#!/usr/bin/env bash
# The Android platform suite (#3356): Chrome on an Android emulator, on a GitHub Linux runner (ubuntu-24.04, which exposes
# KVM). It serves the docs site, boots an emulator, opens the Studio in Chrome and runs probe.mjs, which taps Library →
# Import and reads what Android's file chooser offers. Evidence (XML dumps, screenshots, result.json) goes to
# platform-suite-artifacts/android. Run from the repo root after `npm ci` and `npm run build`.
#
# The emulator reaches the runner as 10.0.2.2. The system image is Google APIs x86_64 (it ships Chrome and allows `adb
# root`, which the first-run flags below need). Every wait is bounded: the boot by BOOT_LIMIT, the whole probe by the
# job's own timeout.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
OUT="$ROOT/platform-suite-artifacts/android"
mkdir -p "$OUT"
PORT=4321
API=${ANDROID_API:-34}
IMAGE="system-images;android-$API;google_apis;x86_64"
BOOT_LIMIT=${BOOT_LIMIT:-420}
# A failure before the probe runs (no AVD, an emulator that exits or never boots, an image without Chrome) is the runner's,
# not a finding: write the iOS suites' `no-session` mark so tools/platform-suites-triage.js calls it infra, and the nightly
# re-runs once before it files the alert. A probe that ran and failed never writes it.
infra() { echo "$1" >&2; printf 'no-session\n' > "$ROOT/platform-suite-artifacts/no-session"; exit 3; }

# KVM: the runner has it, but only root can open it until a udev rule says otherwise (GitHub's documented step).
echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules >/dev/null
sudo udevadm control --reload-rules
sudo udevadm trigger --name-match=kvm
ls -l /dev/kvm

SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/usr/local/lib/android/sdk}}"
SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"
AVDMANAGER="$SDK/cmdline-tools/latest/bin/avdmanager"
yes | "$SDKMANAGER" --licenses >/dev/null || true
"$SDKMANAGER" --install emulator platform-tools "$IMAGE" >/dev/null
ADB="$SDK/platform-tools/adb"
# One AVD folder for both tools: avdmanager and the emulator otherwise disagree about where an AVD lives (the first run's
# emulator said "Unknown AVD name [probe]" after avdmanager had made it somewhere else).
export ANDROID_AVD_HOME="${RUNNER_TEMP:-$HOME}/android-avd"
mkdir -p "$ANDROID_AVD_HOME"
echo no | "$AVDMANAGER" create avd --force -n probe -k "$IMAGE" -d pixel_6
"$SDK/emulator/emulator" -list-avds | grep -qx probe || infra "avdmanager did not make the 'probe' AVD in $ANDROID_AVD_HOME"

# The docs site, as the iOS suite serves it, plus the probe's control page: one input that accepts only PDFs. By MIME type:
# Chrome on Android does not filter on an extension (the ninth dispatch: accept=".pdf" offered Camera, Camcorder, Media).
if [ -f docs/dist/.prebuilt ]; then
  echo "using the prebuilt docs site ($(cat docs/dist/.prebuilt))"
  (cd docs && npm ci)
else
  (cd docs && npm ci && npm run build:e2e)
fi
cat > docs/dist/__chooser-control.html <<'HTML'
<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chooser control</title>
<input type="file" accept="application/pdf" aria-label="Pick a PDF" style="display:block;width:80vw;height:30vh;margin:10vh auto">
HTML
# Bound to IPv4 127.0.0.1: the emulator's 10.0.2.2 is the runner's 127.0.0.1, and astro's default `localhost` bound IPv6
# ::1 alone on the runner (the fourth dispatch: Chrome said ERR_CONNECTION_REFUSED while curl localhost passed over ::1).
# `exec`: the subshell becomes node, so the trap's kill stops the server itself, not only its parent shell.
(cd docs && PREVIEW_PORT=$PORT PREVIEW_HOST=127.0.0.1 exec node scripts/preview-e2e.mjs > "$OUT/preview.log" 2>&1) &
server=$!

"$SDK/emulator/emulator" -avd probe -cores 4 -memory 4096 -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect \
  -camera-back emulated -camera-front emulated > "$OUT/emulator.log" 2>&1 &
