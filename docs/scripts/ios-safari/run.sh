#!/usr/bin/env bash
# The `ios-safari-*` platform suites (.github/platform-suites.json): a probe in REAL Mobile
# Safari, in an iPad and an iPhone iOS Simulator, on a GitHub macOS runner. PROBE=studio (default) runs the Studio
# preview probe against the built docs site; PROBE=photo runs the Studio's photo verdict probe (photo-probe.js) there; PROBE=focus-sync taps the Playground's editor on an iPad under a busy page
# (focus-sync-probe.js); PROBE=jpeg runs the shared JPEG encoder against Safari's own, on a blank
# page (it needs an http origin, not the site). PROBE=undo runs the Filo undo probe against the site, in both
# simulators and then in the Mac's own Safari. PROBE=chat-storage checks that chats move from localStorage to IndexedDB
# across a reload, and measures the localStorage allowance (chat-storage-probe.js), against the site in both simulators. PROBE=font-cache checks that the Studio's warmed fonts are read from Safari's
# cache, against font-cache-server.mjs on two ports (font-cache-probe.js). PROBE=present-memory imports a deck of eighteen phone
# photos into the Studio, opens Present and steps it, reading the WebKit footprint (present-memory.mjs). PROBE=office opens each one-slide editable .pptx that
# tools/office-quicklook.mjs cut in QLProbe, a test app around Apple's Quick Look viewer (what Preview in Files uses),
# and captures the device screen (office-capture.mjs). Run from the repo root after `npm ci` and `npm run build` (the
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
# NO PROBE RAN. When every device that failed did so before any probe code ran (no WebDriver session: run.mjs exit 3,
# a stuck boot or a dead safaridriver: 4 and 5), this file names it and the script exits 3 instead of 1. The workflow's
# alert job reads it and leaves the run to the supervisor (.github/workflows/platform-suites-supervisor.yml), which
# re-runs the job once on a fresh runner; only a second such failure files the alert (D1 A on #3034). A probe failure
# (exit 1) never writes it.
NO_SESSION_MARK="$ROOT/platform-suite-artifacts/no-session"
rm -f "$NO_SESSION_MARK"
# A dispatch can ask for this outcome without an outage (SIMULATE_NO_SESSION=1, the workflow's `simulate` input), to prove
# the supervisor path end to end. It runs nothing else.
if [ "${SIMULATE_NO_SESSION:-}" = 1 ]; then
  echo 'SIMULATE_NO_SESSION=1: reporting "no probe ran" without starting a simulator'
  printf 'simulated\n' > "$NO_SESSION_MARK"
  exit 3
fi

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

if [ "$PROBE" = office ]; then
  # The one-slide editable .pptx files tools/office-quicklook.mjs cut, shown by QLProbe, a test app that hands each to
  # Apple's Quick Look viewer (the component the Files app's Preview uses). Built here with swiftc for the simulator and
  # signed ad hoc, as a simulator requires. A plain server answers run.sh's readiness check.
  page="$ROOT/platform-suite-artifacts/office-quicklook"
  test -f "$page/index.json" || { echo "no $page/index.json: run tools/office-quicklook.mjs first" >&2; exit 1; }
  app="$RUNNER_TEMP/QLProbe.app"
  mkdir -p "$app"
  xcrun --sdk iphonesimulator swiftc -parse-as-library -target "$(uname -m)-apple-ios17.0-simulator" \
    -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" docs/scripts/ios-safari/QLProbe.swift -o "$app/QLProbe"
  cp docs/scripts/ios-safari/QLProbe-Info.plist "$app/Info.plist"
  codesign --force --sign - "$app"
  (cd "$page" && python3 -m http.server $PORT --bind 127.0.0.1 > "$OUT/preview.log" 2>&1) &
  server=$!
  ready="http://localhost:$PORT/index.json"
elif [ "$PROBE" = jpeg ] || [ "$PROBE" = photo-memory ]; then
  # A blank page on an http origin is all the JPEG probe needs; the photo-memory probe serves its own pages.
  page="$RUNNER_TEMP/jpeg-probe-page"
  mkdir -p "$page"
  printf '<!doctype html><title>jpeg probe</title>\n' > "$page/index.html"
  (cd "$page" && python3 -m http.server $PORT > "$OUT/preview.log" 2>&1) &
  server=$!
  ready="http://localhost:$PORT/"
