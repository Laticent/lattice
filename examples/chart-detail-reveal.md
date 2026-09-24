---
marp: true
theme: indaco
paginate: true
---

<!-- _class: title silent -->

# Per-mark detail, across the chart family.

`funnel · map · quadrant · speaker-notes channel`

The pie's authored-detail pattern now generalizes. A funnel stage, a map region, or a quadrant item can each carry an indented sub-list. On screen it reveals on hover/tap; in the exported PDF it rides the slide's **speaker note** — the chart pixels stay byte-identical.

---

<!-- _class: statement silent -->

## One source, two surfaces.

The sublist under a mark powers **both** the present-mode reveal popover **and** the static-PDF speaker note. One shared substrate (`mark-detail.js`) tags each mark with `data-mark`, emits an inert `<template class="chart-detail">`, and folds the same detail into the slide note. Open this PDF's note annotations to read each mark's detail.

---

<!-- _class: funnel -->

`Pipeline · 312 opportunities`

## Where deals leak out of the funnel.

The bands show the drop-off; the notes carry the why.

- Discovery `312`
  - Avg 21 days in stage — the longest single step.
  - Two-thirds arrive from inbound, not outbound.
- Qualified `196`
  - Loss here is mostly budget timing, not fit.
- Procurement `108`
  - Legal + security review is the bottleneck.
- Closed-won `44`
  - Median contract 14 months.

---

<!-- _class: map -->

`Program reach · active deployments`

## Where the program runs.

Hover a region on screen; read the note in the PDF.

- Kenya `4.2`
  - Anchor market — 3 regional hubs, 40 staff.
  - Year-on-year growth 28%.
- Nigeria `3.1`
  - Newest expansion; Lagos office opened Q1.
- India `2.8`
  - Largest by volume, thinnest by margin.
- Brazil `2.2`

---

<!-- _class: quadrant -->

`[{Effort, 0..10}, {Reach, 0..100}]`

## Where to put the next dollar.

Each dot carries its own rationale in the note.

- Strategic Bets
  - Scoring model v2 `3, 70`
    - Owner: Platform. A 3-week spike de-risks the whole roadmap.
    - Unblocks per-team calibration below it.
  - Per-team calibration `5, 85`
    - Needs the scoring model first.
- Quick Wins
  - Weekly signal brief `8, 80`
    - Already scoped; one engineer, one sprint.
- Time Sinks
  - Bespoke board export `9, 28`
    - High ask, low reach — defer past this half.

---

<!-- _class: radar -->

`Capability · 0–100`

## Where the team is strong, and where it isn't.

Radar reveals **per-axis** — each dimension carries its own note.

- This quarter
  - Delivery `82`
    - Up 12 points since the reorg.
    - On-call load is the constraint, not skill.
  - Quality `70`
  - Craft `64`
    - Test coverage gap concentrated in payments.
- Last quarter
  - Delivery `70`
  - Quality `68`
  - Craft `60`

---

<!-- _class: funnel -->

`Onboarding · 1,000 signups`

## A plain funnel is unchanged.

No sublists here — so this chart emits **no note** and exports exactly as a plain funnel always has, byte-for-byte.

- Signups `1000`
- Activated `620`
- Retained (D30) `410`
- Paid `180`

---

<!-- _class: title silent -->

# Read the notes.

`open the annotations`

The detail never crowds the boardroom slide — it waits in the speaker-notes channel for the reader who wants it, and on screen it lifts to life on hover.
