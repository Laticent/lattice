---
origin: 2457
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2457
---

# split-compare: the string and DOM paths disagree on an author block the layout doesn't claim

Found by #2457's red team, pre-existing. A split-compare slide with an extra paragraph (or any
block that is not the frame label, heading, lede, option list or verdict) loses it on the
string path (`lib/core/split-panels.js` `applyCompare` emits only the parts it recognizes) and
keeps it as a loose section child IN FRONT of the panels on the DOM path
(`lib/transformers/split-panels.js` `transformSplitCompare`). HARD RULE #1 drift, and the
string path silently drops author content.

```text
  P3 · split-compare drops (string) or strands (DOM) unclaimed author blocks
       why now   — silent content loss on the export path.
       where     — applyCompare / transformSplitCompare.
       done when — both paths put an unclaimed block in the same place (the options
                   zone, or a lint warning that names it), and the parity test in
                   test/unit/transformers/split-panels-chrome.test.js covers it.
       evidence  — the parity test, plus a render of a slide with an extra paragraph.
       verify    — tier 1.
```
