---
origin: 2279
priority: P5
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2279#issuecomment-5764143460
backfill: true
---

# Document that a soft newline inside a paragraph renders as a literal <br>

Backfilled verbatim from the continuation brief on #2279 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P5 · [no ticket] Document that a soft newline inside a paragraph renders as a literal <br>
       why now   — `breaks: true` is on, so a hard-wrapped paragraph ships visible mid-sentence
                   breaks. Undocumented, invisible until you look at the render, and every
                   agent that wraps prose at 80 columns will hit it — including whoever writes
                   P2's demo deck.
       where     — searched design/skill.md, design/editorial.md, engineering/gotchas/marp.md
                   and lib/base/base.docs.md: nothing covers it. design/skill.md:269 discusses
                   the source splitter and fenced `---`, a different thing. The deck-authoring
                   contract (design/skill.md) is the right home, with a symptom row in
                   engineering/gotchas.md pointing at it.
       done when — the contract says each paragraph goes on ONE source line and why, and
                   `grep -rn "breaks" design/skill.md` finds it.
       evidence  — the diff, plus a two-paragraph deck rendered before and after to show the
                   `<br>` (verified mechanism: `render()` on `line one\nline two` emits
                   `<p>line one<br />line two</p>`).
       verify    — tier 0, the gates. Docs only.
```
