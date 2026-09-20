---
status: in-progress
summary: "`compare-table` becomes `table` — a hard rename with no alias, matching every prior rename in this repo. The component stops owning table CSS: it declares the contract (capacity, density, focus axes, the portrait card reshape) and rides the universal base treatment, which is what makes `table-plain` / `table-fill` / `--table-zebra` / `--table-grow` / `--table-valign` work on it instead of being inert by construction. Default geometry flips from fill-and-top-align to hug-and-center. The first-column row-label bet base.elements.css refuses is auto-detected from the header cell, with an explicit `row-label` / `no-row-label` override so an author can always overrule it."
---

# `compare-table` becomes `table` (2026-09-20)

## The symptom

An author who wants a table on a slide has no obvious way to find one. The
component catalog offers `compare-table`, whose name says the table is for
comparisons; the plain GFM table that any slide already renders has no name at
all and **no row in `dist/docs/components.pick.md`**, the file an agent greps to
choose a layout. So the discoverable thing is mis-named and the well-named thing
is undiscoverable.

Underneath that is a second problem. `compare-table` and the universal table
treatment are two implementations of the same look, and the engine keeps them
apart with a deny guard — `base.elements.css:261` and its five siblings exclude
all seven table-owning components from the universal block. That exclusion is
why `base.variants.css:519` has to say *"a `table-plain` on a `compare-table`
slide is inert by construction."* Two of the three universal table switches do
nothing on the component whose entire subject is a table.

## The root cause

The component owns CSS it has no reason to own.

Seven of the thirteen declarations in `compare-table.styles.css` are
byte-identical to the universal treatment (`border-collapse`, `table-layout`,
the `--spectrum-structure` thead rail, the label-voice `th`, the last-row
border clear). The six that differ, differ mostly by accident of when they were
written: `0.625cqi` cell padding against the base's `--sp-*` tokens,
`--fs-meta` on the table element against `--fs-body-compact`, `flex:1`
hardcoded against `flex:var(--table-grow, 0) 1 auto`.

Only **one** difference is a real decision, and `base.elements.css:351` states
it precisely:

> NO first-column emphasis here, deliberately. […] Base cannot make that bet.
> […] it is simply wrong on a leading ordinal (`| # | Finding |`), a status
> tick, a citation index, or a single-column table. **A component that knows its
> first column is a label says so itself.**

That sentence is the whole difference between "a table" and "the table
component". It is a *declaration*, not a look — and a declaration is exactly
what a manifest is for.

## The decision

**`table` is a contract-only component.** It declares what base cannot know and
styles no `<table>` element at all.

| Layer | Owns |
|---|---|
| `lib/base/base.elements.css` (universal treatment) | every table rule — width, padding, type, rails, hairlines, zebra, the three `--table-*` switches |
| `lib/components/comparison/table/table.manifest.json` | capacity (`row`: 2/4/6/8), density, focus axes, `split.strategy: cover-cards`, `excludes` |
| `table.styles.css` | the portrait card reshape only (`.ct-cards` / `.ct-card` — `div` subjects, not table subjects), plus section-subject custom-property defaults |

This is not a way around `checkUniversalTableGuard`; it is the reason the gate
stops mattering here. `universalTableClaims` (`tools/check-ownership.js:9363`)
registers an ownership claim only for a rule whose **subject is a table element**
and whose selector chains classes onto a `section`/`figure` compound naming a
known component. A component that writes neither needs no deny entry, so
`table` is removed from the guard rather than renamed within it — and every
universal switch reaches it for free.

### Geometry

Default flips from **fill-and-top-align** to **hug-and-center**: the table takes
only the height its rows need, and the block centers in the stage.

Today's `flex:1` with `vertical-align:top` produces the worst of both — the
table stretches, but each cell's text stays pinned to the top of its band, so a
three-row table reads as a line, a gap, a line, a gap. `base.variants.css:513`
already names this failure for the plain table (*"a stretched row with its text
pinned to the top reads as a gap rather than as a band"*) and fixes it by
pairing `--table-grow: 1` with `--table-valign: middle`. The component did the
half that causes the defect and skipped the half that fixes it.

Both behaviors stay reachable, because the component only sets the properties:

```css
section.table { --table-grow: 0; }              /* hug — the new default */
section.table > .cell-stage { justify-content: center; }
```

`table-fill` then does what it says on a `table` slide for the first time.

Horizontal geometry is unchanged: `width: 100%`, and **column alignment stays
the author's** (`:---` / `:---:` / `---:` compile to inline styles the engine
deliberately never overrides — `base.elements.css:345`).

### The row-label bet

Auto-detected, with an override. A transform reads the table and sets
`--table-label-weight` / `--table-label-ink`; base's `td:first-child` rule reads
them and is a no-op until they are set, the same pattern `--table-grow` already
uses.

**The rule turns the bet OFF** when the first column is not a label:

- the table has one column;
- the first header cell is an index word (`#`, `No.`, `Ref`, `ID`, `Idx`, `№`);
- every first-column cell is numeric;
- every first-column cell is a bare state marker (`[x]` `[-]` `[ ]` `[/]`).

Otherwise it is on. **Measured against every table in every deck in the repo —
224 of them:** 202 carry a named label header, 22 an empty header cell over a
label column, and **zero** match any of the four OFF shapes. So the rule
reproduces today's rendering on all 37 `compare-table` tables and never fires
its OFF arm in our corpus.

