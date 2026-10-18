---
origin: 2780
priority: P1
recorded: 2026-10-18
area: website
severity: medium
swimlane: engineering/decisions/2026-10-18-on-demand-styles.md §9
source: https://github.com/Laticent/lattice/pull/2780
---

# A Playground loader for the style modules (E3)

why now   — E2 proved which modules a deck needs; nothing yet loads only those, so no byte is saved. Every later step (regrouping, delivery, export bundles) is measured against this.
where     — dist/styles-min/manifest.json, tools/style-needs.js, docs/src/playground/. Read the note §7 and §8 first.
done when — first-slide bytes and time against the note's §2 baseline, cold and warm, on Chromium and WebKit; no flash of unstyled content; a unit that appears later loads its modules before it shows. Fetched CSS goes through sanitizeStyleText (HARD RULE #22).
evidence  — tools/style-baseline.mjs before/after on the same machine, plus the bench scenario for the optimized path (HARD RULE #19).
verify    — tier 2, the adversarial trio on the final shape: the loader is a style sink (#22) and changes what every deck loads.
