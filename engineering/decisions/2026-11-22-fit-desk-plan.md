---
status: proposed
summary: >
  The fit desk's split of "fit everywhere" into a base track (Fluid, the fit spine, split and carousel policy,
  venues, text-room breakpoints, the harness and the viewers) and a component track (per-layout responsive
  behavior), with slices, dependencies, proof, review tier, order and worker count. Most slices wait for PR #2988.
---

# The fit desk plan: base track and component track (2026-11-22)

**Status: proposed.** The owner set up a fit desk on 2026-11-22 to own "fit everywhere" (total
responsive) until it is finished, and asked for the work to be split into **base** work and
**component** work. This note is that split. The order and the worker count below are the
desk's recommendation; the owner confirms them on the desk's ❓ card, and this note is updated
with the answers.

Why a separate note: PR #2988 appends §13–§25 to `2026-10-28-fit-everywhere-model.md`. A new
section written on `main` would collide with that tail. Once #2988 lands, the model doc gets a
one-line pointer here.

## 1. The split

- **Base** is the shared engine and runtime every layout rides on: Fluid (the runtime
  post-processor, `2026-10-27-fluid-layout-library.md`), the fit spine and measurement
  (`lib/core/fit-measure.js`), the split and carousel policy, the venue type scale, the
  text-room box breakpoints (the `container: lattice` query box), the fit harness and the
  nightly fit ratchet, and the viewers (Playground, player, Studio).
- **Component** is each layout's own responsive behavior on top of base: tables to cards,
  chart labels and chart kernels, diagrams, the catalog moving onto markup seams, and
  per-component fit lint.

The rule between them: a component slice may use a base attribute or query box only once the
base slice that creates it is on `main`. Today that means most component work waits for
#2988, which creates `container: lattice` (`lib/base/base.elements.css`), the `data-align*` and
`data-split-nth` attributes, and the `phone` venue's laptop-keep list. None of these is on
`main` yet.

## 2. Where #2988 stands (measured 2026-11-22)

- 134 commits plus 6 merges of `main`; 407 files, +18,964 / −3,663 against the merge base;
  merges cleanly with `main`.
- Base: measured split and packing (~2.3k lines), split policy and carousel (~1.6k), venue and
  phone sizing (~0.4k), text-room breakpoints (~0.9k), unified `align:` replacing `cards:`
  (~0.8k, breaking), viewers (~0.4k), PDF text-layer hyphens (~0.1k).
