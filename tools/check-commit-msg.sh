#!/usr/bin/env bash
# Validate commit message format: `area(scope): summary` or `area: summary`.
# Matches the convention in engineering/workflow.md.
#
# Then WARN (never block) on British spellings from tools/us-english.js
# (HARD RULE #21). This is the ONLY automated spelling check left: the repo-wide
# build:check ratchet was deleted once the tree was swept, and #21 is discipline
# now. It covers the surface that measured real drift — 21 British spellings in
# the last 300 commit subjects and bodies. It warns rather than blocks because a message legitimately quotes
# British-spelled text (an upstream error string, a dependency's option name),
# and HARD RULE #14 forbids `--no-verify` as the way out of a false positive.
#
# Allows merges, reverts, fixups, squashes (git's machine-generated forms),
# and empty messages (git's own validation handles those).
#
# Usage: tools/check-commit-msg.sh <path-to-commit-msg-file>

set -euo pipefail

msg_file="${1:?usage: $0 <commit-msg-file>}"
first_line=$(head -n1 "$msg_file")

# The advisory US-English scan. Always exits 0 — see the header.
warn_dialect() {
  node "$(dirname "$0")/us-english.js" --warn "$msg_file" || true
}

# Pass-through: git's own machine-generated messages and empty lines.
case "$first_line" in
  '') exit 0 ;;
  'Merge '*|'Revert '*|'fixup! '*|'squash! '*|'amend! '*) warn_dialect; exit 0 ;;
esac

# Format: lowercase area, optional (scope), optional ! (breaking-change
# marker per conventional-commits), colon, space, then summary text.
# area     = [a-z][a-z0-9-]*
# scope    = optional, parenthesized, lowercase letters/digits/comma/dot/space/hyphen
# !        = optional, signals a breaking change (e.g. `ci(node)!: drop Node 18`)
# summary  = at least one non-space character
if echo "$first_line" | grep -qE '^[a-z][a-z0-9-]*(\([a-z0-9.,\ -]+\))?!?: \S'; then
  warn_dialect
  exit 0
fi

cat >&2 <<EOF
Commit message format: area(scope): short summary

Examples (from this repo's history):
  fix(test): use glob for node --test on Node 22
  feat(quadrant): native 2×2 chart-family member
  docs(workflow): note lint script and lefthook in PR checklist
  chore(lint): adopt Biome for linting

Got:
  ${first_line}
EOF
exit 1
