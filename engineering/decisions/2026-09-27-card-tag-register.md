---
status: in-progress
summary: Lattice draws a label on a card six different ways. Four are copies of one flush top-left "corner tag" recipe that have already drifted apart, list-steps draws a fifth kind under another name ("STEP 01"), and none of them keeps sibling tags the same height when one wraps. This note audits every card marker in the tree, says which qualify as card tags, and proposes one shared tag kernel plus a `tag:` front-matter register and `tag-*` slide classes packed the way `backdrop:` packs its axes, covering color (plain, color, none), placement on the card, text alignment and size. It also lists the phases to get there.
---

# One card tag — an audit, a design and a plan

**Status:** in progress. Phase 1 (the CSS kernel), phase 2 (the `tag:` register's color and
size axes, plus equal-size tags and the label budget) and phase 3's placement and alignment axes
are built. Phase 3 shipped **without** the new element (§3.1.1, an agent's call in the owner's
absence, open for the owner to reverse). Phase 4 is built: `banner-tag` draws through the band
rules and capsule's pill is the inline tag on the `--cat-N-mark` tier, both with an advisory
`tag-alias` lint. Phase 5 is built: a Card tags group in deck settings and four Tag rows in slide settings. The owner settled the first
six questions on 2026-09-27 and three more on 2026-09-28 (§7).

## 1. The problem in one example

Put these three slides in one deck:

```markdown
<!-- _class: cards-grid -->
1. Intake
   - …
<!-- _class: decision -->
- Build
  - …
<!-- _class: list-steps -->
1. Scope
   - …
```

The first card gets a solid accent block reading `1`. The second gets a categorical block
reading `BUILD`, tracked 0.08em. The third gets no block at all: bare `STEP 01` text in the
theme's label ink, tracked 0.12em. All three do the same job, which is naming a card, and an author can
change none of them from the deck. Give a decision card a long label and the tag wraps: at
two lines it barely clears the body text, and at three it covers the body's first line,
because the space reserved above the body is sized for one (rendered, §2.3.2).

## 2. Audit — every card marker in the tree

Two read-only scouts swept all 13 buckets, `lib/base` and `themes/`. A **card tag** here
means a short label that names or numbers one card among its siblings. The table shows
what qualifies.

### 2.1 These qualify — one family, several names

| Where | Trigger | Placement | Color · ink | Drift from the cards-grid recipe |
|---|---|---|---|---|
| `cards-grid` (`cards-grid.styles.css:83`, `:95`, `:142`, three copies) | `ol` source, `::before counter(card)` | Flush top-left, absolute | `--accent` · `--on-accent` | The reference. No re-peg for square, tall or strip decks |
| `cards-stack` (`cards-stack.styles.css:99`, `:111`) | `ol` source, `::before counter(stack)` | Flush top-left | `--accent` · `--on-accent` | Reserves `--sp-xs + 1.875cqi` above the body where cards-grid reserves `--sp-sm + 2.34375cqi` for the same tag |
| `compare-prose` and `decision` (`compare-prose.styles.css:217-267`) | Lifted `<strong>` slot label (`lib/core/slot-label-lift.js`) | Flush top-left | compare-prose: `--accent` · `--on-accent`. decision: `--cat-N-mark` 8-slot cycle · `--cat-on-mark` | Uppercase at 0.08em. The only tag re-pegged per deck shape. decision's own `strong` rule (`decision.styles.css:100-109`) is outranked for the lifted label |
| `banner-tag` modifier (`compare-prose.styles.css:284-336`) | `_class: … banner-tag`, decision and compare-prose only | Full-width band across the card top, in flow | As above | A wrapped band is taller than its neighbors' |
| `split-compare` verdict (`split-compare.styles.css:88`) | Always, text from `--insight-label` | Flush top-left | `--accent` · `--on-accent` with no fallback | Smaller padding (`0.3125/0.9375cqi`), 0.12em tracking, `sketch` leaves it crisp |
| `list-steps` default (`list-steps.styles.css:41`) | `ol` source, a literal `STEP ` prefix (`phase`, `stage`, `milestone`, `rank`, `tier` swap it through `--step-prefix`) | In flow above the title, no box | No fill · `--text-label` (brand-tinted in most themes) | Not called a tag. No `nowrap`, so `MILESTONE 01` can wrap in a narrow card |
| `list-steps capsule` (`list-steps.styles.css:144-189`) | `capsule` modifier | Floating pill centered above the title | `--cat-N-fill` cycle · `--cat-on-fill` | Pads with `--sp-*`. The `--accent-soft` fill at `:149-150` never applies, because the cycle overrides it |