- Component: 94 component files (+1,171 / −620), math and plot wrapping (~0.2k).
- Tooling and CI: harness and baseline (~3.3k); `fit-nightly.yml` adds the `phone` venue to the
  nightly ratchet (a CI change, the owner's call); `tools/check-ownership.js` gains
  `TEXT_ROOM_REFLOW`, a rung rule and one math sanction.
- It changes exported bytes (PDF text layer, the CLI's measured split, the webpage export), so
  it owes the owner's dark and light sign-off on a demo deck. It ships 10 demo decks.
- Seams: the PDF hyphen fix, math wrapping and the `pack.ts` packer stand alone. Unified
  `align:` is tangled with the split code (`auto-split.js`, `split-envelope.js`, `panes.js`
  stamp `data-align`), so a clean base/component cut of #2988 needs hunk-level surgery.
- Owner answers on its Nov 17 card (relayed 2026-11-22): D1 yes (a lede longer than a phone
  page continues at a sentence break), D2 yes (a 3-column table cut off at a phone's edge
  becomes cards), W1 keeps its default.

## 3. Base track

Each slice is its own branch and PR from `main` (HARD RULE #17). Proof, for every slice: the
harness corpus run (`tools/fit-harness.js`), a green fit nightly on the PR head's merge,
`npm run check:jank`, `tools/screenshot.js` at 390, 820 and 1440 px, and a real device where
one is reachable (UNVERIFIED otherwise, #23). Engine slices get maker-checker; wide-reach
slices (marked trio) get red team, inversion and checker (#25).

| # | Slice | Closes | Needs | Proof beyond the standard set | Review |
|---|---|---|---|---|---|
| B0 | Land #2988 (its own session) | — | — | dark/light export sign-off | its session |
| B1 | Fluid on the live viewers: HTML viewer, player (baked pages and template re-plan), Studio | `2923-p4` | B0 | player and Studio at three widths; iPhone and iPad where reachable | maker-checker |
| B2 | The measured rescue on live surfaces: probe pass, hysteresis, frame budget | `2923-p5` | B1 | a frame-budget count (not milliseconds, #32); resize sweep with `check:jank` | maker-checker |
| B3 | Reuse the live render for the fit check | `2793-p2` | B0 | harness numbers before and after | maker-checker |
| B4 | PDF and PPTX on the Fluid connector with budget rescue; delete the string path | `2923-p6` | B2 | dark/light export sign-off; `npm run bench` before and after (#19) | trio |
| B5 | What a venue means on a portrait canvas; per-canvas count budgets | `2862-p3`, `2862-p2` | B0, owner ruling | portrait corpus run | maker-checker |
| B6 | Fluid by default; retire `--fluid`; rename the auto-split vocabulary | `2923-p7` | B4 | full corpus at every box and venue | trio |
| — | A continuous (document) host declares itself | `3021-p10` | blocked: no host exists | — | — |

`2923-p2` (rescue on the Playground) is checked against #2988 first: #2988 ships the measured
split on the Playground (`docs/src/lib/measured-split.ts`), so P2 may already be done. The
first base worker after B0 settles that and deletes the file if so.

## 4. Component track

| # | Slice | Closes | Needs | Notes |
|---|---|---|---|---|
| C0 | Finish #3088's two leftovers: an independent review of the tall-canvas chart frame (`printsAsLarge`, `lib/transformers/chart-frame.js`) and a visual overlap check of the 132 portrait slides whose chart text grew | none (only in the #3088 brief; write `followups.d/` if not finished) | nothing; from `main` today | the one slice that does not touch #2988's files |
| C1 | Seam census, then the catalog onto `data-fluid-*` behind a ratchet | `2923-p3` | B0 | the census decides the four silent clips |
| C2 | Chart text on the deck's type ladder; the kinds that do not take the venue factor yet | `3021-p15`, `3098-p1` | B0 | excludes histogram end labels and "unreadable" cells, which the #3251 audit owns |
| C3 | Charts redraw for their box, kind by kind; chart labels that look like markup | `3021-p9`, `3021-p13` | C2 for p9; p13 none | |
| C4 | Kanban, roadmap and journey pack pages by measurement | `3131-p2-kanban-roadmap-pack-pages` | B0 (`fit: pack`) | |
| C5 | Per-component fit lint: kpi, over-capacity | `3305-p2-kpi-fit-lint`, `3131-p2-over-capacity-lint` | B0 | a lint rule, not a CI change |
| C6 | Per-layout clips at hall, story and portrait | `2962-p2`, `2962-p4`, `2962-p5`, `3226-p2`, `3247-p3`, `3249-p3`, `3088-p1`, `3021-p12`, `2862-p1`, `2862-p7` | B0 | one PR, one commit per layout; coordinate with the meta desk, which moves the same layouts from `_class:` to `@meta` |
| C7 | Six layouts keep their columns in a narrow box at a large venue | `2962-p3` | B0 | a shared reflow rule, so it is base-shaped: maker-checker |

Proof for every component slice: the layout's gallery slides at 390, 820 and 1440 px, the
harness run filtered to that layout, `check:jank`, and a demo deck when the slide surface
changes (#9).

## 5. Order and concurrency

1. Now: B0 continues in its own session; C0 starts from `main` (it touches nothing #2988
   changes). Nothing else starts until #2988 lands, because almost every other slice either
   needs a base attribute #2988 creates or edits one of its 94 component files.
2. After B0: B1 and C1 in parallel, then B2 with C2, then B3/B5 with C4–C6.
3. B4 and B6 last, each with the adversarial trio and the owner's export sign-off.

Two worker sessions at a time while #2988 is open, three after it lands. The desk asks before
starting a fourth.

## 6. Coordination

- **#2988's session** owns its branch (#31). The desk never pushes to it.
- **The #3251 audit** owns the fit-debt "unreadable" cells and histogram end labels; C2 leaves
  them alone.
- **The meta desk** moves slide settings from `_class:` to `@meta` and touches the same
  layouts; C6 checks the meta desk's `claim:` tags before starting and rebases only on a real
  conflict.
