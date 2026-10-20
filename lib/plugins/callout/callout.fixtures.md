# callout — conformance fixtures

The plugin harness (`test/unit/plugins/conformance.test.js`) runs every case below. Each `##`
heading is one case: the ` ```markdown ` fence is the input, rendered by the engine, and each
bullet is an assertion about that render:

- `renders` — the HTML contains the quoted text
- `omits` — the HTML does not contain it

## a heatmap draws an anchored label at the cell it names

```markdown
<!-- _class: heatmap -->

## Retention

| Cohort | M0  | M1 | M2 |
| ------ | --: | -: | -: |
| Jan    | 100 | 62 | 48 |
| Feb    | 100 | 58 | 31 |

`@callout{{Drop-off, tag, c4, row=Feb, col=M2}}`
```

- renders `class="legend legend--anchored"`
- renders `data-mark-for="5"`
- renders `class="legend-plate" data-c="c4" data-shape="square"`
- renders `legend-number`
- renders `>Drop-off</tspan>`
- omits `<code>@callout`

## with no style words, the marker is a circle and the words are bare

```markdown
<!-- _class: heatmap -->

## Retention

| Cohort | M0  | M1 |
| ------ | --: | -: |
| Jan    | 100 | 62 |

`@callout{{Peak, for=0}}`
```

- renders `legend-text legend-text--bare`
- renders `data-shape="circle"`
- renders `legend-knockout`
- omits `chart-leader`

## a seventh callout is not drawn, and the description says so

```markdown
<!-- _class: heatmap -->

## Retention

| Cohort | M0  | M1 | M2 |
| ------ | --: | -: | -: |
| Jan    | 100 | 62 | 48 |
| Feb    | 100 | 58 | 31 |

`@callout{[{A, for=0}, {B, for=1}, {C, for=2}, {D, for=3}, {E, for=4}, {F, for=5}, {G, for=0}]}`
```

- renders `data-shape="star"`
- renders `"G" (past the 6-callout limit)`
- omits `>G</tspan>`

## a label's detail reaches the speaker note

```markdown
<!-- _class: heatmap -->

## Retention

| Cohort | M0  | M1 |
| ------ | --: | -: |
| Jan    | 100 | 62 |

`@callout{{Dip, row=Jan, col=M1, detail="Pricing change"}}`
```

- renders `Dip: Pricing change`

## a label that names no cell is reported, not drawn

```markdown
<!-- _class: heatmap -->

## Retention

| Cohort | M0  | M1 |
| ------ | --: | -: |
| Jan    | 100 | 62 |

`@callout{{Lost, row=Mar, col=M9}}`
```

- renders `which names no cell`
- omits `legend--anchored`

## a heatmap with no legend is untouched

```markdown
<!-- _class: heatmap -->

## Retention

| Cohort | M0  | M1 |
| ------ | --: | -: |
| Jan    | 100 | 62 |
```

- omits `legend`

## the pre-split `legend: off` still hides a callout and keeps its detail

```markdown
---
legend: off
---

<!-- _class: heatmap -->

## Retention

| Cohort | M0  | M1 |
| ------ | --: | -: |
| Jan    | 100 | 62 |

`@callout{{Dip, row=Jan, col=M1, detail="Pricing change"}}`
```

- renders `callout-off`
- renders `Dip: Pricing change`
- omits `legend--anchored`
- omits `<code>@callout`

## callout: off hides a callout and keeps its detail

```markdown
---
callout: off
---

<!-- _class: heatmap -->

## Retention

| Cohort | M0  | M1 |
| ------ | --: | -: |
| Jan    | 100 | 62 |

`@callout{{Dip, row=Jan, col=M1, detail="Pricing change"}}`
```

- renders `callout-off`
- renders `Dip: Pricing change`
- omits `legend--anchored`
- omits `<code>@callout`

## the pre-split spelling, a `@legend` span that pins a cell, still draws a callout

```markdown
<!-- _class: heatmap -->

## Retention

| Cohort | M0  | M1 |
| ------ | --: | -: |
| Jan    | 100 | 62 |

`@legend{{Dip, row=Jan, col=M1}}`
```

- renders `class="legend legend--anchored"`
- renders `>Dip</tspan>`
- omits `<code>@legend`
