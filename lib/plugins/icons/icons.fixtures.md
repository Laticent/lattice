# icons — conformance fixtures

The plugin harness (`test/unit/plugins/conformance.test.js`) runs every case below. Each `##`
heading is one case: the ` ```markdown ` fence is the input, rendered by the engine, and each
bullet is an assertion about that render:

- `renders` — the HTML contains the quoted text
- `omits` — the HTML does not contain it
- `detect true` / `detect false` — what `detect(source)` must answer

## an inline icon draws

```markdown
Raw files land in `^{bucket, c4}` S3.
```

- renders `class="lat-icon" data-icon="bucket"`
- renders `data-c="c4"`
- renders `<svg class="lat-icon-svg" viewBox="0 0 24 24" aria-hidden="true"`
- omits `<code>^{bucket`
- detect true

## an alias draws the canonical icon

```markdown
The `^{db, lg, bare}` primary.
```

- renders `data-icon="database"`
- renders `data-size="lg"`
- renders `data-frame="bare"`
- detect true

## a pill leads with its icon

```markdown
- `{S3, icon=bucket, c4}` raw uploads
```

- renders `class="lat-pill"`
- renders `<svg class="lat-pill-icon"`
- renders `</svg>S3</span>`
- detect true

## a vendor name stays literal

```markdown
Use `^{s3}` here.
```

- renders `<code>^{s3}</code>`
- omits `lat-icon`
- detect true

## the escape keeps the literal

```markdown
Write `\^{database}` to show the notation.
```

- renders `>^{database}</code>`
- omits `class="lat-icon"`
- detect true

## a deck with no icon is untouched

```markdown
Regex anchors like `^foo` and `^{` alone are code.
```

- omits `lat-icon`
- detect true

## TeX accents and superscripts are not icons

```markdown
An accent `\^{o}` and a power `^{2}` stay as written.
```

- renders `<code>\^{o}</code>`
- renders `<code>^{2}</code>`
- omits `lat-icon`
- detect true

## an icon-only pill takes its option words as options

```markdown
- `{icon=gateway, c2}`
```

- renders `data-c="c2" role="img" aria-label="gateway"`
- omits `</svg>c2`
- detect true
