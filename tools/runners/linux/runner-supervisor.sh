#!/usr/bin/env bash
# Keep N single-use Linux runners alive: each slot asks GitHub for a just-in-time runner config,
# runs one job in a fresh lattice-runner container, deletes the container, and starts over.
#
# Nothing a job writes survives it: no shared volume, no Docker socket, no host mount. That is
# the point, because this repo is public and pull_request jobs from forks run here too.
#
# Config: /etc/lattice-runner/env (root-only, mode 0600), see runner.env.example.
# Run by: lattice-runners.service (systemd). Runbook: engineering/self-hosted-runners.md
set -euo pipefail

ENV_FILE="${LATTICE_RUNNER_ENV:-/etc/lattice-runner/env}"
# shellcheck source=/dev/null
[[ -r "$ENV_FILE" ]] && source "$ENV_FILE"

: "${GITHUB_PAT:?set GITHUB_PAT in $ENV_FILE (fine-grained token, Administration: read and write on the repo)}"
REPO="${LATTICE_REPO:-Laticent/lattice}"
SLOTS="${LATTICE_SLOTS:-8}"
CPUS="${LATTICE_CPUS_PER_JOB:-3}"
MEMORY="${LATTICE_MEMORY_PER_JOB:-5500m}"
SHM="${LATTICE_SHM_PER_JOB:-2g}"
HOST_LABEL="${LATTICE_HOST_LABEL:-$(hostname -s)}"
LABELS="${LATTICE_LABELS:-self-hosted,linux,x64,lattice-linux}"
IMAGE="${LATTICE_IMAGE:-lattice-runner:latest}"
NETWORK="${LATTICE_NETWORK:-lattice-ci}"
HEALTHCHECK_URL="${LATTICE_HEALTHCHECK_URL:-}"

log() { printf '%s slot=%s %s\n' "$(date -u +%FT%TZ)" "${slot:-main}" "$*"; }

# Ask GitHub for a one-job runner registration. Prints the encoded JIT config on stdout.
jit_config() {
  local name="$1" labels_json body
  labels_json=$(jq -cn --arg l "$LABELS,$HOST_LABEL" '$l | split(",") | map(select(length > 0))')
  body=$(jq -cn --arg n "$name" --argjson l "$labels_json" \
    '{name: $n, runner_group_id: 1, labels: $l, work_folder: "_work"}')
  curl -fsS -X POST \
    -H "Authorization: Bearer $GITHUB_PAT" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/$REPO/actions/runners/generate-jitconfig" \
    -d "$body" | jq -er .encoded_jit_config
}

run_slot() {
  local slot="$1" backoff=5 name jit
  while true; do
    name="${HOST_LABEL}-${slot}-$(date -u +%Y%m%d%H%M%S)"
    if ! jit=$(jit_config "$name"); then
      log "could not get a JIT config; retrying in ${backoff}s"
      sleep "$backoff"; backoff=$(( backoff < 300 ? backoff * 2 : 300 ))
      continue
    fi
    backoff=5
    log "waiting for a job as $name"
    # --rm: the container and everything the job wrote are deleted when it exits.
    docker run --rm --name "$name" \
      --network "$NETWORK" \
      --cpus "$CPUS" --memory "$MEMORY" --memory-swap "$MEMORY" --shm-size "$SHM" \
      --pids-limit 8192 \
      -e LATTICE_JIT_CONFIG="$jit" \
      "$IMAGE" || log "runner exited with status $? (job result is on GitHub)"
    unset jit
  done
}

heartbeat() {
  [[ -n "$HEALTHCHECK_URL" ]] || return 0
  while true; do curl -fsS -m 10 "$HEALTHCHECK_URL" >/dev/null || true; sleep 60; done
}

SUBNET="${LATTICE_SUBNET:-172.31.250.0/24}"
docker network inspect "$NETWORK" >/dev/null 2>&1 \
  || docker network create --subnet "$SUBNET" "$NETWORK" >/dev/null
# Block job containers from the home network, even if the VLAN is misconfigured.
"$(dirname "$0")/firewall.sh" "$SUBNET"
docker image inspect "$IMAGE" >/dev/null || { log "image $IMAGE missing: run build-image.sh"; exit 1; }

log "starting $SLOTS slots on $REPO (labels: $LABELS,$HOST_LABEL; ${CPUS} CPUs, $MEMORY each)"
pids=()
for slot in $(seq 1 "$SLOTS"); do
  run_slot "$slot" & pids+=("$!")
  sleep 2   # stagger the JIT requests
done
heartbeat & pids+=("$!")

trap 'log "stopping"; kill "${pids[@]}" 2>/dev/null; docker ps -q --filter "name=^${HOST_LABEL}-" | xargs -r docker stop -t 30; exit 0' TERM INT
wait
