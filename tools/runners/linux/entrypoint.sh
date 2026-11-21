#!/usr/bin/env bash
# Container entrypoint: run exactly one job from a just-in-time (JIT) runner config, then exit.
#
# The supervisor (runner-supervisor.sh) asks GitHub for a JIT config and passes it in
# LATTICE_JIT_CONFIG. A JIT runner registers itself, takes one job and deregisters, so no
# long-lived registration token ever enters the container.
set -euo pipefail

if [[ -z "${LATTICE_JIT_CONFIG:-}" ]]; then
  echo "entrypoint: LATTICE_JIT_CONFIG is empty; the supervisor must pass it" >&2
  exit 2
fi

cd /home/runner/actions-runner
# Hide the config from the job's environment: steps inherit this process's env otherwise.
jit="$LATTICE_JIT_CONFIG"
unset LATTICE_JIT_CONFIG
exec ./run.sh --jitconfig "$jit"
