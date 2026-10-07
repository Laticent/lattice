---
origin: 2565
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2565
---

# A browsable grid of the 265 icons, for an author who does not know a name to start from

why now   — #2565 shipped the icon picker as the editor's completion menu (engineering/decisions/
            2026-09-29-inline-icons.md § 15): it needs a first letter, or `^{` alone lists all 265
            names in one long column. An author looking for "something that means storage" has no
            way to scan the drawings.
where     — docs/src/components/studio/icon-preview.ts (the drawing builder to reuse); the Studio's
            Add menu or a command-palette entry; the names and aliases from icons.vocab.generated.js.
done when — a grid of every icon with its name, searchable by name and alias, that inserts `^{name}`
            at the cursor (or `icon=name` inside a record), and loads the drawings only when it opens.
evidence  — tools/screenshot.js at 1440 / 820 / 390, light and dark; the network log showing no
            lattice-plugin-icons.js request before it opens.
verify    — tier 1 checker, because it is website UI.
