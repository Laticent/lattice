---
origin: 2992
priority: P2
recorded: 2026-11-03
area: website
severity: medium
swimlane: engineering/decisions/2026-11-01-icon-font.md
deferred: large — a new feature with its own design round and PR (HARD RULE #17); the owner asked for it on PR 2992
source: https://github.com/Laticent/lattice/pull/2992
---

# Export presets: one "what is this file for?" dropdown, every setting behind an accordion

```text
  P2 · [no ticket] export presets, named for the outcome, with the settings in a Custom accordion
       why now   — the owner (PR 2992): "the permutation and complexity is getting out of hand ... hide all the options
                   in an accordion during export and have presets drop down instead ... great presets are self evident."
                   An editable PowerPoint export offers about 300 combinations (editable, resolution, pictures + quality,
                   text-font tier, emoji-font tier, re-openable), each named for a mechanism (Exact, Used, Full, System).
       where     — docs/src/components/studio/ExportOptionsPanel.tsx, PicturesControl.tsx, FontsControl.tsx,
                   WebpageOptionsPanel.tsx; a shared kernel (lib/core/export-presets.js) the CLI reads too (--preset).
       draft     — PDF: Share (default) · Print · Review. PowerPoint/LibreOffice: Present (default) · Edit.
                   Webpage: Share (default) · Private. Named for the result, one line of what you get and give up,
                   ideally an estimated size; changing a setting flips to Custom and shows what differs; a deck's own
                   `images:`/`font-embedding:` lines are its starting point, labeled. Prune what presets make redundant (the
                   font tiers, the Settings panel's PDF options).
       done when — a design note (outcome map tested on real decks, mockups at 1440/820/390) is confirmed by the owner
                   in one round, then built on its own branch: Studio and CLI share the presets, screenshots at three
                   widths, e2e on Chromium/WebKit/Gecko.
       verify    — tier 2 maker-checker (a UI and CLI surface every export goes through).
```
