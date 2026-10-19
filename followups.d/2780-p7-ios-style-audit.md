---
origin: 2780
priority: P7
recorded: 2026-10-18
area: infra
severity: low
swimlane: engineering/decisions/2026-10-18-on-demand-styles.md §9
source: https://github.com/Laticent/lattice/pull/2780
---

# Run the style-needs audit and the Playground loader on a real iPhone (WebKit on Linux is done)

Status 2026-10-19: **UNVERIFIED on iOS Safari.** The sandbox has no device, no iOS simulator and no remote-debugging bridge to one, so a headless run cannot stand in (HARD RULE #23). Linux WebKit (Playwright's build) has run the audit on all 293 decks and the Playground loader gate (`tools/style-loader-gate.mjs`) on the sample recorded in the decision note §11. That is the nearest surface reachable here, and it is not iOS.

why now   — two claims rest on engines, not on the device: "no needed module is skipped" (the audit) and "the Playground loader renders what the whole sheet renders" (the gate). Both are proven for Chromium and for Linux WebKit.
where     — a real iPhone with Safari. Nothing in the repo drives one. The cheapest check is by hand, with the production Playground: open `/playground/?styles=full` and `/playground/` with the same deck (paste one from `examples/`), and compare the two screens slide by slide, in light and dark, including a chart slide and a math slide. Then `/playground/?c=kpi&view=read` both ways.
done when — the two screens match on the device and a screenshot pair from it is attached to the decision note, or this file is deleted with the reason written in the note. A mismatch on the device is a bug in the loader: file it with the pair attached.
evidence  — screenshots from the device, two per deck (whole sheet, loader), and the iOS and Safari versions.
verify    — tier 0 gates.
