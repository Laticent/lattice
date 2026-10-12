---
group: Test & verify
---
Render every shipped deck (examples + component galleries + the baseline deck) and ratchet the per-deck CLIPPED pages against test/integration/overflow-baseline.json. Catches an engine change that quietly over-subscribes the corpus — nothing else measures fit corpus-wide. On-demand (185 real renders), not a blocking CI gate.
