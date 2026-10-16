---
title: Upgrading an older deck
description: The empty box used to mean "no" in three layouts. Here is what changed, how to find the slides it affects, and how to fix them.
---

If you wrote a deck before the six state marks, **re-rendering it can change
what it says.** Three layouts used to read the empty box `[ ]` their own way.
Now `[ ]` means *open* everywhere, and *no* has its own mark, `[!]`.

The rest of the deck is unaffected: `[x]`, `[-]` and `[/]` mean what they
always meant.

## What changed

| Layout | An old `[ ]` drew | It now draws | To keep the old meaning, write |
|---|---|---|---|
| `verdict-grid` | A red cross, "not met" | The open ring, "not assessed" | `[!]` |
| `pricing` | A red cross, "missing" | The open ring, "coming" | `[!]` for a missing feature, or `[/]` for "not on this plan" |
| `obligation-matrix` | "Exempt" | "Undetermined" | `[/]` for exempt, or `[!]` for "not required" |

Everywhere else — `checklist`, `roadmap`, `state-cells` tables, inline marks —
`[ ]` already meant *open*, and nothing changes.

**Why it changed.** One keystroke used to draw opposite answers on two slides
of the same deck: a red cross on a verdict-grid, an empty ring on the checklist
beside it. A reader cannot see which layout rule is in force. See
[The six answers](/guides/status/answers/) for the model that replaced it.

## Find the slides

Lattice does not flag these slides: `[ ]` is a valid answer on every layout,
so a slide that uses it renders correctly. Search your deck for `[ ]` on a
`verdict-grid`, `pricing` or `obligation-matrix` slide, and read each one
against the table above.

On `verdict-grid` and `pricing`, an old `[ ]` drew the red cross, so `[!]`
draws exactly that cross again.

## Fix obligation-matrix with care

There is no one rewrite for `obligation-matrix`. The old key called `[ ]`
"exempt", but authors used it for "exempt", "not required", "unconfirmed" and
even "controlled". When we migrated our own decks, a blanket rewrite to `[/]`
turned out to be wrong in 17 of 37 cells. Only you know which one you meant:

| You meant | Write |
|---|---|
| The obligation does not reach this regime | `[/]` — keyed "Exempt" |
| It reaches it, but nothing is required | `[!]` — keyed "Not required" |
| Nobody has worked it out yet | `[ ]` — keyed "Undetermined" (no change) |
| Something else, like "controlled" | Keep the marker, and rename it with a [label set](/guides/status/marks-in-layouts/#rename-the-words-with-a-label-set) |

## Typed ticks and crosses

If a deck types its marks as characters — `✓`, `✗`, `✕`, `❌`, `❓` — `lint:deck`
suggests the mark to use instead: `[x]`, `[!]` or `[?]`. A typed character is
drawn by whatever font the viewer's machine has, so it looks different in the
PDF, in the browser and in an export. A mark is drawn by Lattice, in the
theme's colors, the same everywhere.

## Next

[Cheat sheet](/guides/status/cheat-sheet/): every mark and pill on one page.
