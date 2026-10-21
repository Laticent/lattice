---
origin: 2846
priority: P2
recorded: 2026-10-21
area: website
severity: medium
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md
source: https://github.com/Laticent/lattice/pull/2846
---

# Compose: inline math (`$x^2$`) and block HTML lock the slide

why now   — 30 and 21 of the 96 locked slides in the shipped decks. Math needs the engine's rule (`sourceHasMath`) as an inline atom drawn by KaTeX with a TeX panel; block HTML needs an atom that carries the HTML verbatim.
where     — docs/src/lib/compose/deck-source.ts, deck-markdown.ts.
done when — both round-trip byte for byte and open a panel (TeX field with a live preview).
evidence  — corpus byte test, real Studio at three widths.
verify    — tier 1 checker.
