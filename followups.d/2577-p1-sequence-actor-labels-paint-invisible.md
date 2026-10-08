---
origin: 2577
priority: P1
recorded: 2026-10-07
area: diagram
severity: high
swimlane: engineering/mermaid.md
---

# Sequence diagrams draw their participant boxes with no visible name

why now   — found while comparing the installed CLI's render to the in-tree one (the P1 follow-up
            to #2577). Every participant box on the diagram gallery's sequence slide is empty, top
            and bottom: `App`, `SDK`, `Weights`, `Log` never show. The committed golden
            `lib/components/diagram/diagram.gallery.light.pdf` (last rebuilt in #2532) shows the same
            empty boxes, so it is on `main` and older than this work. A sequence diagram without
            participant names does not say who talks to whom, which is its whole content.
where     — the names ARE in the SVG: `<text class="actor actor-box"><tspan>Log</tspan></text>` sits
            in each box (`lattice.js lib/components/diagram/diagram.gallery.md out.pdf`, then
            read out.html). So the text paints invisibly rather than going missing. First suspect: a
            `.actor` fill rule (the box color) reaching the `<text>`, which carries the same `actor`
            class, ahead of Mermaid's `text.actor > tspan` rule; check the diagram overrides in
            lib/plugins/mermaid/ and the theme variables `actorTextColor` / `actorBkg`.
done when — the gallery's sequence slide shows all four names in both modes, and a test fails when
            a sequence participant's text fill equals its box fill.
evidence  — before/after crops of that slide, dark and light.
verify    — tier 0 plus a look at every sequence diagram in the galleries and examples/.
