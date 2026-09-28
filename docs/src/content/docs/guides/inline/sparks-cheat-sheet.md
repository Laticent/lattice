---
title: Sparks cheat sheet
description: Every spark type, modifier and setting on one page — the grammar, what each word does, where it works, and the mistakes lint:deck catches.
---

The syntax on one page. [Sparks](/guides/inline/sparks/) explains each part with live examples.

## The grammar

```
`~{DATA}:type:size:color:look:markers`      modifiers in any order, all optional
```

```markdown
Signups climbed `~{12 13 12 15 17 16 19 21}:end` in eight weeks.
Plan `~{72/80}:bullet:c3` · onboarding `~{72%}:sm`
```

Single backticks, a `~` before the braces. `\~{…}` keeps it as plain code.

## Data

| Write | Means | Draws by default |
|---|---|---|
| `~{12 14 13 17}` | A series: 2 to 48 numbers, spaces between | A line |
| `~{72%}` | A share of 100 | A ring |
| `~{18/24}` | A value over a total | A ring |

Numbers only: no units, commas or currency signs (`1200`, not `1,200` or `$1.2K`). Negatives
and decimals are fine.

## Type

| Type | Data | Shows |
|---|---|---|
| *(line)* | series | The shape of change |
| `:area` | series | Shape, with weight under the line |
| `:bar` | series | The size of each period, always from zero |
| `:step` | series | A value that holds, then jumps |
| `:winloss` | series | Hit (above 0), miss (below 0, hollow), tie (0) |
| *(ring)* | ratio | Part of a whole |
| `:bullet` | ratio | A value against a target tick |

## Size, color and look

| Kind | Words | Default |
|---|---|---|
| Size | `:sm` · `:md` · `:lg` | `:md` |
| Color | `:c1` … `:c12` — the same numbered slots pills use | `:c1` |
| Look | `:pigment` (the color fills the tile) · `:etching` (a clear tile, the color is the line) · `:tone` (one hue, stepped by value) | `:pigment` |

A look sets the tile, its edge, the line and the bars together, from the one color.

## Line extras — `line`, `area` and `step` only

| Word | Does |
|---|---|
| `:end` | Dots the latest value, in the accent color |
| `:minmax` | Dots the low and the high |
| `:zero` | Starts the axis at 0, so a flat series reads flat |
| `:fill` | Stretches the spark to the width of its line (every type but ring) |

## Frame

| Kind | Words | Default |
|---|---|---|
| Frame | `:framed` · `:bare` (ink in the line, no tile) | `:framed` |
| Corners | `:square` · `:rounded` | `:square` |

## One spark, one slide, the whole deck

The most specific wins, one setting at a time.

| Scope | Write |
|---|---|
| One spark | `` `~{1 3 2}:etching:rounded` `` |
| One slide | `<!-- _class: table spark-bare -->` — any word with `spark-` in front |
| The whole deck | `spark: etching rounded` in front matter |

The deck-level words are frame, look and corners: `framed` · `bare` · `pigment` · `etching` ·
`tone` · `square` · `rounded`.

## Sketch mode

With `mode: sketch`, sparks are drawn by hand like the tables around them: the tile's edge, the
line, the bars' outlines, the bullet's tick and the ring. Nothing to write. Sparks in the header
or footer stay clean.

## What `lint:deck` catches

A span that looks like a spark but doesn't parse stays as plain code, and `lint:deck` says why:

| Written | Reported |
|---|---|
| `~{1,200 1,450}` | `1,200` is not a number: no units, commas or currency signs |
| `~{5}` | one number is not a trend: write a series, or a ratio like `72/80` |
| `~{72%}:bar` | a bar needs a series of two or more numbers |
| `~{1 2 3}:ring` | a ring takes one value, not a series |
| `~{3 5 4}:bar:end` | `:end` only goes on line, area and step |
| `~{3 5 4}:c13` | `:c13` is not a spark modifier |
| `~{1 2}:etching:tone` | repeats the look — one word per setting |

In the Studio, `spark-too-big` also warns when a spark is too wide for its space or more than
1.5 lines tall, with a one-click fix to the size that fits.
