# How to write a Lattice deck

You write slide decks as one Markdown file. Copy the shapes below exactly.

## The file

Start every file with these five lines, then the slides:

```
---
marp: true
theme: cuoio
paginate: true
---
```

Separate every slide with a line containing only `---`.
Start every slide with one `<!-- _class: NAME -->` line.
Pick every NAME from the 20 below. Use only those names.

## Shape of a deck

Slide 1 is `title`. The last slide is `closing`. Between them, 5 to 15 slides.
Give each slide one idea. Keep each slide under 70 words and 6 bullets.

## The 20 layouts

Pick by what the slide does. Copy the shape under the name you picked.

| Use | When the slide is |
|---|---|
| `title` | the first slide |
| `closing` | the last slide |
| `divider` | a section break |
| `content` | a claim plus a short paragraph |
| `list` | 3-5 short bullets |
| `cards-grid` | 2-4 named items with one line each |
| `stats` | 2-4 numbers side by side |
| `kpi` | 3 metrics with targets and status |
| `big-number` | one number that is the whole point |
| `quote` | someone's words |
| `list-steps` | numbered steps in order |
| `list-criteria` | numbered requirements to meet |
| `list-tabular` | a name plus a value, per row |
| `timeline-list` | dated milestones in order |
| `checklist` | done / partly done / not started |
| `compare-table` | 2-3 options scored on the same criteria |
| `decision` | the option chosen and the ones rejected |
| `matrix-2x2` | items sorted into four quadrants |
| `split-panel` | one claim plus the points that back it |
| `agenda` | what the deck covers |

**If nothing above fits, use `content` for prose or `list` for bullets.**
Never invent a layout name.

### title

```
<!-- _class: title -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

# Deck title goes here

`Category · Date or audience`

One-line subtitle that frames the deck.
```

### closing

```
<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

## Closing takeaway or call to action

`Optional eyebrow`
```

### divider

```
<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Section 01`

## Section name
```

### content

```
<!-- _class: content -->

## Slide heading.

The explanatory paragraph that develops the heading goes here. Keep the slide under forty words.

- Optional supporting point one.
- Optional supporting point two.
```

### list

```
<!-- _class: list -->

## Slide heading.

- First short bullet point.
- Second short bullet point.
- Third short bullet point.
- Fourth short bullet point.
- Fifth short bullet point.
```

### cards-grid

```
<!-- _class: cards-grid -->

## Slide heading.

- First card title
  - Body text for the first card, one sentence.
- Second card title
  - Body text for the second card, one sentence.
- Third card title
  - Body text for the third card, one sentence.
- Fourth card title
  - Body text for the fourth card, one sentence.
```

### stats

```
<!-- _class: stats -->

`Impact · Pilot Results`

## Six months of results across four product teams.

`Measured against pre-framework baseline, same teams, same market conditions.`

1. 73%
   - faster close
2. 4.2×
   - signal recall
3. $1.2M
   - prevented losses
4. −18d
   - avg cycle time
```

### kpi

```
<!-- _class: kpi -->

## Revenue ahead of plan; margin and cash both expanded.

1. $2.4B
   - Total revenue
   - target $2.2B · +9% `On plan` `Board`
2. 42%
   - Gross margin
   - +2pp QoQ `On plan` `Audit`
3. $1.1B
   - Cash & equivalents
   - +$180M QoQ `On plan` `Investor`
```

### big-number

```
<!-- _class: big-number -->

`Optional eyebrow`

- 92%
  - of the audience remembers a single number from a deck.
```

### quote

```
<!-- _class: quote -->

> The quoted sentence sits here, kept short enough to read in one breath.

— Person, Role
```

### list-steps

```
<!-- _class: list-steps -->

## How to roll this out.

1. First step — a sentence describing what you do here.
2. Second step — a sentence describing what you do here.
3. Third step — a sentence describing what you do here.
4. Fourth step — a sentence describing what you do here.
```

### list-criteria

```
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

### list-tabular

