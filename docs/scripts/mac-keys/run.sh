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
# Turn the input-source shortcuts back on (the runner image ships them off; a new Mac ships them on: Ctrl-Space and
# Ctrl-Option-Space), apply them to the running session, then run the probe with the stock arms.
for id in 60 61; do
  mods=262144; [ "$id" = 61 ] && mods=786432
  defaults write com.apple.symbolichotkeys AppleSymbolicHotKeys -dict-add "$id" \
    "<dict><key>enabled</key><true/><key>value</key><dict><key>parameters</key><array><integer>32</integer><integer>49</integer><integer>$mods</integer></array><key>type</key><string>standard</string></dict></dict>"
done
/System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings -u || echo 'activateSettings failed'
echo '--- symbolic hotkeys 60/61 after turning them on'
defaults read com.apple.symbolichotkeys AppleSymbolicHotKeys | grep -A3 -E '^ +6[01] = '
(cd docs && STOCK_HOTKEYS=1 KEYS_BIN="$OUT/keys" OUT="$OUT/stock" STUDIO_URL=http://localhost:4321/studio/ node mac-keys-probe.mjs)
