#!/usr/bin/env python3
"""Generate one narrator voice line via the ElevenLabs text-to-speech API.

Reads ELEVENLABS_API_KEY from the repo-root .env. Output still needs
`scripts/postprocess-voice.sh` run over it (raw TTS comes back quiet, ~-28 LUFS).

Usage:
    uv run --directory pipeline --with python-dotenv \
        python ../scripts/gen-voice.py OUT.mp3 "TEXT" [--speed 1.15] [--model eleven_v3]

With eleven_v3 (the default) the text may carry inline audio tags for direction:
`[excited]`, `[whispers]`, `[laughs]`, `[sighs]`. v3 accepts only three stability
values -- 0.0 (Creative, most tag-responsive), 0.5 (Natural), 1.0 (Robust).

Voice and defaults come from pipeline/config/voices.yaml unless overridden.
One call per invocation, by design.
"""

import argparse
import os
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(REPO_ROOT / ".env")
VOICES_YAML = REPO_ROOT / "pipeline" / "config" / "voices.yaml"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out")
    ap.add_argument("text")
    ap.add_argument("-l", "--language", default="de", help="picks the narrator from voices.yaml")
    ap.add_argument("--voice", default=None, help="override the voice_id")
    ap.add_argument("--model", default="eleven_v3")
    ap.add_argument("--stability", type=float, default=0.0)
    ap.add_argument("--style", type=float, default=0.5)
    ap.add_argument("--speed", type=float, default=1.0, help="0.7-1.2; >1 speaks faster")
    args = ap.parse_args()

    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        print("ELEVENLABS_API_KEY is not set (expected in the repo-root .env)", file=sys.stderr)
        return 1

    voice_id = args.voice
    if voice_id is None:
        cfg = yaml.safe_load(VOICES_YAML.read_text())
        narrator = cfg.get("narrators", {}).get(args.language, {})
        voice_id = narrator.get("voice_id")
        if not voice_id:
            print(f"No voice configured for '{args.language}' in {VOICES_YAML}", file=sys.stderr)
            return 1

    from elevenlabs.client import ElevenLabs
    from elevenlabs.types.voice_settings import VoiceSettings

    client = ElevenLabs(api_key=api_key)
    print(f"voice={voice_id} model={args.model} stability={args.stability} "
          f"style={args.style} speed={args.speed}")
    print(f"text: {args.text!r}")

    audio = client.text_to_speech.convert(
        voice_id=voice_id,
        text=args.text,
        model_id=args.model,
        output_format="mp3_44100_64",      # SPEC: 64 kbps 44.1 kHz mono
        voice_settings=VoiceSettings(
            stability=args.stability,
            similarity_boost=0.80,
            style=args.style,
            use_speaker_boost=True,
            speed=args.speed,
        ),
    )
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "wb") as f:
        for chunk in audio:
            f.write(chunk)

    print(f"chars={len(args.text)}  wrote {out} ({out.stat().st_size} bytes)")
    print(f"next:  scripts/postprocess-voice.sh {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
