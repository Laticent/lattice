---
origin: 2887
priority: P3
recorded: 2026-10-26
area: engine
severity: low
swimlane: lib/authoring/lint-core.js
source: https://github.com/Laticent/lattice/pull/2887
---

# lint:deck says nothing about a deck-level `class:` token or two finishes on one slide

```text
  P3 · two silent cases in the class lint, both the same on main
       found     — #2887's checker. (1) A deck-level `class: bogusxyz` raises no unknown-class, so
                   `class: chart-finish-tone` gets no `marks-renamed` note either (it renders correctly).
                   (2) `_class: bar marks-tone marks-etch` stamps both finishes and lint is silent;
                   the old spelling behaves the same, so the alias did not cause it.
       where     — lint-core.js, the unknown-class pass (it reads `_class:` directives only) and
                   findUnknownMarks (it reads the front-matter key, not slide classes).
       done when — a deck-level `class:` token goes through the same unknown/renamed check as `_class:`,
                   and a slide naming two finishes (or two intensities) gets one warning naming the winner.
       verify    — lint the two one-slide decks above; each reports one finding.
```
