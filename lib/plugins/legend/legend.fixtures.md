# legend — conformance fixtures

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

`@legend{{Drop-off, tag, c4, for="Feb · M2"}}`
```

- renders `class="legend legend--anchored"`
- renders `data-mark-for="5"`
- renders `legend-plate legend-plate--tag`
- renders `>Drop-off</tspan>`
- omits `<code>@legend`

## a bare label is the default

```markdown
<!-- _class: heatmap -->

## Retention

| Cohort | M0  | M1 |
| ------ | --: | -: |
| Jan    | 100 | 62 |

`@legend{{Peak, for=0}}`
```

- renders `legend-text legend-text--bare`
- omits `legend-plate`

## a label's detail reaches the speaker note

```markdown
<!-- _class: heatmap -->

## Retention

| Cohort | M0  | M1 |
| ------ | --: | -: |
| Jan    | 100 | 62 |

`@legend{{Dip, for="Jan · M1", detail="Pricing change"}}`
```

- renders `Dip: Pricing change`

## a label that names no cell is reported, not drawn

```markdown
<!-- _class: heatmap -->

## Retention

| Cohort | M0  | M1 |
| ------ | --: | -: |
| Jan    | 100 | 62 |

`@legend{{Lost, for="Mar · M9"}}`
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
