---
origin: 2404
priority: P2
recorded: 2026-09-27
area: website
severity: medium
swimlane: engineering/decisions/2026-09-27-studio-export-one-engine.md
source: https://github.com/Laticent/lattice/pull/2404
---

# The Studio webpage export leaves a blank line where it strips a speaker note

Two tests in `docs/e2e/webpage-export.spec.ts` fail on `main` itself: "keeps the deck the author
wrote — the note was the slide break" and "keeps a tight list tight — the note was inside a list
item". The stripped export is not byte-identical to the same deck written without the note. It
carries one extra blank line after the paragraph that preceded the note (`<p>Some text</p>` then
an empty line, before the slide's closing `</div>`).

```text
  P2 · [no ticket] the note strip leaves the newline that followed the note.
       why now   — the tests exist to pin byte identity, and they are red on main (found while
                   running every export spec for #2404; reproduced with main's deck-export.js
                   and base.finish.css swapped in, so #2404 does not cause it).
       where     — the note-stripping step of the Studio webpage export
                   (docs/src/components/studio/export/deck-export.js and the notes core it calls).
       done when — both tests pass on the desktop project.
```
