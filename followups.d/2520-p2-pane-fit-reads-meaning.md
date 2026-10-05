---
origin: 2520
priority: P2
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2520
---

# The pane gallery's "Keeps your text" judges shape, not meaning

why now   — the owner asked (PR 2520) whether a component that structurally fits but reads oddly
            should still say "Keeps your text": a plain list fits `contact` and `actors` (their only
            required slot is `ul > li`), so "- A point" becomes a contact card. Not yet decided.
where     — docs/src/lib/compose/pane-model.ts `paneFit`; docs/src/lib/compose/pane-needs.ts (the
            needs map, built in docs/src/pages/studio.astro from dist/docs/grammar.json).
done when — the owner picks a rule (e.g. a component's optional slots or its substance must also
            match before "keeps"), and the gallery's bands follow it for every component.
evidence  — tools/screenshot.js @1440/820/390 of the pane gallery on a plain-list pane, before/after.
verify    — tier 1 checker, because the badge decides whether a pick replaces the author's text.
