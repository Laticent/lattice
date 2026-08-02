---
status: proposed
summary: >
  #1292 asked for `content` to be the layout a slide gets when it declares none.
  Shipping that verbatim clipped 9 slides across 5 decks that render clean on
  main, and the investigation found why: `content` is the statement-prose layout,
  not the generic one. It is one of 18 of the 61 components with no `flex:1`
  body fill, so its trailing annotation floats 202px above the stage bottom where
  every other component's sits flush at 0px; it is on `below-note.js` EXCLUDED,
  so a trailing note is never promoted or styled; and its prose sits at
  `--fs-message` (21pt) while Key Insight is deliberately pinned to `--fs-body`
  (16pt) to read as a peer of body prose — so as the default it renders a summary
  24% smaller than the thing it summarizes. Separately, NOTHING in the engine
  styled a plain markdown table (§4, now SHIPPED), and an `# H1` is invisible on
  every light theme unless a component puts it on a dark panel (§5, pre-existing,
  logged not fixed). This note proposes four changes that make `content` the
  layout #1292 actually describes, and records the measurements behind each.
builds-on: 2026-08-02-slide-class-taxonomy.md, 2026-06-27-stage-flow-no-margins.md
---

# The default slide layout — what a slide gets when it declares nothing

## The ask, and what happened

#1292: *"if there is a slide created in the editor without `_class` declaration it
doesn't get styled. We need to make content the default component if `_class` is
absent."*

The intent behind it, stated by the owner during review:

> content [is] the default layout. people could add common markdown supported
> structures to it, and be legible and feel [a] natural fit to other deck
> layouts/components. it is not exempt [from] content constraints and good
> authoring. it's not supposed to allow a wall of text. it should allow for
> paragraphs, eyebrow, header, footer, title, subtitle, pagination, rail,
> minimalistic styled table and lists and other markdown structures like block
> quote that isn't a key point, key point and below note and other universal
> lattice semantics.

Implemented literally — append `content` to any section whose resolved class list
names no component — this regressed the shipped corpus. Verified with the repo's
own ratchet on the branch against an `origin/main` worktree:

```
branch:  ✗ 5 decks clip MORE than baseline — 9 slides
         mode-frontmatter p2,p4,p6 · debug p3,p4 · finish-backdrops p2
         chart-theme-gallery/README p1,p2 · exemplars/README p1
main:    ✓ 0 clipped slides, none above baseline (27)
```

56 slides across 29 decks re-render. The clipping ones are all the same shape:
heading + lede paragraph + a nested card list.

## What an un-classed slide actually inherits today

The premise in #1292's title — that it "doesn't get styled" — is not accurate,
and correcting it is what makes the rest of this note tractable. An un-classed
slide inherits the **base layer** (`lib/base/base.elements.css`), which is
element-selector-only and applies to every slide:

- `section` — theme `--bg`, `--text-body` ink, `--font-body`, `--fs-body`,
  `--lh-base`, slide padding, the `--spectrum` border-top
- `h1`–`h6` — `--font-display` on the full 6-token heading scale
- `code` — the accent inline chip · `hr` — the centered accent rule

It also carries `form` regardless of component, so the masthead lift and the
`.cell-stage` flow apply. Rendering the owner's full list of universal semantics
un-classed on main versus with `content`:

```
cell-masthead   main 4  ·  content 4     (eyebrow, title, subtitle, header)
cell-stage      main 4  ·  content 4     (the flow + its gap)
below-note      main 3  ·  content 1     ← content LOSES two
```

**Eyebrow, subtitle, header, footer, pagination and the masthead lift are base and
form features, not component features.** They already work with no `_class`. So
the fidelity gap is narrower than assumed, and — critically — `content` is not a
superset of base. It trades.

## The findings

### 1. `content` has no body fill, so annotations float

Components that carry a trailing annotation do not pin the annotation. They put
`flex:1` on the **body block**, which expands to fill the bounded stage and
pushes the annotation down; the annotation carries `flex-shrink:0` so it holds
its height. `compare-prose.styles.css` states it:

```css
/* The stage is a flex column so the comparison list (`> :is(ul,ol) { flex:1 }`)
   fills the bounded stage (flex cell-tree §6) */
.below-note { padding-top:var(--sp-xs); flex-shrink:0; position:relative; }
```

