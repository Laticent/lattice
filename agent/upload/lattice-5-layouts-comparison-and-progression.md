# Lattice layouts — comparison, progression



> How options differ, and ordered movement through stages.



**Contents:** `compare-prose` · `compare-table` · `decision` · `matrix-2x2` · `pricing` · `redline` · `split-compare` · `verdict-grid` · `cycle` · `list-criteria` · `list-steps`



## compare-prose

> Two prose options side-by-side with a labeled corner tag on each.

**Function** comparison · **Form** split · **Substance** structure

**Tags** `tradeoff` · `contrast` · `recommendation` · `transformation` · `retrospective`

Use to weigh two approaches against each other in body text. Add the `chosen` or `decision` modifier to mark the verdict; add `vertical` to stack top/bottom instead of side-by-side. `axis` reframes the pair as two facets of one idea — a lede above, a numeral-led card per facet, a closing note below.

### Agent contract

**Density** aim ~20 words per item; past ~32 it reads as a wall of text — each side's case in a sentence or two.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the comparison. |
| `options` | `ul > li` | yes | Exactly two list items, each one option. The lead text is the option label — it renders bold automatically (no `**…**` needed); follow it with a nested bullet carrying 1–3 sentences. In `axis`, leave the lead blank and nest a 3-item sub-list instead: the facet numeral (`I` / `II`), a bold title, and a description sentence. |
| `lede` | `h2 + p` | no | `axis` only. A framing sentence between the heading and the two facet cards. |
| `note` | `:is(ul, ol) + p` | no | A closing line after the two cards. Plain prose in the base layout; `axis` renders it centered and italic. |

#### Variant decision rule

- **`axis`.** Two FACETS of one idea, not a before/after change of state — authored as a numbered list (`1. Title` + a nested body line). The I/II numerals are generated from the ol counter, never typed, and the variant opts out of the family's corner-tag treatment so the title stacks under the numeral.
- **`transition`.** The comparison is a state change over time — left is before, right is after; implies causation, not two co-equal preferences.
- **`mirror`.** Same anatomy, but the deck's rhythm wants the accented (second) option to land visually on the left instead of the right.
- **`chosen`.** One option is the winner and the other keeps its full, undiminished case — crowns the second option without dimming the first.
- **`decision`.** The decision is made and the slide is the record — composes `chosen` with a de-emphasized first card and a stronger connector.
- **`vertical`.** Either case needs more room than the two-column width can hold — stacks the panes top/bottom instead of side by side.
- **`banner-tag`.** The corner labels are short, loud verdicts (camps, teams) that deserve a full-width banner instead of a quiet corner tag.
- **`rejected`.** One option was considered and explicitly declined — dims and strikes the second card as the record of what didn't make it.

#### Common mistakes

- **Assuming `chosen`/`rejected`/`decision` mark whichever option is authored first.** All three target the SECOND card (`li:last-child`) in the markdown — the option to crown (`chosen`) or strike (`rejected`) must be written second, not first.
- **Combining `mirror` with `chosen`/`rejected`/`decision`, expecting the marked card to move with the visual swap.** `mirror` only reverses the VISUAL row (`flex-direction: row-reverse`) — the chosen/rejected treatment still targets the second option in markdown SOURCE order, so mirroring changes where it appears on screen, not which option gets the accent.
- **Writing a label before the nested sub-list in an `axis` card (`- Own the verb` then the numeral/title/description sub-list), the way the base layout's option lead works.** `axis` cards read the FIRST three items of the nested sub-list as numeral, title, and description — leave the outer bullet's own lead blank (`- ` with nothing after it) so nothing is left over to become a stray corner tag.

### When to use

- **Two prose alternatives.** Both sides are full sentences of argument, not lists of facts. The audience reads each column as a paragraph and weighs them against each other.
- **Equal-density prose.** Each card carries roughly the same body length. One short and one long breaks the visual symmetry that makes the comparison legible.
- **Add a verdict modifier when chosen.** Layer `chosen`, `decision`, or `vertical` to name the editorial intent. The default (neutral two-up) reads as still-being-decided.

### When NOT to use

- **Code comparison.** Use `compare-code` for two fenced blocks. compare-prose is for sentences, not snippets.
- **Three or more options.** compare-prose is strictly two. For three or more, use `cards-grid three` or `verdict-grid` with criteria badges.
- **Verbatim text differences.** When the diff lives inside the prose itself — legal language, contract clauses — use `redline` so insertions and deletions render inline.

### Authoring

```markdown
<!-- _class: compare-prose -->

## Heading framing the comparison.

- First option
  - Two-sentence description of the first option, including the strongest argument for it.
- Second option
  - Two-sentence description of the second option, including the strongest argument for it.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│                  LABEL                  │
│            Comparison Title             │
│                                         │
│  ┌──────────────┐     ┌──────────────┐  │
│  │ Before /     │  →  │ After /      │  │
│  │ Option A     │     │ Option B     │  │
│  │              │     │              │  │
│  └──────────────┘     └──────────────┘  │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `transition` — transition

Left reads as before, right as after.

```markdown
<!-- _class: compare-prose transition -->

## transition reads left as before, right as after.

- Before
  - The arrow between the panes turns comparison into change over time.
- After
  - Use it for state changes, not preferences — the arrow implies causation.
```

#### `mirror` — mirror

Swaps the reading order.

```markdown
<!-- _class: compare-prose mirror -->

## mirror swaps the reading order.

- Second option
  - mirror renders this pane first — for when the deck's rhythm lands on the left.
- First option
  - Same anatomy, flipped; the corner tags travel with their panes.
```

#### `chosen` — chosen

Crowns the right pane the winner.

```markdown
<!-- _class: compare-prose chosen -->

## chosen crowns the right pane the winner.

- The road not taken
  - The losing option keeps its full case — an honest comparison shows real strength.
- The verdict
  - The accent treatment marks this pane as the pick; pair with a reason, not a repeat.
```

#### `decision` — decision

Stamps the verdict banner across the pair.

```markdown
<!-- _class: compare-prose decision -->

## decision stamps the verdict banner across the pair.

- Option one
  - Both panes stay equal; the banner above carries the call.
- Option two
  - Use when the decision is made and the slide is the record.
```

#### `vertical` — vertical

Stacks the panes for longer cases.

```markdown
<!-- _class: compare-prose vertical -->

## vertical stacks the panes for longer cases.

- The top option
  - Stacking buys full slide width, so a case may run toward its ceiling without the columns pinching.
- The bottom option
  - The trade is simultaneity — the eye compares in sequence, so lead with the keeper.
```

#### `banner-tag` — banner-tag

Corner tags become banners.

```markdown
<!-- _class: compare-prose banner-tag -->

