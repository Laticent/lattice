---
origin: 2772
priority: P3
recorded: 2026-10-18
area: website
severity: low
swimlane: engineering/decisions/2026-10-17-meta-record.md
source: https://github.com/Laticent/lattice/pull/2772
---

# `e2e/compose-panes.spec.ts` fails on `main`: the Undo locator matches two buttons.

`@crosswidth the pane gallery says what each pick does, starts fresh with an Undo, …` clicks
`getByRole('button', { name: 'Undo', exact: true })`, which now resolves to the Compose editor's `cs-undo` pill
(`aria-label="Undo"`) and the toast's Undo button. Strict mode refuses the click. It fails identically on `main` at
`adba03a` (run in place on that commit, 2026-10-18), so it is not from #2772. The Studio e2e suite is nightly, off the PR
gate, which is how it stayed red.

```text
  P3 · [no ticket] Scope the spec's Undo locator to the toast (or the pill) so it matches one button.
       why now   — the nightly is red on it.
       where     — docs/e2e/compose-panes.spec.ts
       done when — `npx playwright test --project=desktop e2e/compose-panes.spec.ts` passes.
       evidence  — the run.
       verify    — tier 0.
```
