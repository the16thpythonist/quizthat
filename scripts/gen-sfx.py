#!/usr/bin/env python3
"""Generate one sound effect via the ElevenLabs text-to-sound-effects API.

Reads ELEVENLABS_API_KEY from the repo-root .env. Writes a raw MP3 that still
needs `scripts/postprocess-sfx.sh` run over it (see CLAUDE.md -- raw output
clips and is padded with silence).

Usage:
    uv run --directory pipeline --with python-dotenv \
        python ../scripts/gen-sfx.py OUT.mp3 "PROMPT" [DURATION_SECONDS] [--loop]

--loop asks the model for a seamlessly wrapping bed (ambient/tension loops).

One call per invocation, by design. Do not batch variants without being asked.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(REPO_ROOT / ".env")

PROMPT_INFLUENCE = 0.6  # higher = follows the prompt more closely, less variety


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2

    args = [a for a in sys.argv[1:] if a != "--loop"]
    loop = "--loop" in sys.argv
    out = Path(args[0])
    prompt = args[1]
    duration = float(args[2]) if len(args) > 2 else 1.5

    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        print("ELEVENLABS_API_KEY is not set (expected in the repo-root .env)", file=sys.stderr)
        return 1

    from elevenlabs.client import ElevenLabs

    client = ElevenLabs(api_key=api_key)
    print(f"prompt: {prompt}\nduration: {duration}s  loop={loop}")

    audio = client.text_to_sound_effects.convert(
        text=prompt,
        duration_seconds=duration,
        prompt_influence=PROMPT_INFLUENCE,
        loop=loop,
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "wb") as f:
        for chunk in audio:
            f.write(chunk)

    print(f"wrote: {out} ({out.stat().st_size} bytes)")
    print(f"next:  scripts/postprocess-sfx.sh {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
