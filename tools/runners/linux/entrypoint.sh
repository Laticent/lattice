#!/usr/bin/env bash
# Container entrypoint: run exactly one job from a just-in-time (JIT) runner config, then exit.
#
# The supervisor (runner-supervisor.sh) asks GitHub for a JIT config and passes it in
# LATTICE_JIT_CONFIG. A JIT runner registers itself, takes one job and deregisters, so no
# reusable registration token ever enters the container.
#
# The config is NOT secret from the job: it ends up on run.sh's command line, which the job can
# read from /proc. That is acceptable because it is single-use and only registers the runner the
# job is already running on. Unsetting it just keeps it out of the job's environment variables.
set -euo pipefail

if [[ -z "${LATTICE_JIT_CONFIG:-}" ]]; then
  echo "entrypoint: LATTICE_JIT_CONFIG is empty; the supervisor must pass it" >&2
  exit 2
fi

cd /home/runner/actions-runner
jit="$LATTICE_JIT_CONFIG"
unset LATTICE_JIT_CONFIG
exec ./run.sh --jitconfig "$jit"