That measurement establishes recall, not precision — the corpus contains no
negative cases, which is why the four OFF shapes come from
`base.elements.css:351`'s reasoning rather than from our decks. It is also why
the override is not optional: base's other objection is that the bet sets the
same property pair as `section strong`, so `**bold**` in column one becomes a
silent no-op with no way out. `row-label` and `no-row-label` give the author the
last word.

### The name change is a hard break

No alias. This matches every prior rename here: `split-panel` → `split-list`
(`2026-05-17-split-panel-rename.md`), `bg-*` → `tint-*`/`mark-*` (whose
changelog says *"No alias period"*), and the five `split-*` removals — all
shipped a migration table as the entire user-facing remedy. The repo's own test
for when an alias IS owed is written in
`changelog.d/578-progress-center-rename.changed.md`: internal-only, never
reaches the DOM, not persisted. `compare-table` fails all three.

There is no component-name alias mechanism to reuse. `lib/tokens/crosswalk.js`
does this for token names; there is no equivalent for component names, and the
name is the key of four generated catalogs, the stem of a runtime-stamped DOM
class (`split-cover-<layout>`, `lib/core/split-envelope.js:988`), and a literal
in ~40 CSS selectors.

**Per `spec/LFM-1.0.md` §7 this is a MAJOR LFM bump** — "removing or breaking an
extension".

**What an unmigrated deck does.** It degrades; it does not break.
`lib/core/resolve-component.js:46-59` appends the default component, so
`<!-- _class: compare-table -->` resolves to `class="compare-table content"`.
Because the deny entry is *removed* rather than re-pointed, the table then falls
into the universal treatment and renders as a correctly-styled plain table. What
is lost: capacity, autosplit, the portrait card reshape, and the focus axes.
`lint:deck` warns `unknown-class` (advisory, never blocking) and its fuzzy
suggester proposes the nearest token.

## What this does NOT change

Four of the asks that motivated this work are already true, and saying so is
cheaper than building them again:

- **Focus on rows and columns already works on every table**, plain or
  component — `lib/transformers/focus.js:103-132` carries no component guard.
  `row` / `col` / `cell`, five `_focusStyle` treatments, and `_build: rows|cols`.
- **Spectrum already reaches the thead rail** through `--spectrum-structure`,
  switched by the `spectrum-trim:` register.
- **`state-cells` already works on `compare-table`** — it is the one universal
  table switch that was never denied.
- **Speech already reads tables header-bound.** `speakTable`
  (`lib/transformers/prose-projection.mjs:855`) produces
  `Plan A — Cost: $10; Risk: Low.` There is no per-component speech opt-in and
  a manifest `speech` field was evaluated and rejected in
  `2026-07-11-manifest-speech-contract.md`; reopening that is a separate call,
  not part of this work.

## Deferred, with the evidence for each

These are real and out of scope for this change; each gets its own issue.

1. **Column striping does not exist anywhere in the engine.** Every zebra in the
   tree is a row rule. The only column-aware feature at all is
   `--rough-ink-cols`, which draws column boundary *lines* under sketch and
   which nothing in the repo sets. A `--table-zebra-col` switch is net-new work.
2. **The word budget is column-count-blind.** `density: { axis: 'row', soft: 12 }`
   is counted per whole pipe row by `prose-budgets.js:116-121`, so it means six
   words per cell in a two-column table and two in a six-column one — while the
   thing that actually crowds is the cell. `lib/core/collections.js:268-281`
   already resolves a render-exact `cell` axis, so a per-cell budget is
   buildable. Two smaller defects ride along: a slide with **two** tables counts
   the second table's header and separator rows as data rows, and a cell of
   inline code counts as **zero** words, so a table of backticked values never
   trips the budget.
3. **The speech fallback reads table chrome aloud.** `lib/core/slide-speech.js`
   has no `|` rule, so a GFM row reaches the voice verbatim — pipes, dashes and
   all. It is rung 5 of the live Present ladder (`PresentOverlay.tsx:320`), used
   whenever the DOM projection has not landed or the section count disagrees, so
   this is reachable, not dead. No test covers it, which is why it has gone
   unnoticed.
4. **`base.docs.md:674` overstates its gate.** It claims
   `checkUniversalTableGuard` fails the build if the docs table and the CSS
   disagree. The gate reads `base.elements.css` and the manifests; it never
   opens `base.docs.md`, so that table can rot silently.
*(A fifth deferral — sketch's component-scoped table arms — did not survive
contact. `checkUniversalTableGuard` failed the moment `table` became a component
name, because `section.sketch.compare-table table` reads as an ownership claim
once the class in it is a component. Adding a deny entry would have cut `table`
out of the universal treatment and undone the whole design, so the selectors
were widened off component names instead — which is what the gate's own header
says cross-cutting decoration should look like. A plain markdown table under
`mode: sketch` now gets the drawn frame and wavy rules, which it never did. The
enrollment selector is duplicated between `base.sketch.css` and
`lib/core/rough-ink.js` and nothing gates the pair; both carry a comment saying
so.)*

## Verification

- `npm run lint` · `npm test` · `npm run build:check` · `npm run test:integration`.
- `checkUniversalTableGuard` is the gate that proves the CSS ownership claim:
  removing `table` from the deny list while it styles no table element must stay
  green, and the gate fails loudly on a stale entry if the removal is partial.
- Rendered evidence at both row counts, light and dark, against the real
  emulator — not CI (HARD RULE #23).
- The six long-running galleries graduate in a separate post-review commit
  (HARD RULE #8).