That is **five recipes** (flush corner, band, bare text, pill, and the verdict's own flush
corner) spread over **six components** (two of the recipes are modifiers), with **three** color semantics (accent,
categorical mark, categorical fill) plus bare ink.

### 2.2 These do not qualify, and why

| Marker | Why it stays out |
|---|---|
| Rail nodes: `list-steps timeline` disc, `timeline-list` date pill, `split-panel steps` circle, `regulatory-update timeline` pill | They mark a point on a line, not a card. The rail sets their geometry |
| Status pills: `.chart-status` (progress, kanban, gantt, slope, timeline-list), `regulatory-update priority`, `kpi` status pill | They encode a state (pass, warn, fail) with their own semantic color vocabulary |
| The universal trailing pill (`li > code:last-child`, `base.modifiers.css:456-482`), `list-tabular register` stamp, `roadmap` header meta pill | They carry metadata about a card. The card's name lives elsewhere |
| Row numerals: `list`, `list-tabular`, `q-and-a`, `premise`, `principles`, `agenda cards` | They number rows in a gutter, not cards |
| Inline eyebrows: `citation-card`, `statute-stack`, `authority-chain`, `split-panel proof`, `redline` labels | These label a card as an eyebrow in the text flow, or as the card's own structure (authority-chain's tier column). The owner ruled them out after seeing them rendered (§7 Q5) |
| `journey` mood badge, `state-chart` chip, `list-steps chevron` column, `converge` and `ghost` titles | They are data readouts, edge labels or title styles |

### 2.3 What is wrong today

1. **Copies, not a kernel.** Four hand-copied corner recipes, already disagreeing on
   padding (`0.47/1.09cqi` vs `0.31/0.94cqi`), tracking (0.08em vs 0.12em), the space
   reserved above the body (three sums at landscape, and a fourth on compare-prose and
   decision in square, tall and strip decks) and the ink fallback.
2. **Wrapping breaks the card.** Rendered on `decision` (indaco, laptop): absolute tags
   reserve one line, and the tag sets `line-height: 1`, so a two-line tag is cramped and
   barely clears the body, and a **three-line tag covers the body's first line**. A
   wrapped `banner-tag` band makes its card's body start lower than its siblings'. No
   marker equalizes.
3. **Venue reaches the text but not the padding.** `--fs-meta` grows with `venue:` (up
   to 1.95x at `hall`), and the tag box grows with it. The padding is fixed `cqi`, so at
   `hall` the tag reads tighter than at `laptop`. Rendered `cards-grid` and `decision` at
   `hall`: nothing overflows and the body still clears the tag, so this is a proportion
   issue, not a collision.
4. **Author levers are per-component and partial.** `banner-tag` works on two layouts,
   `capsule` on one, and nothing works deck-wide.
5. **The existing color pairs are pinned; a neutral one does not exist.** Tests pin
   `--cat-on-mark` on `--cat-N-mark` and `--cat-on-fill` on `--cat-N-fill`
   (`test/unit/palette/contrast.test.js`), and `--on-accent` on `--accent` on every theme
   (`tools/contrast-audit.js:230`, asserted by `test/unit/palette/theme-surface-aa.test.js`).
   There is no neutral tag pair, because no tag is neutral today.
