# pills — conformance fixtures

The plugin harness (`test/unit/plugins/conformance.test.js`) runs every case below. Each `##`
heading is one case: the ` ```markdown ` fence is the input, rendered by the engine, and each
bullet is an assertion about that render:

- `renders` — the HTML contains the quoted text
- `omits` — the HTML does not contain it
- `detect true` / `detect false` — what `detect(source)` must answer

## a bare label draws a capsule

```markdown
Status `{LIVE}` today.
```

- renders `<span class="lat-pill" data-shape="pill">LIVE</span>`
- omits `<code>{LIVE}</code>`
- detect true

## shape and color words reach the render

```markdown
Build `{BETA, tag, c4}` is out.
```

- renders `data-shape="tag"`
- renders `data-c="c4"`
- omits `<code>{BETA`
- detect true

## word order is free

```markdown
`{BETA, c4, tag}`
```

- renders `data-shape="tag" data-c="c4"`
- detect true

## a backslash keeps the literal

```markdown
Write `\{LIVE}` to show the braces.
```

- renders `data-lat-escaped="">{LIVE}</code>`
- omits `lat-pill`
- detect true

## a JavaScript object literal stays code

```markdown
Pass `{ ok, scene }` to the helper.
```

- renders `<code>{ ok, scene }</code>`
- omits `lat-pill`
- detect true

## an unknown word fails back to literal

```markdown
`{X, c13}`
```

- renders `<code>{X, c13}</code>`
- omits `lat-pill`
- detect true

## a deck with no braces has no pills

```markdown
Plain text and `getUserId()`.
```

- omits `lat-pill`
- detect false
