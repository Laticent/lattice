#!/usr/bin/env bash
# The `ios-safari-studio` platform suite (.github/platform-suites.json): the Studio preview probe in REAL Mobile
# Safari, in an iPad and an iPhone iOS Simulator, on a GitHub macOS runner. Run from the repo root after
# `npm ci` and `npm run build` (the platform-suites job does both).
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

# The docs site, built and served the way the e2e suite serves it.
(cd docs && npm ci && npm run build:e2e)
(cd docs && PREVIEW_PORT=$PORT node scripts/preview-e2e.mjs > "$OUT/preview.log" 2>&1) &
server=$!
for _ in $(seq 1 120); do curl -sf "http://localhost:$PORT/studio/" >/dev/null && break; sleep 1; done
curl -sf "http://localhost:$PORT/studio/" >/dev/null

sudo safaridriver --enable
safaridriver --port 4444 &
driver=$!
trap 'kill "$driver" "$server" 2>/dev/null || true; xcrun simctl shutdown all || true' EXIT

runtime=$(xcrun simctl list runtimes --json | jq -r '[.runtimes[] | select(.platform == "iOS" and .isAvailable)]
  | sort_by(.version | split(".") | map(tonumber)) | last | .identifier // empty')
if [ -z "$runtime" ]; then echo 'no iOS Simulator runtime on this runner' >&2; exit 1; fi
echo "runtime: $runtime"

status=0
for family in iPad iPhone; do
  device_type=$(xcrun simctl list devices available --json | jq -r --arg rt "$runtime" --arg f "$family" \
    '[.devices[$rt][] | select(.name | startswith($f))] | first | .deviceTypeIdentifier // empty')
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
  if ! SIM_UDID="$udid" SIM_LABEL="$family" ARTIFACT_DIR="$OUT" STUDIO_URL="http://localhost:$PORT" node docs/scripts/ios-safari/run.mjs; then
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
  for f in "$OUT"/*.json; do
    [ -f "$f" ] || continue
    jq -r '"| \(.session.label) (iOS \(.session.platformVersion // "?"), Safari \(.session.browserVersion // "?"), \(.width)px) | \(if .ok then "PASS" else "FAIL: \(.error)" end) |"' "$f"
  done
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
exit $status