6. **`sketch` roughens some tags and not others.** It roughens the cards-grid and
   cards-stack corners (`base.sketch.css:367-375`) and the compare-prose/decision corner
   (`:385-391`); the split-compare verdict and the list-steps markers stay crisp.

## 3. The design

### 3.1 One element, one kernel

**Phase order (2026-09-27):** the kernel CSS lands first on the tags as they are (§6
phase 1); the element described here lands in phase 3, beside the measurement that
needs it. A code map for phase 1 found three costs the element carries and the CSS
does not: list-steps' number formats (`upper-alpha`, `upper-roman`, `--step-prefix`)
and the verdict word (`--insight-label`) are resolved in CSS, so the element keeps a
`::before` for its text; eight component sheets and three runtime checks key on the
lifted label being `strong:first-child`, so a label tag is the `<strong>` itself with
the class, not a wrapper; and a page with no runtime needs a CSS fallback.

Every qualifying tag becomes **one real element**, `<span class="card-tag">`, emitted by
the shared kernel on every render path (HARD RULE #1). Today three of the recipes draw
the tag as a `::before` pseudo-element. A real element buys three things a pseudo-element
cannot:

- the runtime can **measure** it, which the equal-height rule in §3.4 needs;
- it can sit in the card's layout flow for the `band`, `foot` and `inline` placements
  without per-component rewiring;
- `sketch`, print textures and every future treatment hit one selector.

A number tag is marked `aria-hidden="true"`, because the `ol` already tells a screen
reader the order. A text tag (a slot label or the verdict word) stays readable.

One CSS file, `lib/base/base.card-tag.css`, owns the geometry. Components stop styling
the tag. They declare only their **native defaults** (§3.3) as custom properties.

#### 3.1.1 Phase 3 as built: placements on the existing tags, no new element (2026-09-29)

Phase 3 was briefed as "the element, then the placements", with the element's shape to go to
the owner first. The owner was away and had asked for a safe, reversible choice over a wait, so
the agent building phase 3 built the placements on the tags as they already are (the
`::before` counter or verdict word, and the lifted `<strong>`) and left the markup alone. The
reasons, each checked while building:

- **Each thing the element was to buy is available without it.** The measure already works on
  pseudo-elements and lifted `<strong>`s (phase 2). Every placement is a re-point of the corner
  rule: `foot`, `notch` and `band` stay absolute and move a side or stretch; `inline` goes
  static. The one awkward case, a chip on its own line inside a flex-row card (cards-grid,
  cards-stack), is solved by the card's own `::after` as a zero-content line break, and an
  empty `<span>` in that flex row would face the same problem. One selector list per placement
  covers all six layouts.
- **The span still needs the pseudo-element as its fallback.** The export-to-Marp bundle renders
  the markdown with Marp's own parser, which never runs our plugins, so every number tag there
  is still a `::before`. Adding a span means keeping both, and every rule written twice.
- **The span moves structural selectors.** In `lib/base` and the three number-tag components,
  14 rules key on a list item's first or last child
  (`grep -rnE "li\s*>\s*(p|strong|code|\*)?:(first|last)-child|li:(first|last)-child"`). An
  element emitted first in every `<li>` changes what those match, on every deck.
- **The span changes every exported deck's bytes**, which triggers export sign-off (CLAUDE.md
  Quality Bar) for no visible gain. The placements are opt-in CSS, so a deck that sets no
  placement renders unchanged (pixel diff in the PR).

What the element would still buy: an `aria-hidden` number (the CSS counter is exposed to some
screen readers today, as it was before this work) and one selector in place of the host lists.
Both can land later without changing a register word. **This is the owner's call to reverse.**

### 3.2 The tokens

All are engine-owned names under a new `--card-tag-*` namespace. `--tag-bg` already
exists and means the spectrum duo partner, so the new tokens stay clear of it.

