#!/usr/bin/env bash
# Wall CI job containers off from everything private, while leaving them the public internet
# (GitHub, npm, Ubuntu mirrors):
#
#   - FORWARD (Docker's DOCKER-USER chain): no traffic from the CI subnet to any private range:
#     your home LAN, the router's admin page, the other CI machines on the same VLAN, Tailscale
#     (100.64.0.0/10) and link-local metadata (169.254.0.0/16).
#   - INPUT: no new connections from the CI bridge to this host itself (its sshd, anything
#     listening on 0.0.0.0, its own Tailscale address). Traffic to an address the host owns
#     goes through INPUT, which DOCKER-USER never sees.
#
# This is the second wall. The first is the CI VLAN on your router, which cannot stop two
# machines on the SAME VLAN from reaching each other; these rules can. Idempotent; the
# supervisor re-runs it at every start.
#
# Usage: sudo ./firewall.sh <subnet> <bridge>   e.g. 172.31.250.0/24 lattice-ci0
#
# IPv4 only: the lattice-ci network is created without IPv6, so containers have no v6 route.
set -euo pipefail

subnet="${1:?usage: firewall.sh <subnet> <bridge>}"
bridge="${2:?usage: firewall.sh <subnet> <bridge>}"
private=(10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16 198.18.0.0/15 192.0.0.0/24)
tag=(-m comment --comment lattice-ci-isolate)

add() {  # add <chain> <rule...>: insert once
  local chain="$1"; shift
  iptables -C "$chain" "$@" 2>/dev/null || iptables -I "$chain" "$@"
}

iptables -N DOCKER-USER 2>/dev/null || true
for dest in "${private[@]}"; do
  add DOCKER-USER -s "$subnet" -d "$dest" "${tag[@]}" -j REJECT --reject-with icmp-net-prohibited
done

# Replies to connections the host opened stay allowed; anything a container starts toward the
# host is refused. Docker's embedded DNS (127.0.0.11) runs inside each container's own network
# namespace, so it is unaffected.
add INPUT -i "$bridge" -s "$subnet" -m conntrack ! --ctstate ESTABLISHED,RELATED "${tag[@]}" \
  -j REJECT --reject-with icmp-port-unreachable

echo "firewall: $subnet on $bridge blocked from the host and from ${private[*]}"