`quadrant` and `radar` do the same with `height:100%` on the chart body.

**43 of the 61 components use the `flex:1` fill idiom. `content` is one of the 18
that do not** — no `flex:1`, no `flex-shrink`, nothing.

Measured on identical markdown at an identical 438px stage height:

| | annotation element | gap below it |
|---|---|---|
| `compare-prose` | `DIV.below-note` | **0px** — flush to the stage bottom |
| `content` | bare `<P>` | **202px** — floating, a third of the slide empty |

### 2. `content` is excluded from below-note promotion, and does not need to be

`lib/core/below-note.js` lists `content` in `EXCLUDED`, with the stated reason:
layouts *"that claim their trailing `<p>` for something else (caption,
attribution, **main content**)."* For a prose layout the trailing paragraph is
body copy, so the concern is real on its face.

But both promotion paths already guard on the preceding sibling being
**structural**, and nothing else can promote:

```js
const STRUCTURAL = new Set(['DIV', 'UL', 'OL', 'TABLE', 'PRE', 'BLOCKQUOTE']);
// DOM path
if (!prev || !STRUCTURAL.has(prev.tagName)) continue;
// HTML path — the same set, as a regex anchor
/((?:<\/div>|<\/ul>|<\/ol>|<\/table>|<\/pre>|<\/blockquote>)\s*)<p>…<\/p>\s*…$/
```

A paragraph following a paragraph is never promoted. **The exclusion guards a case
the `STRUCTURAL` check already prevents.** Verified by removing `content` from
`EXCLUDED` and rendering:

| slide shape | promoted? | correct? |
|---|---|---|
| heading + p + p (pure prose) | **no** | ✅ the trailing `<p>` stays body copy |
| heading + list + p | **yes** | ✅ an annotation after a structural block |
| heading + table + p | **yes** | ✅ same |

Below-note totals returned to exact parity with base (3 on each probe deck, the
same count main produces).

The cost of the exclusion is not only placement. Because the note never becomes
`.below-note`, it gets none of that wrapper's treatment — no hairline accent rule,
no muted ink, no `--fs-body` sizing. It renders as ordinary body prose.

### 3. The statement tier inverts the Key Insight relationship

Key Insight is universal: any `> blockquote` on a section that is not
`quote`/`math`/`citation-card`/`policy-recommendation` becomes one, on base and on
`content` alike. `base.modifiers.css:223` pins its size deliberately:

> *Body tier, NOT `--fs-message` (the 21pt slide-statement tier). A Key Insight
> SUMMARIZES the body above it, so it must not out-shout the very content it
> distills — it reads as a **peer of the body prose**, never louder.*

On base, body prose is also `--fs-body` — peers, as designed. Under `content` the
body becomes `--fs-message` and the insight stays `--fs-body`, so **the
distillation renders 24% smaller than what it distills.** The same applies to a
below-note, which the `.below-note p` rule also sizes at `--fs-body` for the same
stated reason.

The type contract itself names the tiers (`base.tokens.css`):

```
Card / list / inline prose    → --fs-body      (default; 18pt projection)
Slide-level statement body    → --fs-message   (statement, quote, lead, divider sub)
```

`content` lives in the **statement** bucket, and its 21pt prose is correct *for a
slide-level statement*. It is the wrong tier for the generic case, and it is what
caused the clipping: the slides that broke are card lists, which the contract
assigns to `--fs-body`.

Measured — moving `content`'s prose and list items to `--fs-body` and re-running
the corpus ratchet over the five regressed decks:

```
8 of the 9 clipped slides clear.
```

The one that remains, `finish-backdrops.md` p2, renders **119 words** — 3× the
~40-word body budget `content.docs.md` sets — and is structurally a card list. It
is over budget by the layout's own contract, which is the constraint working
rather than failing.

### 4. Nothing styles a plain markdown table — **SHIPPED**

There was **no universal table CSS in the engine.** Every table rule was scoped to
a component. A markdown table on any other slide — base or `content` — got raw
browser defaults: no borders, no zebra, no cell padding, no header weight.

This is a boardroom-bar defect independent of the default-layout question. It was
broken on base and would have remained broken under `content`.

**Landed** in `lib/base/base.elements.css` § UNIVERSAL TABLE. Two corrections to
this record's first draft, both found while implementing:

