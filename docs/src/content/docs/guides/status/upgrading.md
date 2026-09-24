---
title: Upgrading an older deck
description: The empty box used to mean "no" in three layouts. Here is what changed, how Lattice finds the slides it affects, and how to fix them in one command or by hand.
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

## How Lattice finds the slides

You do not have to hunt. Three things point at every affected slide, and all
three use the same check, so they always agree:

1. **Rendering warns.** Rendering an old deck from the command line prints a
   warning naming each slide where an old `[ ]` now draws something else, up
   to five slides, then a count of the rest.
2. **`lint:deck` flags it**, with the marker to use instead:

   ```bash
   npm run lint:deck -- my-deck.md
   ```

3. **The Studio underlines it** as you type, with the same advice. On
   `verdict-grid` and `pricing` the underline offers a **Quick fix**, and
   **Fix all issues** counts it too.

None of them fires on a slide that already uses `[!]` or `[?]`, because that
slide was clearly written for six marks. None fires where a
[label set](/guides/status/marks-in-layouts/#rename-the-words-with-a-label-set)
names `[ ]` either, because the author has already said what it means.

## Fix it in one command

For `verdict-grid` and `pricing` the fix is mechanical. An old `[ ]` drew the
red cross, and `[!]` draws exactly that cross again:

```bash
npm run lint:deck -- --fix my-deck.md
```

`--fix` rewrites only the slides the warnings name, even when several slides
share one `---` chunk. It keeps your file's line endings and byte-order mark,
and it lists each fix it applied.

`--fix` applies **every** machine fix `lint:deck` knows, not just this one.
Read the list it prints, and review the diff before you commit.

## Fix obligation-matrix by hand

`--fix` leaves `obligation-matrix` alone, on purpose. The old key called `[ ]`
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
