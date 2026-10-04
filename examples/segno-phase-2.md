---
marp: true
theme: indaco
paginate: true
header: "Lattice · one inline notation"
---

<!-- _class: title silent -->

# Every inline value is now one record.

`Lattice · Segno phase 2`

Braces hold the value, commas separate what describes it, and the order is free.

---

<!-- _class: list-tabular -->
<!-- _footer: "Pills and sparks: the modifiers moved inside the braces." -->

## The release train, by workstream.

1. Settlement engine
   - Shipped and load-tested `{STABLE, c2}` `~{12 14 13 17 21 24, end}`
2. Ledger migration
   - Cutover paused for review `{PARTIAL, tag, c4}` `~{72/80, bullet, c4}`
3. Reconciliation
   - Design agreed, not started `{QUEUED, tag, c7}` `~{0 0 1 1 2 2, step}`

---

<!-- _class: quadrant -->
<!-- _footer: "A quadrant point is one record: `{2, 82}` is effort 2, reach 82." -->

`[{Effort, 0..10}, {Reach, 0..100}]`

## Where to put the next dollar.

- Quick wins
  - Self-serve onboarding `{2, 82}`
  - Usage alerts `{3, 64}`
- Big bets
  - Partner marketplace `{8, 90}`
  - Data residency `{7, 58}`

---

<!-- _class: gantt -->
<!-- _footer: "The axis line sets the window and today; a dependency is `after=`." -->

`[{Timeline, 2026 Q1..2026 Q4, today=Q3}]`

## What ships in each phase.

- Framework
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model v2 `Q2..Q3` `live` `after=Signal taxonomy`
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Org-wide rollout `Q3..Q4` `after=Scoring model v2`
  - GA `Q4` `milestone`

---

<!-- _class: radar -->
<!-- _footer: "The scale is the axis line; the ring ticks print it." -->

`[{Scale, 0..10}]`

## How we stack up across the buying criteria.

- Lattice
  - Performance `9`
  - Pricing `7`
  - Support `8`
  - Ecosystem `6`
- Rival North
  - Performance `7`
  - Pricing `8`
  - Support `6`
  - Ecosystem `8`

---

<!-- _class: journey -->
<!-- _footer: "A step is one record: who, how it felt, and how many." -->

## Walking a new customer to their first report.

- Evaluate
  - Read case study `{who=prospect, mood=5}`
  - Live demo `{who=prospect, mood=4}` `@sales`
- Trial
  - Workspace setup `{who=user, mood=1}` `@onboarding`
  - First import `{who=user, mood=3}`
- Activate
  - First report `{who=user, mood=5}`

---

<!-- _class: state-chart -->
<!-- _footer: "A transition is `{event, to=N}`." -->

## A document moves from draft to published.

1. Draft `start`
   - `{submit, to=2}`
2. In review `at-risk`
   - `{approve, to=3}`
   - `{"reject, with notes", to=1}`
3. Published `end`

---

<!-- _class: flowchart -->
<!-- _footer: "A style is one record, or one bare word." -->

## An incident pages a human only when it must.

- Alert fires `pill` => Triage
- Triage `{diamond, c2}`
  - -SEV1-> Page on-call
  - -SEV3-> Backlog `dotted`
- Page on-call -> Postmortem
- Postmortem `doc`

`[{"=>", Paging path}, {dotted, Waits for business hours}]`

---

<!-- _class: list takeaway -->

## One notation, one set of rules.

- A record is `{value, word, word}`; a named item is `name=value`.
- Quote a value that holds a comma: `{"reject, with notes", to=1}`.
- An old spelling renders as plain code; `npm run segno:migrate` rewrites a deck.
