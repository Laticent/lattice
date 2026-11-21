#!/usr/bin/env bash
# Stop CI job containers from reaching anything on a private network: your home LAN, the router's
# admin page, Tailscale (100.64.0.0/10), cloud metadata (169.254.0.0/16), and each other.
# They keep full access to the public internet (GitHub, npm, Ubuntu mirrors).
#
# This is the second wall. The first is the CI VLAN on your router; this one still holds if the
# VLAN is ever misconfigured. Docker's DOCKER-USER chain is the place Docker reserves for rules
# like this; it is consulted before Docker's own rules and survives Docker restarts while this
# script re-runs at each supervisor start. Idempotent.
#
# Usage: sudo ./firewall.sh 172.31.250.0/24   (the lattice-ci network's subnet)
set -euo pipefail

subnet="${1:?usage: firewall.sh <lattice-ci subnet>}"
private=(10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16)

iptables -N DOCKER-USER 2>/dev/null || true
for dest in "${private[@]}"; do
  rule=(-s "$subnet" -d "$dest" -m comment --comment lattice-ci-isolate -j REJECT --reject-with icmp-net-prohibited)
  iptables -C DOCKER-USER "${rule[@]}" 2>/dev/null || iptables -I DOCKER-USER "${rule[@]}"
done

# The same for IPv6: unique-local and link-local ranges.
if ip6tables -L DOCKER-USER >/dev/null 2>&1; then
  for dest in fc00::/7 fe80::/10; do
    rule=(-d "$dest" -m comment --comment lattice-ci-isolate -j REJECT)
    ip6tables -C DOCKER-USER "${rule[@]}" 2>/dev/null || ip6tables -I DOCKER-USER "${rule[@]}"
  done
fi

echo "firewall: lattice-ci ($subnet) blocked from ${private[*]}"
