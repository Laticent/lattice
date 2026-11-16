---
origin: 3181
priority: P3
recorded: 2026-11-13
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §9
deferred: off-path — the shortcut's record path is #3126's code on `main`; this PR moved the shipped decks onto it and measured the cost, and #3153 already fixed the Studio stall it caused
source: https://github.com/Laticent/lattice/pull/3181
---

# The picture shortcut writes its address into a record string and parses it back

why now   — A lone `![title](src)` on an `image` or `bleed` slide is drawn by the image record's path: the engine writes
            `@image{"<src>", title=…}` as text and the record reader parses it again
            (lib/integrations/markdown-it/plugins.js, the `placedAt` branch). A pasted phone photo is a 3.5 MB `data:`
            address, so each one is quoted, unquoted and copied several times. Measured in Node on three such slides: 2.5 s of
            engine render against 1.7 s for the same deck as `![bg]`, most of it garbage collection. #3153 fixed the Studio
            freeze it caused; the render cost is still there, on every surface that renders the deck.
where     — the `placedAt` branch in lib/integrations/markdown-it/plugins.js and `inlineDirectiveBlockHtml`; the record reader
            (lib/plugins/image/image.inline.js `read`). The placed-picture kernel already stands a long payload in for a short
            marker before its own parse (lib/core/placed-picture.mjs `shrinkData`).
done when — the shortcut hands the record its fields without re-serializing the address, or stands the payload in for a
            marker and restores it in the output, and the image size the record stamps (`--lat-media-ar`) is unchanged.
evidence  — engine render time on the three-photo deck before and after (`npm run bench`, a scenario for it), and
            docs/e2e/export-photo-size.spec.ts green on Gecko.
verify    — self-review with the gates; `npm run identity:check` shows no deck moves.
