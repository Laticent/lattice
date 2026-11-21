---
status: in-progress
summary: The spectrum settings had up to four names for one thing (front-matter key, deck-settings label, value and class) and five keys for two stripes. The owner settled them as three keys, read as plain English with the thing first. `spectrum:` (style, edge, weight) is the stripe on the slide edge, `card-spectrum:` (style, edge, weight) is the stripe on each card, and `trim-spectrum:` is the accent on tables, timelines and rules. A new weight axis (`hairline`, `regular`, `band`) is what deck presets need for a heavy edge. Old names are removed, not aliased; lint flags each as an error and fixes it, and the same PR migrates every repo deck.
companion:
  - ./2026-07-03-spectrum-register-white-label.md
  - ./2026-07-15-accent-finish-consolidation.md
  - ./2026-07-16-spectrum-structure-default.md
  - ./2026-10-26-spectrum-edge-shift.md
  - ./2026-11-20-deck-preset-study.md
---

# Spectrum keys: three keys, one name per thing

**Date:** 2026-11-21 · **Status:** in progress; the decisions in §2 are owner-settled (one session, four rounds), the build is under way

**The answer, first.** A deck writes at most three spectrum keys:

```yaml
spectrum: solid left band        # the stripe on the slide edge
card-spectrum: match left band   # the stripe on each card
trim-spectrum: restrained        # the accent on tables, timelines and --- rules
```

Deck settings label them **Spectrum**, **Card spectrum** and **Trim spectrum**: the label is the key.
The old keys, values and classes are removed. `lint:deck` reports each as an error, names the new
spelling, and `--fix` rewrites it.

## 1. Why

The deck-preset study (`2026-11-20-deck-preset-study.md` §6) needed a heavy accent edge: 22px on
Strategy House, 14px on Earnings. The engine draws the slide-edge stripe at one width, so the wave-1
build stopped on it as gap G1. The owner's answer was that the edge is a spectrum, so its weight belongs
on the spectrum key as an axis, and the card stripe needs the same axis. Looking at it surfaced the
naming problem underneath:

| Front matter today | Deck-settings label | Same look, other words | Code |
|---|---|---|---|
| `spectrum:` | Brand bar | `on` means rainbow | `with-spectrum`, `--spectrum-bar`, `--_bar-w` |
| `spectrum-edge:` | Bar placement | `off` repeats `spectrum: off` | `no-spectrum-edge` |
| `spectrum-card:` | Card rail | `rainbow` here is `on` above; `auto` is labeled "Match bar" | `--rail-w`, `--sp-card-w` |
| `spectrum-card-edge:` | Card rail placement | | |
| `spectrum-trim:` | Structural trim | `off` and `on` are labeled Quiet and Spectrum | |

"Rail" already means the divider's stripe, `progress-rail:` and the split rail, and "bar" collides
with bar charts. The owner: *"we need to standardize before GA."*

## 2. Decisions

| # | Decided | Not chosen |
|---|---|---|
| S1 | The stem stays `spectrum` | `bar` (bar charts), `rail` (four meanings), `accent-edge` (renames the key every deck uses) |
| S2 | The thing comes first: `card-spectrum`, `trim-spectrum`, as `card-tag` does. The owner: *"Spectrum Card and spectrum trim read odd"* | `spectrum-card`, `spectrum-trim` |
| S3 | Two stripe keys, each with three axes (style, edge, weight), one word per axis, in any order, as `cover: light column` does | A seventh key per axis; a single shared weight key |
| S4 | Trim is its own third key | An axis of `spectrum:` |
| S5 | The deck-settings label equals the key; each word means one thing everywhere | Keeping "Brand bar" and "Card rail" |
| S6 | `_class:` names follow the keys, within the switch rule (§3) | Keeping the old class names |
| S7 | **Old names are removed, not aliased.** The owner: *"old names don't stay, they go. we have the linter flag them and suggest fixes and fix them."* The engine carries no translation. A deck with an old spelling renders the default until fixed, and lint reports it as an error | Rendering old names as aliases |
| S8 | Preset styling lives in per-preset stylesheets (`lib/presets/<name>/`); no script writes CSS. Recorded here because it was settled in the same session; it ships with the preset wave, not this change | A generated `section.preset-<name>` rule from a JavaScript table |

## 3. The vocabulary

