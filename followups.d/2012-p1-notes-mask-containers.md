---
origin: 2012
priority: P1
recorded: 2026-10-26
area: engine
severity: high
swimlane: design/skills/speaker-notes.md
source: https://github.com/Laticent/lattice/pull/2910
---

# The --strip-notes code mask does not model containers, so some real notes still ship

```text
  P1 · [no ticket] model list items, blockquotes and multi-line code spans in maskCodeRegions
       why now   — PR 2910 rewrote the mask (lib/authoring/notes-core.js) and pinned "no
                   regression against main": over 300,000 generated documents, 0 notes hidden
                   that main's mask strips, and 648 hidden per 100,000 against main's 8,452.
                   The 648 are all PRE-EXISTING shapes main hides too. In each, markdown-it
                   renders the comment as a live note, the mask hides it, --strip-notes ships it,
                   and auditStrippedSource says nothing:
                     - a fence inside a list item: "- a\n  ```\n<!-- secret -->\n" (markdown-it
                       closes the fence when the item ends; the mask runs to end of file)
                     - a code span across a line break: "`\nb` <!-- secret --> `\n"
                     - an HTML block inside a container: "> <span>\n> `a <!-- secret --> a`\n",
                       "- <div>\n  `a <!-- secret --> a`\n"
       where     — maskCodeRegions / maskCodeSpans / htmlBlockEnd. A line scanner without a
                   container stack cannot see these. The robust shape is to ask markdown-it
                   itself: tag each comment opener with a unique id, render once, and treat a
                   comment as a note only if its id lands inside a live comment (the exact test
                   the PR's differential fuzz uses). Weigh the bundle cost first: notes-core is
                   in the authoring bundle and does not load markdown-it today.
       done when — the differential fuzz in test/unit/authoring/notes-core.test.js, widened to
                   the container vocabulary above, reports 0 hidden live notes.
       evidence  — the fuzz counts before and after.
       verify    — tier 2 trio: this is the privacy boundary for shared decks.
```