emu=$!
trap 'kill "$server" "$emu" 2>/dev/null || true' EXIT

for _ in $(seq 1 120); do curl -sf "http://127.0.0.1:$PORT/studio/" >/dev/null && break; sleep 1; done
curl -sf "http://127.0.0.1:$PORT/studio/" >/dev/null
curl -sf "http://127.0.0.1:$PORT/__chooser-control.html" >/dev/null

# Bounded: an emulator that exits (a bad AVD, no KVM) must fail the suite at once, not hang it until the job is cancelled.
booted=0
for _ in $(seq 1 "$BOOT_LIMIT"); do
  kill -0 "$emu" 2>/dev/null || { tail -20 "$OUT/emulator.log" >&2; infra "the emulator exited (its log is above)"; }
  if [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; then booted=1; break; fi
  sleep 1
done
[ "$booted" = 1 ] || infra "the emulator did not finish booting within ${BOOT_LIMIT} s"
# CHROMIUM_SNAPSHOT=<revision> installs the official Chromium Android build from Google's snapshot bucket (x86_64, so it
# runs natively here) and probes it instead of the image's own Chrome, which stops at 133 on API 36. Throwaway branch.
if [ -n "${CHROMIUM_SNAPSHOT:-}" ]; then
  CHROME_PKG=org.chromium.chrome
  zip="$RUNNER_TEMP/chromium.zip"
  curl -sfL --retry 3 -o "$zip" "https://commondatastorage.googleapis.com/chromium-browser-snapshots/AndroidDesktop_x64/$CHROMIUM_SNAPSHOT/chrome-android-desktop.zip" || infra "could not download Chromium snapshot $CHROMIUM_SNAPSHOT"
  unzip -o -j -q "$zip" chrome-android-desktop/apks/ChromePublic.apk -d "$RUNNER_TEMP" || infra "the snapshot holds no ChromePublic.apk"
  rm -f "$zip"
  timeout 600 "$ADB" install -r -g "$RUNNER_TEMP/ChromePublic.apk" || infra "adb could not install ChromePublic.apk"
fi
export CHROME_PKG="${CHROME_PKG:-com.android.chrome}"
"$ADB" shell pm list packages "$CHROME_PKG" | grep -q "$CHROME_PKG" || infra "this system image has no $CHROME_PKG"

# Chrome's first-run screens would sit over the page: skip them with Chrome's own command-line file (needs root).
"$ADB" root >/dev/null; timeout 60 "$ADB" wait-for-device
"$ADB" shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line; chmod 644 /data/local/tmp/chrome-command-line'
"$ADB" shell am set-debug-app --persistent "$CHROME_PKG"
# Chrome's own permissions, granted the way a phone in use has them: no notifications prompt, and no camera prompt in
# front of the chooser (the eighth dispatch: Import asked "Allow Chrome to take pictures and record video?" first).
for perm in POST_NOTIFICATIONS CAMERA RECORD_AUDIO READ_MEDIA_IMAGES READ_MEDIA_VIDEO; do
  "$ADB" shell pm grant "$CHROME_PKG" "android.permission.$perm" || true
done
"$ADB" shell am force-stop "$CHROME_PKG"
"$ADB" shell settings put global window_animation_scale 0
"$ADB" shell settings put global transition_animation_scale 0
"$ADB" shell settings put global animator_duration_scale 0
echo "Android $("$ADB" shell getprop ro.build.version.release | tr -d '\r'), Chrome $("$ADB" shell dumpsys package "$CHROME_PKG" | grep -m1 versionName | tr -d '\r ')"

status=0
ADB="$ADB" BASE="http://10.0.2.2:$PORT" OUT="$OUT" node docs/scripts/android/probe.mjs || status=$?
if [ "$status" != 0 ]; then
  # What Android was doing when the probe failed: the activity stack and the device log (a Chrome crash is here).
  "$ADB" shell dumpsys activity activities > "$OUT/activities.txt" 2>&1 || true
  "$ADB" logcat -d > "$OUT/logcat.txt" 2>&1 || true
  grep -E "FATAL|ANR in|has died|Force finishing" "$OUT/logcat.txt" | head -20 || true
fi
exit "$status"
