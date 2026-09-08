# The slot contract — how a mark declares its colour

**Status:** plan, pre-implementation. This is the thing `scoring.md` names as
upstream of all three finishes: *"Every mark declares its colour slot and the
kind of slot it is — category, status, series, or magnitude — in one place, on
every member."* Nothing here ships until the adversarial trio has been at it
(HARD RULE #25).

Read `scoring.md` for the measurement that forced it and `spend-rules.md` for
what a finish is then allowed to do with it.

---

## 1. The problem, in one table

`tools/chart-language-census.js --keying` over the rendered gallery:

| slot attribute | members |
|---|---|
| `data-cat` | bar, bullet, line, scatter, stacked-bar |
| `data-mark` (+ `data-s` / `data-cell`) | funnel, gantt, piechart, quadrant, slope, state-chart, waterfall, map |
| `data-s` alone | progress, timeline-list |
| `data-series` | radar |
| **nothing** | journey, kanban, matrix-grid, map's 167 regions, roadmap, word-cloud |

Five conventions and a hole. A finish written against `[data-cat]` reaches
**5 of 21** members, which is the whole of `scoring.md`'s 5/10.

And the attributes do not mean the same thing, so the cheap fix is barred:
stamping `data-cat` on a gantt bar would call a STATUS a category, and on a
radar polygon would call a SERIES one.

## 2. What a mark declares

Three attributes in markup, one block in the manifest.

### 2a. Markup — three attributes, and why each earns its bytes

| attribute | values | per | who reads it |
|---|---|---|---|
| `data-slot` | `1`–`8` | instance | the family's slot→token table; the a11y and print texture blocks |
| `data-fill` | `hue` · `ramp` · `presence` · `layered` | class | a finish: may the body retreat? |
| `data-register` | `mark` · `backdrop` | class | a finish: is the wash level pinned? |

`data-slot` is **1-based**, unlike today's 0-based `data-cat`, so it reads as the
token it resolves (`data-slot="1"` → `--chart-cat-1-*`) instead of one off it.

`data-fill` and `data-register` are per-CLASS constants, so stamping them on
every element looks wasteful. The alternative is worse: without them, each of
the three finishes carries its own hand-maintained class list
(`:is(.bar-mark, .sbar-seg, .wedge, …)`), which is the same fact written three
times and drifting three ways. One attribute turns three lists into one
declaration at the source. They are stamped from the manifest, not typed per
call site, so there is still exactly one place to change them.

**`kind` is NOT stamped.** `category` / `status` / `series` / `position` /
`magnitude` is what the slot MEANS, and nothing selects on it — it is
documentation and tooling input. It lives in the manifest, where a reader can
find it, rather than on every rendered element where nobody reads it.

### 2b. The manifest — one `marks` block per chart

```jsonc
"marks": [
  { "class": "bar-mark", "kind": "category", "fill": "hue", "register": "mark" }
]
```

This is the declaration; the markup carries the resolved value. `class` is the
mark's CSS class, `kind` its meaning, `fill` what the body encodes, `register`
whether it bears text.

A `marks` block becomes REQUIRED for every manifest in the `chart` bucket, so a
new chart cannot ship a mark nobody can address — the same shape
`kernel.figureClass` already has, and for the same reason.

## 3. What CSS does with it

### 3a. One slot→token table for the whole family

`chart-family.css` resolves the slot ONCE:

```css
.chart-frame [data-slot="1"] { --slot-hue:  var(--chart-cat-1-hue);
                               --slot-ink:  var(--chart-cat-1-ink);
                               --slot-fill: var(--chart-cat-1-fill); }
/* …eight of them… */
```

A member then paints from `--slot-*` and stops naming a numbered token:

```css
:is(section.bar, figure.chart-frame) .bar-mark { stroke: var(--slot-ink); }
```

Six rules become one, on every member that cycles. `candidates-colour/3-systems.md`
predicted this ("member stylesheets shrink"); it is the contract's second payoff
after the finishes, and the one that is measurable the day it lands.

### 3b. A state-keyed mark resolves its OWN ink

`gantt`, `progress` and `waterfall` colour by status, and each has already
mapped `data-s` to an ink in its own stylesheet. Those members set `--slot-hue`
and `--slot-ink` from their own status map rather than from the table:

```css
.gantt-bar[data-s="at-risk"] { --slot-ink: var(--chart-state-warn-ink); }
```

This is `spend-rules.md` §7's finding, and it is what stops a finish needing a
second status-to-slot mapping to keep in sync. A finish never learns whether a
member is categorical or semantic; it reads `--slot-*` and `data-fill`.

## 4. What the contract buys elsewhere

The a11y and print texture blocks key on `data-cat` today, so they are written
per member per slot — `base.print-textures.css` spends ten rules on the seven
Cartesian members and six more on piechart, plus a legend-swatch set. On
`data-slot` they collapse to **one rule per slot for the whole family**:

```css
section.print [data-slot="1"] { fill: url(#latt-a11y-chart-tex-1) !important; }
```

That is the same simplification in `themes/a11y-base.css`. It is not a bonus —
it is the test of whether the contract is real: if one attribute cannot replace
`data-cat` for its existing consumers, it is a second convention rather than a
unifying one.

## 5. How it is enforced

Extend `checkChartKernels` in `tools/check-ownership.js` (already manifest-driven,
already text-matches a kernel's own source against its declaration):

1. every `chart`-bucket manifest carries a `marks` block;
2. every declared `class` appears as a class-attribute string in that member's
   `.transform.js` — the same text match `figureClass` uses, with the same
   stated blind spot (a class assembled at runtime);
3. every declared mark class appears in the member's `.styles.css`, so a
   declaration cannot name a mark nothing paints;
4. no `marks` entry is stale — a declared class the transform no longer writes
   fails, so the block cannot rot.

And a rendered arm, because a static check cannot see a mark that renders
without its stamp: extend `tools/chart-language-census.js`'s KEYING arm to
report, per member, the fraction of painted marks carrying `data-slot`. The
target is 21 of 21; the census is what proves it rather than claims it.

## 6. Staging

One branch, one PR, several commits (HARD RULE #17).

| commit | what | why this order |
|---|---|---|
| 1 | the kernel helper, the generated marks catalog, the schema block, the family slot table, the gate — applied to the five `data-cat` members | proves the whole mechanism end to end on the members that already have a slot value in hand |
| 2 | the eleven members keyed on `data-mark` / `data-s` / `data-series` | each has a slot value; the work is renaming, not inventing |
| 3 | the six with no slot attribute at all | these need a transform to LEARN its slot, which is the only genuinely new code |
| 4 | migrate the `data-cat` consumers (a11y block, print textures, legend swatches) and delete `data-cat` | last, so the old convention dies only once nothing needs it |

The `marks` block is required from commit 1, so every manifest declares up
front; what moves per commit is the stamping and the CSS. There is no
allowlist and no ratchet — the census reports the fraction, and the fraction is
the progress bar.

## 7. Open questions the trio should answer

1. **The name.** shadcn uses `data-slot` on the docs site
   (`docs/src/styles/landing.css`, `docs/src/styles/playground.css`). Different
   documents, and every engine rule is scoped under `.chart-frame` /
   `section.<member>` — but it is one repo and one word.
2. **Whether the generated catalog is needed at all.** The kernel helper must
   know a class's `fill`/`register` to stamp them, and a browser-bundled kernel
   cannot fs-load manifests — the `build-stage-catalog.js` precedent. Is the
   catalog worth the build step, or should the kernel take the values as
   arguments at each call site (one source lost, one build step saved)?
3. **Whether `data-slot` can carry a non-categorical mark honestly.** `map`'s
   choropleth has a magnitude, not a slot; `matrix-grid`'s filled cell has a
   row. Do those omit `data-slot` and rely on `data-fill` alone, and does any
   consumer break when it is absent?
4. **Whether commit 4 is safe to defer.** Running `data-cat` and `data-slot`
   side by side for three commits is two attributes for one fact — the drift
   this repo hates. Is there a cheaper order?
5. **What breaks.** `data-cat` is read by the a11y theme, the print textures and
   the legend emitter; `--i` is emitted by six transforms and read by nothing;
   `data-mark` drives the reveal layer and Anima. Which of those does this
   change touch by accident?
