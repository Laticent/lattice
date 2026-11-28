# How to write a Lattice deck

You write slide decks as one Markdown file. Copy the shapes below exactly.

## The file

Start every file with these lines, then the slides:

```
---
theme: indaco
pagination: true
---
```

Separate every slide with a line containing only `---`.
Start every slide with one `<!-- @meta{layout=NAME} -->` line.
Pick every NAME from the 19 below. Use only those names.

## Shape of a deck

Slide 1 is `title`. The last slide is `closing`. Between them, 5 to 15 slides.
Give each slide one idea. Keep each slide under 70 words and 6 bullets.

## The 19 layouts

Pick by what the slide does. Copy the shape under the name you picked.

| Use | When the slide is |
|---|---|
| `title` | the first slide |
| `closing` | the last slide |
| `divider` | a section break |
| `content` | a claim plus a short paragraph |
| `list` | 3-5 short bullets (`takeaway` over a `1.` list for numbered requirements, each with a reason) |
| `cards-grid` | 2-4 named items with one line each |
| `stats` | 2-4 numbers side by side |
| `kpi` | 3 metrics with targets and status |
| `big-number` | one number that is the whole point |
| `quote` | someone's words |
| `list-steps` | numbered steps in order |
| `list-tabular` | a name plus a value, per row |
| `timeline-list` | dated milestones in order |
| `checklist` | done / partly done / not started |
| `table` | 2-3 options scored on the same criteria |
| `decision` | the option chosen and the ones rejected |
| `matrix-2x2` | items sorted into four quadrants |
| `split-panel` | one claim plus the points that back it |
| `agenda` | what the deck covers |

**If nothing above fits, use `content` for prose or `list` for bullets.**
Never invent a layout name.

### title

```
<!-- @meta{layout=title} -->

# Deck title goes here

`Category · Date or audience`

One-line subtitle that frames the deck.
```

### closing

```
<!-- @meta{layout=closing} -->

## Closing takeaway or call to action

`Optional eyebrow`
```

### divider

```
<!-- @meta{layout=divider} -->

`Section 01`

## Section name
```

### content

```
<!-- @meta{layout=content} -->

## Slide heading.

The explanatory paragraph that develops the heading goes here. Keep the slide under forty words.

- Optional supporting point one.
- Optional supporting point two.
```

### list

```
<!-- @meta{layout=list} -->

## Slide heading.

- First short bullet point.
- Second short bullet point.
- Third short bullet point.
- Fourth short bullet point.
- Fifth short bullet point.
```

### cards-grid

```
<!-- @meta{layout=cards-grid} -->

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
<!-- @meta{layout=stats} -->

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
<!-- @meta{layout=kpi} -->

## Revenue ahead of plan; margin and cash both expanded.

1. $2.4B
   - Total revenue
   - target $2.2B · +9% `{On plan}`
2. 42%
   - Gross margin
   - +2pp QoQ `{On plan}`
3. $1.1B
   - Cash & equivalents
   - +$180M QoQ `{On plan}`
```

### big-number

```
<!-- @meta{layout=big-number} -->

`Optional eyebrow`

- 92%
  - of the audience remembers a single number from a deck.
```

### quote

```
<!-- @meta{layout=quote} -->

> The quoted sentence sits here, kept short enough to read in one breath.

— Person, Role
```

### list-steps

```
<!-- @meta{layout=list-steps} -->

## How to roll this out.

1. First step
   - One sentence on what happens in this step.
2. Second step
   - One sentence on what happens in this step.
3. Third step
   - One sentence on what happens in this step.
4. Fourth step
   - One sentence on what happens in this step.
```

### list-tabular

```
<!-- @meta{layout=list-tabular} -->

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
<!-- @meta{layout=timeline-list} -->

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
<!-- @meta{layout=checklist} -->

## Pre-launch readiness.

- [x] First item that is fully done.
- [x] Second item that is fully done.
- [-] Third item that is partially complete with a caveat.
- [!] Fourth item that was checked and failed.
- [?] Fifth item nobody can settle yet.
- [ ] Sixth item that is not yet started.
```

### table

```
<!-- @meta{layout=table} -->

## Heading framing the comparison.

| Criterion | Option A | Option B | Option C |
| --- | --- | --- | --- |
| First criterion | Value | Value | Value |
| Second criterion | Value | Value | Value |
| Third criterion | Value | Value | Value |
```

### decision

```
<!-- @meta{layout=decision} -->

## What we are doing.

- Chosen path
  - One-line rationale for the decision.
- Rejected option
  - One-line rationale for why this didn't fit.
```

### matrix-2x2

```
<!-- @meta{layout=matrix-2x2} -->

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
<!-- @meta{layout=split-panel} -->

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
<!-- @meta{layout=agenda} -->

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
theme: indaco
pagination: true
---

<!-- @meta{layout=title, class=silent} -->

# Move billing to the new platform in March

`Finance Systems · Board review`

One migration window replaces four years of manual reconciliation.

---

<!-- @meta{layout=big-number} -->

`Cost of the status quo`

- $4.1M
  - spent every year reconciling invoices by hand, up from $2.6M in 2023.

---

<!-- @meta{layout=cards-grid} -->

## Three failures repeat every quarter.

- Late close
  - Books close nine days after month end, against a four-day target.
- Manual matching
  - Sixty percent of invoices need a person to match them.
- No audit trail
  - Adjustments are recorded in spreadsheets outside the ledger.

---

<!-- @meta{layout=closing, class=silent} -->

## Approve the March window and the $1.4M migration budget.

`The ask`
```

**The skeletons are shapes to fill, not text to copy.** Replace every placeholder
with real content. Never ship the example words.

On the `title` and `closing` slides, `class=silent` in the record is a shorter way to
write `header=""`, `footer=""` and `no-pagination`. Either form works; pick one and keep it.

## The rules

1. Every slide starts with `<!-- @meta{layout=NAME} -->` and NAME is a real layout.
2. Slides are separated by a line containing only `---`, with a blank line each side.
3. Rows on `cards-grid`, `matrix-2x2`, `decision`, `kpi`, `list-steps`, `list-tabular`, `stats`, `timeline-list` nest the body under the title, never `- **Title.** body`; `agenda` rows are one plain line.
4. Under a numbered `1.` row, indent the nested line **three** spaces, not two.
5. A row on `split-panel`, `kpi`, `stats` always has a body under its title — never a bare title.
6. Every `<!-- -->` comment is closed.
7. The title slide is `# H1`, then a backtick `eyebrow` line, then a plain subtitle — in that order.
8. Colors and emphasis come from the layouts and modifiers. Never write a hex code.
9. Write every `##` heading as a full sentence that states the point — "Revenue grew 18%, led by APAC", never "Q2 Results".
10. End with a `closing` slide that names ONE thing you want the room to do.

## Check before you finish

- Slide 1 uses `title`; the last slide uses `closing`.
- Every slide starts with `<!-- @meta{layout=NAME} -->` and NAME is one of the list.
- Every card title has its body on the next line, indented.
- Every `##` heading is a sentence that states a point.
