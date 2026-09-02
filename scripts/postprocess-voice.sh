#!/usr/bin/env bash
# Post-process raw ElevenLabs TTS clips in place, to -14 LUFS (SPEC.md) 64k mono MP3.
#
# Method: measure integrated loudness with loudnorm's analysis pass, then apply a
# FLAT GAIN of (target - measured) followed by a true-peak limiter.
#
# Why not loudnorm's own correction: it gates and compresses. On clips under ~3s
# (a one-line callout) the gating discards most of the signal and it undershoots
# by 4-5 dB -- plainly audible when such lines play back to back at random. SPEC
# already flags R128 as unreliable below 3s. Flat gain has neither problem and,
# unlike loudnorm's dynamic mode, preserves intentional level differences inside a
# clip -- a whispered aside stays quieter than the line before it.
#
# The limiter ceiling is -2 dBFS, not -1: alimiter caps SAMPLE peaks, but mp3
# decoding reconstructs inter-sample peaks above them, so a -1 ceiling measures
# as +1 dBTP after encoding. -2 leaves the headroom for that.
#
# The untouched download is kept alongside as <name>.raw.mp3 and re-used as the
# source on later runs, so re-running never stacks lossy re-encodes.
set -euo pipefail
TARGET=${VOICE_LUFS:--14}
for f in "$@"; do
  raw="${f%.mp3}.raw.mp3"
  if [ -f "$raw" ]; then cp "$raw" "$f"; else cp "$f" "$raw"; fi

  m=$(ffmpeg -hide_banner -i "$f" -af "loudnorm=I=${TARGET}:TP=-1.0:LRA=11:print_format=json" \
        -f null - 2>&1 | sed -n '/^{/,/^}/p')
  gain=$(python3 -c "
import json
d=json.loads('''$m''')
print(round(${TARGET} - float(d['input_i']), 2))")

  ffmpeg -hide_banner -loglevel error -y -i "$f" \
    -af "volume=${gain}dB,alimiter=limit=0.794:level=disabled" \
    -ac 1 -c:a libmp3lame -b:a 64k "${f%.mp3}.tmp.mp3"
  mv "${f%.mp3}.tmp.mp3" "$f"

  after=$(ffmpeg -hide_banner -nostats -i "$f" -af ebur128=peak=true -f null - 2>&1 \
          | grep -E "I:.*LUFS$|Peak:" | tail -2 | tr -s ' ' | tr '\n' ' ')
  printf "%-22s %ss  gain %+6s dB ->%s\n" "$(basename "$f")" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" | cut -c1-5)" "$gain" "$after"
done