**The specialist count was four; it is seven.** The draft named `compare-table`,
`glossary`, `list-tabular` and `obligation-matrix`. `list-tabular` renders an
`<ol>`, not a `<table>`, so it was never a table component at all. The actual set
that styles a table element is `compare-table`, `glossary`, `obligation-matrix`,
`statute-stack`, `math`, `roadmap`, `matrix-grid`.

**"Component selectors `(0,1,N)` beat base element rules `(0,0,N)`, so no existing
table changes" was wrong**, and it is the sharpest thing this section has to say.
Specificity settles a contest only over a property BOTH rules declare. A base rule
setting a property the specialist never declared has no contest to lose:

| base declares | specialist that declares nothing for it | result without a guard |
|---|---|---|
| `tbody tr:nth-child(odd){background}` | compare-table, statute-stack.lane, math.derivation | a zebra wash they never asked for |
| `td{border-bottom}` | math.derivation (it borders `tbody tr`) | doubled row lines |

So the treatment carries a **deny guard** — `:where(:not(.compare-table)…)`, zero
specificity, one entry per table-owning component — and is scoped to the **stage's
own child** (`> table`, `> .cell-stage > table`), which excludes every
transform-generated table inside a `<figure>` for free. `roadmap` and `matrix-grid`
are in the guard even though the scoping already excludes their wrapped tables,
because the rule that is easy to state is the one that stays true: *a component
that styles `<table>` owns its tables, and base stands off.*

**Two entries are variant-scoped, and the gate enforces that.** `math` styles a
table only under `.derivation`, `statute-stack` only under `.lane`. A
name-granularity entry for either withholds the default from a bare `_class: math`
slide — reintroducing raw browser defaults on the exact surface this section
exists to fix. Caught by rendering it, not by reading it. So the guard denies
`.math.derivation` / `.statute-stack.lane`, and `checkUniversalTableGuard` fails
three ways: a claim with no entry, a **stale** entry, and an **over-broad** entry
(`:not(.math)` when only `.math.derivation` claims a table). Eleven unit tests,
including the wired-into-`run()` assertion the rest of that file's gates carry.

**Two switches, at the owner's direction.** Striping and vertical fill are both
toggleable, and both are custom properties rather than classes-with-CSS-inside, so
the switch is reachable from a theme `:root`, a deck `style:` block, a component,
or a per-slide class — `--table-zebra: transparent` and `--table-grow: 1`
(`table-plain` / `table-fill` are the author-facing spelling). They are independent
flags, not an exclusive axis. `table-fill` also sets `--table-valign: middle`,
found by rendering it: a stretched row with its text pinned to the top reads as a
gap rather than a band.

**Column alignment is native markdown's, and always was.** Verified in the emitted
HTML rather than asserted: `:---` / `:---:` / `---:` compile to an inline
`style="text-align:…"` on every cell in the column, `th` included, which outranks
anything in the treatment. The block sets no `text-align` on `td` at all; its one
`text-align` is the `thead th` default that replaces the browser's centered
default for a column the author left unaligned.

**No first-column emphasis.** An earlier cut gave `td:first-child` heading ink and
600 weight, mirroring compare-table and obligation-matrix. Those two can assert it
— their manifests declare the first column IS the row label. Base cannot: it sets
the identical property pair as `section strong`, so `**bold**` in column one
becomes a no-op with no way to opt out, and it is simply wrong on a leading
ordinal, a status tick, a citation index, or a single-column table (every cell
bold). Dropped.

**Cell padding is half `--sp-xs`, and that number was earned.** The first cut used
the full token and made rows 15% taller (38.2px → 43.9px) — the compact type saved
less than the padding spent. Measured on a plain `content` slide, that moved the
clip threshold from **11 rows to 10**: a ten-row table that fit on `main` exported
with its last row *silently gone*, because a plain table has no capacity axis and
the Fit Spine cannot split it. That is a HARD RULE #18 break the corpus ratchet
could never have caught (see below). At half the token the threshold is **12 rows**
— one better than before this block existed.

| | row height | clips at |
|---|---|---|
| `main` (unstyled) | 38.2px | 11 rows |
| first cut (`--sp-xs`) | 43.9px | **10 rows** ← regression |
| shipped (`--sp-xs` × 0.5) | — | 12 rows |

#### What was verified, and what the instruments actually prove

