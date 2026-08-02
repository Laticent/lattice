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

The guard is gated (`checkUniversalTableGuard`, `tools/check-ownership.js`): it
reads the deny list back out of the stylesheet, fails on a table-styling component
with no entry, and fails on a stale entry — so it cannot rot. Verified: the corpus
ratchet holds at 27 across 248 decks, and the three specialists on the probe deck
pixel-diff to **0**.

### 5. An `# H1` is invisible on a light-theme slide that has no dark panel

Found while rendering §4's probe, and it undercuts this record's own claim that an
un-classed slide "already works". `base.elements.css` sets

```css
section h1 { …; color: var(--text-display); … }
```

and `--text-display` is, in **all thirteen** light themes, a near-white ink: indaco
`#FFFFFF` ("on dark surfaces — 11.29:1 on bg-dark"), cuoio `#FAF7F2`, carbone
`#F5F5F2`, and so on. It is correct for every component that puts its `h1` on a
dark panel — `title`, `divider`, `closing`, `big-number` — which is every component
that uses `h1` today. On a bare slide, or any slide whose `h1` sits on the theme's
light `--bg`, the heading renders **white on white**.

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
