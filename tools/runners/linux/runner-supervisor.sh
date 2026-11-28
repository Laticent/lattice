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
BRIDGE="${LATTICE_BRIDGE:-lattice-ci0}"
SUBNET="${LATTICE_SUBNET:-172.31.250.0/24}"
# Public resolvers. Docker's built-in DNS forwards a container's queries from the container's own
# network, so a private upstream (the router, Tailscale's 100.100.100.100) would hit firewall.sh's
# private-range REJECT and no job could resolve github.com.
DNS="${LATTICE_DNS:-1.1.1.1 9.9.9.9}"
# A container that lives longer than this is killed: a job that wedges its own runner (or a
# hostile one that freezes Runner.Listener) cannot hold a slot forever. The longest job's
# timeout-minutes is 40; a slot also spends its idle wait inside this budget, then re-registers.
MAX_MINUTES="${LATTICE_MAX_CONTAINER_MINUTES:-180}"
HEALTHCHECK_URL="${LATTICE_HEALTHCHECK_URL:-}"
STATE_DIR="${LATTICE_STATE_DIR:-/run/lattice-runner}"

log() { printf '%s slot=%s %s\n' "$(date -u +%FT%TZ)" "${slot:-main}" "$*"; }

# Authenticated GitHub API call. The token goes to curl on stdin, never on its command line,
# so it does not show in `ps`.
gh_api() {
  local method="$1" path="$2"; shift 2
  printf 'Authorization: Bearer %s\n' "$GITHUB_PAT" | curl -fsS -m 30 -X "$method" \
    -H @- -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/$REPO/$path" "$@"
}

# Ask GitHub for a one-job runner registration. Prints the encoded JIT config on stdout.
jit_config() {
  local name="$1" labels_json body
  labels_json=$(jq -cn --arg l "$LABELS,$HOST_LABEL" '$l | split(",") | map(select(length > 0))')
  body=$(jq -cn --arg n "$name" --argjson l "$labels_json" \
    '{name: $n, runner_group_id: 1, labels: $l, work_folder: "_work"}')
  gh_api POST actions/runners/generate-jitconfig -d "$body" | jq -er .encoded_jit_config
}

# Everything a container needs, checked BEFORE minting a registration: a missing image or
# network must not turn into a loop that mints a new runner many times a second.
ready() {
  docker image inspect "$IMAGE" >/dev/null 2>&1 && docker network inspect "$NETWORK" >/dev/null 2>&1
}

run_slot() {
  local slot="$1" backoff=5 name jit envfile started rc dns_args=()
  for d in $DNS; do dns_args+=(--dns "$d"); done
  while true; do
    if ! ready; then
      log "image $IMAGE or network $NETWORK missing; retrying in ${backoff}s"
      sleep "$backoff"; backoff=$(( backoff < 300 ? backoff * 2 : 300 )); continue
    fi
    name="${HOST_LABEL}-${slot}-$(date -u +%Y%m%d%H%M%S)"
    if ! jit=$(jit_config "$name"); then
      log "could not get a JIT config; retrying in ${backoff}s"
      sleep "$backoff"; backoff=$(( backoff < 300 ? backoff * 2 : 300 )); continue
    fi
    # The config reaches the container through a root-only env file, so it is not in `ps`.
    envfile=$(mktemp "$STATE_DIR/jit-XXXXXX")
    printf 'LATTICE_JIT_CONFIG=%s\n' "$jit" > "$envfile"
    unset jit
    log "waiting for a job as $name"
    started=$SECONDS
    rc=0
    # --rm: the container and everything the job wrote are deleted when it exits. `timeout`
    # kills the docker client at the deadline; the `rm -f` below then kills the container itself.
    timeout --kill-after=60 "${MAX_MINUTES}m" docker run --rm --name "$name" \
      --network "$NETWORK" "${dns_args[@]}" \
      --cpus "$CPUS" --memory "$MEMORY" --memory-swap "$MEMORY" --shm-size "$SHM" \
      --pids-limit 8192 \
      --env-file "$envfile" \
      "$IMAGE" || rc=$?
    rm -f "$envfile"
    docker rm -f "$name" >/dev/null 2>&1 || true
    if (( rc != 0 )); then log "runner exited with status $rc after $(( SECONDS - started ))s (job result is on GitHub)"; fi
    # A container that dies at once (125-127 = docker could not run it) is a host problem,
    # not a job: back off instead of minting again straight away.
    if (( rc >= 125 && rc <= 127 )) || (( SECONDS - started < 30 )); then
      log "container lived $(( SECONDS - started ))s; backing off ${backoff}s"
      sleep "$backoff"; backoff=$(( backoff < 300 ? backoff * 2 : 300 ))
    else
      backoff=5
    fi
  done
}

# Ping the health URL only while the host can actually serve jobs: the token still works (a
# cheap authenticated API read) and the image and network exist. An expired token or a broken
# Docker then turns into an alert, not a green heartbeat over a dead host.
heartbeat() {
  [[ -n "$HEALTHCHECK_URL" ]] || return 0
  while true; do
    if ready && gh_api GET 'actions/runners?per_page=1' >/dev/null 2>&1; then
      curl -fsS -m 10 "$HEALTHCHECK_URL" >/dev/null || true
    else
      curl -fsS -m 10 "$HEALTHCHECK_URL/fail" >/dev/null || true
    fi
    sleep 120
  done
}

pids=()
cleanup() {
  log "stopping"
  kill "${pids[@]}" 2>/dev/null || true
  docker ps -q --filter "name=^${HOST_LABEL}-" | xargs -r docker stop -t 30 >/dev/null || true
  rm -f "$STATE_DIR"/jit-*
  exit 0
}
trap cleanup TERM INT

install -d -m 0700 "$STATE_DIR"
if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  # A fixed bridge name lets firewall.sh match traffic aimed at the host itself (INPUT), and
  # icc=false stops job containers talking to each other without relying on br_netfilter.
  docker network create --subnet "$SUBNET" \
    -o com.docker.network.bridge.name="$BRIDGE" \
    -o com.docker.network.bridge.enable_icc=false "$NETWORK" >/dev/null
fi
# Filter the subnet and bridge the network REALLY has, not the configured ones: a network
# created by hand, or before a config change, would otherwise leave the rules matching nothing.
real_subnet=$(docker network inspect -f '{{(index .IPAM.Config 0).Subnet}}' "$NETWORK")
real_bridge=$(docker network inspect -f '{{index .Options "com.docker.network.bridge.name"}}' "$NETWORK")
if [[ -z "$real_bridge" ]]; then
  log "network $NETWORK has no fixed bridge name; delete it (docker network rm $NETWORK) and restart"
  exit 1
fi
"$(dirname "$0")/firewall.sh" "$real_subnet" "$real_bridge"
ready || { log "image $IMAGE missing: run build-image.sh"; exit 1; }

log "starting $SLOTS slots on $REPO (labels: $LABELS,$HOST_LABEL; ${CPUS} CPUs, $MEMORY each)"
for s in $(seq 1 "$SLOTS"); do
  run_slot "$s" & pids+=("$!")
  sleep 2   # stagger the JIT requests
done
heartbeat & pids+=("$!")
wait
