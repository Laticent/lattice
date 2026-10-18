---
origin: 2780
priority: P7
recorded: 2026-10-18
area: infra
severity: low
swimlane: engineering/decisions/2026-10-18-on-demand-styles.md §9
source: https://github.com/Laticent/lattice/pull/2780
---

# Run the style-needs audit on all 281 decks in WebKit, and on a real iPhone

why now   — the claim 'no needed module is skipped' is proven for 281 decks in Chromium but for 29 in WebKit, and not at all on iOS Safari (HARD RULE #23).
where     — node tools/style-needs-audit.mjs --all --engine webkit (about 95 minutes in Chromium; note §10); iOS needs a real device.
done when — 0 misses and 281 of 281 gate-identical in WebKit; iOS marked UNVERIFIED or verified with an artifact.
evidence  — the audit's printed summary, committed to the note.
verify    — tier 0 gates.