| Token | Default | What it sets |
|---|---|---|
| `--card-tag-fs` | `var(--fs-meta)` | Font size. It already tracks venue and deck shape |
| `--card-tag-scale` | `1` | Multiplier on the font size, set by the size axis |
| `--card-tag-pad-y`, `--card-tag-pad-x` | `0.35em`, `0.8em` | Padding in **em**, so the box grows with the text at every venue |
| `--card-tag-font`, `--card-tag-weight`, `--card-tag-track`, `--card-tag-case` | `--font-label`, 700, 0.08em, uppercase | One voice. A number tag drops the tracking |
| `--card-tag-fill`, `--card-tag-ink` | set by the color axis | Always set as a pair. §3.5 lists the pairs |
| `--card-tag-radius` | `--radius-sm` | Corner shape. `sketch` overrides it once |
| `--card-tag-block` | measured | The tallest tag in the row. §3.4 |

### 3.3 The register — `tag:` packs the axes, the way `backdrop:` does

One deck key, several one-word axes. **Each word belongs to exactly one axis**, so the
order does not matter and the parser needs no keys. Per slide, the same words take a
`tag-` prefix, and a slide's word on one axis replaces the deck's word **on that axis
only**, exactly as `backdrop:` does (`lib/core/resolve-backdrop.js`).

```markdown
---
tag: plain band center
---

<!-- _class: decision tag-color -->
```

That deck puts a neutral full-width band on every card, text centered. The decision
slide keeps the band and the centering and swaps only the color back to its categorical
cycle.

