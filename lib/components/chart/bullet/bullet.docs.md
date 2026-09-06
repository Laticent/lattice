# bullet

> Actual against target inside a qualitative band — one dense row per KPI.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — One SVG because three of the four marks in a row share one scale: the target is a tick at a VALUE, the qualitative zones tile that same value axis, and the measure is read against both. HTML boxes can express one bar against an implicit 0-100 domain; they cannot put a threshold and a banded scale in the same coordinate system.

**Tags** `metric` · `okr` · `scorecard` · `assessment`

Use when the question is 'are we on plan'. Each row carries a measure bar, a perpendicular target marker, and up to four neutral range zones behind them, so a reader sees attainment, threshold and context in one glance. Six KPIs fit where six gauges would not.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the verdict ('Three of five are behind plan'), not the chart type. |
| `eyebrow` | `p > code` | no | Optional eyebrow caption above the heading. |
| `subtitle` | `p` | no | Optional plain subtitle after the heading. |
| `rows` | `ul > li` | yes | One li per KPI. Lead text is the KPI name, then two trailing inline-code pills — the measure first, the target second: - New ARR `4.2M` `5.0M`. Magnitude suffixes scale (`4.2M` is 4 200 000), the unit affix carries onto the axis, and both printed values are normalized to one magnitude per chart. A row with only one pill draws a bare bar with no marker and no range. |
| `range` | `li > ul` | no | Optional nested sublist, each child a NAME plus a value pill. `Target` (or `Plan`/`Goal`) overrides the second pill; `Actual` (or `Measure`) overrides the first; each `Band` (or `Range`) adds one internal cut point, so two Bands make three zones and three is the ceiling — past that the cuts NEAREST the target are the ones kept; `Floor` (or `Base`) starts the row's scale above zero, which is what a near-100% KPI — uptime, NRR, renewal rate — needs to show any movement at all. Every other nested bullet is mark detail: the Present-mode reveal payload and the PDF speaker note. That includes a bullet whose pill IS a number under an unrecognized name, so context never becomes a phantom band. Omit the sublist and the zones are derived from the target at 60% and 85%. |

### Variant decision rule

- **default (no modifier).** Always, unless you have looked at the rendered chart and disagree with the axis it chose. The kernel shares an axis when the rows agree on their affix and sit inside one magnitude, and gives each row its own otherwise.
- **`shared-axis`.** The rows are the same measure at different scales and the LENGTH comparison between bars is the point. Refused on a chart carrying a `Floor`, because a floored row and a zero-based row are not one ruler.
- **`own-axis`.** The rows share a unit but not a meaning — five percentages of five different things — and you want every plan tick on one vertical line.

### Common mistakes

- **Writing the target pill first, as `- New ARR `5.0M` `4.2M``.** Pills read measure first, target second — the order you would say it out loud ('4.2 against 5.0'). Reversing them is a silent break, not a tolerated variation: the bar draws at the target and the marker at the actual, so a missed number renders as a beat.
- **Adding a nested `- 60%` bullet expecting it to become a range boundary.** A nested value is structural only when it is named: `- Band `60%``, `- Target `80%``, `- Actual `72%``. Anything else — including a bare number — is mark detail, so the reveal payload and the speaker note stay usable for context.
- **Mixing `4.2M` and `$4.2M` across rows to mean the same thing.** The shared axis is adopted only when every row agrees on its affix, so one inconsistent `$` silently drops the whole chart onto per-row scales. Write the unit the same way in every row, or in none.
- **Expecting the printed values to come out exactly as they were typed.** They are normalized to one magnitude — per chart when the rows share an axis, per row when they do not — so `900k` beside `1.2M` prints as `0.9M` and `1.2M`, and a row scaled in hundreds of thousands prints `250k` even if you typed `0.25M`. That is deliberate: two magnitudes for one quantity make a reader re-scale between the measure and the target it is being compared with. Write the numbers however you like; read the chart for the shape.

### Data shape

