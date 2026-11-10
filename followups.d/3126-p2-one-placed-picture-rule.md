---
origin: 3126
priority: P2
recorded: 2026-11-10
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-media-plugins.md §9
deferred: large — Compose and the photo finder would have to ask the engine's markdown-it parse per slide instead of their own reading, a design change the next PR (the engine stops reading `![bg]`) needs anyway
source: https://github.com/Laticent/lattice/pull/3126
---

# One rule for "is this picture the slide's placed photo?", asked by every reader

why now   — The inversion lens on #3126 found the shortcut's rule written in several places that had drifted: the
            engine (`lonePicture` and `placesPhotoAlready`, lib/integrations/markdown-it/plugins.js), Export-to-Marp
            (`withImageMarkdown`, lib/plugins/image/shared/image-marp-export.js), Compose (`soleLonePicture`,
            `placementAt`, docs/src/lib/compose/image-objects.ts) and the photo finder (`photoAt`,
            docs/src/components/studio/card-ink-pick.ts). #3126 fixed every drift it found and pins the engine and the
            export to the same answer on twenty decks (test/unit/plugins/image-address.test.js, "agree on which picture
            is placed") and Compose to the same shared table (test/fixtures/placed-picture-cases.json, read by
            docs/src/lib/compose/placed-picture-parity.test.ts), so the three agree through it. `photoAt` and the
            image lint are not on the table yet, and each reader still re-derives the rule by hand. The next PR sends every legacy `![bg]`
            photo through this rule, so a fifth copy drifting there would place or drop photos silently.
where     — the four functions above; the image lint (`image-extra-panel`, lib/plugins/image/image.lint.js) counts only
            records and should count the shortcut too.
done when — one kernel function (e.g. lib/core/placed-picture.js, HARD RULE #1) decides it from a markdown-it parse;
            the engine, the export, Compose's placement and badge, `photoAt` and `image-extra-panel` all ask it; and the
            parity test runs every case through each of them.
evidence  — the inversion's findings F1, F3, F5, F6 and F10 on #3126, each a reader disagreeing with the engine.
verify    — the shared table read by `photoAt` and `image-extra-panel` too; `npm run identity:check`.