**The class names obey the switch rule** (`2026-11-04-switch-vocabulary.md`, the owner's): an off is
`no-X` and the way back on is `with-X`, never `X-off` or `X-on`. Every other value is `<key>-<value>`.

**`spectrum:`** — the stripe on the slide edge.

| Axis | Words (default first) | Class on a slide |
|---|---|---|
| Style | `rainbow`, `solid`, `duo`, `mono`, `off` | `with-spectrum` (back to the rainbow), `spectrum-solid`, `spectrum-duo`, `spectrum-mono`, `no-spectrum` |
| Edge | `top`, `left`, `right`, `bottom` | `spectrum-top`, `spectrum-left`, `spectrum-right`, `spectrum-bottom` |
| Weight | `regular`, `hairline`, `band` | `spectrum-regular`, `spectrum-hairline`, `spectrum-band` |

**`card-spectrum:`** — the stripe on each card.

| Axis | Words (default first) | Class on a slide |
|---|---|---|
| Style | `off`, `match`, `rainbow`, `solid`, `duo`, `mono` | `no-card-spectrum`, `with-card-spectrum` (on, matching the slide edge), `card-spectrum-rainbow`, `card-spectrum-solid`, `card-spectrum-duo`, `card-spectrum-mono` |
| Edge | `left`, `top`, `right`, `bottom` | `card-spectrum-left`, `card-spectrum-top`, `card-spectrum-right`, `card-spectrum-bottom` |
| Weight | `regular`, `hairline`, `band` | `card-spectrum-regular`, `card-spectrum-hairline`, `card-spectrum-band` |

**`trim-spectrum:`** — `quiet` (default), `restrained`, `full`; classes `trim-spectrum-quiet`,
`trim-spectrum-restrained`, `trim-spectrum-full`. None of the three is an off, so trim is no longer a
switch.

A deck value that is the default stamps nothing. On a slide, the default's class is the restore token:
it returns one slide to the default inside a deck that set something else.

**Weights.** `regular` is today's width on both stripes. `band` is the heavy edge the presets use,
and `hairline` is the quiet one. The widths live in CSS (`lib/base/base.accent-finish.css` and
`base.elements.css`), keyed on the class, and the bar keeps taking its room out of the slide margin, so
`npm run check:edge-shift` still holds content and chrome in place under every weight.

## 4. The rename map

| Old | New |
|---|---|
| `spectrum: on` | `spectrum: rainbow` (or omit) |
| `spectrum-edge: <edge>` | the edge word on `spectrum:` |
| `spectrum-edge: off` | `spectrum: off` |
| `spectrum-card: <style>` | the style word on `card-spectrum:`; `auto` becomes `match` |
| `spectrum-card-edge: <edge>` | the edge word on `card-spectrum:` |
| `spectrum-trim: off \| restrained \| on` | `trim-spectrum: quiet \| restrained \| full` |
| `spectrum-edge-<edge>` | `spectrum-<edge>` |
| `no-spectrum-edge`, `with-spectrum-edge` | `no-spectrum`, `with-spectrum` |
| `no-spectrum-card`, `with-spectrum-card` | `no-card-spectrum`, `with-card-spectrum` |
| `spectrum-card-<style>` | `card-spectrum-<style>` |
| `spectrum-card-edge-<edge>` | `card-spectrum-<edge>` |
| `no-spectrum-trim`, `spectrum-trim-restrained`, `with-spectrum-trim` | `trim-spectrum-quiet`, `trim-spectrum-restrained`, `trim-spectrum-full` |

`with-spectrum`, `no-spectrum` and `spectrum-solid|duo|mono` keep their names: they already follow
the rule. The fixer merges several old keys into one new line in a fixed order (style, edge, weight),
so `spectrum: duo` plus `spectrum-edge: left` becomes `spectrum: duo left`. The old classes join
`RETIRED_SWITCHES`' sibling table, which lint already uses to report a retired class and rewrite it.

## 5. Scope, measured

`git grep` on `main` at `038c49f`, excluding `dist/` and `CHANGELOG.md`:

| Term | Files | Hits |
|---|---|---|
| `spectrum-edge` | 125 | 411 |
| `spectrum-card` | 96 | 452 |
| `spectrum-trim` | 88 | 265 |
| `no-spectrum` | 50 | 177 |
| `with-spectrum` | 37 | 134 |

Seven repo decks write an old key or `spectrum: on` in their front matter. Released changelog entries
and earlier decision notes keep the old names: they record what was true then.

## 6. What follows

- The deck-preset wave 1 waits for this change: Strategy House and Earnings write
  `spectrum: solid left band`.
- The command center was asked for a plain-English inventory of every other author-facing key under
  the same rules (S2, S5, S7), as proposals for the owner to decide in one round.
