---
status: proposed
summary: Lattice draws a label on a card six different ways. Four are copies of one flush top-left "corner tag" recipe that have already drifted apart, list-steps draws a fifth kind under another name ("STEP 01"), and none of them keeps sibling tags the same height when one wraps. This note audits every card marker in the tree, says which qualify as card tags, and proposes one shared tag kernel plus a `tag:` front-matter register and `tag-*` slide classes packed the way `backdrop:` packs its axes, covering color (plain, color, none), placement on the card, text alignment and size. It also lists the phases to get there.
---

# One card tag — an audit, a design and a plan

**Status:** proposed 2026-09-27. Nothing is built. The owner settled Q1–Q4 on 2026-09-27
(§7); Q5 is open and gates phase 4 only.

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
reading `BUILD`, tracked 0.08em. The third gets no block at all: plain gray `STEP 01` text,
tracked 0.12em. All three do the same job, which is naming a card, and an author can
change none of them from the deck. If `BUILD` were `WHY NOT DELAY THE LAUNCH`, the tag
would wrap to a second line and run into the card's body, because the space reserved
above the body holds one line.

## 2. Audit — every card marker in the tree

Two read-only scouts swept all 13 buckets, `lib/base` and `themes/`. A **card tag** here
means a short label that names or numbers one card among its siblings. The table shows
what qualifies.

### 2.1 These qualify — one family, several names

| Where | Trigger | Placement | Color · ink | Drift from the cards-grid recipe |
|---|---|---|---|---|
| `cards-grid` (`cards-grid.styles.css:82`, `:94`, `:141`, three copies) | `ol` source, `::before counter(card)` | Flush top-left, absolute | `--accent` · `--on-accent` | The reference. No re-peg for square, tall or strip decks. `sketch` leaves it crisp |
| `cards-stack` (`cards-stack.styles.css:99`, `:111`) | `ol` source, `::before counter(stack)` | Flush top-left | `--accent` · `--on-accent` | Reserves `--sp-xs + 1.875cqi` above the body where cards-grid reserves `--sp-sm + 2.34375cqi` for the same tag |
| `compare-prose` and `decision` (`compare-prose.styles.css:223-267`) | Lifted `<strong>` slot label (`lib/core/slot-label-lift.js`) | Flush top-left | compare-prose: `--accent` · `--on-accent`. decision: `--cat-N-mark` 8-slot cycle · `--cat-on-mark` | Uppercase at 0.08em. The only tag re-pegged per deck shape and the only one `sketch` roughens. decision's own `strong` rule (`decision.styles.css:100-109`) is outranked and dead |
| `banner-tag` modifier (`compare-prose.styles.css:284-336`) | `_class: … banner-tag`, decision and compare-prose only | Full-width band across the card top, in flow | As above | A wrapped band is taller than its neighbors' |
| `split-compare` verdict (`split-compare.styles.css:88`) | Always, text from `--insight-label` | Flush top-left | `--accent` · `--on-accent` with no fallback | Smaller padding (`0.3125/0.9375cqi`), 0.12em tracking, `sketch` leaves it crisp |
| `list-steps` default (`list-steps.styles.css:41`) | `ol` source, `STEP 01` via `--step-prefix` | In flow above the title, no box | No fill · `--text-label` | Not called a tag. No `nowrap`, so `MILESTONE 01` can wrap in a narrow card |
| `list-steps capsule` (`list-steps.styles.css:144-189`) | `capsule` modifier | Floating pill centered above the title | `--cat-N-fill` cycle · `--cat-on-fill` | Pads with `--sp-*`. The `--accent-soft` fill at `:149-150` never applies, because the cycle overrides it |

That is **five recipes** (flush corner, band, bare text, pill, and the verdict's own flush
corner) spread over **seven components**, with **three** color semantics (accent,
categorical mark, categorical fill) plus bare ink.

### 2.2 These do not qualify, and why

| Marker | Why it stays out |
|---|---|
| Rail nodes: `list-steps timeline` disc, `timeline-list` date pill, `split-panel steps` circle, `regulatory-update timeline` pill | They mark a point on a line, not a card. The rail sets their geometry |
| Status pills: `.chart-status` (progress, kanban, gantt, slope, timeline-list), `regulatory-update priority`, `kpi` status pill | They encode a state (pass, warn, fail) with their own semantic color vocabulary |
| The universal trailing pill (`li > code:last-child`, `base.modifiers.css:456-482`), `list-tabular register` stamp, `roadmap` header meta pill | They carry metadata about a card. The card's name lives elsewhere |
| Row numerals: `list`, `list-tabular`, `q-and-a`, `premise`, `principles`, `agenda cards` | They number rows in a gutter, not cards |
| Inline eyebrows: `citation-card`, `statute-stack`, `authority-chain`, `split-panel proof`, `redline` labels | These name a card, but as an eyebrow in the text flow, which is the `inline` placement below. They are phase-4 candidates, not phase-1 migrations (§6) |
| `journey` mood badge, `state-chart` chip, `list-steps chevron` column, `converge` and `ghost` titles | They are data readouts, edge labels or title styles |

