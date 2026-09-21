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

## What the checker found

The change earned maker-checker under HARD RULE #25 and self-reviewed at first.
Running the checker afterwards was the right call: it found a defect already
baked into a committed PDF, and three more the gates could not see.

- **The gate was a regex, and `\btable\b` matches inside `table-fill`.** `-` is
  a non-word character, so a slide carrying only the geometry or zebra switch was
  walked and stamped — including `examples/universal-table.md`'s own
  two-switches slide, whose entire subject is those switches. It also split the
  two render paths, since the DOM mirror matches the class exactly. Now token
  equality; any future `table-*` modifier would have inherited the bug.
- **The two paths read cell text from different places.** The token walker used
  `token.content` — raw markdown SOURCE — while the mirror reads `textContent`.
  `[2024](…)` is not numeric as source but `2024` is once rendered; an image cell
  is a non-empty string as source and empty in the DOM. The walker now derives a
  textContent-equivalent from the inline token's children.
- **A raw-HTML table reached only the mirror.** markdown-it hands it through as
  an `html_block`, so the engine never saw its rows while the runtime saw an
  ordinary `<table>` — one deck, two renderings, which is the HARD RULE #1 break
  this design exists to avoid. The engine now reads that shape too.
- **The sketch guard was not the mirror of base's that its comment claimed.**
  Base uses CHILD combinators; the rewrite used a descendant one, which enrolled
  a side-frame table in the rough.js painter — a new SVG overlay on a slide that
  never had one. And collapsing the pre-rename selectors into ONE guard added
  `glossary` to the interior wave rules it had always been excluded from, which
  would have invented a row line on a component that draws none. Two guards now,
  with child combinators.
- **The migration line was false.** The changelog claimed `lint:deck` suggests
  the new name; it did not, and could not — the suggester scores edit distance.
  A `RENAMED_CLASSES` map now names the replacement outright.

Three probes back these rather than prose: the original plain-table one plus
`@shapes` (links, images, entities, the `table-fill` gate) and `@rawhtml`. Each
was mutation-tested — reverting the fix turns the matching probe red — because a
probe that passes against the broken code certifies nothing, which was the
checker's finding about the first one.

The checker also reported the 224-table corpus count as unreproducible. It is
not: it re-derives exactly under the four roots the corpus test walks
(`examples/`, `exemplars/`, `test/integration/baseline-decks/`,
`lib/components/`). The fair half of that finding was that the docblock said
"every deck in the repo" without naming them, so it now names them.

## The raw-HTML arm, added and removed

