---
marp: true
theme: indaco
paginate: true
header: 'Lattice'
footer: 'Design system — function · form · substance · finish'
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

# Lattice Design System

`The component model · branch · claude/design-system-foundation-HJb5Z`

Function · Form · Substance · Finish. Authored in short names, organized in four layers.

---

<!-- _class: agenda -->

## What this deck covers.

1. The four layers — Function · Form · Substance · Finish
2. The seven function families
3. Components stay short — why dotted names lost
4. Manifests as the single source of truth
5. Discovery via the scaffolder and VS Code snippets
6. What ships, what's deferred

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Section 01`

## The four layers

---

<!-- _class: cards-grid four -->

## Each slide is a stack of four orthogonal decisions.

- Function.
  - What the slide does for the audience. Seven families: Anchor, Statement, Inventory, Comparison, Progression, Evidence, Imagery.
- Form.
  - The spatial composition that holds the content. Ten shapes: bookend, divider, canvas, grid, stack, ledger, panel, matrix, scatter, timeline, split.
- Substance.
  - What fills the form. Four sources: prose, structure, series, graph — the engine's only plugin point.
- Finish.
  - Palette tokens plus cross-cutting modifiers — dark, compact, mirror, accent, numbered, background flourishes.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Section 02`

## The seven functions

---

<!-- _class: list-tabular -->

## Pick by intent. Then by data shape.

1. Anchor
   - Orientation — title, divider, closing.
2. Statement
   - One claim — big-number, quote, split-panel.
3. Inventory
   - Parallel items — cards-grid, list-tabular.
4. Comparison
   - Contrast — compare-prose, verdict-grid.
5. Progression
   - Ordered movement — list-steps, roadmap.
6. Evidence
   - Data into picture — stats, kpi, quadrant, radar.
7. Imagery
   - Visual that carries meaning — image.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Section 03`

## Components stay short

---

<!-- _class: compare-prose chosen -->

## Why dotted names lost the rethink.

- Dotted (rejected).
  - `<!-- _class: inventory.grid.cards compact -->` is 35 characters. Authors learn ~70 path combinations instead of 35 names. Implementation surfaces leak into invocation — `evidence.canvas.chart.progress` for what used to be `progress`.
- Short (kept).
  - `<!-- _class: cards-grid compact -->` is 32 characters and what authors already know. Same pattern as shadcn, Chakra, Mantine, Lit, Slidev, Notion blocks. Discovery happens via tooling, not in the directive name.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Section 04`

## Manifests

---

<!-- _class: cards-stack -->

## Each layout ships a manifest at `lib/components/<bucket>/<name>/<name>.manifest.json`.

- Single source of truth.
  - name, function, form, substance, purpose, variants, slots, skeleton. The pipeline is unchanged — manifests are metadata.
- Consumed everywhere.
  - Scaffolder reads `skeleton`. Snippets read `skeleton` + `name`. The catalog groups by `function`. Editor autocomplete reads `variants`. Docs link from `docs`.
- 53 components shipped.
  - Every component in the galleries has one; a validation gate keeps them well-formed.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Section 05`

## Discovery

---

<!-- _class: cards-stack horizontal -->

## Two paths from blank deck to a slide skeleton.

- CLI scaffolder
  - `npm run new:slide -- --list` prints the catalog grouped by function. `npm run new:slide -- cards-grid` emits the skeleton. Exit codes: 0 success, 1 unknown, 2 usage.
- VS Code snippets
  - Type `lattice-` in any .md file. Autocomplete shows all 53 components by name and description. Tab inserts the canonical skeleton. Generated from manifests; freshness enforced by `npm run snippets:check`.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Section 06`

## Status

---

<!-- _class: checklist -->

## What ships on this branch.

- [x] Spec — `design/design-system.md` with the four-layer model and component contract.
- [x] Manifests — 53 components in `lib/components/<bucket>/<name>/<name>.manifest.json`, schema validator, loader.
- [x] Scaffolder — `tools/new-slide.js` with `--list` and component-name modes.
- [x] VS Code snippets — `.vscode/lattice.code-snippets` generated and committed.
- [x] CLAUDE.md pointer — design-system.md at the top of "Read these first".
- [-] Templates.md reorganization by function family — deferred to a follow-up.
- [ ] Visual catalog page (`docs/catalog.html`) — deferred to a follow-up.

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

## Authors keep their short names. Everyone else gets a map.

`design/design-system.md`
