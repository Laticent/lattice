# avatars — conformance fixtures

The plugin harness (`test/unit/plugins/conformance.test.js`) runs every case below. Each `##`
heading is one case: the ` ```markdown ` fence is the input, rendered by the engine, and each
bullet is an assertion about that render:

- `renders` — the HTML contains the quoted text
- `omits` — the HTML does not contain it
- `detect true` / `detect false` — what `detect(source)` must answer

## an inline avatar draws

```markdown
Our sponsor `!{Ada Okafor}` clears blockers.
```

- renders `class="lat-avatar"`
- renders `role="img" aria-label="Ada Okafor"`
- renders `<svg class="lat-avatar-svg" viewBox="14 14 72 72" aria-hidden="true"`
- omits `<code>!{Ada`
- detect true

## written traits and tile words reach the render

```markdown
`!{Ada Okafor, hair=coily, skin=6, glasses=round, c3, lg, rounded, border=c4}`
```

- renders `data-size="lg"`
- renders `data-c="c3"`
- renders `data-shape="rounded"`
- renders `data-border="c4"`
- renders `skin=6 hair=coily`
- renders `glasses=round`
- detect true

## a value a trait does not take stays literal

```markdown
Use `!{Ada, skin=9}` here.
```

- renders `<code>!{Ada, skin=9}</code>`
- omits `lat-avatar`
- detect true

## the escape keeps the literal

```markdown
Write `\!{Ada Okafor}` to show the notation.
```

- renders `>!{Ada Okafor}</code>`
- omits `lat-avatar`

## ordinary code that starts with a bang stays code

```markdown
Mark it `!important` and keep `![bg](photo.svg)` as written.
```

- renders `<code>!important</code>`
- omits `lat-avatar`
- detect false

## a deck with no avatar does not load the plugin's data

```markdown
A slide with `^{database}` and `~{1 2 3}` but no faces.
```

- omits `lat-avatar`
- detect false
