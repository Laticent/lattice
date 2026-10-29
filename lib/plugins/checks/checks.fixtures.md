# checks — conformance fixtures

The plugin harness (`test/unit/plugins/conformance.test.js`) runs every case below. Each `##`
heading is one case: the ` ```markdown ` fence is the input, rendered by the engine, and each
bullet is an assertion about that render:

- `renders` — the HTML contains the quoted text
- `omits` — the HTML does not contain it
- `detect true` / `detect false` — what `detect(source)` must answer

## a shortcut in running text draws the disc

```markdown
SOC 2 evidence `[!]` rejected.
```

- renders `<span class="state fail state-empty lat-state" role="img" aria-label="no"></span>`
- omits `<code>[!]</code>`
- detect true

## the full form draws the same disc

```markdown
SOC 2 evidence `@check{fail}` rejected.
```

- renders `<span class="state fail state-empty lat-state" role="img" aria-label="no"></span>`
- omits `<code>@check`
- detect true

## a spoken word is the same answer

```markdown
Audit `@check{partly}` done.
```

- renders `class="state warn state-half lat-state"`
- omits `<code>@check`
- detect true

## a label puts the check in a pill

```markdown
Status `@check{yes, label=Residency}` today.
```

- renders `<span class="lat-pill" data-shape="pill"><span class="lat-pill-lead"><span class="state pass state-full lat-state" role="img" aria-label="yes"></span></span>Residency</span>`
- detect true

## a quoted label keeps its comma

```markdown
`@check{no, label="Audit, EU"}`
```

- renders `</span></span>Audit, EU</span>`
- renders `class="state fail state-empty lat-state"`
- detect true

## a size is the pill's size

```markdown
Status `@check{yes, label=Residency, lg}` and `@check{no, sm}` today.
```

- renders `<span class="lat-pill" data-shape="pill" data-size="lg"><span class="lat-pill-lead">`
- renders `<span data-size="sm" class="state fail state-empty lat-state"`
- detect true

## a size the pill does not have stays code

```markdown
`@check{yes, xl}`
```

- renders `<code>@check{yes, xl}</code>`
- detect true

## an answer that is not one of the six stays code

```markdown
`@check{maybe}`
```

- renders `<code>@check{maybe}</code>`
- omits `lat-state`
- detect true

## a bare record is a pill, not a check

```markdown
`{pass}`
```

- renders `<span class="lat-pill" data-shape="pill">pass</span>`
- omits `lat-state`

## a verdict-grid criterion is a check in a pill

```markdown
<!-- _class: verdict-grid -->

## Paths

- Path A
  - [x] Speed
  - [/] Adoption
  - Body text.
```

- renders `<span class="lat-pill" data-shape="pill"><span class="lat-pill-lead"><span class="state pass state-full lat-state" role="img" aria-label="yes"></span></span>Speed</span>`
- renders `class="state skip state-slashed lat-state"`
- omits `class="badge`
- detect true

## a pricing feature is a check in a row

```markdown
<!-- _class: pricing -->

## Plans

- Starter `$0`
  - [x] Workspace
  - For one team.
```

- renders `<span class="state pass state-full lat-state" role="img" aria-label="yes"></span>Workspace`
- omits `class="badge`
- detect true

## something that only looks like a check stays code

```markdown
Select `[data-mark]` and index `[0]`.
```

- renders `<code>[data-mark]</code>`
- renders `<code>[0]</code>`
- omits `lat-state`
- detect true

(`detect` is a superset: any bracket around one character might be a check, so `[0]` probes true and stays code.)

## a deck with no bracket and no check is not probed

```markdown
Plain prose with `code` and a {brace}.
```

- omits `lat-state`
- detect false
