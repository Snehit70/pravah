#!/usr/bin/env bash
# trace-icon.sh — convert a raster icon (PNG/JPG/WebP) into a traced SVG,
# replicating the FreeConvert PNG->SVG pipeline locally (FreeConvert is a
# hosted VTracer; this uses vtracer when installed, potrace otherwise).
#
# Usage:
#   scripts/trace-icon.sh input.png [output.svg] [options]
#
# Options:
#   --invert          trace light-on-dark art (ChatGPT dark renders)
#   --color           keep colors (vtracer only; default is black & white)
#   --threshold N     binarization cutoff percent for B&W pre-pass (default 50)
#   --speckle N       drop blobs smaller than N px (default 4)
#   --size N          downscale longest edge to N px before tracing (default 1024)
#   --no-crop         keep full canvas instead of cropping viewBox to drawing
set -euo pipefail

usage() { sed -n '2,16p' "$0"; exit 1; }

INPUT="${1:-}"; [[ -z "$INPUT" || "$INPUT" == -* ]] && usage
shift
OUTPUT=""
if [[ $# -gt 0 && "${1:-}" != -* ]]; then OUTPUT="$1"; shift; fi
[[ -z "$OUTPUT" ]] && OUTPUT="${INPUT%.*}.svg"

INVERT=0 COLOR=0 THRESHOLD=50 SPECKLE=4 SIZE=1024 CROP=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --invert) INVERT=1 ;;
    --color) COLOR=1 ;;
    --threshold) THRESHOLD="$2"; shift ;;
    --speckle) SPECKLE="$2"; shift ;;
    --size) SIZE="$2"; shift ;;
    --no-crop) CROP=0 ;;
    *) echo "unknown option: $1" >&2; usage ;;
  esac
  shift
done

command -v magick >/dev/null || { echo "ImageMagick (magick) is required" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Pre-pass: flatten transparency onto white, normalize size. For B&W also
# grayscale + hard threshold so anti-aliased edges become clean shape borders.
PRE_ARGS=(-background white -alpha remove -flatten -resize "${SIZE}x${SIZE}>")
if [[ $COLOR -eq 0 ]]; then
  PRE_ARGS+=(-colorspace Gray)
  [[ $INVERT -eq 1 ]] && PRE_ARGS+=(-negate)
  PRE_ARGS+=(-threshold "${THRESHOLD}%")
elif [[ $INVERT -eq 1 ]]; then
  PRE_ARGS+=(-negate)
fi

# potrace gives noticeably smoother curves on binarized line art, so it is
# the B&W default; vtracer handles the color mode potrace cannot.
if [[ $COLOR -eq 0 ]] && command -v potrace >/dev/null; then
  magick "$INPUT" "${PRE_ARGS[@]}" "$WORK/pre.pnm"
  potrace --svg --turdsize "$SPECKLE" --output "$WORK/traced.svg" "$WORK/pre.pnm"
  BACKEND=potrace
elif command -v vtracer >/dev/null; then
  magick "$INPUT" "${PRE_ARGS[@]}" "$WORK/pre.png"
  VT_ARGS=(--input "$WORK/pre.png" --output "$WORK/traced.svg"
    --mode spline --filter_speckle "$SPECKLE"
    --corner_threshold 60 --segment_length 4 --splice_threshold 45)
  if [[ $COLOR -eq 1 ]]; then
    VT_ARGS+=(--colormode color --hierarchical stacked --color_precision 6)
  else
    VT_ARGS+=(--colormode bw)
  fi
  vtracer "${VT_ARGS[@]}"
  BACKEND=vtracer
else
  echo "install potrace (dnf install potrace) or vtracer (cargo install vtracer)" >&2
  exit 1
fi

# Tighten the viewBox to the drawn area so the icon scales edge-to-edge,
# matching the hand-cropped FreeConvert assets already in the repo.
if [[ $CROP -eq 1 ]] && command -v inkscape >/dev/null; then
  inkscape "$WORK/traced.svg" --export-area-drawing --export-margin=2 \
    --export-plain-svg --export-filename="$OUTPUT" 2>/dev/null \
    || cp "$WORK/traced.svg" "$OUTPUT"
else
  cp "$WORK/traced.svg" "$OUTPUT"
fi

echo "traced ($BACKEND): $OUTPUT ($(wc -c <"$OUTPUT") bytes)"
