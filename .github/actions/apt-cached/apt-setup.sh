#!/usr/bin/env bash
# Make apt robust against one bad package mirror, before any apt call in CI (owner call, 2026-11-11).
#
#   apt-setup.sh            write the retry policy, and the mirror list wherever apt reads one
#
# Why: on 2026-11-11 every integration shard of PR #3136 died in `apt-get install poppler-utils` with "Temporary failure
# resolving 'azure.archive.ubuntu.com'", twice, about 35 minutes apart, before a single test ran. GitHub's Ubuntu images
# point apt at a mirror LIST (`mirror+file:/etc/apt/apt-mirrors.txt`), and apt moves down that list when one mirror
# fails; the image's list is short. This writes a longer one and gives every download three tries.
#
# Two things, both idempotent:
#   1. /etc/apt/apt.conf.d/80-lattice-retries: three retries per download, short connect and read timeouts, so a dead
#      mirror costs seconds, not minutes, before apt moves on.
#   2. /etc/apt/apt-mirrors.txt, in priority order. Written where the system already reads a mirror list (the runner
#      images). Where it does not (a container), the stock `archive.ubuntu.com` entry in ubuntu.sources is pointed at the
#      list, so a container gets the same fallbacks. The security pocket keeps its own entry.
set -euo pipefail
SUDO=; [ "$(id -u)" = 0 ] || SUDO=sudo

$SUDO tee /etc/apt/apt.conf.d/80-lattice-retries >/dev/null <<'CONF'
Acquire::Retries "3";
Acquire::Retries::Delay::Maximum "30";
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
Acquire::ConnectionAttemptDelayMsec "250";
CONF

# Ubuntu's own archive and well-known full mirrors of it. Every one carries noble, noble-updates, noble-backports and
# noble-security for amd64 (the runners are amd64; ports are out of scope).
#
# THE ORDER IS MEASURED. On 2026-11-11 (15:26 UTC), 20 fetches each from a network unrelated to GitHub's: the two names
# Ubuntu serves from Azure Traffic Manager failed to RESOLVE about half the time (azure.archive 8 of 20, us.archive 8 of
# 20), archive.ubuntu.com and security.ubuntu.com once each, mirrors.edge.kernel.org and Princeton never. The runner
# image puts azure.archive first, which is how every integration shard of #3136 failed. So the mirrors that never failed
# lead, the Azure-backed names follow, and security.ubuntu.com, which holds only the security pocket, is last: apt asks
# it for the others only when every mirror above has failed.
mirrors() {
  printf '%s\tpriority:%s\n' \
    http://mirrors.edge.kernel.org/ubuntu/ 1 \
    http://archive.ubuntu.com/ubuntu/ 2 \
    http://mirror.math.princeton.edu/pub/ubuntu/ 3 \
    http://azure.archive.ubuntu.com/ubuntu/ 4 \
    http://us.archive.ubuntu.com/ubuntu/ 5 \
    http://security.ubuntu.com/ubuntu/ 6
}

if [ -f /etc/apt/apt-mirrors.txt ] || grep -qs 'mirror+file:/etc/apt/apt-mirrors.txt' /etc/apt/sources.list.d/*.sources /etc/apt/sources.list; then
  mirrors | $SUDO tee /etc/apt/apt-mirrors.txt >/dev/null
elif [ -f /etc/apt/sources.list.d/ubuntu.sources ] && grep -q '^URIs: http://archive.ubuntu.com/ubuntu/\?$' /etc/apt/sources.list.d/ubuntu.sources; then
  mirrors | $SUDO tee /etc/apt/apt-mirrors.txt >/dev/null
  $SUDO sed -i 's#^URIs: http://archive.ubuntu.com/ubuntu/\?$#URIs: mirror+file:/etc/apt/apt-mirrors.txt#' /etc/apt/sources.list.d/ubuntu.sources
fi
echo "apt-setup.sh: retries 3, mirrors: $(mirrors | cut -f1 | tr '\n' ' ')"
