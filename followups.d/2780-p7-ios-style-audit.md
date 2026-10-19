---
origin: 2780
priority: P7
recorded: 2026-10-18
area: infra
severity: low
swimlane: engineering/decisions/2026-10-18-on-demand-styles.md §9
source: https://github.com/Laticent/lattice/pull/2780
---

# Run the style-needs audit on a real iPhone (WebKit on Linux is done)

why now   — the claim 'no needed module is skipped' is proven for all 293 decks in Chromium and in Playwright's Linux WebKit, but not on iOS Safari (HARD RULE #23).
where     — iOS needs a real device; the audit needs a browser it can drive (note §7).
done when — iOS Safari is verified with an artifact from a device, or stays marked UNVERIFIED in the note.
evidence  — the audit's printed summary, committed to the note.
verify    — tier 0 gates.
