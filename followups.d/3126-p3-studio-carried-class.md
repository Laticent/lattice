---
origin: 3126
priority: P3
recorded: 2026-11-11
area: website
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §9
deferred: off-path — the Studio reads one slide's text everywhere (the class drawer, the photo checks); resolving a class carried from an earlier slide is a Studio-wide change, not the placed-picture rule this PR moved into one kernel
source: https://github.com/Laticent/lattice/pull/3126
---

# The Studio's picture readers cannot see what a slide inherits from the slides before it

why now   — `photoAt` (docs/src/components/studio/card-ink-pick.ts) now asks the placed-picture kernel
            (lib/core/placed-picture.mjs) with the slide's own `_class` and the deck's `class:`. A running
            `<!-- class: image -->` written on an earlier slide is out of its sight, because the Studio hands it one
            slide's text. On such a slide the engine places a lone picture and the photo-contrast check stays silent.
            The same holds for a `backgroundImage` from the front matter or a running `<!-- backgroundImage: … -->`
            (Compose and `photoAt` both: the engine and the export treat it as the slide's photo, the Studio places the
            picture), and for a `split: headings` deck, where Compose and `photoAt` see one `---` slide holding two
            pictures and place neither while the engine places one per heading slide. The shared table marks the
            first two `carried` and `carriedBackground`, and the vitest parity skips them by name.
where     — `photoAt` / `photoRefOf` and their callers (thin-card-fix.ts, photo-verdict.ts, photo-ink-read.ts,
            SlideContext.tsx), which hold the whole deck source and could resolve the slide's class from it.
done when — the Studio's readers receive the slide's resolved classes and its carried background (a deck-level
            reader the Studio owns, from the whole source and the engine's slide boundaries), and every `carried` and
            `carriedBackground` case in test/fixtures/placed-picture-cases.json runs in the vitest parity with no skip.
evidence  — the five named skips in docs/src/lib/compose/placed-picture-parity.test.ts.
verify    — `cd docs && npx vitest run src/lib/compose/placed-picture-parity.test.ts` with no skip.