A first round of fixes closed an engine/runtime split by teaching the engine to
read a table an author wrote as raw HTML. A second checker measured that arm
against the DOM mirror and found it **re-opened the split on eight shapes** — a
header row mixing `th` and `td`, an HTML comment containing `<tr>`, a `>` inside
an attribute value, an unclosed `td`, `<template>` rows, `&mdash;`, a table split
across blocks, and two tables in ONE block, where it merged their rows and
stamped the WRONG table. Its attribute rewrite also wrote the class into
`data-class` (the `\b` trap of #1358) and silently dropped the stamp on an
unquoted `class=`. Three of those were reproduced here end to end.

It was REMOVED rather than hardened. Its docblock promised to decline anything
it could not read confidently, and it did the opposite: it returned confident
wrong answers. Making that promise true means demanding exactly one `<table>`,
no comments, no nesting, no `<template>`, every cell closed and no `>` in an
attribute — a parser, in a plugin, for a shape no shipped deck uses, which had
already cost two CodeQL alerts.

What remained after the removal was a raw-HTML table never being judged on the
engine path — closed later in this record's § "The raw-HTML regression". It is
still never judged there, because markdown-it hands raw HTML through as an opaque block and its
rows never reach the kernel. That is better than a reader that is wrong eight ways,
and it errs toward UNDER-stamping rather than stamping the wrong column.

**An earlier draft of this paragraph said the gap was a SPLIT — "plain in the PDF
and emphasized in the HTML export". That was asserted from reading the code and it
is false on the artifact it named.** Driven in a real browser (puppeteer over the
`file://` export, computed `font-weight` read off the first body cell), the CLI's
`.html` export leaves the raw table at weight 400: the runtime does not boot there
at all — `window.Lattice` is undefined and no berths or backdrops are injected — so
the DOM pass never runs. `applyToDom` WOULD stamp such a table, since a raw table
and a pipe table are the same element by then; the surfaces where it runs are the
VS Code Marp preview and a Marp render of an exported bundle, which is what the
fidelity ledger's `mirrored` row means. Whether the split shows up THERE is
**UNVERIFIED** — driving it needs the marp-cli tier in
test/integration/export/marp-kit-render.test.js, which was not run for this claim
(HARD RULE #23). What is measured is the regression below, on the PDF.

**And it is a REGRESSION, not merely a gap — which the paragraph above missed.**
`compare-table` styled `td:first-child` unconditionally in component CSS, so it
caught a raw `<table>` for free. The renamed component stops owning table CSS and
drives the emphasis from a stamp instead, and the stamp never reaches raw HTML on
the engine path. Measured on a two-slide probe (a markdown table and the same data
as raw HTML, both on the component's slide), rendered through the real emulator on
this branch and on `origin/main`: main bolds the raw table's first column, this
branch does not. By HARD RULE #18 that is a window this change created.

The same round also removed a `stripTagsToFixedPoint` helper whose justification
did not survive checking: `<[^>]*>` matches leftmost-first from a `<` to the next
`>`, so one pass is ALREADY the fixed point and the worked counterexample in the
commit message was wrong. It was a no-op with a test that could not fail.

## Verification

- `npm run lint` · `npm test` · `npm run build:check` · `npm run test:integration`.
- `checkUniversalTableGuard` is the gate that proves the CSS ownership claim:
  removing `table` from the deny list while it styles no table element must stay
  green, and the gate fails loudly on a stale entry if the removal is partial.
- Rendered evidence at both row counts, light and dark, against the real
  emulator — not CI (HARD RULE #23).
- The six long-running galleries graduate in a separate post-review commit
  (HARD RULE #8).

## The raw-HTML regression, and the fix that needed no new machinery

`compare-table` styled `td:first-child` unconditionally in component CSS, so it
emphasized the first column of a table written as raw `<table>` HTML for free.
The renamed component stops owning table CSS and drives the emphasis from a stamp
the markdown-it walker applies — and markdown-it hands raw HTML through as an
opaque `html_block`, so its rows never reach the kernel. Measured on a two-slide
probe through the real emulator, computed `font-weight` read in Chromium:
`compare-table` 600, `table` 400. By HARD RULE #18 that is a window this change
created, so it was fixed rather than filed.

### Three routes were built and measured before the fourth was found

**CSS keyed on the component — refused, and rightly.** A rule scoped
`section.table > table … td:first-child` makes `checkUniversalTableGuard`
register an ownership claim, and its remedy is to add `:not(.table)` to every
universal guard — which would cut the component back out of the treatment this
change exists to give it.

**The engine's HTML stage — breaks the browser bundle.** Wiring `withDom` from
`lib/core/dom-provider.js` into `renderHtml` works and was measured working (both
tables stamped, the markdown control's PDF pixel-identical, all 16 pages of
`examples/sketch.md` pixel-identical). But `lib/engine` is bundled for the
BROWSER, esbuild statically resolves `require('jsdom')` inside the provider's Node
branch, and the playground bundle fails on `path` / `url` / `fs`. Reproduced with
the playground's exact esbuild options. That is why `withDom` has no production
callers.

**A jsdom pass at the CLI seam — barred by a lesson already paid for.**
`lattice-emulator.js` is Node-only (`platform: 'node'`, `packages: 'external'`)
and `engineSlides()` is a single call site, so a post-pass there is reachable. But
it would `require('jsdom')`, and **jsdom is a devDependency**: the emulator's own
`speechProjection` block records that jsdom there was "BROKEN for anyone but us —
the `require` threw in a published install", silently degrading `--captions`. A
demo of this route passes only in a tree that has jsdom installed.

**Doing the DOM work in the export's own Chromium — right in shape, wrong in
scope.** It fixes the PDF and not the deliverable beside it: `outHtml` is written
from `cleanDocHtml`, the engine's string, at every one of its seven write sites,
never from the page. Stamping in the page would have produced a bold PDF and a
plain `.html` sidecar — a NEW split, in place of one regression.

### What shipped: write down the verdict we DO have, and fall back where we have none

The fix needs no HTML parsing, no DOM library, no export change, and no bundler
work. Three small pieces:

1. **Both verdicts are stamped.** The walker already decided ON or OFF per table;
   it now writes the negative one down too, as `lat-row-label-off`. "Judged and
   declined" and "never judged" were indistinguishable to CSS without it, and that
   distinction is what makes the fallback safe.
2. **A slide holding a raw table is marked**, `lat-raw-tables`, from a SUBSTRING
   TEST on the `html_block` token — `/<table[\s>]/i`, not a parse. This is the
   crucial difference from the reader removed earlier: the consequence is a CSS
   fallback scoped to a slide, not a verdict about any one table, so a false
   positive costs nothing. Every pipe table on that slide carries its own verdict
   and is excluded by name.
3. **One CSS rule** gives a table carrying NEITHER verdict the emphasis
   `compare-table` applied unconditionally.

**Why the ownership gate stays quiet, stated because it looks like a loophole and
is not.** `universalTableClaims` registers a claim for a table-subject rule only
when the selector chains a class that IS a component name. `lat-raw-tables` is not
a component, and the rule genuinely claims no component's table — it says "a table
nothing judged, on a slide that holds raw HTML". Chaining `.table` would trip the
gate correctly. A unit test pins that the selector names no component, so the
distinction cannot erode into the loophole it resembles.

### What this buys, and what it costs

A raw-HTML table is now **emphasized unconditionally** rather than judged. That is
`compare-table`'s exact behavior restored, and it is a real choice: a raw table
whose first column holds numbers gets bolded where a pipe table would not. Writing
the table as pipes is what buys a decision, and `base.docs.md` says so. Matching
the old behavior beat inventing a new one for a shape the rule cannot see.

The browser-side pass keeps judging raw tables, because in a DOM a raw table and a
pipe table are the same element. So the verdict there can differ from the engine's
blanket fallback — for a numeric-first-column raw table only.

**That divergence is MEASURED, not predicted.** Driven on the real surface: the
deck exported with `tools/export-marp.js` and rendered by real marp-cli (`^4.3.1`,
fetched on demand), computed `font-weight` read in Chromium. A raw `<table>` whose
first column holds years reads **600 in the engine's PDF** and **400 on the Marp
render** — the engine falls back, Marp judges and declines. On a raw table whose
first column IS a label both paths agree at 600, and every pipe table agrees on
both paths, so the split is confined to that one shape.

Two things worth stating plainly about it. It is a regression against
`compare-table` ON THE MARP PATH ONLY: the old component styled `td:first-child`
in CSS, which applied wherever the stylesheet did, so that shape used to read 600
there too. And the new Marp behavior is the more CORRECT of the two — a year
column is not a set of labels — which makes the engine's blunt fallback the
weaker half. Closing it would need the engine to see raw tables, which is the
thing markdown-it does not offer; the section marker it relies on is stamped by
our markdown-it plugin, which marp-core never runs, so the runtime cannot defer
to it either.

No deck under the four corpus roots has that shape, and a first measurement of it
is a better position than the unverified note this paragraph used to carry.

### Verified

- raw-HTML probe, computed `font-weight` in real Chromium: **600**, matching
  `origin/main`. The regression is closed on the surface it was measured on.
- `examples/universal-table.md`, every table read out of a real browser: the
  year-column demo carries `lat-row-label-off` at **400** — the fallback does not
  reach it — `row-label` forces **600**, and plain content-slide tables stay 400.
- `examples/sketch.md`: all 16 pages pixel-identical to the pre-fix branch. No
  committed PDF changed.
- Both halves of the fallback's safety are mutation-tested: dropping the
  `:not(.lat-row-label-off)` guard turns one arm red, and so does dropping the OFF
  stamp.
- `npm test` 9968/9968, lint, `build:check`, `check-ownership` all green.