- Two pills per row, measure then target, in one consistent unit across every row — the affix is what decides whether one axis can honestly describe them all.
- Keep the row domains within about 4x of each other if you want a shared axis; a 5.0M target beside a 0.2M target compresses the second row into a stub, and the chart falls back to per-row scales.
- Explicit `Band` boundaries are ascending INTERNAL cut points, not zone widths: two Bands make three zones, the ceiling is three cuts (four zones) and past it the cuts nearest the target are kept, and the last zone always runs to the top of the row's scale.
- A measure past the top of its range is drawn past it, on bare track — that overshoot is the read, so do not clamp values to their range.
- Every row must be higher-is-better. There is no inverted mode; restate a cost or a cycle time as the thing you want to grow.
- A `Floor` puts that row's scale above zero, so its bar LENGTH is no longer proportional to its value — the origin is drawn as a visible edge, and the whole chart drops to per-row scales because a floored row and a zero-based row are not the same ruler.
- Five rows is the sweet spot and seven the ceiling, measured on the landscape box: seven still hold a legible track and a full-width KPI name, and the eighth thins the track past where the measure reads against its zones. A KPI name gets one line beside its readout and ellipsizes rather than wrapping at about 56 characters. These are guidance numbers, not a split axis: like every chart in the family a bullet is a GRAPHIC, so it never paginates — an overflowing chart wants fewer rows.

## When to use

- **The target is the point.** A board asks 'are we on plan', not 'how big is it'. A bullet row answers both at once: the bar is the magnitude, the tick is the plan, and the gap between them is the story. Without a target you have a bar chart, and `bar` says that better.
- **Several KPIs, one scan.** Three to six KPIs of the same shape — quarterly plan attainment, SLO compliance, an OKR set. The rows stack, the marks align, and the reader sweeps a column of target ticks instead of reading six separate gauges.
- **Qualitative context matters as much as the number.** When 'behind plan' has grades — merely short versus genuinely off — the range zones carry that without a word of prose. Author them with nested `Band` bullets when the grades are real thresholds (an SLO, a rating scale); let them derive from the target when they are just 'short / close / there'. A KPI that lives near 100% — uptime, net revenue retention, renewal rate — adds a `Floor` so the scale starts where the movement is.

## When NOT to use

- **No target to measure against.** A row with one pill draws a bar with no marker and no range — every mark that makes it a bullet is gone. Use `bar` instead.
- **One KPI on its own.** A single row spends a whole slide on two numbers. Use `big-number`, or `stats` for a short row. This chart earns its density.
- **Red/amber/green range bands.** The zones are one neutral on purpose: a traffic-light range re-states the verdict the target marker already carries.
- **A KPI where lower is better.** Cost against budget, churn against a ceiling: the bar grows past the marker, so beating the target reads as missing it.

## Authoring

```markdown
<!-- _class: bullet -->

## Are we on plan.

- First KPI `4.2M` `5.0M`
- Second KPI `3.6M` `3.0M`
- Third KPI `1.1M` `2.4M`
```

## Variants (component-specific)

### `shared-axis` — shared-axis

Forces one value axis across every row, even where the kernel would have chosen per-row scales. Use only when the rows really are the same ruler and you want the bars comparable by length.

```markdown
<!-- _class: bullet shared-axis -->

## shared-axis puts every row on one ruler.

- New ARR `4.2M` `5.0M`
- Expansion ARR `3.6M` `3.0M`
- Gross renewal `2.8M` `2.6M`
```

### `own-axis` — own-axis

Forces per-row scales, so every target tick lands on one x and the bars are read against the plan line rather than against each other. Use when the rows are different measures that happen to share a unit.

```markdown
<!-- _class: bullet own-axis -->

## own-axis lines the plan up and lets each row keep its scale.

- Qualified pipeline `128%` `100%`
- Win rate `112%` `100%`
- Ramped reps `96%` `100%`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`progress`](../../chart/progress/progress.docs.md) — percent-complete with a status verdict and no target or range — HTML bars, so no marker and no band, but the row carries a status pill and a note the bullet has no room for
- [`bar`](../../chart/bar/bar.docs.md) — magnitudes compared against each other rather than against a plan
- [`big-number`](../../statement/big-number/big-number.docs.md) — one figure against its target is the entire slide
- [`stats`](../../evidence/stats/stats.docs.md) — a row of independent headline metrics with no shared scale
- [`gantt`](../../chart/gantt/gantt.docs.md) — the rows are time-bound work, not measures against a threshold

## Demo deck

See [bullet.gallery.light.pdf](./bullet.gallery.light.pdf) for rendered examples of every variant.