| Axis | Words | Effect |
|---|---|---|
| **Color** | `color` | The component's native color: accent for a sequence (cards-grid, compare-prose), the categorical cycle for independent slots (decision, capsule). **The default** |
| | `plain` | Neutral: a `--bg` fill with `--text-body` ink and a hairline edge (the pill look), for decks where color is already busy. Not `--bg-alt`, which is the card's own fill, so a tag in it vanished (found building phase 2); not `--text-label`, which most themes tint with the brand |
| | `none` | No fill and no box. The label stays, as bare `--text-secondary` ink |
| **Placement** (relative to the card) | `corner` | Flush into the top-left corner. **The default for card grids** |
| | `foot` | Flush into the bottom-left corner |
| | `notch` | A tab inset from the corner that straddles the card's top edge, half outside it |
| | `band` | A full-width band across the card top, in flow (today's `banner-tag`) |
| | `inline` | In the text flow above the title, like an eyebrow. **The default for list-steps** |
| **Text alignment** (inside the tag) | `start` `center` `end` | Only visible where the tag is wider than its text: `band`, and any row whose tags are equalized in width. **Default `start`** |
| **Size** | `small` `regular` `large` | `--card-tag-scale` at 0.85, 1 or 1.2, with padding following because it is in em. **Default `regular`** |

**Most specific wins:** a slide `tag-*` class, then the deck's `tag:`, then the
component's native default. That is the same three tiers as `backdrop:`, with the
component standing where the baked finish stands.

**`tag: none` is not "hide".** A slot label (`BUILD`, `BEFORE`) is content; hiding it
would silently drop words from the slide. A separate `hidden` word (placement axis) is
possible for number tags only, but this note does not propose it (§7 Q3).

**Retired modifiers become aliases.** `banner-tag` means `tag-band`, and list-steps
`capsule` means `tag-inline tag-center tag-color` with a pill radius. Each keeps working
and earns a lint hint pointing at the new words, so no shipped deck breaks.

Lint: `unknown-tag` for an unknown word or a second word on one axis, in
`lib/authoring/lint-core.js` (HARD RULE #7). The per-slide words join `MODIFIER_GROUPS`.

### 3.4 Equal size — the one part CSS cannot do alone

**Built in phase 2, per slide, width as well as height (§7 Q7–Q9).** The owner widened the rule
below after seeing a decision row where `BUILD`, a two-line label and `WHY NOT DELAY` were three
different widths: **every boxed tag on a slide takes the widest tag's width and the tallest
tag's height.** `lib/core/card-tag-equalize.js` measures each tag's content box and writes
`--card-tag-shim-x` / `--card-tag-shim-y` (extra padding) on each card and `--card-tag-block`
(the equalized height, which the corner reserve reads) on the section. It works on the tags as
they are — pseudo-elements and lifted `<strong>`s — so it did not wait for the element (§3.1).
The runtime runs it on its post-mutation dispatch and after fonts settle; the CLI export, which
strips the runtime, injects the same function after every navigation and once more after the
trim, before overflow is measured. A plain `.html` export skips it, because that file is built
before the page renders and carries no script, so its tags keep their own sizes; the export
runs the same kernel in a write-nothing report mode and warns on each slide where a tag would
cover its card body (2026-09-29). Padding never
changes a content box, so the pass settles in one step and a repeat writes nothing; the checker
confirmed one writing run over 400 random label sets, with no tag gaining a line or passing its
card. A `tag-none` label, which has no box, is not centered in an invisible taller one, so the
labels stay in line. In a stacked layout (portrait, or the fluid view on a tablet) a label that
wraps at the full card width would make every corner tag card-wide; the budget below stops a
label long before that. The rest of this section is the original row-scoped proposal, kept for
the record.

The rule: **in one row of cards, every tag is as tall as the tallest.** Absolute
placements (`corner`, `foot`, `notch`) and in-flow ones (`band`, `inline`) both need it,
for different reasons. For an absolute tag, the space reserved above the body has to fit
the real tag, not one assumed line. For an in-flow tag, the card bodies have to start on
the same line.

CSS can express this only inside a CSS grid with `subgrid` rows. `cards-grid` and
`verdict-grid` wrap as flex rows, and `compare-prose` and `decision` use their own grids,
so no single CSS mechanism reaches all of them. The proposal is:

1. **Runtime measure.** One pass in `lib/runtime` groups tags by visual row (equal
   `offsetTop` of their cards), reads each tag's height, and writes the row's maximum as
   `--card-tag-block` on those cards. Tags use `min-block-size: var(--card-tag-block)`,
   and the body reserve reads the same variable. The pass runs after fonts load and
   before the fit pass, since the reserve changes how much fits. It uses `padding` and
   `gap` only, so the measurement stays honest (HARD RULE #20).
2. **Static floor without the runtime.** With no runtime (the marp-kit export), the tag
   reserves one line, as today, and wraps rather than truncating. Nothing regresses; it
   just is not equalized.

### 3.5 Color and contrast

Every color word sets the fill and the ink **as a pair**, from pairs that already have,
or will get, a contrast test:

| Word | Fill | Ink | Contrast pin |
|---|---|---|---|
| `color`, sequence | `--accent` | `--on-accent` | Exists: `tools/contrast-audit.js:230` via `theme-surface-aa.test.js`. Phase 1 confirms it covers dark mode on every theme |
| `color`, categorical | `--cat-N-mark` | `--cat-on-mark` | Exists: `contrast.test.js:156` |
| `plain` | `--bg` | `--text-body` | **New**, pinned light and dark in `contrast.test.js` (phase 2) |
| `none` | transparent | `--text-secondary` on the card's own `--bg-alt` | **New**, pinned light and dark in `contrast.test.js` (phase 2) |

`capsule` today uses the pale `--cat-N-fill` with `--cat-on-fill`. Under this design the
categorical cycle uses the saturated mark tier for every tag, so capsule moves from pale
to saturated. That is a visible change (§7 Q4).

### 3.6 Venue

The font size is `--fs-meta × --card-tag-scale`, and `--fs-meta` already carries the
venue lift. Because padding is in em, the box grows with the text, and because the
reserve is measured (§3.4), the body clears the tag at every venue. That keeps the tag's
proportions the same at every venue (gap 2.3.3). Rail nodes and status pills had the
same fixed-cqi boxes. A hall render on 2026-09-29 confirmed it, and the follow-up PR sized
each box in em of its own text, as the tag's padding is: `.chart-status`, the
timeline-list date pill, the numbered `list-steps timeline` disc, and kanban's compact
status. roadmap's meta pill font was a raw cqi, so it takes the meta role's venue factor
instead. Each box was the old cqi value over 1.17, the landscape `--fs-meta` coefficient,
so a 1280 landscape slide moves by 0.4px at most. The bigger date pill cost timeline-list
one short item at conference and hall, re-measured with `tools/calibrate-capacity.js`.

## 4. What does not change

- Rail nodes, status pills, meta pills and row numerals (§2.2).
- The `--insight-label` vocabulary. The verdict tag keeps reading it; only its geometry
  moves onto the kernel.
- `ol` stays the switch that turns number tags on. The register styles tags; it does not
  create them where the source has none.
- The `stamp:` register. It shapes the slide's own state marker in the slide corner, not a
  card's tag.

## 5. Surfaces

- **Engine:** `lib/core/resolve-card-tag.js` (the resolver, modeled on
  `resolve-backdrop.js`), the element emission in `lib/integrations/markdown-it/plugins.js`
  and `lib/runtime/index.js` (next to the slot-label lift), and the measure pass.
- **CSS:** `lib/base/base.card-tag.css`. The copies in cards-grid, cards-stack,
  compare-prose, decision, split-compare and list-steps are deleted.
- **Lint:** `unknown-tag`, and the alias hints for `banner-tag` and `capsule`.
- **Docs:** `lib/base/base.registers.docs.md` gains a `tag:` section. The Labeled Corner
  Tag and Auto-Numbered sections of `lib/base/base.docs.md` merge into one Card tag
  section. Each affected component's `.docs.md` names its native default.
- **Studio:** a Tag row in deck settings and in the slide drawer, with the same
  provenance badge `backdrop:` shows (slide, deck or component).
- **Demo deck:** `examples/card-tags.md` (HARD RULE #9), with each placement, each color
  word, a wrapped label in a row to show equal heights, and a `venue: hall` slide.

## 6. The plan

One branch and one PR, one commit per phase (HARD RULE #17). Each phase stands on its own
and renders every shipped deck unchanged unless the phase says otherwise.

| Phase | What lands | Visible change | Proof |
|---|---|---|---|
| **1. Kernel (CSS only)** | `base.card-tag.css` and the `--card-tag-*` tokens; the seven recipes move onto it at their current look, each component keeping only its counter or label and which fill/ink pair it wears; `sketch` reaches every tag through two token re-points; a light-and-dark pin for the `--on-accent` pair. **No markup changes** (owner decision, §7 Q6) | The drift fixes: one padding (in em, so it follows venue and orientation), one tracking, one reserve formula, `sketch` everywhere. A two- and three-line corner label now clears the body | Pixel diff of the affected galleries before and after, with every changed slide listed and explained |
| **2. Register: color and size; equal size** | `resolve-card-tag.js`; `tag:` and `tag-*` on the engine and the runtime, per-axis eviction, split pages, lint (`unknown-tag`), the modifier vocabulary, the Studio's value completion, docs. The color axis (`color` · `plain` · `none`) and the size axis (`small` · `regular` · `large`). Placement and alignment wait for phase 3 so every word works on every layout; until then the linter names them as not yet available. **Added on the owner's call (§7 Q9):** the equal-size pass (§3.4) and the `tag-budget` lint | Every boxed tag on a slide matches the widest and tallest; otherwise none unless a deck opts in | Unit: resolver, slide-over-deck per axis on the engine AND the runtime bundle, lint, CSS contract; `plain`/`none` pairs AA-pinned light and dark. Demo deck extended, light and dark |
| **3. The element and placements** *(placements and alignment built 2026-09-29; the element deferred, §3.1.1)* | The real `card-tag` element on every render path (§3.1, with a CSS fallback for script-less pages), then `foot`, `notch`, `band` on every qualifying layout, `inline`, and text alignment. The measure pass already runs (phase 2) and extends to each new placement | None unless a deck opts in; wrapped tags stop colliding with the body | A row with one wrapped label at each placement, measured: every tag in the row the same height to the pixel, at `laptop` and `hall` |
| **4. Aliases** *(built 2026-09-29)* | `banner-tag` and `capsule` as aliases with lint hints. The legal inline-eyebrow layouts stay out (§7 Q5) | capsule moves to the saturated tier (§3.5) | Gallery pixel diff |
| **5. Studio** *(built 2026-09-29)* | The Tag row in deck settings and the slide drawer | Studio only | `docs/e2e` spec with screenshots at 1440, 820 and 390px |

Export sign-off applies from phase 1: moving a tag from a pseudo-element to a real
element changes the bytes of every exported deck that has one, so phase 1's demo PDFs go
to the owner in light and dark before merge. Maker-checker applies to phases 1 and 3,
which touch the shared kernel and the runtime.

## 7. Owner decisions

Settled 2026-09-27. The owner took the recommendation on each:

1. **Name:** `tag:` and `tag-*`. Tokens stay under `--card-tag-*`.
2. **Size:** one `small`/`regular`/`large` axis that moves font and padding together.
3. **`none`:** bare text with no box. It never hides the label.
4. **capsule:** moves to the saturated `--cat-N-mark` tier with every other categorical tag.

5. **Phase 4 scope:** the register stays with the seven recipes in §2.1. The owner looked
   at renders of the three inline-eyebrow legal layouts beside `decision` and ruled them
   out. `statute-stack`'s jurisdiction word is an eyebrow that already reads well,
   `authority-chain`'s tier column is the card's structure rather than a label on it, and
   `citation-card`'s label heads a callout, not one of several sibling cards. No `side`
   placement is added.
6. **Phase 1 is CSS only.** The element moves to phase 3 with the measure pass (§3.1).

Settled 2026-09-28, after the owner saw three decision tags at three widths, one wrapped:

7. **Only a band wraps.** A corner tag holds one line; a `banner-tag` band may run to two, and
   every band on the slide matches the tallest. A corner chip that wraps stops reading as a
   chip, and under equal size one long label pushes every card body down.
8. **The budget is set by card count, not one flat number.** The owner first took a flat 20
   characters (the tightest measured case: 4 cards at `tag-large`). Measured against the tree,
   20 failed 63 labels in 30 committed decks that fit on one line today; the strict deck lint
   blocks on it. Re-asked with that figure, the owner took the per-count budget (49, 33, 24
   characters for 2, 3, 4 cards; ÷1.2 at `tag-large`; twice that for a band), which fails the
   2 labels that really wrap.
9. **Equal size ships in phase 2's PR**, not as phase 3's first commit, so the demo that showed
   the mismatch does not merge without the fix.

## 8. How this note was checked

- **Rendered, not only read.** Two scratch decks through the CLI (indaco, laptop and
  `hall`): a decision row with one-, two- and three-line tags, the same row as
  `banner-tag`, list-steps `milestone` in five cards, and numbered `cards-grid` and
  `decision` at `hall`. They confirmed §2.3.2, softened §2.3.3 from "overflows" to "reads
  tighter", and showed that `MILESTONE 01` fits in five cards at laptop (wrapping needs a
  narrower card than that).
- **Independent fact-check.** A fact-checker agent verified the file:line and token claims:
  24 confirmed; three refuted (the `sketch` coverage, the "no `--on-accent` pin" claim, and a
  component count) and six imprecise (line offsets, the `STEP` prefix mechanism, the
  brand-tinted `--text-label`, a fourth reserve sum, and "dead" for decision's rule). All
  nine are corrected above. The `--text-label` finding moved `plain` and `none` to
  `--text-secondary`.
