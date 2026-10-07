---
origin: 2556
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2556
---

# Editable office export: cards, pills and rules as native shapes

why now   — the owner asked whether a corner tag is a real shape. Today only the words are
            editable; a card, a pill or a rule is pixels in the slide picture, so it cannot be
            resized or moved with its text. Native shapes are the next step in look-parity.
where     — docs/src/lib/calco/reader.ts (read the box of a plain solid or rounded element
            with a border), a shape type in types.ts, odp.ts draw:custom-shape and pptx.ts
            addShape; a pill grouped with its label.
done when — a design note picks which boxes become shapes (solid fill, border, radius only;
            gradients, textures and sketch strokes stay in the picture) and how a label is
            grouped with its pill; the owner confirms it before code.
evidence  — card-tags and muted-tier exported both ways, opened in LibreOffice, Collabora on
            iOS and Google Slides, with a shape resized in each.
verify    — tier 1 checker, because the reader and both writers change.
status    — (2026-10-07) the design note is written:
            engineering/decisions/2026-10-07-calco-native-shapes.md. It measures three decks and
            recommends option A (a pill or tag becomes one shape that carries its own text).
            Waiting on the owner's pick; no code before it.
