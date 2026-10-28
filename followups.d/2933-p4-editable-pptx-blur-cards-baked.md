---
origin: 2933
priority: P4
recorded: 2026-10-27
area: engine
severity: low
swimlane: engineering/decisions/2026-06-16-focus-highlighting.md §6
---

# Decide how the editable PPTX exports `_focusStyle: blur`'s receded cards

```text
  P4 · [no ticket] blur bakes the receded cards into one picture
       why now   — `--editable` exports a `_focusStyle: blur` slide's receded cards as ONE picture (examples/focus.md slide 8), because no office format blurs live text; the focused card stays editable. The owner noticed it while reviewing #2933 and deferred the call. Options: A keep baking (looks like the PDF, those cards not editable; the current default), B recede them like spotlight with native transparency (editable, the blur is lost in the PPTX), C bake the blur AND keep invisible editable text behind it (most work, confusing to edit).
       where     — docs/src/lib/calco/reader.ts (a `filter: blur` box is refused and kept in the picture).
       done when — the owner picks A, B or C, and the editable export of examples/focus.md slide 8 matches the pick.
       evidence  — an Impress render of examples/focus.md slide 8 from `--editable`, light and dark, before and after.
       verify    — owner decision first; then tier 1 checker and the export sign-off if the bytes change.
```