### 2.3 What is wrong today

1. **Copies, not a kernel.** Four hand-copied corner recipes, already disagreeing on
   padding (`0.47/1.09cqi` vs `0.31/0.94cqi`), tracking (0.08em vs 0.12em), the space
   reserved above the body (three different sums) and the ink fallback.
2. **Wrapping breaks the card.** Absolute tags reserve one line, so a second line runs
   into the body. In-flow tags (band, list-steps) grow only their own card, so siblings
   differ in height. No marker equalizes.
3. **Venue does not reach the box.** `--fs-meta` grows with `venue:` (up to 1.95x at
   `hall`), but the padding and the reserve are fixed `cqi`, so at `hall` the text
   outgrows its own box and the reserve beneath it.
4. **Author levers are per-component and partial.** `banner-tag` works on two layouts,
   `capsule` on one, and nothing works deck-wide.
5. **No contrast pin for the main pair.** Tests pin `--cat-on-mark` on `--cat-N-mark` and
   `--cat-on-fill` on `--cat-N-fill` per theme and mode (`test/unit/palette/contrast.test.js`),
   but nothing pins `--on-accent` on `--accent` outside the print pair.
6. **`sketch` roughens two of the five recipes.**

## 3. The design

### 3.1 One element, one kernel

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
| | `plain` | Neutral: a `--bg-alt` fill with `--text-label` ink, for decks where color is already busy |
| | `none` | No fill and no box. The label stays, as bare `--text-label` ink (today's list-steps look) |
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

### 3.4 Equal height — the one part CSS cannot do alone

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
| `color`, sequence | `--accent` | `--on-accent` | **New** — AA per theme and mode, added in phase 1 (gap 2.3.5) |
| `color`, categorical | `--cat-N-mark` | `--cat-on-mark` | Exists: `contrast.test.js:156` |
| `plain` | `--bg-alt` | `--text-label` | **New**, same test |
| `none` | transparent | `--text-label` on the card's own surface | Covered by the text-tier tests |

`capsule` today uses the pale `--cat-N-fill` with `--cat-on-fill`. Under this design the
categorical cycle uses the saturated mark tier for every tag, so capsule moves from pale
to saturated. That is a visible change (§7 Q4).

### 3.6 Venue

The font size is `--fs-meta × --card-tag-scale`, and `--fs-meta` already carries the
venue lift. Because padding is in em, the box grows with the text, and because the
reserve is measured (§3.4), the body clears the tag at every venue. That fixes gap 2.3.3
for tags. The same fixed-cqi fault in rail nodes and status pills is out of scope and
goes to a follow-up.

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
| **1. Kernel** | The `card-tag` element on every render path, `base.card-tag.css`, the tokens, and the migration of the seven qualifying recipes onto it at their current look. The `--on-accent` and `plain` contrast pins | Only the drift fixes: one padding, one tracking, one reserve, `sketch` everywhere | Pixel diff of the six galleries before and after, with every changed slide listed and explained |
| **2. Register** | `resolve-card-tag.js`, `tag:` and `tag-*` on all paths, lint, docs | None unless a deck opts in | Unit: resolver, slide-over-deck per axis on the engine and the runtime bundle. Demo deck, light and dark |
| **3. Placements and equal height** | `foot`, `notch`, `band` on every qualifying layout, `inline`, text alignment, size, and the measure pass | None unless a deck opts in; wrapped tags stop colliding with the body | A row with one wrapped label at each placement, measured: every tag in the row the same height to the pixel, at `laptop` and `hall` |
| **4. Aliases and adopters** | `banner-tag` and `capsule` as aliases with lint hints. The inline-eyebrow layouts (`citation-card`, `statute-stack`, `authority-chain`) opt in with `inline` as native, if the owner wants them in (§7 Q5) | capsule moves to the saturated tier (§3.5) | Gallery pixel diff |
| **5. Studio** | The Tag row in deck settings and the slide drawer | Studio only | `docs/e2e` spec with screenshots at 1440, 820 and 390px |

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

Still open, and it gates phase 4 only:

5. **Scope of phase 4.** Bring the inline-eyebrow legal layouts (`citation-card`,
   `statute-stack`, `authority-chain`) under the register, or keep the register to the
   seven recipes in §2.1.
