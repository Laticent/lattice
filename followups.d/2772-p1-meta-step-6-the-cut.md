---
origin: 2772
priority: P1
recorded: 2026-11-10
area: engine
severity: high
swimlane: engineering/decisions/2026-10-17-meta-record.md §15
source: https://github.com/Laticent/lattice/pull/3115
deferred: large — breaking, every deck and test that writes a directive comment
---

# Slice E, the cut: the engine stops reading authored directive comments and the bare record

The brief for slice E of the meta clean break (record note §15.3). Rewritten 2026-11-24 in #3497 (slice D) from the
meta desk's brief, so the plan lives on a durable surface, not in chat.

**Decided** (the owner, 2026-11-22 and 2026-11-24, relayed through the command center and the meta desk):

- A **hard** cut. `<!-- @meta{…} -->` is the only spelling: authored directive comments (`<!-- _class: … -->`,
  `_footer`, `_pane`, `_paginate`, the running `class:`, …) and the bare `<!-- {…} -->` record stop being read.
- **No conversion on open** ("we are not ga. the only decks that exist are mine that i used for testing"). The path for a
  deck in the old form is the lint fix, the Studio's fix button and `lattice migrate meta`.
- **Tier A for 1.0**: the release is Sun 2026-11-29, freeze Sat 2026-11-28 23:59 UTC. Release-gate work: it continues
  past the 90% usage stop.

**State when E starts.** Slices A (#3426, readers), B (#3429, lint and completion), C (#3433, writers) and D (#3497, the
sweep) are on `main`. Every shipped deck, gallery and manifest sample is in records; `test/unit/core/meta-sweep-corpus.test.js`
fails on an old spelling outside its `KEEP` list (the Marp sample, the VS Code harness deck, the LFM-1.0 conformance
cases, `test/fixtures/mermaid-slide-class-forms.md` and `examples/slide-class-forms.md`, which pin the comment forms
until this cut). `legacy-directive-comment` counts under `lint:deck --strict` and in the Coach. Lente writes a slide's lens
tag in its record (`docs/src/lib/lente-host.ts`).

**Do:**

- **The door.** `lib/plugins/meta/meta.source.mjs`, `lib/core/meta-door.mjs`, and the opener tests in
  `lib/core/meta-record.mjs` and `lib/core/directive-island.mjs`: stop reading authored directive comments and the bare
  `{…}`. The engine's internal expansion (`lattice_meta_expand`) and export to Marp (`recordsToComments`) stay. Ping the
  Segno desk (session_01DPMMjEWq7TK48eTYCYYdrq), which owns the grammar and the deck model, **before starting and
  before landing**.
- Flip `LEGACY_META_SEVERITY` (lib/authoring/lint-core.js) to `error`.
- Re-add the bare-record warning with its one-line `@meta` fix (moved out of #3429 for budget).
- Flag a lone `_pane:` marker as an old spelling.
- `design/skill.md`, `README.md` and the skills teach only `@meta`, and drop the "opens in Marp unchanged" promise. The
  deck samples in the skills and docs pages move with their prose (slice D tried the samples alone and reverted: they
  contradicted the text around them). `design/skills/lens.md` already teaches the record.
- The pinned comment-form decks (`examples/slide-class-forms.md`, `test/fixtures/mermaid-slide-class-forms.md`): the
  cut is what they pin, so each becomes a proof that the comment form renders the default layout with the error and its
  fix, or is swept and leaves `KEEP` (and `SANCTIONED_SUBJECT_DECKS`). Mark the LFM-1.0 conformance cases
  `until: LFM-2.0`, add record cases to the LFM 2.0 draft, and drop the pre-2.0 exemption in `tools/lfm-conformance.js`.
- Extend `examples/meta.md` as the demo deck (HARD RULE #9).
- A **`major` changeset** (`npx changeset`, HARD RULE #10 now uses changesets) for the breaking change, and the LFM 2.0
  draft note.

**Lint budget.** `lintCoreGz` was 28 B under its ceiling after #3429. The owner: free bytes first; if it still does not
fit, bring measured numbers before raising.

**Proof:**

- a legacy deck renders the default layout with the lint error and its fix; `build:check`; the tree test extended to the
  bare form;
- every export on its real surface: the Marp bridge plus marp-cli, PPTX/Calco, PDF including `--embed-source`, the HTML
  player's speaker and read views, `.lattice`, the Studio share;
- the demo deck rendered dark and light and **sent to the owner for sign-off before merge** (Quality Bar, export
  exception).

**Review:** the adversarial trio (HARD RULE #25) plus the card grader, about 5 agents, no extra fan-outs.

**Who starts it:** the meta desk (session_01DPMMjEYudbNCQvHJvttvqS) starts E as a new session when #3497 lands. If the
desk is gone, whoever holds the meta lane does.

```text
  P1 · [no ticket] Slice E: the cut — the door reads only `<!-- @meta{…} -->`
       why now   — tier A for 1.0 (freeze 2026-11-28 23:59 UTC); slices A–D are on main
       where     — lib/plugins/meta/meta.source.mjs, lib/core/meta-door.mjs, lib/authoring/lint-core.js, design/, README.md, examples/meta.md
       done when — a legacy deck renders the default layout with the lint error and its fix; build:check; the tree test covers the bare form
       evidence  — every export on its real surface; the demo deck dark and light, signed off by the owner before merge
       verify    — tier 2 trio: breaking, every deck
```