- **Contrast, all 61 components** (`tools/check-slide-contrast.js` over a probe
  deck putting the same table on every component): 66 sub-AA runs → **39**, and
  **zero** table cells. The 27 that cleared were a **pre-existing** defect this
  change fixes — see §6.
- **Three specialists pixel-diff to 0** on the probe deck.
- **Corpus ratchet holds at 27 across 249 decks** (249, not 248 — the demo deck
  this change adds is itself in the corpus glob). Say plainly what that is worth:
  the shipped corpus contained **zero** authored tables on a non-owning slide before
  this change, so the ratchet's denominator for the affected set is zero. It proves
  the deny guard and the figure-scoping did not disturb the tables that already
  existed — and the seven specialist galleries pixel-diff to 0 across 76 pages,
  which is the real form of that proof. It does **not** evidence the treatment's
  quality, and it structurally could not have caught the row-capacity regression
  above. That evidence is the contrast sweep, the fit rig, and rendered review.

**The `:where()` guard survives selector scoping.** Both render paths re-scope
theme CSS under the slide root, and `gotchas.md` §"Marpit theme prefixer mangles
`:is(...)`/`:where(...)`" documents a real trap there — but only for a selector
that *leads* with the function. This guard leads with `section`, the form that
section explicitly calls safe, and `base.modifiers.css` already ships six rules in
it. Verified on the owned engine by running the real `packTheme`
(`lib/engine/css.js`) over all three shapes — the `:where()` guard, the
`:where(.cell-stage)` arm, and the `:is()` bookend support rule — each scopes to
`article.lattice > section…` intact. Export through **real marp-cli is
UNVERIFIED**: `@marp-team/marp-core` is not installed in this sandbox.

#### The corpus ratchet is RED on this branch, and it is `main`'s red

After rebasing onto `main` at `7648100`, the ratchet reports one deck above
baseline: `examples/marp-export-fidelity.md` p1 — a `title finish-none` slide with
a heading and a lede, **no table on it**. Bisected against the same deck, same
content, CSS only:

```
dist/lattice.css @ 7648100^ (before #1309)   →  no overflow
dist/lattice.css @ 7648100  (#1309, on main) →  p1 CLIPPED
```

So it is `#1309` — *anchor(bookends): measure in em, not cqi* — regressing a
shipped deck, and it is red on `main` today for every branch that rebases. This
change adds **zero** clips of its own: that one deck is the entire delta, and the
seven specialist galleries pixel-diff to 0 against the post-#1309 `main`.

Deliberately **not** blessed and **not** fixed here. It is a pre-existing defect
this branch merely found, off the path of a table treatment, and the repair is a
judgment call about `--measure-bookend-lede` that belongs with whoever owns the
bookend measures — pulling it into this diff would breach both HARD RULE #18's
off-path rule and #17.

#### Recorded, not fixed

- A table inside `split-panel` / `split-compare` / `compare-code` / `image` lands
  in a side frame, not the slide body's top level, so it gets nothing. The frame
  set is already maintained in one place — `CLIP_CELL_SELECTOR`
  (`lib/core/overflow-probe.js`), which `collections.js` reads rather than
  duplicating, precisely so "a new clip-cell class can't silently fall through the
  way `.panel-right` originally did." This CSS hardcodes `.cell-stage` and cannot
  read that JS constant. Widening it is a real improvement and a wider blast
  radius; it belongs in its own change with its own render pass.
- `_class: sketch` now draws machine-straight table hairlines that
  `base.sketch.css` has no rule to roughen — it enumerates the four table
  components and a plain table was never in scope because it drew no lines.
- The zebra reads `--accent` directly rather than the `--spectrum-structure`
  register `base.variants.css` documents for in-content accent lines, so
  `spectrum: off` does not flatten it. Inherited from obligation-matrix's
  identical expression; newly universalized.

### 5. An `# H1` is invisible on a light-theme slide that has no dark panel

Found while rendering §4's probe, and it undercuts this record's own claim that an
un-classed slide "already works". `base.elements.css` sets

```css
section h1 { …; color: var(--text-display); … }
```

