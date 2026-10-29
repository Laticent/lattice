# Fluid — how a slide fits its box

This is the canonical doc for Fluid, the one library that decides how a slide's content fits the
box it is shown in. It reflows the content (CSS keyed on the box's shape) or paginates it (a cover,
one element per page, a closing page). It replaces the auto-split and the `--fluid` viewer, which
were built separately and never met.

The design, the audit behind it and the owner's rulings are in
[`decisions/2026-10-27-fluid-layout-library.md`](decisions/2026-10-27-fluid-layout-library.md).
That note is the record of why; it grows by dated "as built" sections at the end rather than by
rewrites. This doc says what is true **now**, and it changes in the same commit as the code.

---

## Glossary — two things share the word "fluid"

| Term | Means | Lives in |
|---|---|---|
| **the fluid view** | the BOX: a viewer that unpins each slide from its authored pixel size and sizes it to the screen, then re-stamps `data-family` | `lib/base/base.fluid-view.css`, `initFluidView` in `lib/runtime/index.js`, `--fluid` |
| **Fluid** | the PLAN: given a box and the rendered slide, which pages exist and what each holds | the split kernels today; `@laticent/fluido` from P1 |
| **family** | the box's shape class, from its aspect ratio: `wide`, `square`, `tall`, `strip` | `lib/adaptive/families.js` `familyFor` |
| **seam** | a place a slide may break: between members of its collection, between panes, or inside one member (rows, lines, items) | component manifests today; `data-fluid-*` in the markup from P3 |
| **paginate** | cut a slide into cover, body and closing pages on its seams, one element per body page | `splitDoc` in `lib/core/auto-split.js` |
| **rescue** | cut ONE member that still overflows its own page at an inner seam; from P5 on live screens (measured) and in files (budgets) | not built; code's line run (`carousel.js`) is the one existing case |
| **ring** | the honest terminal: a page that still does not fit is marked, never shrunk | `lib/core/overflow-probe.js` |

The library that implements the plan is **Fluido** (`@laticent/fluido`), named like its Italian
siblings; its mark and palette are in `decisions/2026-07-18-sibling-brand-system.md` § Fluido.
Until the P7 rename lands, "auto-split" and `split-*` in the code mean **Fluid's paginate move**.

---

## The rules in force

- **Structure decides the page count.** A slide with more than one member becomes cover → body
  (one element each) → closing. Nothing measured changes that (2026-09-01, kept by Fluid §3).
- **No pagination at `wide`.** Overflow there is a layout defect; a file clips and prints a
  build-time line, a live screen rings.
- **There is no shrink move.**
- **Author HTML cannot forge the split's attributes.** The engine renames every `data-split-` and
  `data-fluid-` in raw HTML to `data-x-…` (`lib/core/reserved-attrs.mjs`), wherever it appears,
  because a per-token parser can be slipped past.
- **One paginator.** `checkPaginationOwners` in `tools/check-ownership.js` lists every module that
  stamps a split page's role or run in `SANCTIONED_PAGINATORS`; a new one fails `build:check`, and
  each Fluid phase that deletes a path deletes its entry. Paths that paginate without stamping
  (the pane split, `splitSlideInHalf`) are tracked by name in the decision note's §8 instead.

## Where the code is today

| Piece | File |
|---|---|
| the one preprocessor every surface calls (stamp, size gate, split, run adornments) | `lib/core/structural-split.js` `structuralSplit` |
| the decision: which slides divide, on which seam, how many pages | `@laticent/fluido` (`docs/src/lib/fluido/plan.ts`) `planSlide`, `paginates`, `rescueRuns` |
| the split kernel, the connector that reads the facts and builds the pages | `lib/core/auto-split.js` `splitDoc` |
| cover, body and closing pages | `lib/core/split-envelope.js` |
| the 14 per-component strategies | `lib/core/carousel.js` `CAROUSEL_STRATEGIES` |
| panes split per pane at non-`wide` sizes | `lib/core/panes.js` `installPaneSplit` |
| the size gate | `lib/core/structural-split.js` `splitApplies` |

Callers: the CLI (`lattice.js`), the Playground (`lib/playground/index.js` `splitForPreview`), the
Studio (`docs/src/lib/single-slide-render.ts`) and the Studio's player export
(`docs/src/components/studio/share-export.ts`). All of them go through `structuralSplit`.

## Checking a change

| Check | Command | What it proves |
|---|---|---|
| parity | `npm run split:golden:check` | every gallery at `square`, `portrait` and `mobile` emits the same pages, byte for byte, as the CLI and as the live previews (`settle`) call it (80 decks, about 8 s) |
| enrollment facts | `npm run oracle:check` | each component's split facts match `test/oracle/split-oracle.json` |
| one paginator | `npm run build:check` | no unsanctioned module stamps split pages |
| cost | `npm run bench` (the split tier) | the split's slides, pages and milliseconds over the gallery at the three sizes, against `test/benchmark/baseline.json`; a moved page count is drift to re-bless with a reason |
| the core alone | `npm run test:fluido` | `planSlide`'s decision order, the size gate, the budget rescue, the cap, and ESM/CJS parity |
| jank | `npm run check:jank` | anchors hold position as content grows (no canvas axis yet; P2 adds it) |

Re-bless the parity golden (`npm run split:golden`) only in a change that means to move pages, and
say in the PR why each moved page is right.

**After editing Fluido's TypeScript, rebuild it** (`npm run fluido-lib:build`). Lattice requires the
built `dist/`, which is not committed, so a stale one silently runs the old decision: P1's own first
golden run reported 468 drifts across the galleries for exactly that reason, and a rebuild put every page back.

## Status

| Phase | State |
|---|---|
| P0 cleanup and guard rails | built: one CLI assembly, the parity golden, the paginator census, reserved attributes stripped, the dead splitter deleted, stale claims fixed |
| P1 the core package | built: `@laticent/fluido` holds the decision (`planSlide`), the size gate (`paginates`), the budget rescue (`rescueRuns`) and the 64-page cap on every built run (`fitsCap`); `splitDoc`, `splitApplies` and code's line run delegate to it; the Libraries page has its entry |
| P2 the vertical slice on the Playground: today's builders, split only on a measured overflow at the venue's size, as many members per page as fit (decision note §13.1), tuned first on the fit-everywhere harness (`decisions/2026-10-28-fit-everywhere-model.md`) | next |
| P2–P7 | planned; see the decision note §8 |
