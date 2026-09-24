---
title: Cheat sheet
description: Every state mark, pill, status word and label set on one page — the syntax, where it works, and a link to the page that explains it.
---

The syntax on one page. Each section links to the page that explains it.

## State marks — [the six answers](/guides/status/answers/)

| Marker | Answer | Drawn as |
|---|---|---|
| `[x]` | Yes | Check, solid green |
| `[-]` | Partly | Dash, solid amber |
| `[!]` | No | Cross, solid red |
| `[?]` | Unknown — looked, cannot settle | `?` in a hollow ring |
| `[ ]` | Open — not looked yet | Empty hollow ring |
| `[/]` | Does not apply | Slash, solid gray, label struck |

```markdown
- [!] Load test failed at peak            ← bare, in a layout that reads markers
Residency `[x]` · SOC 2 `[?]`            ← inline, on any slide
```

**Bare markers work in:** `checklist` · `verdict-grid` · `pricing` ·
`obligation-matrix` · `roadmap` · any table with `state-cells`.

## Layout switches — [marks in layouts](/guides/status/marks-in-layouts/)

| Write | Does |
|---|---|
| `<!-- _class: table state-cells -->` | A table's leading cell markers draw discs |
| `` `[{[x], In force}, {[/], Exempt}]` `` | Renames key entries (`obligation-matrix`, `roadmap`); own paragraph, above the grid |
| `checks-ringed` · `checks-knockout` · `checks-bold` · `checks-outline` · `checks-tonal` | Disc style, per slide or per deck |
| `heat` | Yes turns red, no turns green, for a risk reading |

## Brace pills — [pills you place](/guides/status/pills/)

```
`{LABEL}:shape:color:size`      modifiers in any order, all optional
```

| Kind | Modifiers |
|---|---|
| Shape | *(capsule)* · `:chip` · `:tag` · `:tag-bordered` · `:circle` · `:chevron-right` · `:chevron-left` · `:diamond` |
| Color | `:c1` … `:c12` — numbered slots, never a meaning |
| Size | *(automatic: large in headings, small in notes and footers)* · `:sm` · `:lg` |

`:circle` and `:diamond` hold one or two characters. An unknown modifier leaves
the span as plain code.

## Status words — [pills a component places](/guides/status/component-pills/)

| Good | Careful | Bad | Noted | Parked |
|---|---|---|---|---|
| `on-track` `done` `live` | `at-risk` `warn` | `blocked` `fail` | `pilot` `decision` | `deferred` |

| Component | Slot |
|---|---|
| `progress` | Second trailing span — `` `68%` `at-risk` `` |
| `timeline-list` | Trailing span after the title |
| `kanban` | Trailing span on the card's lane bullet |
| `gantt` | A token on the task bullet (`live` is informational here) |
| `state-chart` | Trailing span on the state line |
| `slope` | Trailing span on the entity line |

Hyphenate: `at-risk`, not `at risk`. On `progress` and `timeline-list` an
unknown word still draws, in the informational color. Only `gantt` warns.

## Positional pills

| Pill | Where |
|---|---|
| Date | `timeline-list`: **leading** span · `regulatory-update`: last nested bullet · `roadmap`: phase header |
| Metadata | Trailing code span on a row, where the component has the slot |
| Range | `glossary` heading, automatic |

## Keeping text literal

| Write | Gets |
|---|---|
| `` `\[x]` `` · `` `\{LIVE}` `` | The literal text |
| `inline-code: literal` in front matter | Pills and inline marks off, whole deck |
| `<!-- _class: inline-code-literal -->` | The same, one slide |
| Studio: **Settings → Deck → General → Inline pills and marks** | The front-matter switch |

`[X]`, `[~]`, `{x}` and fenced code blocks never draw anything.

## Checking your deck

| Command | Catches |
|---|---|
| `npm run lint:deck -- deck.md` | Moved `[ ]`, label-set keys, words in `:circle`, `{x}` in braces, typed `✓` `✗` |
| `npm run lint:deck -- --fix deck.md` | Rewrites old verdict-grid and pricing `[ ]` to `[!]`, plus every other machine fix |

Upgrading a deck written before the six answers? See
[Upgrading an older deck](/guides/status/upgrading/).
