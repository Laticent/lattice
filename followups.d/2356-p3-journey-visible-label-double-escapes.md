---
origin: 2356
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2356
---

# A journey step or stage whose name holds `&` or `"` shows the entity, not the character

Found while fixing CodeQL's attribute-escaping alerts on #2356. Pre-existing on `main`, and off
that PR's path: the PR only touched the `data-label` attribute beside it.

```text
  P3 · Journey renders `T & "q"` as the visible text `T &amp; &quot;q&quot;`
       why       — journey.transform.js parses a label with its local `stripTags`, which drops tags
                   but keeps the entities markdown-it wrote; the render then runs `escHtml` on that
                   already-escaped text, so every `&` doubles (`&amp;amp;`).
       where     — lib/components/chart/journey/journey.transform.js: parseTask / parseSection
                   (stripTags), the `.journey-task-label` / `.journey-stage-name` /
                   `.journey-vstage-name` spans, and `journeyDesc`, which inserts the raw label.
       fix       — parse with `lib/core/plain-text.js`'s `plainText` (fixed-point strip + decode)
                   and escape every output once; `journeyDesc` must then escape too, or a decoded
                   `<` reaches markup. #2356's data-label already does it this way
                   (`escAttr(plainText(label))`), pinned by
                   test/unit/components/mark-identity-escaping.test.js.
       done when — rendering `- T & "q" \`@a\` \`:3\`` gives a `.journey-task-label` whose
                   textContent is `T & "q"`, and the unit suite pins it.
```
