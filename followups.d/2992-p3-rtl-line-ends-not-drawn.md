---
origin: 2992
priority: P3
recorded: 2026-11-03
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-06-calco-office-export-library.md
deferred: off-path — pre-existing on main (117ddbd exports the same file), in how Calco places right-to-left text frames, which PR 2992 does not change
source: https://github.com/Laticent/lattice/pull/2992
---

# An editable file drops the last words of a right-to-left line from view

```text
  P3 · [no ticket] right-to-left wrapped text keeps every word in the file but does not draw the line ends
       why now   — the PR 2992 checker built a right-to-left variant of gallery slide 107 (regulatory-update with
                   `li { direction: rtl }`). In the editable PPTX rendered by LibreOffice, "… ranks people" loses
                   "qualifies.", "… the audit" loses "trail.", "… are in" loses "scope.". The words ARE in
                   slide1.xml; they are placed or wrapped where LibreOffice does not draw them. main renders the same.
       where     — docs/src/lib/calco/reader.ts (RTL frames: the split excludes rtl; frame width and alignment for
                   right-to-left lines) and the writers' paragraph direction (a:pPr rtl, ODP style:writing-mode).
       done when — an RTL paragraph that wraps draws every word in LibreOffice, from the .pptx and the .odp, pinned by
                   an export test; a real Arabic or Hebrew deck checked as well as the English-in-RTL variant.
       evidence  — the variant deck: copy gallery slide 107 into a deck with `li { direction: rtl }` in a style block.
       verify    — tier 2 maker-checker (Calco reader and both writers).
```