else
  # The docs site, served the way the e2e suite serves it. The workflow's docs-site job builds it once on Linux and this
  # job downloads it into docs/dist (D1 B on #3034: that build cost each macOS job 65-94 s); serving still needs docs'
  # own dependencies. Run by hand, or without the download, the script builds it here as before.
  if [ -f docs/dist/.prebuilt ]; then
    echo "using the prebuilt docs site ($(cat docs/dist/.prebuilt))"
    (cd docs && npm ci)
  else
    (cd docs && npm ci && npm run build:e2e)
  fi
  if [ "$PROBE" = font-cache ]; then
    # The font cache probe needs to count what reaches the server, on two origins, under GitHub Pages' cache header
    # (font-cache-server.mjs): the control arm on $PORT, the warm arm on the next port.
    # run.mjs reads the warm arm's origin from WARM_URL, which defaults to the next port.
    (cd docs && node scripts/ios-safari/font-cache-server.mjs $PORT $((PORT + 1)) > "$OUT/preview.log" 2>&1) &
  else
    (cd docs && PREVIEW_PORT=$PORT node scripts/preview-e2e.mjs > "$OUT/preview.log" 2>&1) &
  fi
  server=$!
  ready="http://localhost:$PORT/studio/"
  [ "$PROBE" = focus-sync ] && ready="http://localhost:$PORT/playground/"
fi
for _ in $(seq 1 120); do curl -sf "$ready" >/dev/null && break; sleep 1; done
curl -sf "$ready" >/dev/null

sudo safaridriver --enable
driver=
# (Re)start safaridriver and wait until it answers. It can die after a timed-out session (a PR run's next session attempt then
# got ECONNREFUSED on :4444), so this runs before every start, not once. Every curl is bounded: a driver that accepts the
# connection and never replies must not hold the job until its timeout.
start_driver() {
  if [ -n "$driver" ] && kill -0 "$driver" 2>/dev/null && curl -sf -m 5 http://localhost:4444/status >/dev/null; then return 0; fi
  if [ -n "$driver" ]; then
    echo 'safaridriver is not answering: restarting it'
    kill "$driver" 2>/dev/null || true
    wait "$driver" 2>/dev/null || true
  fi
  safaridriver --port 4444 &
  driver=$!
  for _ in $(seq 1 30); do curl -sf -m 5 http://localhost:4444/status >/dev/null && return 0; sleep 1; done
  echo 'safaridriver did not answer on :4444 within 30 s' >&2
  return 1
}
# Run a command for at most $1 seconds: macOS ships no `timeout`, and perl's alarm survives the exec.
bounded() { local secs=$1; shift; perl -e 'alarm shift @ARGV; exec @ARGV or die "exec: $!"' "$secs" "$@"; }
# The most a Safari launch may take before the device counts as stuck (seconds); see the launch below.
LAUNCH_LIMIT=${LAUNCH_LIMIT:-480}
trap 'kill "$driver" "$server" 2>/dev/null || true; xcrun simctl shutdown all || true' EXIT
start_driver

status=0
# A device that failed before any probe ran (rc 3-5) is the infrastructure; one whose probe failed (rc 1) is a finding.
probe_failed=0
families='iPad iPhone'
# The focus-sync probe needs the Playground's two-pane layout (wider than 820 px): the iPad Pro 13-inch, in portrait,
# is 1032 px wide, and a phone is never wide enough, so it runs on that iPad alone.
[ "$PROBE" = focus-sync ] && families='iPad'
# The office probe stands in for the owner's iPhone (Preview, opened from Files): the iPhone alone, to fit the job.
[ "$PROBE" = office ] && families='iPhone'
# The Present memory probe stands in for the owner's iPhone, where Present on a deck of photos reloaded the tab (#3148).
[ "$PROBE" = present-memory ] && families='iPhone'
# The completion probe (one-off for PR #3174): an iPad (a hardware-keyboard device) and the Mac's Safari.
[ "$PROBE" = completion ] && families='iPad'
# DEVICES picks the devices one job runs, from iPad, iPhone and Mac (the undo probe's desktop half), so a suite can run
# each device as its own job: the three undo devices one after another took 25.4 min of a 30-min job and passed it
# twice (flaky shape F4, engineering/decisions/2026-11-06-flaky-tests.md), each about 3 min of probe and the rest
# simulator boots. Unset, a probe runs every device it runs today.
run_mac=1
if [ -n "${DEVICES:-}" ]; then
  # A subset of the probe's own devices: focus-sync is iPad-only and office iPhone-only, and DEVICES cannot widen that.
  allowed=" $families "
  families=''
  run_mac=0
  for d in ${DEVICES//,/ }; do
    case "$d" in
      iPad|iPhone)
        case "$allowed" in *" $d "*) families="$families $d" ;; *) echo "DEVICES: the $PROBE probe does not run on $d" >&2; exit 1 ;; esac ;;
      Mac) run_mac=1 ;;
      *) echo "DEVICES: unknown device '$d' (iPad, iPhone, Mac)" >&2; exit 1 ;;
    esac
  done
  # A selection this probe runs nothing on must fail, not pass with nothing tested: only the undo probe has a Mac half.
  if [ -z "${families// /}" ] && { { [ "$PROBE" != undo ] && [ "$PROBE" != completion ]; } || [ "$run_mac" = 0 ]; }; then
    echo "DEVICES='$DEVICES' selects no device the $PROBE probe runs on" >&2
    exit 1
  fi