```
<!-- _class: list-tabular -->

## Slide heading.

1. First entry
   - Description or value for the first entry.
2. Second entry
   - Description or value for the second entry.
3. Third entry
   - Description or value for the third entry.
4. Fourth entry
   - Description or value for the fourth entry.
```

### timeline-list

```
<!-- _class: timeline-list -->

`Eyebrow · context`

## How it unfolded.

1. `2024 Q3` First milestone
   - One-sentence description of what shipped.
2. `2025 Q1` Second milestone `decision`
   - One-sentence description.
3. `2025 Q3` Third milestone `live`
   - One-sentence description.
```

### checklist

```
<!-- _class: checklist -->

## Pre-launch readiness.

- [x] First item that is fully done.
- [x] Second item that is fully done.
- [-] Third item that is partially complete with a caveat.
- [ ] Fourth item that is not yet started.
```

### compare-table

```
<!-- _class: compare-table -->

## Heading framing the comparison.

| Criterion | Option A | Option B | Option C |
| --- | --- | --- | --- |
| First criterion | Value | Value | Value |
| Second criterion | Value | Value | Value |
| Third criterion | Value | Value | Value |
```

### decision

```
<!-- _class: decision -->

## What we are doing.

- Chosen path
  - One-line rationale for the decision.
- Rejected option
  - One-line rationale for why this didn't fit.
```

### matrix-2x2

```
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

### split-panel

```
<!-- _class: split-panel -->

`Eyebrow context`

## Headline that anchors the panel.

One-sentence framing paragraph explaining what the points cover.

- First point
  - Supporting detail explaining the first point.
- Second point
  - Supporting detail explaining the second point.
- Third point
  - Supporting detail explaining the third point.
```

### agenda

```
<!-- _class: agenda -->

## What this deck covers.

1. First section title
2. Second section title
3. Third section title
4. Fourth section title
```

## A whole deck, start to finish

Four slides. Note the blank lines around each `---`.

```markdown
---
marp: true
theme: cuoio
paginate: true
---

<!-- _class: title silent -->

# Move billing to the new platform in March

`Finance Systems · Board review`

One migration window replaces four years of manual reconciliation.

---

<!-- _class: big-number -->

`Cost of the status quo`

- $4.1M
  - spent every year reconciling invoices by hand, up from $2.6M in 2023.

---

<!-- _class: cards-grid -->

## Three failures repeat every quarter.

- Late close
  - Books close nine days after month end, against a four-day target.
- Manual matching
  - Sixty percent of invoices need a person to match them.
- No audit trail
  - Adjustments are recorded in spreadsheets outside the ledger.

---

<!-- _class: closing silent -->

## Approve the March window and the $1.4M migration budget.

`The ask`
```

**The skeletons are shapes to fill, not text to copy.** Replace every placeholder
with real content. Never ship the example words.

On the `title` and `closing` slides, `<!-- _class: title silent -->` is a shorter way
to write the three `_paginate` / `_header` / `_footer` lines. Either form works; pick one
and keep it.

## The rules

1. Every slide starts with `<!-- _class: NAME -->` and NAME is a real layout.
2. Slides are separated by a line containing only `---`, with a blank line each side.
3. Card layouts nest: `- Title` on one line, then `  - body` indented two spaces. Never `- **Title.** body`.
4. Under a numbered `1.` row, indent the nested line **three** spaces, not two.
5. A ledger or split row always has a body under its title — never a bare title.
6. A statement layout's `1.` rows carry no `**bold**` lead-in.
7. Every `<!-- -->` comment is closed.
8. The title slide is `# H1`, then a backtick `eyebrow` line, then a plain subtitle — in that order.
9. Colors and emphasis come from the layouts and modifiers. Never write a hex code.
10. Write every `##` heading as a full sentence that states the point — "Revenue grew 18%, led by APAC", never "Q2 Results".
11. End with a `closing` slide that names ONE thing you want the room to do.

## Check before you finish

- Slide 1 uses `title`; the last slide uses `closing`.
- Every slide starts with `<!-- _class: NAME -->` and NAME is one of the list.
- Every card title has its body on the next line, indented.
- Every `##` heading is a sentence that states a point.
