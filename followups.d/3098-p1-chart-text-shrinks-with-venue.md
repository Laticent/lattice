---
origin: 3098
priority: P1
recorded: 2026-11-09
area: chart
severity: high
swimlane: engineering/decisions/2026-11-09-type-hierarchy-study.md
deferred: large — every chart kind draws its text in viewBox units inside an SVG that scales to its box, so making chart text follow the venue touches the shared chart frame and each kind's label budget, and wants its own measurement across kinds and venues
---

# Chart text shrinks as the venue grows

why now   — `venue:` exists so the back row can read the slide, and it does the opposite to charts. The venue lifts every `--fs-*` role, the chart's box shrinks to make room, and the SVG scales its viewBox text down with it. Measured on a bar and a line chart in today's engine with no style block: category labels 14.1 px at laptop and 8.7 px at hall, axis numbers 13.1 px and 8.1 px. On the repo's own legibility model (engineering/typography.md §7) that is 2.3–2.5′ of x-height at the hall's back row, under the ~5′ floor where letters can be made out; conference is under it too.
where     — the chart frame and kernels (lib/plugins/chart-family/, lib/transformers/chart-frame.js); the venue rungs and lifts (lib/typography/emit.js, base.modifiers.css `venue-*`).
done when — every chart kind's category labels, axis numbers, data labels and key hold at least the meta role's back-row size at every venue (about 8′ at the venue's back row), measured on a gallery deck at laptop, huddle, conference and hall; a test pins it.
evidence  — engineering/decisions/2026-11-09-type-hierarchy-study.md §10; reproduce with the study's probe deck plus `venue: hall` and `node tools/type-voice-audit.mjs`-style measurement of the chart's tspans.
verify    — tier 2: maker-checker on the chart frame change; renders of the chart gallery at all four venues, light and dark.
