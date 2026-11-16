---
origin: 3126
priority: P3
recorded: 2026-11-13
area: website
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §9
deferred: large — the Studio's photo readers address a slide by its `---` unit (the photo check, the ink fix and SlideContext all key on the unit index), and a heading part has no unit of its own; placing per part means re-keying all three on the deck index's parts
source: https://github.com/Laticent/lattice/pull/3126
---

# On a `split: headings` deck, the Studio's photo readers see one slide where the engine draws two

why now   — The carried class and background are done (lib/core/slide-carried.mjs, docs/src/lib/slide-carried.ts; every case
            in test/fixtures/placed-picture-cases.json runs in the Studio parity with no skip). One shape is left: on a deck that
            splits on headings (the engine's default), a `---` slide with two headings is two engine slides. If each part
            holds one lone picture, the engine places one per part, while Compose and `photoAt` read the `---` slide, see two
            lone pictures and place neither, so the photo-contrast check stays silent there.
where     — `photoAt` / `photoRefOf` (docs/src/components/studio/card-ink-pick.ts) and their callers (thin-card-fix.ts,
            photo-verdict.ts, photo-ink-read.ts, SlideContext.tsx); Compose's `placementAt`
            (docs/src/lib/compose/image-objects.ts). The deck index (docs/src/lib/deck-outline/deck-outline.ts) already holds
            the parts (`headingSplitPoints`, the engine's own split).
done when — a `split: headings` case with one lone picture per heading part is a row of the shared table, and the engine, the
            export, Compose and `photoAt` all place both pictures.
evidence  — the new row green in test/unit/plugins/image-address.test.js and docs/src/lib/compose/placed-picture-parity.test.ts,
            with a failing arm on today's readers.
verify    — `cd docs && npx vitest run src/lib/compose/placed-picture-parity.test.ts`; self-review with the gates.