fi
if [ -n "${families// /}" ]; then
  runtime=$(xcrun simctl list runtimes --json | jq -r '[.runtimes[] | select(.platform == "iOS" and .isAvailable)]
    | sort_by(.version | split(".") | map(tonumber)) | last | .identifier // empty')
  if [ -z "$runtime" ]; then echo 'no iOS Simulator runtime on this runner' >&2; exit 1; fi
  echo "runtime: $runtime"
fi
# Devices still to run, this one included: the second-start budget below has to leave them their time.
left=$(echo $families | wc -w)
for family in $families; do
  device_t0=$SECONDS
  device_type=$(xcrun simctl list devices available --json | jq -r --arg rt "$runtime" --arg f "$family" --arg p "$PROBE" \
    '[.devices[$rt][] | select(.name | startswith($f))] as $all
     | (if $p == "focus-sync" then ([$all[] | select(.name | test("13-inch|12.9"))] | first) else null end) // ($all | first)
     | .deviceTypeIdentifier // empty')
  # A missing device type is a runner-image or script fault, not a simulator that would not connect: a finding, never re-run.
  if [ -z "$device_type" ]; then echo "no $family device type for $runtime" >&2; status=1; probe_failed=1; continue; fi
  xcrun simctl shutdown all || true
  udid=$(xcrun simctl create "lattice-$family" "$device_type" "$runtime")
  echo "$family: $device_type ($udid)"
  xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" -b
  # Written inside the booted device, then booted again below. Writing them into its preference files before the first
  # boot was tried to save that boot; the first boot did not keep them on either device (run 43361835881).
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
  # The office probe shows each file in QLProbe and captures the screen: no WebDriver session, no Safari
  # (docs/scripts/ios-safari/office-capture.mjs says why).
  if [ "$PROBE" = office ]; then
    xcrun simctl shutdown "$udid" || true
    xcrun simctl boot "$udid" && xcrun simctl bootstatus "$udid" -b
    SIM_UDID="$udid" SIM_LABEL="$family" OFFICE_INDEX="$ROOT/platform-suite-artifacts/office-quicklook/index.json" \
      APP_DIR="$app" ARTIFACT_DIR="$OUT" node docs/scripts/ios-safari/office-capture.mjs || { status=1; probe_failed=1; }
    xcrun simctl shutdown "$udid" || true
    left=$((left - 1))
    continue
  fi
  # Exit 3 from run.mjs means no session was ever created, so no probe code ran: safaridriver could not reach this
  # simulator, or safaridriver itself died. In main's first three iOS nightlies every failure was this one, and run.mjs's own
  # session attempts do not help when the device or the driver is what is stuck. So a stuck start gets ONE second start: a
  # reboot, a fresh Safari and a fresh safaridriver. A probe failure (exit 1) is never retried.
  # The second start must not cost the job its 30-minute limit (.github/workflows/platform-suites.yml), which would cancel
  # it and lose the devices still to come. So it runs only if one more cycle of this device, and every device after it,
  # each at what this device's first start just cost, still ends by SUITE_DEADLINE seconds of this script (default 1560:
  # the job's 1800, less about 180 before the Suite step and a minute's margin). The Studio suites run one device per job
  # (DEVICES), so each has room for its second start, as jpeg and focus-sync do.
  # The first start makes 2 session attempts, not 3, to leave the second one its time.
  rc=3
  why=''
  for start in 1 2; do
    if [ "$start" = 2 ]; then
      cycle=$((SECONDS - device_t0))
      need=$((cycle * left))
      if [ $((SECONDS + need)) -gt "${SUITE_DEADLINE:-1560}" ]; then
        echo "$family: no second start: ${SECONDS} s gone, and $left device start(s) of about ${cycle} s each would pass ${SUITE_DEADLINE:-1560} s"
        # Without a second start this device would get fewer session attempts than main's three: make the third here, in
        # place, 20 s on, as run.mjs would have.
        if [ "$rc" = 3 ]; then
          echo "$family: one more session attempt in place"
          # Relaunch Safari in the simulator first: a session that timed out (or a safaridriver that died) leaves Safari
          # paired with it, and the next session is then refused with "The Safari instance is already paired with another
          # WebDriver session" (main's nightly, 2026-11-01, #2911). A relaunch drops the pairing without a device reboot.
          xcrun simctl terminate "$udid" com.apple.mobilesafari || true
          sleep 2
          bounded "$LAUNCH_LIMIT" xcrun simctl launch "$udid" com.apple.mobilesafari || true
          sleep 18
          if start_driver; then
            rc=0
            SESSION_ATTEMPTS=1 PROBE="$PROBE" SIM_UDID="$udid" SIM_LABEL="$family" ARTIFACT_DIR="$OUT" STUDIO_URL="http://localhost:$PORT" node docs/scripts/ios-safari/run.mjs || rc=$?
          fi
        fi
        break
      fi
      echo "$family: $why on start 1 of 2; rebooting it and restarting safaridriver"
      kill "$driver" 2>/dev/null || true
      wait "$driver" 2>/dev/null || true
      driver=
    fi
    xcrun simctl shutdown "$udid" || true
    t0=$SECONDS
    if ! { xcrun simctl boot "$udid" && xcrun simctl bootstatus "$udid" -b; }; then
      rc=5; why='the simulator did not boot'; continue
    fi
    echo "$family: boot took $((SECONDS - t0)) s"
    # Bounded: a launch that never returned held the iPad job silent for 18 minutes, until the job's 30-minute limit
    # canceled it (run 43355906725). It now fails here, so run.sh ends it as "no probe ran" and the supervisor
    # (.github/workflows/platform-suites-supervisor.yml) re-runs the job on a fresh runner, instead of the limit
    # canceling it as a finding. LAUNCH_LIMIT is generous on purpose until the logged launch times say how far it can
    # come down: the launch alone took 156 s and 252 s on run 43370280534, the slowest measured. The boot is not
    # bounded the same way: one first boot took 432 s on a slow runner (run 43355906725) and none has hung, so a limit
    # there would be a guess.
    t0=$SECONDS
    if ! bounded "$LAUNCH_LIMIT" xcrun simctl launch "$udid" com.apple.mobilesafari; then
      rc=5; why="Safari did not launch within $LAUNCH_LIMIT s"; continue
    fi
    echo "$family: Safari launch took $((SECONDS - t0)) s"
    sleep 5
    if ! start_driver; then rc=4; why='safaridriver did not answer'; continue; fi
    rc=0
    attempts=3
    [ "$start" = 1 ] && attempts=2
    SESSION_ATTEMPTS=$attempts PROBE="$PROBE" SIM_UDID="$udid" SIM_LABEL="$family" ARTIFACT_DIR="$OUT" STUDIO_URL="http://localhost:$PORT" node docs/scripts/ios-safari/run.mjs || rc=$?
    [ "$rc" = 3 ] || break
    why='no session'
  done
  if [ "$rc" != 0 ]; then
    status=1
    case "$rc" in 3|4|5) ;; *) probe_failed=1 ;; esac
    case "$rc" in 3|4|5) echo "$family: $why, so no probe ran: the simulator or safaridriver failed, not the probe" >&2 ;; esac
    xcrun simctl list devices booted || true
    for domain in com.apple.webinspectord com.apple.mobilesafari; do
      echo "--- $domain"; xcrun simctl spawn "$udid" defaults read "$domain" || true
    done
  fi
  xcrun simctl shutdown "$udid" || true
  left=$((left - 1))
done

# The undo probe's desktop half: the runner's own Safari, through the same safaridriver.
if { [ "$PROBE" = undo ] || [ "$PROBE" = completion ]; } && [ "$run_mac" = 1 ]; then
  xcrun simctl shutdown all || true
  if ! PROBE=$PROBE SIM_UDID=mac SIM_LABEL=macOS ARTIFACT_DIR="$OUT" STUDIO_URL="http://localhost:$PORT" node docs/scripts/ios-safari/run.mjs; then
    status=1
    probe_failed=1
  fi
fi

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
if [ "$status" != 0 ] && [ "$probe_failed" = 0 ]; then
  echo 'no probe ran on any device that failed: exit 3, so the supervisor re-runs this job once (NO_SESSION_MARK)' >&2
  printf 'no-session\n' > "$NO_SESSION_MARK"
  exit 3
fi
exit $status
