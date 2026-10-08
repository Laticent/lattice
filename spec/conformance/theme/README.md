# Theme contract shared test cases

These cases say what a conformant reader concludes about a theme file or a theme manifest. They are
written against [`spec/THEME-1.0.md`](../../THEME-1.0.md), not against Lattice's code.

**License:** CC-BY-4.0, like the spec. **Owner:** @saden1.

## A theme file case

`<name>.css` is the theme, and `<name>.json` is what the checks must report:

```json
{
  "title": "One sentence: what the case shows",
  "spec": "THEME-1.0",
  "section": "4.1",
  "knownThemes": ["lattice"],
  "expect": { "ok": false, "blocked": false, "errors": ["token-missing"], "missing": ["accent"] }
}
```

| Field | Meaning |
|---|---|
| `knownThemes` | The theme names the reader holds, for §6's import rule. Absent means `["lattice"]` alone. |
| `expect.ok` | No error-level finding. |
| `expect.blocked` | A finding on the safety rung (§6), so the reader shows no part of the theme. |
| `expect.errors` | The distinct rule IDs of the error findings, sorted. These are the reference implementation's IDs; a reader that names its findings differently skips this field (spec §7). |
| `expect.warnings` | The distinct rule IDs of the warning findings, sorted, as `errors`. Absent means not checked. |
| `expect.missing` | The tokens reported missing (without `--`), sorted. Absent means not checked. |
| `expect.composes` | The theme imports another theme rather than only the engine (§4.1). |

## A manifest case

`<name>.manifest-case.json` holds a `manifest` and `expect.valid`: whether it validates against
[`themes/theme.schema.json`](../../../themes/theme.schema.json).

## Running them

`node tools/theme-conformance.js` runs every case against the reference implementation
(`gateThemeCss` in `lib/theme/gate.js`, and the schema). The unit tier runs the same cases in
`test/unit/spec/theme-conformance.test.js`, with a failing arm, and holds the token table in
§4.1 to the code.
