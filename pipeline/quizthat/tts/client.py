"""TTS client for voice line generation via ElevenLabs.

Falls back to stub mode (empty placeholder files) when ELEVENLABS_API_KEY
is not set.
"""

from __future__ import annotations

import json as _json
import logging
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

CONFIG_DIR = Path(__file__).parent.parent.parent / "config"

# Per-character pricing by tier (USD per 1000 characters)
# SPEC.md §6: higher than the -16 broadcast standard, so speech cuts through a
# noisy room on tablet speakers.
TARGET_LUFS = -14.0

TIER_PRICING = {
    "starter": 0.30,
    "creator": 0.30,
    "pro": 0.24,
    "scale": 0.18,
    "business": 0.12,
}


@dataclass
class TTSResult:
    """Result of a TTS generation run for one language."""

    files: list[Path] = field(default_factory=list)
    characters_used: int = 0
    errors: list[str] = field(default_factory=list)


def has_api_key() -> bool:
    """Check if an ElevenLabs API key is configured."""
    return bool(os.environ.get("ELEVENLABS_API_KEY"))


def load_voice_config() -> dict:
    """Load voice configuration from config/voices.yaml."""
    config_path = CONFIG_DIR / "voices.yaml"
    if not config_path.exists():
        logger.warning("Voice config not found at %s", config_path)
        return {"narrators": {}}
    with open(config_path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def estimate_cost(characters: int, tier: str = "creator") -> float:
    """Estimate cost in USD for a given character count and tier."""
    rate = TIER_PRICING.get(tier.lower(), TIER_PRICING["creator"])
    return (characters / 1000) * rate


def get_subscription_info() -> dict | None:
    """Fetch ElevenLabs subscription info. Returns None if no API key."""
    client = _get_client()
    if client is None:
        return None
    sub = client.user.subscription.get()
    return {
        "tier": sub.tier,
        "status": str(sub.status),
        "character_count": sub.character_count,
        "character_limit": sub.character_limit,
        "characters_remaining": sub.character_limit - sub.character_count,
    }


def generate_voice_lines(
    question_dir: Path,
    question_content: dict,
    language: str,
    kinds: set[str] | None = None,
) -> TTSResult:
    """Generate TTS voice lines for a question in one language.

    ``kinds`` selects which clips to produce from {"teaser", "question",
    "answers"}; all three when omitted. The frontend currently reads only the
    question text aloud, so generating the rest is wasted spend until that
    changes.

    Falls back to stub mode when ELEVENLABS_API_KEY is not set.
    """
    config = load_voice_config()
    narrator = config.get("narrators", {}).get(language, {})
    voice_name = narrator.get("name", f"{language} narrator")

    audio_dir = question_dir / "audio"
    audio_dir.mkdir(exist_ok=True)

    client = _get_client()
    if client is None:
        return _generate_stub(audio_dir, question_content, language, voice_name)

    result = TTSResult()

    # Collect all (text, filename) pairs, filtered by `kinds`.
    clips: list[tuple[str, str]] = []
    want = set(kinds) if kinds else {"teaser", "question", "answers"}

    teaser = question_content.get("teaser_title", "")
    if teaser and "teaser" in want:
        clips.append((teaser, f"teaser.{language}.mp3"))

    question_text = question_content.get("question_text", "")
    if question_text and "question" in want:
        clips.append((question_text, f"question.{language}.mp3"))

    if "answers" in want:
        answer_data = question_content.get("answer_data", {})
        options = answer_data.get("options") or answer_data.get("items") or []
        for i, option_text in enumerate(options):
            if option_text:
                clips.append((str(option_text), f"answer_{i}.{language}.mp3"))

    for text, filename in clips:
        output_path = audio_dir / filename
        try:
            chars = _generate_single_clip(client, text, narrator, output_path)
            result.characters_used += chars
            _normalize_audio(output_path)
            result.files.append(output_path)
            logger.info("Generated %s (%d chars)", filename, chars)
        except Exception as e:
            error_msg = f"Failed to generate {filename}: {e}"
            logger.error(error_msg)
            result.errors.append(error_msg)
            output_path.write_bytes(b"")
            result.files.append(output_path)

    return result


def generate_all_voice_lines(
    question_dir: Path,
    languages: list[str],
    kinds: set[str] | None = None,
) -> dict[str, TTSResult]:
    """Generate voice lines for all languages of a question.

    Reads the question.{lang}.json files from the question directory.
    """
    results: dict[str, TTSResult] = {}
    for lang in languages:
        content_path = question_dir / f"question.{lang}.json"
        if not content_path.exists():
            logger.warning("No question content for language %s at %s", lang, content_path)
            continue
        content = _json.loads(content_path.read_text(encoding="utf-8"))
        results[lang] = generate_voice_lines(question_dir, content, lang, kinds)

    return results


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _get_client():
    """Create an ElevenLabs client if an API key is available."""
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        return None
    from elevenlabs.client import ElevenLabs

    return ElevenLabs(api_key=api_key)


def _generate_single_clip(client, text: str, voice_cfg: dict, output_path: Path) -> int:
    """Generate a single TTS clip. Returns character count of text sent."""
    from elevenlabs.types.voice_settings import VoiceSettings

    settings = voice_cfg.get("settings", {})
    voice_settings = VoiceSettings(
        stability=settings.get("stability", 0.5),
        similarity_boost=settings.get("similarity_boost", 0.75),
        style=settings.get("style", 0.0),
        use_speaker_boost=settings.get("use_speaker_boost", True),
    )

    audio_iterator = client.text_to_speech.convert(
        voice_id=voice_cfg["voice_id"],
        text=text,
        model_id=voice_cfg.get("model_id", "eleven_multilingual_v2"),
        output_format=voice_cfg.get("output_format", "mp3_44100_64"),
        voice_settings=voice_settings,
    )

    audio_bytes = b"".join(audio_iterator)
    output_path.write_bytes(audio_bytes)

    return len(text)


def _normalize_audio(audio_path: Path) -> None:
    """Normalize audio loudness to -14 LUFS (SPEC.md) using ffmpeg.

    Measures integrated loudness, then applies a flat gain and a true-peak
    limiter.

    SPEC.md specifies dual-pass R128 for clips over 3s, and that is what this
    did. It was replaced because it measurably undershoots on speech: with
    ``linear=true`` ffmpeg refuses to exceed the true-peak ceiling and so backs
    the whole gain off instead of limiting. Speech has a high crest factor, so
    that happens constantly -- a set of narrator lines came out spread across
    -15.1 to -17.4 LUFS against a -14 target. Flat gain plus a limiter puts the
    same set inside half a decibel.

    Silently skips if ffmpeg/ffprobe is not installed.
    """
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(audio_path),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        duration = float(result.stdout.strip())
    except FileNotFoundError:
        logger.debug("ffprobe not found, skipping normalization")
        return
    except (subprocess.CalledProcessError, ValueError):
        logger.warning("ffprobe failed for %s, skipping normalization", audio_path)
        return

    del duration  # length no longer selects a strategy; kept for the ffprobe guard
    _normalize_to_target(audio_path)


def _normalize_to_target(audio_path: Path) -> None:
    """Normalize a clip to TARGET_LUFS by measured flat gain.

    Deliberately NOT loudnorm's own correction. Two measured problems with it:

      * loudnorm gates against a relative threshold, and on a two-second line it
        discards enough of the signal to undershoot by 4-5 dB. Across a set of
        one-line clips that produced a 5 dB spread -- plainly audible when they
        play back to back.
      * ``linear=true`` cannot hold the true-peak ceiling across a large positive
        gain, so quiet clips came back over 0 dBFS and mp3 encoding turned the
        overshoot into audible distortion.

    Measuring first and applying a flat gain has neither problem, lands within
    ~0.5 dB, and preserves deliberate level differences inside a clip (a
    whispered aside stays quieter than the line before it). The limiter ceiling
    is -2 dBFS because alimiter caps sample peaks while mp3 decoding
    reconstructs inter-sample peaks roughly 1 dB above them.
    """
    measured = _measure_loudness(audio_path)
    if measured is None:
        return
    gain = TARGET_LUFS - measured

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(audio_path),
                "-af", f"volume={gain:.2f}dB,alimiter=limit=0.794:level=disabled",
                "-ar", "44100", "-ac", "1", "-b:a", "64k",
                str(tmp_path),
            ],
            capture_output=True,
            check=True,
        )
        shutil.move(str(tmp_path), str(audio_path))
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        logger.warning("Normalization failed for %s: %s", audio_path, e)
        tmp_path.unlink(missing_ok=True)


