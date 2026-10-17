# sparks — conformance fixtures

The plugin harness (`test/unit/plugins/conformance.test.js`) runs every case below. Each `##`
heading is one case: the ` ```markdown ` fence is the input, rendered by the engine, and each
bullet is an assertion about that render:

- `renders` — the HTML contains the quoted text
- `omits` — the HTML does not contain it
- `detect true` / `detect false` — what `detect(source)` must answer

## a series draws a bar spark

```markdown
Signups `~{12 14 17, bar, c3, lg}` this quarter.
```

- renders `<span class="lat-spark" data-type="bar" data-size="lg" role="img"`
- renders `aria-label="Trend, 3 points, from 12 to 17, low 12, high 17"`
- renders `data-c="c3"`
- omits `<code>~{12`
- detect true

## a percentage draws a ring

```markdown
Coverage `~{72%}` of the fleet.
```

- renders `data-type="ring"`
- renders `aria-label="72%"`
- detect true

## a ratio draws a bullet against its target

```markdown
Bookings `~{72/80, bullet}` against plan.
```

- renders `data-type="bullet"`
- renders `aria-label="72 against a target of 80"`
- detect true

## the named form is the same spark

```markdown
Signups `@spark{12 14 17, bar}` this quarter.
```

- renders `data-type="bar"`
- renders `data-src="@spark{12 14 17, bar}"`
- detect true

## a broken spark stays literal

```markdown
Revenue `~{3 5 4, c13}` and `~{1,200 1,450}`.
```

- renders `<code>~{3 5 4, c13}</code>`
- renders `<code>~{1,200 1,450}</code>`
- omits `class="lat-spark"`
- detect true

## a backslash keeps the literal

```markdown
Write `\~{1,200}` to show the notation.
```

- renders `<code data-lat-escaped="">~{1,200}</code>`
- omits `class="lat-spark"`
- detect true

## a deck with no spark does not use the plugin

```markdown
Plain `code` and a `{LIVE}` pill.
```

- omits `class="lat-spark"`
- detect false