## banner-tag fills the corner tags at banner weight.

- OPTION A
  - The tag takes the accent fill and full contrast.
- OPTION B
  - Use for short, loud labels — verdicts, camps, teams.
```

#### `rejected` — Rejected

Strikes the losing pane.

```markdown
<!-- _class: compare-prose rejected -->

## rejected strikes the losing pane.

- The pick
  - The surviving option reads at full strength.
- The rejected pane
  - Dimmed and struck — the record of what was considered and declined.
```

#### `axis` — axis

A lede above, numeral-led facet cards, a closing note below.

```markdown
<!-- _class: compare-prose axis -->

## The second axis: how far it reaches.

The verb is one axis — how you think. **Reach** is the other — how far what you make travels.

1. Own the verb
   - You can do the cognitive work — correct, clear, complete. It reaches only you.
2. Widen the reach
   - The work travels: team, org, field. Documented, adopted, durable.

*Most engineers stall on making it travel, not on the thinking.*
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `compare-code` — the columns are code, not prose
- [`split-compare`](#split-compare) — the verdict needs a bottom recommendation bar
- [`verdict-grid`](#verdict-grid) — three or more options scored against shared criteria
- [`decision`](#decision) — the verdict slide that lands after a comparison

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/comparison/compare-prose>


## compare-table

> Multi-row comparison table with consistent columns.

**Function** comparison · **Form** ledger · **Substance** prose

**Tags** `tradeoff` · `ranking` · `assessment`

Use when you have 3+ options or 4+ rows of criteria. Wider data than compare-prose can hold legibly.

### Agent contract

**Capacity** ~4 rows (crowds past 6, overflows past 8) — past that, split across slides. The table density crowds past six rows.

**Density** aim ~12 words per row; past ~18 it reads as a wall of text — a few words per cell.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the comparison. |
| `table` | `table` | yes | Markdown table with header row and 2+ data rows. |

#### Common mistakes

- **Writing a vague or duplicate first column, assuming it's just another data column.** When the table overflows a narrow box, the Fit Ladder reshapes it into row-cards (column headers become in-card labels) instead of clipping — the FIRST column becomes each card's title in that reshape, so it needs to be a genuinely identifying label per row. This happens automatically and needs no opt-in.

### When to use

- **Wider than compare-prose.** Three or more options, or four or more rows of criteria. compare-prose maxes out at two columns and short bodies; compare-table scales further.
- **Cells are short phrases.** Each cell is a value, a phrase, or a state marker — not a paragraph. If the cells need sentences, use `verdict-grid` or `cards-stack`.
- **Stable column meaning.** Every row reads the same way across columns. Mixing column meanings row-to-row breaks the table's scannability.

### When NOT to use

- **Cells full of prose.** Long sentences in a table cell wrap awkwardly and force the column wider. Move to `verdict-grid` for criteria with body text, or `cards-stack` for full prose rows.
- **More than 6 rows.** Past 6 rows the table density crowds the slide. Split into two slides or summarize the rows that don't differentiate.
- **State-marker rows.** When most cells are pass/fail/partial badges, the right layout is `obligation-matrix` or `verdict-grid`. compare-table is for textual values.

### Authoring

```markdown
<!-- _class: compare-table -->

## Heading framing the comparison.

| Criterion | Option A | Option B | Option C |
| --- | --- | --- | --- |
| First criterion | Value | Value | Value |
| Second criterion | Value | Value | Value |
| Third criterion | Value | Value | Value |
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  LABEL                                  │
│  Here are the numbers side by side.     │
│                                         │
│  ┌───────────┬───────────┬───────────┐  │
│  │           │ Option A  │ Option B  │  │
│  ├───────────┼───────────┼───────────┤  │
│  │ Row 1     │ ✓         │ ✕         │  │
│  │ Row 2     │ ✕         │ ✓         │  │
│  │ Row 3     │ ✓         │ ✓         │  │
│  │ Row 4     │ ⚠         │ ✓         │  │
│  └───────────┴───────────┴───────────┘  │
│  Footnote text for scope caveats.       │
│  footer                          11/19  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`compare-prose`](#compare-prose) — exactly two options with prose bodies
- [`verdict-grid`](#verdict-grid) — options scored against criteria with pass/partial/fail badges
- `obligation-matrix` — many regimes compared against shared obligations
- `cards-stack` — each row needs full-prose breathing room rather than a tabular cell

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/comparison/compare-table>


## decision

> The verdict slide — one chosen path, named explicitly.

**Function** comparison · **Form** canvas · **Substance** structure

**Tags** `recommendation` · `tradeoff` · `strategy`

Use after a comparison slide to land the decision. The justifications render as one unified categorical strip — co-equal cards that together signal a single resolved verdict; the heading carries the decision, not a focal/subordinated split.

### Agent contract

**Density** aim ~20 words per item; past ~32 it reads as a wall of text — each option's tradeoff in a sentence or two.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the decision. |
| `options` | `ul > li` | yes | List items. Authoring contract: a top-level bullet is the option name (renders bold by default); an indented bullet underneath carries the short rationale. The cards render as a unified strip of co-equal categorical tags; the verdict is carried by the heading, not by emphasizing one card. |

#### Variant decision rule

- **default (no modifier).** The reasoning carries the weight — a quiet corner tag labels each justification without competing with the verdict heading.
- **`banner-tag`.** The camp or stance itself is worth headlining — converts the quiet corner tag into a full-width banner strip per card.

#### Common mistakes

- **Reordering justification cards, expecting their categorical accent color to travel with the same justification.** The accent color is assigned purely by card POSITION (an `nth-child` cycle through the categorical palette), not by content — reordering cards in the markdown reassigns colors; they don't follow the justification.
- **Manually bolding the option name with `**…**`.** The lead text auto-lifts to `<strong>` (the corner-tag CSS keys off it), and the lift step already skips an already-bolded lead — a manually bolded lead and a plain one produce byte-identical output. Wrapping it yourself is a harmless no-op, not a defect, but it's also unnecessary — write plain text and let the lift handle the weight.

### When to use

- **Land the verdict.** Follows a comparison slide to make the chosen path unambiguous. The heading carries the verb of the decision; the cards substantiate it.
- **Two to four justifications.** Each card is one short rationale — the chosen path first, then a Why-not card for each rejected alternative. More than four crowds the horizontal strip.
- **After the comparison.** Pair with `compare-prose` or `split-compare` upstream — that slide does the weighing, this slide lands the answer. Reaching for decision without a prior comparison reads as edict.

### When NOT to use

- **No clear chosen path.** If the cards don't resolve to a single verdict, the slide is back to being a comparison. Use `compare-prose` or `split-compare`; reserve decision for the resolved call.
- **Long body per card.** Each card is one sentence of rationale. Paragraphs belong on the comparison slide upstream, not on the verdict slide.
- **Generic heading.** The h2 carries the decision verb — Build, not buy. Adopt the framework. Pause the rollout. A heading like Next steps wastes the focal real estate.

### Authoring

```markdown
<!-- _class: decision -->

## What we are doing.

- Chosen path
  - One-line rationale for the decision.
- Rejected option
  - One-line rationale for why this didn't fit.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│            Decision heading.            │
│                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  CHOSEN       Option B     Option C     │
│  rationale    rationale    rationale    │
│  └─────────┘  └─────────┘  └─────────┘  │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `banner-tag` — banner-tag

Headlines each card with its camp.

```markdown
<!-- _class: decision banner-tag -->

## banner-tag headlines each card with its camp.

- DECIDE
  - The banner carries the stance; the body carries the reason.
- RECORD
  - Use when the slide is the decision log's public face.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`compare-prose`](#compare-prose) — the comparison slide that should precede decision
- [`split-compare`](#split-compare) — comparison and verdict on one slide instead of two
- `closing` — the deck ends without a single-call verdict
- `big-number` — the decision is a quantitative commitment

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/comparison/decision>


## matrix-2x2

> Static 2×2 quadrant grid with author-placed items per cell.

**Function** comparison · **Form** matrix · **Substance** structure

**Tags** `two-by-two` · `prioritize` · `strategy` · `risk`

Use for categorical 2×2 reasoning when the items are fixed and you control which cell each lands in. For data-plotted scatter on continuous axes, use quadrant instead.

### Agent contract

**Density** aim ~10 words per item; past ~16 it reads as a wall of text — a short label per quadrant cell.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the framework. |
| `axes` | `ul > li` | yes | Four outer list items (one per cell). Lead each with **Quadrant label.** then the items as inner bullets. |

#### Common mistakes

- **Quadrant title names only one axis, e.g. `- **Priorities.**` instead of both poles.** Lead each quadrant with both axis poles: `- **High impact · Low effort.**`. A single-axis label breaks the 2×2 read — the grid only communicates structure when all four titles name the same two axes.
- **The four outer list items authored in an arbitrary order.** Declaration order IS grid position: 1st item → top-left, 2nd → top-right, 3rd → bottom-left, 4th → bottom-right (a flex-wrap layout, not a labeled grid). Reordering the source list visibly reorders the quadrants.

#### Data shape

- Author exactly four outer list items, one per quadrant. The layout assumes a fixed 2×2 and does not clamp, reflow, or warn on a different count — a 3rd or 5th item is an authoring bug the engine won't catch; it just wraps into a broken grid.

### When to use

- **Categorical 2×2 reasoning.** SWOT, Eisenhower, BCG growth-share, risk × impact, build-vs-buy. The two axes are discrete labels and you place each item by judgment.
- **Fixed, author-placed items.** You know which cell each item belongs in and the placement is the editorial argument. Data-plotted scatter on continuous axes belongs in `quadrant`.
- **Bottom-right accent matters.** The fourth cell carries the accent ring as the conventional outcome or high-priority quadrant. Place the items you want emphasized there.

### When NOT to use

- **Continuous-axis data.** If items have x/y coordinates rather than quadrant labels, use `quadrant`. matrix-2x2 is author-placed categorical, not plotted.
- **Empty quadrants left blank.** An empty cell still needs a label or an explicit (none) placeholder. A missing card breaks the 2×2 symmetry.
- **More than 4 items per cell.** Each quadrant holds 1–4 items. Past that the cells crowd. Promote inner items to their own slide if needed.

### Authoring

```markdown
<!-- _class: matrix-2x2 -->

## Where each option lives.

- **High value · Low cost.**
  - First item in this quadrant
  - Second item
- **High value · High cost.**
  - First item in this quadrant
- **Low value · Low cost.**
  - First item in this quadrant
- **Low value · High cost.**
  - First item in this quadrant
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│           2×2 matrix heading            │
│                                         │
│  ┌──────────────┐     ┌──────────────┐  │
│  │ Q1: top L    │     │ Q2: top R    │  │
│  │ axis y+      │     │ axis y+      │  │
│  └──────────────┘     └──────────────┘  │
│  ┌──────────────┐     ┌──────────────┐  │
│  │ Q3: bot L    │     │ Q4: bot R    │  │
│  └──────────────┘     └──────────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `quadrant` — items have continuous x/y coordinates rather than discrete quadrant labels
- [`verdict-grid`](#verdict-grid) — options scored across more than two dimensions
- `obligation-matrix` — many rows × many columns of state-marker cells
- `matrix-grid` — both axes are ordered categories and cells mark one position, not four free quadrants
- `cards-grid` — the items don't divide along two axes

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/comparison/matrix-2x2>


## pricing

> Side-by-side plan tiers with prices, feature checklists, and one recommended column.

**Function** comparison · **Form** grid · **Substance** structure

**Tags** `pitch` · `tradeoff` · `recommendation`

Use for the plans / packages slide — two to four tiers compared on price and features, with one tier elevated as the recommendation. The recommended tier is marked explicitly (it is usually the middle one, not the last), so the eye lands where you want it.

### Agent contract

**Capacity** ~3 items (over 4 overflows) — past that, compare-table / split across slides. Two tiers read as a binary and four is the widest row that holds; past four the tiers narrow until a feature label wraps to three lines. A split run paces ONE tier per page and carries a derived “Option N of M · comparing …” signal, so the pages still read as one comparison (§0b connected members).

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — the choice the tiers resolve (‘Pick the plan that fits the team.’). |
| `tiers` | `ul > li` | yes | One top-level li per tier. Lead with the plain tier name (auto-bold), then a trailing inline-code price (`$49 / mo`, `Custom`). Add a single-asterisk marker (`*Most popular*`) to elevate one tier — it renders as a ribbon. Then a nested list: one feature per line led by a state marker, and a final marker-less ‘who it's for’ line. |
| `features` | `ul > li > ul > li` | yes | Feature rows, each led by a state marker: `[x]` included (green check), `[/]` not included (muted, struck through), `[-]` limited (half). The LAST nested li carries NO marker — a short ‘who it's for’ line that anchors the bottom of the card. Keep the feature set and its order identical across every tier so the columns scan. |

#### Variant decision rule

- **default (no modifier).** Three tiers is the natural width for a plans slide — good/better/best.
- **`two`.** A straight head-to-head between exactly two plans — self-serve vs. enterprise, free vs. paid.
- **`four`.** The whole ladder needs to be visible at once — compact enough to still read at four columns.

#### Common mistakes

- **Writing the ribbon marker as `**Most popular**` (bold) instead of `*Most popular*` (single asterisk).** The ribbon is CSS-targeted at `li > em` specifically — `*…*` parses to `<em>`. A `**bold**` marker parses to `<strong>` instead and triggers neither the ribbon nor the accent-elevated card styling.
- **Adding a state marker (`[x]`/`[/]`/`[-]`) to the final "who it's for" line.** The audience line is styled by its POSITION — the nested list's `:last-child` — not by being marker-less; adding a marker doesn't move the pinned-bottom, meta-color treatment, it just layers badge chrome (check icon + strike, etc.) on top of it, so the line ends up looking like a feature row instead of a plain caption.

### When to use

- **Two to four tiers.** Each tier is one column; the grid holds three across by default (`two` / `four` adjust the count). Past four the columns crowd and the prices stop scanning — move secondary options to a follow-up slide.
- **Same features, same order, every tier.** The columns only compare if each tier lists the identical feature set in the identical order — `[x]` where it's included, `[/]` where it isn't. Drifting features between tiers defeats the at-a-glance read.
- **Mark the recommendation.** Add `*Most popular*` (or `*Best value*`, `*Recommended*`) to the tier you want chosen — it renders as a ribbon and elevates the card. Usually the middle tier, which is why the marker is explicit rather than positional.
- **A 'who it's for' line per tier.** Each tier ends with one marker-less line naming its audience (‘For scaling teams.’). It anchors the bottom of the card and turns a price into a decision.

### When NOT to use

- **More than four tiers.** Five-plus columns shrink below readability and the price comparison collapses. Curate to the tiers that matter, or use `compare-table` for a dense feature-by-plan matrix.
- **Every tier marked popular.** Elevate exactly one tier. Two ribbons cancel out and the eye has nowhere to land — the whole point of the marker is a single recommendation.
- **Features that drift between tiers.** If each tier lists a different set of features, the columns can't be compared row-for-row. Keep the feature list and order identical; toggle inclusion with `[x]` / `[/]`.
- **A wall of red 'not included'.** Use `[/]` (muted, struck through) for an absent feature, not `[ ]` (alarming empty/fail). A pricing table sells what's included; it shouldn't read as a list of denials.

### Authoring

```markdown
<!-- _class: pricing -->

## Pick the plan that fits the team.

- Starter `$0`
  - [x] First feature
  - [/] Second feature
  - For evaluating, one team.
- Growth `$49 / mo` *Most popular*
  - [x] First feature
  - [x] Second feature
  - For scaling teams.
- Enterprise `Custom`
  - [x] First feature
  - [x] Second feature
  - For procurement and compliance.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│        Pick the plan that fits.         │
│                                         │
│    Starter    Growth*    Enterprise     │
│      $0         $49         Custom      │
│     [x x /]    [x x x]     [x x x]      │
│   one team   scaling     procurement    │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `two` — two

A pair of plans, head to head.

```markdown
<!-- _class: pricing two -->

## two sets a pair of plans head to head.

- Self-serve `$49 / mo`
  - [x] Wider columns, more feature rows
  - [/] The gap that motivates upgrading
  - The simple path.
- Enterprise `Custom`
  - [x] Everything in self-serve
  - [x] The rows that close deals
  - The guided path.
```

#### `four` — four

The whole ladder, compact.

```markdown
<!-- _class: pricing four compact -->

## four compact fits the whole ladder.

- Free `$0`
  - [x] One seat
  - [/] The rest
  - For trying.
- Team `$29`
  - [x] Five seats
  - [/] SSO
  - For starting.
- Growth `$49` *Most popular*
  - [x] SSO
  - [/] Support
  - For scaling.
- Enterprise `Custom`
  - [x] Everything
  - [x] Support
  - For fleets.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`compare-table`](#compare-table) — a dense feature-by-plan matrix with many rows, not a few highlighted features
- [`verdict-grid`](#verdict-grid) — options scored on shared criteria, not priced tiers
- `cards-grid` — parallel items with no price and no shared feature checklist
- [`decision`](#decision) — the slide recommends one option outright rather than presenting a price ladder
- `big-number` — a single headline price, not a tiered comparison

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/comparison/pricing>


## redline

> Clause-by-clause comparison — verbatim language with inline `<ins>`/`<del>` tracking the amendment.

**Function** comparison · **Form** canvas · **Substance** prose

**Tags** `contract` · `contrast` · `compliance` · `transformation`

Use when an amendment's diff is the slide. The blockquote carries the redlined text with ins/del markers; the trailing list explains why the diff matters operationally.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading naming the amendment or change. |
| `citation` | `p:first-of-type > code` | yes | Inline-code citation of the amended provision (e.g. 'Cal. Civ. Code §1798.135 · SB-362 (2024)'). |
| `redline` | `blockquote` | yes | The amended language. Use `<del>old text</del>` and `<ins>new text</ins>` inline. |
| `implications` | `ul > li` | no | Optional explanation. Use **Why this matters** for the operational read. |

#### Variant decision rule

- **default (no modifier).** One clause, ins/del inline in a single blockquote — the simplest, most common redline.
- **`annotated`.** Each individual edit needs its own explanation, not just one trailing 'why this matters' line — numbers each marked edit against a footnoted rationale.
- **`three-col`.** The audience should read old, new, and rationale as three distinct, separately labeled blocks rather than one inline-marked passage.
- **`split`.** Before and after read better as two full parallel blockquotes than as one passage with inline markup.
- **`stacked`.** The passage is long enough that side-by-side columns would be too narrow — stacks the prior text (struck) above the current instead.

#### Common mistakes

- **Placing the citation paragraph BEFORE the heading instead of after it.** Immediately after the heading (the documented placement) the citation paragraph stays in the flow and gets redline's dedicated accent-mono citation styling. Before the heading, it's captured as the shared masthead eyebrow (mono-caps kicker) instead — a different, generic treatment. Keep it after the heading, matching the skeleton.
- **Assuming Markdown strikethrough (`~~text~~`) doesn't render as a tracked deletion the way literal `<del>` does.** `~~text~~` DOES render as a tracked deletion — Markdown strikethrough produces `<s>`, and redline's CSS styles `del`/`s` identically (line-through, fail-red color and background). Either syntax works for a deletion; `<ins>new</ins>` still needs literal HTML since Markdown has no native insertion syntax.

### When to use

- **Verbatim text matters.** When the amendment is the language — legal clauses, regulatory paragraphs, contract terms. Paraphrasing would lose the exact words the parties are bound by.
- **Diff is the slide.** The inline `<ins>` and `<del>` markers are the editorial argument. The audience reads what changed by scanning the green and red inline marks, not by toggling between two blocks.
- **Why-this-matters trailer.** End with a single operational sentence explaining what the diff means for the team's work. The clause is the evidence; the trailer is the implication.

### When NOT to use

- **Code diffs.** For two code snippets side-by-side, use `compare-code`. redline is for natural language — legal, regulatory, contractual — not source code.
- **Paraphrased clauses.** If the quoted text isn't verbatim, the diff is meaningless. Either render the actual clause with its diff, or move to `compare-prose` for narrative comparison.
- **Long passage with one tiny diff.** If one word changed in a paragraph, quote only the affected sentence or two. A wall of unchanged text with one inline mark buries the change.

### Authoring

```markdown
<!-- _class: redline -->

## Headline naming the amendment.

`Citation reference · amendment name (year)`

> Verbatim language with <del>old wording</del> <ins>new wording</ins> inline so the diff reads cleanly.

- **Why this matters.** What the amendment changes in operational terms, in one sentence.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Clause diff heading.                   │
│                                         │
│  The original clause text with          │
│  ~~struck-through removals~~ and        │
│  __underlined insertions__ shown        │
│  inline in the prose stream.            │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `annotated` — annotated

Adds the why beside each edit.

```markdown
<!-- _class: redline annotated -->

## annotated adds the why beside each edit.

`Cal. Civ. Code §1798.135 · amendment SB-362 (2024)`

> A business that <del>collects</del> <ins>collects, sells, or shares</ins><sup>1</sup> consumers' personal information shall provide <del>two or more</del> <ins>at least one</ins><sup>2</sup> designated method for submitting requests to opt-out, <ins>including, at minimum, a clear and conspicuous link on the homepage titled "Your Privacy Choices,"</ins><sup>3</sup> for use by consumers.

- **Scope expansion.** Collapses sale and sharing into one duty.
- **Method floor.** One method is now sufficient; previously two were required.
- **Link mandate.** Pins a uniform link title across all businesses.
```

#### `three-col` — three-col

Old, new, and why side by side.

```markdown
<!-- _class: redline three-col -->

## three-col sets old, new, and why side by side.

`Cal. Civ. Code §1798.135 · amendment SB-362 (2024)`

> A business that collects consumers' personal information shall provide two or more designated methods for submitting requests to opt out of the sale of their personal information.

> A business that collects, sells, or shares consumers' personal information shall provide at least one designated method for submitting requests to opt-out, including a clear and conspicuous homepage link titled "Your Privacy Choices."

- **Scope.** Sale and sharing fold into one duty.
- **Method floor.** One method now suffices.
- **Link title.** Homepage label is mandatory and standardized.
```

#### `split` — split

Before and after in parallel.

```markdown
<!-- _class: redline split -->

## split shows before and after in parallel.

`Cal. Civ. Code §1798.135 · amendment SB-362 (2024)`

> A business that collects consumers' personal information shall provide two or more designated methods for submitting requests to opt out of the sale of their personal information.

> A business that collects, sells, or shares consumers' personal information shall provide at least one designated method for submitting requests to opt-out, including a clear and conspicuous homepage link titled "Your Privacy Choices."

- **Why this matters.** The left column is the prior text; the right is the amendment. Reading across makes the scope expansion obvious.
```

#### `stacked` — stacked

Prior text struck above the current.

```markdown
<!-- _class: redline stacked -->

## stacked strikes the prior text above the current.

`Cal. Civ. Code §1798.135 · amendment SB-362 (2024)`

> A business that collects consumers' personal information shall provide two or more designated methods for submitting requests to opt out of the sale of their personal information.

> A business that collects, sells, or shares consumers' personal information shall provide at least one designated method for submitting requests to opt-out, including a clear and conspicuous homepage link titled "Your Privacy Choices."

- **Why this matters.** Stacking keeps the reading order vertical when each passage is a full sentence or more.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `compare-code` — the diff is source code, not natural language
- [`compare-prose`](#compare-prose) — two narrative alternatives, not verbatim amendments
- `state-chart` — the change is structural state, not text
- `obligation-matrix` — comparing many regimes against shared obligations

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/comparison/redline>


## split-compare

> Two options + verdict — dark frame on the left, 2-column option grid + a recommendation card on the right.

**Function** comparison · **Form** split · **Substance** structure

**Tags** `tradeoff` · `recommendation` · `contrast`

Use when a decision frames a binary choice and the recommendation must be unambiguous. Second top-level list item is always the preferred option (gets the accent badge). The verdict blockquote becomes a recommendation card with a corner tag, pinned across the bottom.

### Agent contract

**Capacity** ~2 items (over 2 overflows) — past that, decision / compare-table. Exactly two by contract — the form IS a two-way choice, so there is no band to grow into. A split run paces ONE option per page and lands the verdict on its own closing page, carrying a derived “Option N of 2 · comparing …” signal.

**Density** aim ~14 words per item; past ~22 it reads as a wall of text — a terse point per line.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `frame` | `p:first-of-type > code` | no | Optional inline-code frame label above the heading (e.g. 'Decision Required'). |
| `heading` | `h2` | yes | Decision framing in the dark left panel. |
| `context` | `p` | yes | One-sentence context paragraph under the heading. |
| `options` | `ul > li` | yes | Exactly two top-level items. First is the alternative; second is the preferred option. |
| `verdict` | `blockquote` | yes | The recommendation — one short sentence in a blockquote. The card tag defaults to RECOMMENDATION; an insight-* modifier on the slide _class (e.g. insight-verdict) renames it via the shared --insight-label seam. See lib/base/base.docs.md § Renaming the eyebrow. |

#### Common mistakes

- **Trying to rename the "RECOMMENDATION" tag by editing the blockquote text.** The tag text comes from the `--insight-label` CSS variable, set by an `insight-*` modifier class on the slide (e.g. `insight-verdict`) — not from anything inside the blockquote; editing the blockquote only changes the recommendation sentence, not its tag.
- **Leaving the frame label unwrapped in backticks.** The frame label is reassembled to the top of the dark panel regardless of its source position — placement doesn't matter. It must be backtick-wrapped, though: unwrapped plain text is instead captured as the intro paragraph, not the frame label.

### When to use

- **Binary decision with a recommendation.** The slide must close the question with one chosen path. Use when the audience needs both the trade-off and the verdict on one slide, not on two.
- **Comparable facts per option.** Each side carries 2–4 short bullets — the same kind of fact across both. Lopsided facts break the visual symmetry.
- **Verdict in one sentence.** The trailing blockquote is the recommendation distilled to a single line. Anything longer belongs in spoken commentary, not the recommendation card.

### When NOT to use

- **Three or more options.** split-compare is strictly two — first card is the alternative, second card is the preferred. For three options, use `verdict-grid` or successive `decision` slides.
- **No verdict.** The blockquote is mandatory. Without it the slide collapses to a comparison without a call — use `compare-prose` for that case.
- **Preferred on the left.** Layout convention pins the preferred option to the second (right) card. Putting the recommendation first breaks the reading flow and the accent badge lands on the wrong card.

### Authoring

```markdown
<!-- _class: split-compare -->

`Decision Required`

## Headline that frames the choice.

One-sentence context paragraph explaining the stakes.

- Alternative option
  - First fact about the alternative
  - Second fact about the alternative
- Preferred option
  - First fact about the preferred path
  - Second fact about the preferred path

> The recommendation in one decisive sentence.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  ┌────────────┐  ┌──────────────────┐   │
│  │ OPTION     │  │ Choice A         │   │
│  │ A vs B     │  └──────────────────┘   │
│  │            │  ┌──────────────────┐   │
│  │ verdict    │  │ Choice B         │   │
│  └────────────┘  └──────────────────┘   │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`compare-prose`](#compare-prose) — the comparison is undecided — no verdict bar yet
- [`decision`](#decision) — the verdict slide that follows a separate comparison
- `split-panel` — the right side is findings, not paired options
- [`verdict-grid`](#verdict-grid) — three or more options scored against shared criteria

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/comparison/split-compare>


## verdict-grid

> Options scored against criteria as a verdict matrix.

**Function** comparison · **Form** grid · **Substance** structure

**Tags** `scorecard` · `ranking` · `prioritize` · `assessment`

Use to evaluate 2–4 options against the same set of criteria, with pass/partial/fail badges. Each card represents one option; badges per criterion.

### Agent contract

**Capacity** ~3 items (crowds past 4, overflows past 5) — past that, compare-table / split across slides. The cards crowd and badges lose legibility past four; a split run spotlights ONE option per page and carries a derived “Option N of M · comparing …” signal so the atomized tiers still read as a compared set (§0b connected members).

**Density** aim ~12 words per item; past ~18 it reads as a wall of text — a verdict card is a label plus its criteria, not prose.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the choice. |
| `options` | `ul > li` | yes | One outer li per option, lead with **Option name.**. Then one inner li per criterion, each led by a state marker ([x]/[-]/[ ]/[/]) followed by a badge label of AT MOST TWO WORDS. Criteria are shared across every option, in the same order. The last option renders as the focal verdict. |
| `rationale` | `ul > li > ul > li:last-child` | yes | REQUIRED. The final inner li of every option carries NO state marker — one short prose line giving the verdict for that option. This content line is what fills the card; omit it and the card renders empty below the badges. |

#### Common mistakes

- **Using `[ ]` (empty) to mean "not applicable" or a soft neutral, rather than an explicit fail.** In verdict-grid specifically (and pricing), `[ ]` reads as a hard fail/alarm state, not neutral — for a partial reading use `[-]`; for a muted, not-alarming 'not included' use `[/]`. This is verdict-grid's own scoring, not the shared state-marker vocabulary's default: the same `[ ]` reads as a neutral 'not yet' in checklist, obligation-matrix, and roadmap. Picking the wrong marker here changes the badge's color semantics, not just its shape.
- **Putting the recommended option first instead of last.** The focal-verdict treatment is applied to the LAST option card, not whichever one the author considers the pick — order the option you want to recommend so it's written last.

### When to use

- **Two to four options.** Each card is one option; the grid keeps two cards per row. Past four options the cards crowd and the criteria badges lose legibility.
- **Shared criteria across cards.** Every option is scored on the same set of criteria, in the same order. Drifting criteria between cards defeats the at-a-glance scan the layout exists for.
- **Two-word badges.** Each criterion is a state marker (`[x]` / `[-]` / `[ ]` / `[/]`, shared with `checklist` and `obligation-matrix`) plus a badge label of at most two words — `Residency`, `Self-serve`, `SOC 2`. The badge is chrome that must scan in a glance.
- **A rationale line is required.** Every option ends with one final inner bullet that carries NO marker — a short prose verdict for that option. It is the body that fills the card, and the last option renders as the focal, recommended verdict.

### When NOT to use

- **Exactly two options.** Two options with shared criteria belong in `compare-prose` or `split-compare`. verdict-grid earns its layout at 3+ options.
- **No rationale line.** Every option must end with a marker-less prose line — the verdict for that card. Omit it and the card renders empty below the badges, and the focal last card has nothing to recommend. The rationale is required, not optional.
- **Badge longer than two words.** The text after the marker is a badge, not a sentence — two words at most (`Residency`, `Self-serve`). A sentence on a badge line breaks the row scan; prose belongs only on the final rationale line.
- **Cards with different criteria.** When each option needs its own criteria list, the comparison fails — use `cards-stack` so each card has full prose breathing room instead.

### Authoring

```markdown
<!-- _class: verdict-grid -->

## Which option meets the criteria.

- **First option.**
  - [x] First badge
  - [-] Second badge
  - [ ] Third badge
  - One-line rationale giving the verdict for this option.
- **Second option.**
  - [x] First badge
  - [x] Second badge
  - [-] Third badge
  - One-line rationale giving the verdict for this option.
- **Third option.**
  - [x] First badge
  - [x] Second badge
  - [x] Third badge
  - One-line rationale; the last option is the focal verdict. Recommended.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Verdict grid heading.                  │
│                                         │
│  ┌──────────────┐     ┌──────────────┐  │
│  │ Option A [x] │     │ Option B [-] │  │
│  │ rationale    │     │ rationale    │  │
│  └──────────────┘     └──────────────┘  │
│  ┌──────────────┐     ┌──────────────┐  │
│  │ Option C [ ] │     │ Option D [x] │  │
│  └──────────────┘     └──────────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`compare-prose`](#compare-prose) — exactly two options with prose bodies
- [`split-compare`](#split-compare) — two options with a bottom verdict bar
- `obligation-matrix` — many regimes scored on shared obligations in a table
- [`compare-table`](#compare-table) — cells are textual values, not state markers
- `checklist` — one set of criteria, not many options against them

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/comparison/verdict-grid>


## cycle

> A closed loop of 3-6 stages that returns to its start — for a process with no beginning or end, where the last stage feeds the first.

**Function** progression · **Form** timeline · **Substance** structure

**Tags** `process` · `workflow` · `retrospective`

Use when the sequence is CIRCULAR: a natural cycle, a feedback loop, a recurring phase. A linear process with a real start and finish is list-steps; a cycle's whole point is the return.

### Agent contract

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, list-steps / split across slides. Under three there is no loop to read; past six the ring crowds; a split run paces ONE stage per page and closes with a derived “↻ back to {stage 1}” signal (§0b connected members).

**Density** aim ~12 words per item; past ~18 it reads as a wall of text — a stage is a name plus one clause, not a paragraph.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the cycle. |
| `eyebrow` | `p > code` | no | Optional label above the heading. |
| `stages` | `ul > li` | yes | Each list item is one stage in the loop. Top bullet = stage name (auto-bold); one nested bullet = a single clause of body. Read clockwise; the last stage returns to the first. |

#### Common mistakes

- **Authoring stages as a numbered list (`1.`) instead of a bullet list (`-`).** The stage-node styling and connector chevrons are scoped to `ul > li` (`section.cycle > .cell-stage > ul`) — an `ol` doesn't match the selector, so stages render as a plain, unstyled numbered list with no ring, no chevrons, no return arc.
- **Assuming the eyebrow follows the after-heading pattern used by `title`/`closing`.** cycle has no eyebrow-specific CSS — it inherits the shared before-heading rule (base.modifiers.css): the inline-code eyebrow paragraph must sit directly BEFORE the `## heading`, not after it, or the masthead lift re-seats it as the italic, secondary-color subtitle instead of the intended mono kicker.

### When to use

- **The sequence is circular.** When the last stage feeds the first and there is no true beginning — a natural cycle, a feedback loop, a recurring season. The return is the point; a layout with a start and end would misrepresent it.
- **Three to six stages.** Under three there is no loop to trace; past six the ring crowds and the return arc loses force. Merge adjacent stages or move to list-steps.
- **Each stage is a name plus a clause.** A stage carries a short name (auto-bold) and one clause of body. Richer per-stage descriptions belong in list-steps; a bare list of names belongs in list.

### When NOT to use

- **A linear process.** If the sequence has a real start and a real end, use list-steps — the numbered spine promises exactly that order. The cycle's closed loop mis-cues a one-way process as recurring.
- **More than six stages.** Past six the ring crowds and the descriptions shrink below legibility. Keep the six load-bearing stages here and push the detail to list-steps or a second slide.
- **Parallel options.** If the items are alternatives the audience weighs rather than stages that flow into each other, use cards-grid or verdict-grid. The arrows here read as causation, not choice.

### Authoring

```markdown
<!-- _class: cycle -->

## The heading names the loop.

- First stage
  - One clause saying what happens here.
- Second stage
  - One clause saying what happens here.
- Third stage
  - One clause saying what happens here.
- Fourth stage
  - One clause saying what happens here.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`list-steps`](#list-steps) — the process is linear — a real start and finish, not a loop
- `timeline-list` — events fixed to dates rather than a repeating cycle
- `diagram` — the loop has branches or feedback into non-adjacent stages

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/progression/cycle>


## list-criteria

> Numbered criteria list — each requirement is a row with rationale.

**Function** progression · **Form** ledger · **Substance** structure

**Tags** `requirements` · `assessment` · `okr`

Use to enumerate the criteria a decision must meet, in priority order. Numbering signals weight; each row reads as a complete requirement.

### Agent contract

**Capacity** ~4 items (over 5 overflows). Counts mirror the existing `density` block, which already measured this axis.

**Density** aim ~14 words per item; past ~22 it reads as a wall of text — one criterion with a short proof, not a spec.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the framework. |
| `criteria` | `ol > li` | yes | One li per criterion. The lead text is the criterion title — it renders bold automatically (no `**…**` needed); follow it with a nested `- rationale` bullet. |

#### Common mistakes

- **Manually bolding the criterion title with `**…**`.** The lead text of each `li` is auto-lifted to `<strong>` by the engine's slot-label-lift step, which already skips a lead that's already bolded — a manually bolded lead and a plain one produce byte-identical output. Wrapping it yourself is a harmless no-op, not a defect, but it's also unnecessary — write plain text and let the lift handle the weight.
- **Nesting the rationale as a numbered sub-list (`1.`) instead of a bullet (`-`).** The rationale styling only targets a nested `ul` — a numbered sub-list (`1.`) falls back to default list markup instead of the muted, unmarked rationale line.

### When to use

- **Criteria that must all be satisfied.** When the audience needs to read each requirement as a complete gate, not a suggestion. The numbered ledger format signals 'these are the rules' rather than 'here are some options'.
- **Order encodes priority.** The leading-zero counter (`01`, `02`, …) reads as rank. Put the load-bearing criterion first; the audience uses position as a weight.
- **Three to six rows.** Below three the ledger feels under-furnished; above six the row gap closes and the audience loses scannability. Group adjacent criteria or split into two slides.

### When NOT to use

- **Parallel options, not gates.** If the items are alternatives the audience is choosing between, use `cards-grid` or `verdict-grid`. list-criteria is for requirements all of which must hold.
- **Rationale longer than two lines.** Each row is a one-sentence rationale. If a criterion needs a paragraph, lift it to `list-steps` or `split-panel` where the body has room to breathe.
- **Missing criterion title.** The lead line on each li — rendered bold automatically — is what makes the ledger scannable. A naked sentence per row reads as paragraph soup; the title is the structure.

### Authoring

```markdown
<!-- _class: list-criteria -->

## What every decision must satisfy.

1. First criterion
   - Short rationale for why this matters.
2. Second criterion
   - Short rationale.
3. Third criterion
   - Short rationale.
4. Fourth criterion
   - Short rationale.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Criteria heading.                      │
│                                         │
│  01  First criterion — gloss            │
│  02  Second criterion — gloss           │
│  03  Third criterion — gloss            │
│  04  Fourth criterion — gloss           │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`list-steps`](#list-steps) — rows are procedural steps with longer body, not gating criteria
- `checklist` — rows carry done/in-flight/planned state markers
- [`verdict-grid`](#verdict-grid) — options scored against shared criteria
- `list` — declared statements — the `principles` variant
- `list-tabular` — rows carry structured metadata alongside the name and description

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/progression/list-criteria>


## list-steps

> Horizontal row of ordered step cards, each with a full description body (the `vertical` variant stacks them instead).

**Function** progression · **Form** timeline · **Substance** structure

**Tags** `process` · `walkthrough` · `planning`

Use for richer sequential processes where each step needs a paragraph rather than a label. More verbose than timeline; more structured than a plain ordered list.

### Agent contract

**Capacity** ~4 items (over 5 overflows) — past that, timeline-list / split across slides. Past five steps the row crowds and a split paces one step per page; a split run paces ONE step per page and carries a derived “→ next: …” signal (§0b connected members).

**Density** aim ~14 words per item; past ~22 it reads as a wall of text — one sentence per step, not a paragraph. The strip gives every card the tallest card's height, so one long step tightens the whole row, and a body that outgrows the card spills past its bottom edge and is clipped at the stage.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the process. |
| `steps` | `ol > li` | yes | Ordered list; each li gets a step number. Body can be one paragraph or a nested bullet list. |

#### Variant decision rule

- **`capsule`.** The tone is warmer and more editorial than an ops checklist — a personal or reflective process (a practice, a ritual, a habit). One class carries the whole look: centered masthead and cards, a pill badge per step in its own categorical hue, a serif title, no connector arrows, and no masthead hairline. Add `rule-full` if you want the hairline back.
- **`vertical`.** The frame is narrow or portrait, or the step bodies need more vertical room — stacks steps down the page instead of across a row.
- **`chevron`.** The story argues through cascading stages (problem → vision → approach → plan) — down-chevron tabs read as a persuasive cascade rather than a neutral sequence.
- **`converge`.** The process narrows toward one outcome — a qualitative funnel shape without literal conversion percentages (use `funnel` when you have numbers).
- **`ghost`.** The argument is the point and the process is secondary — a faint chevron watermark behind one hero description, editorial in tone.
- **`timeline`.** Steps are light labels with no body copy — dots on a spine, not full description cards.
- **`phase`.** The audience already thinks of the sequence as phases rather than steps — swaps the badge prefix word; `stage`/`milestone`/`rank`/`tier` swap it to match other vocabularies the same way.
- **`lettered`.** The audience reads order as letters (A, B, C) rather than numbers — swaps the counter format; combine with a prefix-word variant (e.g. `milestone lettered`).
- **`roman`.** The sequence reads as eras or acts rather than a numbered checklist — swaps the counter format to roman numerals; typically paired with `phase`.

#### Common mistakes

- **Authoring steps as a bullet list (`-`) instead of a numbered list (`1.`).** The card chrome — background, border, STEP badge, connector arrow — is scoped to `ol > li` specifically; a `ul` renders as plain unstyled text with no cards, no counter, no badge.
- **Deleting or reordering a step without checking other steps' prose for a stale reference to its old position (e.g. "as covered in step 3").** The STEP/PHASE/… badge is generated purely from a CSS `counter()` on the `ol` position — it renumbers automatically, but any prose that names a step by number does not.

### When to use

- **Steps need a sentence each.** When each step carries a label plus a sentence of description. Lighter rosters of steps with short labels use the `timeline` variant; richer descriptions belong on the default cards.
- **Three to five steps.** Two steps wastes the layout's ledger feel; six begins to crowd. Group adjacent steps or split the process at a natural phase break.
- **Prefix word names the unit.** The default `STEP` prefix can swap to `PHASE`, `STAGE`, `MILESTONE`, `RANK`, or `TIER`. Pick the noun that matches how the audience already thinks about the process.

### When NOT to use

- **Light labels, no body.** If each step is a single label with no description, use the `timeline` variant (dots on a spine). The default step cards earn their chrome only when the body adds substance.
- **Parallel options.** If the rows are alternatives the audience compares, use `cards-grid` or `verdict-grid`. The numbered prefix here reads as sequence — using it for parallel items mis-cues the audience.
- **Author-typed step numbers.** Don't write `**STEP 01**` into the markdown. The badge is CSS-generated from the `ol` counter; manual numbering double-stamps and breaks on reordering.

### Authoring

```markdown
<!-- _class: list-steps -->

## How to roll this out.

1. First step — a sentence describing what you do here.
2. Second step — a sentence describing what you do here.
3. Third step — a sentence describing what you do here.
4. Fourth step — a sentence describing what you do here.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Step-by-step heading (horizontal).     │
│                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  STEP 01      STEP 02      STEP 03      │
│  label        label        label        │
│  body         body         body         │
│  └─────────┘  └─────────┘  └─────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `vertical` — vertical

Steps stack down the page.

```markdown
<!-- _class: list-steps vertical compact -->

## vertical stacks the steps down the page.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

#### `chevron` — chevron

Down-chevron tabs cascade into keyed description cards.

```markdown
<!-- _class: list-steps chevron -->

## Make the case, one stage at a time.

1. Problem
   - Define the problem causing the pain.
2. Vision
   - Show the world once it is solved.
3. Approach
   - Detail the moves from here to there.
4. Plan
   - Commit to steps, owners, and a date.
```

#### `converge` — converge

Tapering bands narrow onto the final stage (a qualitative funnel).

```markdown
<!-- _class: list-steps converge -->

## Many concerns narrow onto one plan.

1. Problem
   - Define the problem causing the pain.
2. Approach
   - Detail the moves from here to there.
3. Plan
   - Commit to steps, owners, and a date.
```

#### `ghost` — ghost

Faint chevron watermark, eyebrow label, hero description — editorial.

```markdown
<!-- _class: list-steps ghost -->

## The argument, stated plainly.

1. Problem
   - Define the problem causing the pain.
2. Approach
   - Detail the moves from here to there.
3. Plan
   - Commit to steps, owners, and a date.
```

#### `timeline` — timeline

Steps string along a line.

```markdown
<!-- _class: list-steps timeline -->

## timeline strings the steps along a line.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

#### `phase` — phase

Each step blocks as an era.

```markdown
<!-- _class: list-steps phase -->

## phase blocks each step as an era.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

#### `milestone` — milestone

Steps mark as checkpoints.

```markdown
<!-- _class: list-steps milestone lettered -->

## milestone marks the steps as checkpoints.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

#### `lettered` — lettered

Letters count the steps.

```markdown
<!-- _class: list-steps lettered -->

## lettered counts the steps with letters.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

#### `stage` — Stage

Stage tags prefix each step.

```markdown
<!-- _class: list-steps stage -->

## stage prefixes each step with its stage tag.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

#### `rank` — Rank

Numbers read as standings.

```markdown
<!-- _class: list-steps rank -->

## rank reads the numbers as standings.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

#### `tier` — Tier

Steps render as service tiers.

```markdown
<!-- _class: list-steps tier roman -->

## tier renders the steps as service tiers.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

#### `roman` — Roman numerals

Numerals count the phases.

```markdown
<!-- _class: list-steps phase roman -->

## roman counts the phases in numerals.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

#### `capsule` — capsule

Centered, editorial: pill badges, serif titles, no connectors.

```markdown
<!-- _class: list-steps capsule -->

## Turn the framework into a habit.

1. Name it
   - Say the verb and the reach you operate at today.
2. Pick the next move
   - One deeper verb, or the same verb carried wider.
3. Keep the evidence
   - A doc, a metric, a postmortem — proof the shift happened.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`list-criteria`](#list-criteria) — gating requirements rather than a sequence of actions
- `split-panel` — phase label + heading on the left, steps on the right
- `roadmap` — phased grid across multiple workstreams
- `list` — tenets or values (the `principles` variant) rather than a sequence
- `funnel` — a value-driven funnel with conversion percentages, rather than the qualitative `converge` variant

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/progression/list-steps>


