#!/usr/bin/env bash
# Scratch probe for PR #3312: open the exported risk-matrix pages in real Mobile Safari 17 (an iOS 17 Simulator on
# macos-15) and screenshot them. Evidence only: it always exits 0, so a dispatched run never files an alert.
set -x
OUT="$PWD/platform-suite-artifacts"; mkdir -p "$OUT"
P=safari17-probe
{
  sw_vers; xcodebuild -version; xcode-select -p
  defaults read /Applications/Safari.app/Contents/Info CFBundleShortVersionString
  xcrun simctl list runtimes
} > "$OUT/env.txt" 2>&1
cat "$OUT/env.txt"
page="$RUNNER_TEMP/s17page"; mkdir -p "$page"
for d in a11y-achromatopsia carbone; do
  for f in light dark; do node lattice.js "$P/$d-$f.md" "$page/$d-$f.html" -q || echo "export failed $d-$f"; done
  node lattice.js "$P/$d-player.md" "$page/$d-player.html" --player -q || echo "export failed $d-player"
done
node "$P/inject.mjs" "$page"/*.html
for d in a11y-achromatopsia carbone; do perl -pe 's/data-lp-scheme="light"/data-lp-scheme="dark"/ if $.<5' "$page/$d-player.html" > "$page/$d-player-dark.html"; grep -c 'data-lp-scheme="dark"' "$page/$d-player-dark.html"; done
cp "$page"/*.html "$OUT/" 2>/dev/null
(cd "$page" && python3 -m http.server 8765 > "$OUT/server.log" 2>&1) &
runtime=$(xcrun simctl list runtimes --json | jq -r '[.runtimes[] | select(.platform == "iOS" and .isAvailable and (.version | startswith("17.")))] | sort_by(.version | split(".") | map(tonumber)) | last | .identifier // empty')
echo "runtime: $runtime" | tee -a "$OUT/env.txt"
if [ -z "$runtime" ]; then
  echo 'no iOS 17 runtime: trying to download iOS 17.5' | tee -a "$OUT/env.txt"
  timeout 1200 xcodebuild -downloadPlatform iOS -buildVersion 17.5 >> "$OUT/env.txt" 2>&1 || true
  runtime=$(xcrun simctl list runtimes --json | jq -r '[.runtimes[] | select(.platform == "iOS" and .isAvailable and (.version | startswith("17.")))] | last | .identifier // empty')
fi
[ -z "$runtime" ] && { echo 'still no iOS 17 runtime' | tee -a "$OUT/env.txt"; exit 0; }
dtype=$(xcrun simctl list devicetypes --json | jq -r '[.devicetypes[] | select(.name | test("^iPad Pro .*13|^iPad Pro .*12.9"))] | last | .identifier // empty')
[ -z "$dtype" ] && dtype=com.apple.CoreSimulator.SimDeviceType.iPad-Air-5th-generation
udid=$(xcrun simctl create s17probe "$dtype" "$runtime") || exit 0
xcrun simctl boot "$udid"; timeout 600 xcrun simctl bootstatus "$udid" -b
echo "device: $dtype $udid" | tee -a "$OUT/env.txt"
xcrun simctl status_bar "$udid" override --time 9:41 || true
shot() { # name url appearance
  xcrun simctl ui "$udid" appearance "$3"
  xcrun simctl openurl "$udid" "$2"; sleep 12
  xcrun simctl io "$udid" screenshot "$OUT/$1-$3.png"
}
for d in a11y-achromatopsia carbone; do
  for f in light dark; do shot "$d-$f" "http://localhost:8765/$d-$f.html" light; done
  shot "$d-player" "http://localhost:8765/$d-player.html" light
  shot "$d-player-dark" "http://localhost:8765/$d-player-dark.html" light
done
xcrun simctl shutdown all || true
ls -la "$OUT"
exit 0
