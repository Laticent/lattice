---
group: Lint & audit
---
Rewrite the two frozen palette baselines from a live measurement — KNOWN_SUB_THRESHOLD in tools/composed-contrast.js and CVD_FROZEN in test/unit/palette/cvd-trio-floor.test.js. RATCHET-ONLY: an entry may move up, never down by any margin, and a key the audit no longer produces is dropped. Taking a number down stays a manual, argued edit; a table it cannot parse exactly is refused rather than half-read. `--dry-run` prints the delta and writes nothing.
