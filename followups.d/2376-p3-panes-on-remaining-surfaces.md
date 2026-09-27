---
origin: 2376
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2376
---

# Export-to-Marp cannot carve a pane

why now   — the last surface where a panes deck fails. PR #2420 closed the other two this file
            listed: the player's Read · Article view now projects each pane as the slide it would
            be alone (a chart pane is a styled `chart-frame` figure, not black bars), and the
            Studio's Present steps through a split panes slide's pages, in a frame shaped like the
            deck (it was a fixed 16:9 box that cropped every portrait slide). Left:
            - Export-to-Marp cannot carve a pane (marp-core has no carve); it should degrade to
              the two panes' content, stacked, and a pane marker must not become a Marp speaker
              note. Changes exported bytes: dark + light renders go to the owner for sign-off.
where     — lib/core/marp-bundle.js / tools/export-marp.js.
done when — examples/panes.md exported to Marp renders in marp-cli with both panes' content on
            each slide and no pane marker in the speaker notes.
evidence  — the Marp bundle rendered with marp-cli, dark and light, sent for sign-off.
verify    — tier 1 checker, because it changes exported bytes.
