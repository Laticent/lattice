# Universal modifiers

Class tokens that work on **every** layout. Compose them on the same comment,
space-separated, after the layout name:

```
<!-- _class: cards-grid dark tone-warn insight-the-ask -->
```

There are 51, in 11 groups. A layout never has to declare them and
cannot opt out of them.

| Group | Tokens | What it is for |
|---|---|---|
| `mood` (1) | `dark` | Flip a single slide to the dark companion palette. Deck-wide dark is a theme choice, not this. |
| `decoration` (6) | `treatment-none` · `tint-corner at-tl` · `mark-orbit` · `tint-vignette` · `tint-edge at-right` · `mark-threads` | Ambient art on the canvas. One per slide at most — two read as clutter, and none is the right answer on a dense slide. |
| `typography` (5) | `with-period` · `no-period` · `scale-l` · `scale-xl` · `scale-2xl` | Scale the slide’s type up, or control the auto-period on headings. `scale-*` buys emphasis on a SPARSE slide; on a full one it just overflows. |
| `chrome` (7) | `silent` · `no-header` · `no-footer` · `no-paginate` · `form` · `no-form` · `no-progress` | Turn the running header, footer, page number or section rail off for one slide. `silent` bundles the first three — it is what bookends use. |
| `note` (2) | `no-note` · `note-warn` | Act on a trailing sentence: keep it as body copy, or mark the slide’s callout as an alarm (the warning triangle is drawn, so a caveat needs no typed glyph). |
| `social` (1) | `safe` | Crop-safe framing for a slide destined to be screenshotted. |
| `table` (3) | `table-plain` · `table-fill` · `state-cells` | Table treatment switches: drop the zebra, spread rows into leftover height, or decode `[x]` `[-]` `[ ]` `[/]` cells into status discs. |
| `state` (8) | `wip` · `draft` · `tbd` · `confidential` · `redacted` · `archived` · `pinned` · `revised` | Collaboration markers — a visible stamp that a slide is in progress, confidential or superseded. Meta-signal about the slide, independent of its content. |
| `tone` (4) | `tone-pass` · `tone-warn` · `tone-fail` · `tone-skip` | Cast the whole slide in a pass/warn/fail/skip color. Use for "this is the failure slide", not to color one item. |
| `insight` (11) | `insight-key` · `insight-recommendation` · `insight-takeaway` · `insight-verdict` · `insight-so-what` · `insight-bottom-line` · `insight-the-ask` · `insight-our-view` · `insight-implication` · `insight-next-step` · `insight-why` | Rename the key-insight callout’s eyebrow (TAKEAWAY, VERDICT, THE ASK, …). Changes the WORD, never the styling. |
| `claim` (3) | `claim-quiet` · `claim-hero` · `claim-framed` | Let content claim the stage by receding the chrome — quiet, then hero. Composes with the chrome switches above. |

## Two rules that save a slide

**Colors come from the theme, never from you.** There is no way to author a hex
value, and that is the point: a token means the same thing in every theme, a hex
means one thing in one theme and is wrong in the rest.

**One decoration per slide, and usually none.** `tint-*` and `mark-*` are ambient
art. They earn their place on a bookend or a divider; on a slide already carrying
content they compete with it.

## Position suffixes

The `tint-corner` / `tint-edge` treatments take a companion `at-*` token that says
where: `at-tl` `at-top` `at-tr` `at-right` `at-br` `at-bottom` `at-bl` `at-left`.
Author both — `tint-corner at-tl`.

## Semi-universal

These apply to MOST layouts; a layout whose shape they would break opts out, so a
component file is the authority for its own:

`compact` · `accent` · `claim-bleed`

Per-layout variants are listed in each `../components/<name>.md`.

---

Generated from `UNIVERSAL_GROUPS` in the component index — the same source the
engine composes against, so this list cannot drift from what actually renders.
