# chart-family — conformance fixtures

The plugin harness (`test/unit/plugins/conformance.test.js`) runs every case below: the
` ```markdown ` fence is the input, rendered by the engine, and each bullet an assertion about the
render (`renders`, `omits`, `detect true|false`). The family has no syntax and no fence, so its
use probe never fires (`detect false`): a chart slide loads the family through the component
route instead — every member of the chart bucket fills the family's `kernel` slot, which is a
requirement by that act.

## a chart slide is dispatched to its member's kernel and framed

```markdown
<!-- _class: bar -->

## Revenue by region

- North `42`
- South `30`
```

- renders `chart-frame`
- renders `<div class="chart-body"><div class="bar-figure">`
- omits `data-lattice-off`
- detect false

## the first chart class on a section wins, in the generated dispatch order

```markdown
<!-- _class: radar quadrant -->

## Four capabilities, scored.

- Ours
  - People
    - Hiring `4`
    - Retention `3`
  - Process
    - Cadence `5`
    - Rigor `4`
```

- renders `radar-figure`
- omits `quadrant-figure`
- detect false

## a slide with no chart class passes through untouched

```markdown
## Not a chart

- North `42`
- South `30`
```

- omits `chart-frame`
- omits `data-lattice-off`
- detect false