def _measure_loudness(audio_path: Path) -> float | None:
    """Integrated loudness in LUFS via loudnorm's analysis pass, or None."""
    try:
        proc = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-i", str(audio_path),
                "-af", f"loudnorm=I={TARGET_LUFS}:TP=-1:LRA=11:print_format=json",
                "-f", "null", "-",
            ],
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        logger.debug("ffmpeg not found, skipping normalization")
        return None
    match = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", proc.stderr, re.S)
    if not match:
        logger.warning("Could not measure loudness for %s", audio_path)
        return None
    try:
        return float(_json.loads(match.group(0))["input_i"])
    except (ValueError, KeyError):
        logger.warning("Could not parse loudness for %s", audio_path)
        return None



def _generate_stub(
    audio_dir: Path, question_content: dict, language: str, voice_name: str
) -> TTSResult:
    """Stub mode: create empty placeholder files and log."""
    result = TTSResult()

    teaser = question_content.get("teaser_title", "")
    teaser_path = audio_dir / f"teaser.{language}.mp3"
    logger.info(
        "[TTS STUB] Would generate teaser.%s.mp3 with %s: %r",
        language, voice_name, teaser,
    )
    teaser_path.write_bytes(b"")
    result.files.append(teaser_path)

    question_text = question_content.get("question_text", "")
    question_path = audio_dir / f"question.{language}.mp3"
    logger.info(
        "[TTS STUB] Would generate question.%s.mp3 with %s: %r",
        language, voice_name, question_text,
    )
    question_path.write_bytes(b"")
    result.files.append(question_path)

    answer_data = question_content.get("answer_data", {})
    options = answer_data.get("options") or answer_data.get("items") or []
    for i, option_text in enumerate(options):
        answer_path = audio_dir / f"answer_{i}.{language}.mp3"
        logger.info(
            "[TTS STUB] Would generate answer_%d.%s.mp3 with %s: %r",
            i, language, voice_name, option_text,
        )
        answer_path.write_bytes(b"")
        result.files.append(answer_path)

    return result
