#!/usr/bin/env bash
# Build the lattice-runner image with the newest actions/runner release, then prune old images.
#
# lattice-runner-image.timer runs this daily. A new runner release rebuilds everything, so jobs
# never spend their first minute self-updating the runner. CACHE_EPOCH (the ISO week) forces a
# full rebuild at least weekly, which is what picks up Ubuntu and Node security fixes: with an
# unchanged runner version, Docker would otherwise reuse every cached layer.
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

epoch=$(date -u +%G-W%V)
echo "build-image: actions/runner $version, cache epoch $epoch"
docker build --pull \
  --build-arg "RUNNER_VERSION=$version" --build-arg "CACHE_EPOCH=$epoch" \
  -t lattice-runner:latest -t "lattice-runner:$version" .

# Each rebuild leaves the previous version's tag and build cache behind (about 5 GB per image).
docker images --format '{{.Repository}}:{{.Tag}}' lattice-runner \
  | grep -vE ":(latest|$version)\$" | xargs -r docker rmi >/dev/null 2>&1 || true
docker image prune -f >/dev/null
docker builder prune -f --keep-storage 20g >/dev/null
