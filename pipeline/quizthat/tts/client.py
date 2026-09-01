"""TTS client for voice line generation via ElevenLabs.

Falls back to stub mode (empty placeholder files) when ELEVENLABS_API_KEY
is not set.
"""

from __future__ import annotations

import json as _json
import logging
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

CONFIG_DIR = Path(__file__).parent.parent.parent / "config"

# Per-character pricing by tier (USD per 1000 characters)
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
) -> TTSResult:
    """Generate TTS voice lines for a question in one language.

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

    # Collect all (text, filename) pairs
    clips: list[tuple[str, str]] = []

    teaser = question_content.get("teaser_title", "")
    if teaser:
        clips.append((teaser, f"teaser.{language}.mp3"))

    question_text = question_content.get("question_text", "")
    if question_text:
        clips.append((question_text, f"question.{language}.mp3"))

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
        results[lang] = generate_voice_lines(question_dir, content, lang)

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
    """Normalize audio loudness using ffmpeg.

    Dual-pass EBU R128 loudnorm to -14 LUFS for clips >= 3 seconds.
    Simple peak normalization for clips < 3 seconds.
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

    if duration < 3.0:
        _peak_normalize(audio_path)
    else:
        _loudnorm_dual_pass(audio_path)


def _peak_normalize(audio_path: Path) -> None:
    """Simple loudnorm for short clips (<3s)."""
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(audio_path),
                "-af", "loudnorm=I=-14:TP=-1:LRA=11:linear=true",
                "-ar", "44100", "-ac", "1", "-b:a", "64k",
                str(tmp_path),
            ],
            capture_output=True,
            check=True,
        )
        shutil.move(str(tmp_path), str(audio_path))
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        logger.warning("Peak normalization failed for %s: %s", audio_path, e)
        tmp_path.unlink(missing_ok=True)


def _loudnorm_dual_pass(audio_path: Path) -> None:
    """Dual-pass EBU R128 loudness normalization to -14 LUFS."""
    # Pass 1: Measure
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-i", str(audio_path),
                "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json",
                "-f", "null", "-",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        logger.warning("Loudnorm pass 1 failed for %s: %s", audio_path, e)
        return

    # Parse the JSON stats from ffmpeg stderr
    stderr_lines = result.stderr.strip().split("\n")
    json_start = None
    for i in range(len(stderr_lines) - 1, -1, -1):
        if stderr_lines[i].strip().startswith("{"):
            json_start = i
            break
    if json_start is None:
        logger.warning("Could not parse loudnorm stats for %s", audio_path)
        return

    try:
        stats = _json.loads("\n".join(stderr_lines[json_start:]))
    except _json.JSONDecodeError:
        logger.warning("Could not decode loudnorm JSON for %s", audio_path)
        return

    # Pass 2: Apply measured values
    measured_i = stats.get("input_i", "-14")
    measured_tp = stats.get("input_tp", "-1")
    measured_lra = stats.get("input_lra", "11")
    measured_thresh = stats.get("input_thresh", "-24")

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        pass2_filter = (
            f"loudnorm=I=-14:TP=-1:LRA=11:linear=true"
            f":measured_I={measured_i}:measured_TP={measured_tp}"
            f":measured_LRA={measured_lra}:measured_thresh={measured_thresh}"
        )
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(audio_path),
                "-af", pass2_filter,
                "-ar", "44100", "-ac", "1", "-b:a", "64k",
                str(tmp_path),
            ],
            capture_output=True,
            check=True,
        )
        shutil.move(str(tmp_path), str(audio_path))
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        logger.warning("Loudnorm pass 2 failed for %s: %s", audio_path, e)
        tmp_path.unlink(missing_ok=True)


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
