---
origin: 3132
priority: P2
recorded: 2026-11-11
area: imagery
severity: medium
swimlane: engineering/decisions/2026-10-16-media-plugins.md §9
deferred: large — the owner chose a separate PR (2026-11-11): it needs the photo's luminance at render time in the engine, the CLI and the Marp runtime, a scrim design, and its own demo deck
source: https://github.com/Laticent/lattice/pull/3132
---

# A `bleed` slide picks its ink from its photo

why now   — The owner's Export-to-Marp sign-off PDFs on #3132 showed a `bleed` slide whose dark photo sat under the theme's
            dark heading ink in light mode. `bleed` never picks its ink: lib/plugins/image/image.styles.css leaves it to the
            author (`dark` gives light ink and a top scrim). The engine, the CLI and the Marp bundle all draw it the same way,
            and main always has, so a dark photo without `dark` has unreadable words.
where     — the `bleed` seat in lib/plugins/image/image.styles.css; the photo reading the Studio already does for thin cards
            (lib/core/card-ink.mjs, docs/src/components/studio/photo-ink-read.ts); the engine's and the runtime's image passes
            (lib/transformers/image-adaptive.js), which would need the photo's luminance where the slide renders.
done when — a `bleed` slide with no `dark`/`light` of its own draws light ink and a scrim over a dark photo and dark ink over
            a light one, in the engine, the CLI PDF and the Marp bundle alike, light and dark mode; an author's own `dark` or
            `light` still wins.
evidence  — a demo deck (a dark and a light photo, each with and without `dark`) rendered dark and light; a contrast check
            on the heading over the photo.
verify    — tier 1 checker (it moves rendered ink); `npm run identity:check` names every deck that changes.
