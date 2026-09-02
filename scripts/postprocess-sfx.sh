#!/usr/bin/env bash
# Post-process a raw ElevenLabs SFX clip in place:
#   1. trim leading silence and trailing silence
#   2. loudness-normalize to -14 LUFS / -1.0 dBTP  (SPEC.md target)
#   3. 5ms fade-in, 25ms fade-out, re-encode 128k MP3
#
# Head and tail offsets are both measured BEFORE encoding and applied with
# -ss/-t, not with silenceremove inside the filter chain: the filter shifts the
# output timeline, which would silently move the tail trim and the fade-out by
# however much head was removed.
#
# The 5ms fade-in matters because ElevenLabs SFX output frequently begins
# mid-waveform at near-full amplitude; starting playback on a discontinuity
# clicks. It cannot restore a missing attack -- for that, request a LONGER
# duration_seconds than the sound needs so the onset fits inside the window, and
# let this script trim the resulting leading silence.
set -euo pipefail
THRESH=${SFX_SILENCE_DB:--40}   # dB; ElevenLabs tails often sit above -50
for f in "$@"; do
  raw="${f%.mp3}.raw.mp3"
  if [ -f "$raw" ]; then cp "$raw" "$f"; else cp "$f" "$raw"; fi

  D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  LOG=$(ffmpeg -hide_banner -nostats -i "$f" -af "silencedetect=noise=${THRESH}dB:d=0.05" -f null - 2>&1 || true)
  STARTS=$(grep -o 'silence_start: [0-9.-]*' <<<"$LOG" | awk '{print $2}')
  ENDS=$(grep -o 'silence_end: [0-9.]*' <<<"$LOG" | awk '{print $2}')

  # Leading silence: a region starting at (or before) 0 that closes.
  HEAD=0
  first_start=$(head -1 <<<"$STARTS"); first_end=$(head -1 <<<"$ENDS")
  if [ -n "$first_start" ] && [ -n "$first_end" ]; then
    HEAD=$(python3 -c "
s=$first_start; e=$first_end
print(round(max(e-0.01,0),3) if s<=0.02 and e<s+$D else 0)")
  fi

  # Trailing silence: only when the final silent region reaches the end.
  END=$D
  last_start=$(tail -1 <<<"$STARTS"); last_end=$(tail -1 <<<"$ENDS")
  if [ -n "$last_start" ]; then
    if [ -z "$last_end" ] || python3 -c "import sys; sys.exit(0 if $last_end < $last_start or $D-$last_end < 0.05 else 1)"; then
      END=$(python3 -c "print(round(min($last_start+0.04,$D),3))")
    fi
  fi

  DUR=$(python3 -c "print(round(max($END-$HEAD,0.05),3))")
  FADE=$(python3 -c "print(round(max($DUR-0.025,0),3))")
  ffmpeg -hide_banner -loglevel error -y -ss "$HEAD" -i "$f" -t "$DUR" \
    -af "afade=t=in:st=0:d=0.005,loudnorm=I=-14:TP=-1.0:LRA=11,afade=t=out:st=$FADE:d=0.025" \
    -c:a libmp3lame -b:a 128k "${f%.mp3}.tmp.mp3"
  mv "${f%.mp3}.tmp.mp3" "$f"

  printf "%-24s %ss -> %ss  (head -%ss)  " "$(basename "$f")" "${D:0:5}" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" | cut -c1-5)" "$HEAD"
  ffmpeg -hide_banner -nostats -i "$f" -af ebur128 -f null - 2>&1 | grep -A1 Integrated | tail -1 | tr -s ' '
done
