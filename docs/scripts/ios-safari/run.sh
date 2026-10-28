#!/usr/bin/env bash
# The `ios-safari-studio` and `ios-safari-jpeg` platform suites (.github/platform-suites.json): a probe in REAL Mobile
# Safari, in an iPad and an iPhone iOS Simulator, on a GitHub macOS runner. PROBE=studio (default) runs the Studio
# preview probe against the built docs site; PROBE=focus-sync taps the Playground's editor on an iPad under a busy page
# (focus-sync-probe.js); PROBE=jpeg runs the shared JPEG encoder against Safari's own, on a blank
# page (it needs an http origin, not the site). Run from the repo root after `npm ci` and `npm run build` (the
# platform-suites job does both).
#
# The simulator recipe is the one that is known to work on hosted runners (aletheia-works/formicarium#129):
# a FRESH device (the image ships a booted one that safaridriver times out on), the remote-automation defaults
# written inside it, a reboot so Safari reads them, Safari launched before safaridriver connects, and Xcode 26
# (Xcode 27 replaced Simulator.app, and safaridriver then finds no iOS session host) left as the image's default.
set -euo pipefail

ROOT=$(pwd)
OUT="$ROOT/platform-suite-artifacts/ios-safari"
mkdir -p "$OUT"
PORT=4321
PROBE=${PROBE:-studio}

# KEEP THE IMAGE'S DEFAULT XCODE; only check it. Switching with `xcode-select -s`, even to the same 26.x, is what
# makes safaridriver fail every session with "Could not find Simulator.app or a devices:// URL handler" (seen on
# this suite's first run, and on formicarium#129). Read the version into a variable first: `xcodebuild -version |
# grep -q` fails under pipefail when grep exits early and xcodebuild dies of SIGPIPE; that is how the switch ran.
xcode=$(xcodebuild -version)
echo "$xcode"
case "$xcode" in
  'Xcode 26.'*) ;;
  *) echo 'the default Xcode is not an Xcode 26: Xcode 27 replaced Simulator.app, and safaridriver then finds no iOS session host' >&2; exit 1 ;;
esac
test -d "$(xcode-select -p)/Applications/Simulator.app" || { echo "no Simulator.app under $(xcode-select -p)" >&2; exit 1; }

if [ "$PROBE" = jpeg ]; then
  # A blank page on an http origin is all the JPEG probe needs.
  page="$RUNNER_TEMP/jpeg-probe-page"
  mkdir -p "$page"
  printf '<!doctype html><title>jpeg probe</title>\n' > "$page/index.html"
  (cd "$page" && python3 -m http.server $PORT > "$OUT/preview.log" 2>&1) &
  server=$!
  ready="http://localhost:$PORT/"
else
  # The docs site, built and served the way the e2e suite serves it.
  (cd docs && npm ci && npm run build:e2e)
  (cd docs && PREVIEW_PORT=$PORT node scripts/preview-e2e.mjs > "$OUT/preview.log" 2>&1) &
  server=$!
  ready="http://localhost:$PORT/studio/"
  [ "$PROBE" = focus-sync ] && ready="http://localhost:$PORT/playground/"
fi
for _ in $(seq 1 120); do curl -sf "$ready" >/dev/null && break; sleep 1; done
curl -sf "$ready" >/dev/null

sudo safaridriver --enable
safaridriver --port 4444 &
driver=$!
trap 'kill "$driver" "$server" 2>/dev/null || true; xcrun simctl shutdown all || true' EXIT

runtime=$(xcrun simctl list runtimes --json | jq -r '[.runtimes[] | select(.platform == "iOS" and .isAvailable)]
  | sort_by(.version | split(".") | map(tonumber)) | last | .identifier // empty')
if [ -z "$runtime" ]; then echo 'no iOS Simulator runtime on this runner' >&2; exit 1; fi
echo "runtime: $runtime"

status=0
families='iPad iPhone'
# The focus-sync probe needs the Playground's two-pane layout (wider than 820 px): the iPad Pro 13-inch, in portrait,
# is 1032 px wide, and a phone is never wide enough, so it runs on that iPad alone.
[ "$PROBE" = focus-sync ] && families='iPad'
for family in $families; do
  device_type=$(xcrun simctl list devices available --json | jq -r --arg rt "$runtime" --arg f "$family" --arg p "$PROBE" \
    '[.devices[$rt][] | select(.name | startswith($f))] as $all
     | (if $p == "focus-sync" then ([$all[] | select(.name | test("13-inch|12.9"))] | first) else null end) // ($all | first)
     | .deviceTypeIdentifier // empty')
  if [ -z "$device_type" ]; then echo "no $family device type for $runtime" >&2; status=1; continue; fi
  xcrun simctl shutdown all || true
  udid=$(xcrun simctl create "lattice-$family" "$device_type" "$runtime")
  echo "$family: $device_type ($udid)"
  xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" -b
  for key in \
    com.apple.webinspectord:RemoteInspectorEnabled \
    com.apple.webinspectord:RemoteAutomationEnabled \
    com.apple.webinspectord:WIRRemoteAutomationEnabled \
    com.apple.mobilesafari:WebKitDeveloperExtrasEnabledPreferenceKey \
    com.apple.mobilesafari:WebInspectorEnabled \
    com.apple.mobilesafari:RemoteAutomationEnabled \
    com.apple.mobilesafari:WebKitRemoteAutomationEnabled; do
    xcrun simctl spawn "$udid" defaults write "${key%%:*}" "${key#*:}" -bool true
  done
  xcrun simctl shutdown "$udid"
  xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" -b
  xcrun simctl launch "$udid" com.apple.mobilesafari
  sleep 5
  if ! PROBE="$PROBE" SIM_UDID="$udid" SIM_LABEL="$family" ARTIFACT_DIR="$OUT" STUDIO_URL="http://localhost:$PORT" node docs/scripts/ios-safari/run.mjs; then
    status=1
    xcrun simctl list devices booted || true
    for domain in com.apple.webinspectord com.apple.mobilesafari; do
      echo "--- $domain"; xcrun simctl spawn "$udid" defaults read "$domain" || true
    done
  fi
  xcrun simctl shutdown "$udid" || true
done

{
  echo
  echo "| device | result |"
  echo "|---|---|"
  for f in "$OUT"/"$PROBE"-*.json; do
    [ -f "$f" ] || continue
    jq -r '"| \(.session.label) (iOS \(.session.platformVersion // "?"), Safari \(.session.browserVersion // "?"), \(.width)px) | \(if .ok then "PASS" else "FAIL: \(.error)" end) |"' "$f"
  done
  # The JPEG probe's measurements: Safari's own encoder against ours, picture by picture.
  for f in "$OUT"/jpeg-*.json; do
    [ -f "$f" ] || continue
    echo
    jq -r '"**\(.session.label)**: Safari'"'"'s encoder \(.total.native) B, ours \(.total.ours) B", "", "| picture | Safari | ours |", "|---|---|---|", (.rows[] | "| \(.name) | \(.native.bytes) B, \(.native.sampling), \(.native.psnr * 100 | round / 100) dB | \(.ours.bytes) B, \(.ours.sampling), \(.ours.psnr * 100 | round / 100) dB, \(.ours.ms | round) ms |")' "$f"
  done
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
exit $status
