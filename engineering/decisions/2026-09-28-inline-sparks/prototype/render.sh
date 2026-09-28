#!/usr/bin/env bash
# Build the light + dark prototype decks and render them through the real engine.
# Output lands in .scratch/sparks/ (gitignored), never beside the note.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
OUT="$ROOT/.scratch/sparks"
mkdir -p "$OUT"
cd "$OUT"
export CHROME_PATH=${CHROME_PATH:-/opt/pw-browsers/chromium}
for m in light dark; do
  { printf -- '---\nmarp: true\ntheme: indaco\npaginate: true\ncolor-mode: %s\n---\n\n<style>\n' "$m"; cat "$HERE/spark.css"; printf '</style>\n\n'; cat "$HERE/sparks.body.md"; } > "sparks-$m.md"
  node -r "$HERE/patch.js" "$ROOT/lattice-emulator.js" "sparks-$m.md" "sparks-$m.pdf" 2>&1 | grep -iE 'overflow|clip|error' || true
done
rm -rf png && mkdir png
pdftoppm -r 60 -png sparks-light.pdf png/l && pdftoppm -r 60 -png sparks-dark.pdf png/d
echo "PDFs and PNGs in $OUT"
