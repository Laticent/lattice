#!/usr/bin/env bash
# One-off macOS probe for the Studio autocomplete audit (engineering/decisions/2026-11-13-studio-autocomplete-audit.md
# §1): does a real keystroke of Ctrl-Space, Option-Esc, Option-` or Option-i, posted through the OS event system, open
# the Studio editor's completion menu? Dispatched on the audit's branch only; not kept as a suite.
set -euo pipefail
OUT="$PWD/platform-suite-artifacts"; mkdir -p "$OUT"
sw_vers
echo '--- symbolic hotkeys 60/61 (input-source switching); absent means the macOS default (on)'
defaults read com.apple.symbolichotkeys AppleSymbolicHotKeys 2>/dev/null | grep -A8 -E '^ +6[01] = ' || echo 'no entry: macOS defaults apply'
echo '--- HIToolbox enabled input sources'
defaults read com.apple.HIToolbox AppleEnabledInputSources 2>/dev/null || echo 'none recorded'
swiftc -O docs/scripts/mac-keys/keys.swift -o "$OUT/keys"
"$OUT/keys" trusted
(cd docs && npm ci && npm run build:e2e && npx playwright install chromium)
(cd docs && PREVIEW_PORT=4321 node scripts/preview-e2e.mjs > "$OUT/preview.log" 2>&1) &
for _ in $(seq 1 120); do curl -sf http://localhost:4321/studio/ >/dev/null && break; sleep 1; done
curl -sf http://localhost:4321/studio/ >/dev/null
cp docs/scripts/mac-keys/probe.mjs docs/mac-keys-probe.mjs
(cd docs && KEYS_BIN="$OUT/keys" OUT="$OUT" STUDIO_URL=http://localhost:4321/studio/ node mac-keys-probe.mjs)
