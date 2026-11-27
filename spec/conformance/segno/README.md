# Segno shared test cases

These cases say what a conformant reader of Segno notation returns for a span. They are written against
[`SEGNO-1.0.md`](../../SEGNO-1.0.md), not against Lattice's code, so a second implementation can run this
folder with its own adapter and compare. Lattice's adapter is `docs/src/lib/segno/conformance.test.ts`.

**License:** CC-BY-4.0, like the spec. **Owner:** @saden1.

## A case

All cases are in `cases.json`, one object each:

```json
{ "section": "4.5", "title": "An empty element holds its place", "input": "[, Reach]",
  "item": { "value": { "kind": "list", "items": [null, { "kind": "scalar", "text": "Reach" }] } } }
```

- `input` is the span: the text inside the backticks, or a record's text.
- `item` is the top item the reader must return (§4). An item has `value`, plus `name` when it was
  written `name=value` and `tag` when the span is tagged. A value is `{ "kind": "scalar", "text": … }`
  (with `"quoted": true` for quoted text), `{ "kind": "record", "items": [items] }`,
  `{ "kind": "list", "items": [values or null] }` or `{ "kind": "description", "text": … }`.
  Positions are not compared.
- `refuse` instead of `item`: the span must be refused, with that code (§5).
- `"ok": true` instead of `item`: the span must read; its tree is not compared.
