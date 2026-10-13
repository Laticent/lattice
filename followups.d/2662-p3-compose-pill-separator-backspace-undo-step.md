---
origin: 2662
priority: P3
recorded: 2026-10-13
area: website
severity: low
swimlane: engineering/decisions/2026-10-13-compose-inline-notation-editors.md §12
source: https://github.com/Laticent/lattice/pull/2662
---

# Backspace on the space between a pill and a neighboring code span leaves an empty undo step

```text
  P3 · [no ticket] Backspace on a pill's separating space is a no-op that costs one undo step
       why now   — #2662 keeps a single space between a pill and a neighboring pill or code span, because two code spans that touch are one span in Markdown (`{A}``{B}`). Backspace on that space deletes it, the edit-time pass puts it straight back, and the author sees nothing happen. The history gets one step that changes nothing, so the next Undo seems to do nothing. The second independent checker confirmed it (`undoDepth` goes 0 to 1 on a no-op). Documented in lib/base/base.docs.md and the decision note §12; no data is lost.
       where     — docs/src/lib/compose/inline-objects.ts (`normalizeObjects` gap pass, `inlineObjectsPlugin` `appendTransaction`). A fix is a `handleKeyDown` for Backspace and Delete that consumes the key when the character to delete is that mandatory space, so no transaction exists, or a `filterTransaction` that refuses a delete which would make the spans touch.
       done when — Backspace and Delete on the separating space change neither the document nor the undo depth, with a test in docs/src/lib/compose/inline-objects.test.ts that fails without the fix, and the line in base.docs.md saying it "comes straight back" is updated or removed.
       evidence  — a vitest case on the real plugin (the checker's repro: `` `code` `{ONE, c2}` ``, delete the space, assert doc and `undoDepth` unchanged), plus one driven run of the real Studio.
       verify    — tier 0.
```
