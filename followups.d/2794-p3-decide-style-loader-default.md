---
origin: 2794
priority: P3
recorded: 2026-10-19
area: website
severity: low
swimlane: engineering/decisions/2026-10-18-on-demand-styles.md §11
source: https://github.com/Laticent/lattice/pull/2794
---

# Decide whether the Playground style loader becomes the default

why now   — it ships opt-in (`?styles=modules`). Flipping it is one line (`loaderOn` in docs/src/lib/playground-engine.ts), and the decision is the owner's: it changes what every Playground visitor loads.
where     — docs/src/lib/playground-engine.ts; decision note §11 "Still owed".
done when — all of: the live-frame gate is clean on all 293 decks on Chromium and WebKit; a throttled (cable and 4g) and a WebKit timing table exist; a real-iPhone check passes (2780-p7); and the newcomer bake (`docs/scripts/bake-newcomer-frame.mjs`) carries the floor instead of the whole sheet, because first visitors take the bake and the loader does nothing for them today.
evidence  — the gate summaries, the timing tables, the device screenshots.
verify    — tier 2.