and `--text-display` is a near-white ink in **all thirteen** light palettes —
indaco `#FFFFFF` ("on dark surfaces — 11.29:1 on bg-dark"), cuoio `#FAF7F2`,
atelier `#F0EDE6`, burgundy `#F0E2CE`, and so on down to mustard `#F0E5C8`.
(Thirteen, not fourteen: `carbone` is the one dark-only palette and is excluded —
which is also #1302.)

**`title` is the only component that styles `h1` at all.** `divider` and `closing`
style `h2`; `big-number` uses neither `h1` nor `--text-display` nor a dark panel.
So the near-white ink has exactly one correct consumer, and every other `h1` in
the engine — which means every `h1` an author writes on a slide `title` did not
claim — renders **white on white**.

Reproduced on a two-slide probe with no `_class` at all: the `##` slide renders its
heading correctly, the `#` slide renders body copy under an empty masthead.

This is a **pre-existing** defect (`main` has it), not a regression from §4, and it
is off the path of the table change — logged here rather than folded into it, per
HARD RULE #18. But it belongs with (1)–(3), not after them: "a slide with no
`_class` doesn't get styled" (#1292's premise, which §"What an un-classed slide
actually inherits" pushed back on) is *more* right than this record allowed, and
the strongest single piece of evidence for it is that the title disappears. Any
fix is a `--text-display` binding question — surface-aware ink, the way
`--code-inline-fg` already works — not an `h1` question.

## Proposal

Four changes. (1)–(3) are `content`; (4) is base and benefits every slide and
every future component.

1. **`flex:1` on `content`'s body block**, with `flex-shrink:0` on the
   annotation — the idiom 43 of the other 60 components already use. Annotations land at the
   stage bottom instead of floating.
2. **Remove `content` from `below-note.js` `EXCLUDED`.** The `STRUCTURAL` guard
   makes it unnecessary; §2 shows pure prose is still never promoted.
3. **`content`'s prose and top-level list items move to `--fs-body`.** Nested
   items already step to `--fs-body`; they would need a distinct step
   (`--fs-body-compact`) to keep the support relationship legible. This restores
   Key Insight and below-note to peers of body prose, and clears 8 of 9 clipped
   slides.
4. **A minimal universal table treatment in base** — hairline rules, header
   weight, zebra at low alpha, cell padding, `--fs-body-compact` — withheld from
   the seven specialist components by an explicit deny guard. **SHIPPED**; see §4
   for the two things this line originally got wrong (the count, and the belief
   that specificity alone made a guard unnecessary).

Plus one finding that is **not** a proposal, because it is a pre-existing defect
rather than a change to weigh: §5, an `# H1` renders white-on-white on every light
theme unless a component puts it on a dark panel.

### What this does NOT change

- The 72cqi reading measure, which is the other genuine base gap and is correct
  as it stands.
- List markers. Base strips them globally and only 2 of the 61 components restore
  real bullets (`content` and `split-compare`), because the house treatment is that a list is raw material a
  component turns into structure. `content` restoring them is right for the
  generic case and should stay.
- The overflow oracle. Discipline is already visible when over-authored: on a
  5-slide probe covering prose · table+note · paragraph+list+insight+note ·
  list+insight · a deliberately over-authored slide, only the last clips and it is
  tagged **"Content clipped"** on base and `content` alike.

### Sequencing

(4) is independent and **landed first** — it fixes a real gap regardless of what is
decided about defaults. (1)–(3) are one coherent change to `content` and should
land together, because (3) alone would leave annotations floating and (1) alone
would leave them unpromoted.

Whether the default-component rule itself ships is a separate call from whether
these four are right: (1)–(3) improve `content` for authors who write
`_class: content` today, and (4) improves every slide, independent of #1292.

### Cost

(1)–(3) alter the rendering of every existing `content` slide plus, if the default
rule ships, 56 slides across 29 decks. That is an export-bytes change under the
QUALITY BAR and needs owner sign-off with rendered dark + light artifacts, plus a
corpus sweep and regenerated committed PDFs. (4) alters every slide carrying a
markdown table and is subject to the same gate.

## Open question

**Should annotations pin to the bottom of the *slide*, or the bottom of the
content?** (1) delivers the latter — the body fills the stage, so on a short slide
the annotation still ends up at the bottom edge, but that is a consequence of the
fill rather than a stated rule. No component pins an annotation directly, and
HARD RULE #20 bars the `margin-top:auto` that would be the obvious way to. If the
intent is "annotations are footer-weight and always sit at the slide's bottom",
that is a stage-flow change affecting every component and belongs in its own note.
