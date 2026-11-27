#!/usr/bin/env bash
# THROWAWAY: the measurement matrix behind engineering/decisions/2026-11-27-shared-chrome-for-tests.md.
# Every arm on the same file list, interleaved round by round so a drift in the machine lands on
# every arm alike. Writes one JSON line per run to $OUT (default .scratch/sc/results.jsonl).
#   bash tools/shared-chrome-lab/matrix.sh .scratch/sc/files.txt
set -u
FILES=${1:?file list}
OUT=${OUT:-.scratch/sc/results.jsonl}
ARMS=(baseline global group context pool)
run() { timeout 1200 node tools/shared-chrome-lab/run-arm.mjs --files "$FILES" --concurrency 4 "$@" >>"$OUT" 2>/dev/null || echo "{\"label\":\"$*\",\"driverExit\":$?}" >>"$OUT"; }
for arm in "${ARMS[@]}"; do run --arm "$arm" --pool 2 --label "$arm-quiet"; done
for round in 1 2 3; do
  for arm in "${ARMS[@]}"; do run --arm "$arm" --pool 2 --load --label "$arm-load-$round"; done
done
# Crash blast radius: kill the (first) shared browser 30 s in, quiet machine.
for arm in global group pool; do run --arm "$arm" --pool 2 --kill-after 30 --label "$arm-kill"; done
