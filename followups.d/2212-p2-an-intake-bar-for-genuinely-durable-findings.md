---
origin: 2212
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2212#issuecomment-5670593205
backfill: true
---

# An intake bar for genuinely durable findings

Backfilled verbatim from the continuation brief on #2212 (merged 2026-09-14).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] An intake bar for genuinely durable findings
       why now   — #2212 and P1 both route the HANDOFF. Neither touches the other half: an
                   off-path defect that should outlive the next session still gets filed
                   with no swimlane and no acceptance check, which is how the queue reached
                   317 with 6 pickable.
       where     — engineering/workflow.md §Intake floor + §Definition of Ready.
       done when — filing a card requires the two DoR fields AT CREATION, not at the
                   status:ready transition nobody performs.
       evidence  — file one card through each intake path (form, API/MCP, gh) and show the
                   gate's verdict on each, live on this repo.
       verify    — tier 1 checker: it changes what every future filing costs.
```
