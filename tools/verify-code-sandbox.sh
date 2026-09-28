#!/bin/sh
# Start the code-package sandbox check on Linux or macOS.
# tools/verify-code-sandbox.mjs says what it checks. Run it from anywhere:  ./tools/verify-code-sandbox.sh
# It needs Node.js 22.12 or newer and this repository's dependencies; it offers to install those.
set -u
# The report goes where the tester started.
VERIFY_REPORT_DIR=$(pwd)
export VERIFY_REPORT_DIR
cd "$(dirname "$0")/.." || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node.js 22 (LTS) or newer from https://nodejs.org, then run this again."
  exit 1
fi
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)'; then
  echo "Node.js $(node -v) is too old. Install Node.js 22.12 or newer from https://nodejs.org, then run this again."
  exit 1
fi
if [ ! -d node_modules/puppeteer ]; then
  echo "This repository's dependencies are not installed yet (about 2 minutes, downloads a browser)."
  printf "Install them now with \"npm ci\"? [y/n] "
  read -r answer
  case "$answer" in
    y|Y|yes) npm ci || { echo "npm ci failed; see the messages above."; exit 1; } ;;
    *) echo "Run \"npm ci\" in $(pwd), then run this again."; exit 1 ;;
  esac
fi
exec node tools/verify-code-sandbox.mjs "$@"
