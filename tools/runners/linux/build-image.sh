#!/usr/bin/env bash
# Build the lattice-runner image with the newest actions/runner release.
#
# GitHub refuses runners more than about 30 days behind the current release, so rebuild weekly:
# the systemd timer in lattice-runner-image.timer runs this script every Sunday.
#
# Usage: ./build-image.sh [runner-version]
set -euo pipefail
cd "$(dirname "$0")"

version="${1:-}"
if [[ -z "$version" ]]; then
  version=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name)
  version="${version#v}"
fi
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "build-image: bad runner version '$version'" >&2; exit 1; }

echo "build-image: actions/runner $version"
docker build --pull --build-arg "RUNNER_VERSION=$version" -t lattice-runner:latest -t "lattice-runner:$version" .
