# legend — conformance fixtures

The plugin harness (`test/unit/plugins/conformance.test.js`) runs every case below. Each `##`
heading is one case: the ` ```markdown ` fence is the input, rendered by the engine, and each
bullet is an assertion about that render:

- `renders` — the HTML contains the quoted text
- `omits` — the HTML does not contain it

The key's authoring lands one adopter at a time (engineering/decisions/2026-10-20-callout-placement.md
§ 6). Until a component reads `@legend{…}` as its key, the case below pins what happens today: the
heatmap does not draw it and says so.

## a heatmap reports a key legend it does not draw

```markdown
<!-- _class: heatmap -->

## Retention

| Cohort | M0  | M1 |
| ------ | --: | -: |
| Jan    | 100 | 62 |

`@legend{[{Poor, c1}, {Good, c3}], key}`
```

- renders `"Poor" (a key legend, which a heatmap does not draw yet)`
- omits `legend--anchored`
- omits `<code>@legend`
