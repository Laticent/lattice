---
origin: 2763
priority: P1
recorded: 2026-10-17
area: website
severity: medium
swimlane: engineering/decisions/2026-10-16-mosaico-layout-library.md §8.4
source: https://github.com/Laticent/lattice/pull/2763
---

# Studio exports wait for a measuring collage or logo wall; then hide them while they measure

why now   — a first visit to a logo wall in the live preview still paints the unpacked grid, then
            jumps into its packed rows (#2763 fixed only revisits). Hiding the measuring list, as
            collage does, is the fix, but it is unsafe until the exports wait: bakeDeckSections
            (docs/src/components/studio/export/deck-export.js ~721-796) builds a fresh capture frame
            and waits for load, fonts and diagrams, never for `[data-collage="measuring"]` or
            `[data-logo-wall="measuring"]`, so a slow fetch bakes the list hidden, and the webpage
            export strips the runtime, so it stays hidden. Collage ships that hole today.
where     — deck-export.js bakeDeckSections and createCaptureFrame; share-export.ts webpage bake;
            lib/components/inventory/logo-wall/logo-wall.styles.css (add the measuring hide back)
done when — the capture waits, capped at 4 s, until no list is measuring; a bake that still finds
            one normalizes it to the unpacked grid rather than hidden; the logo-wall hide returns
evidence  — an export of a deck with a collage and a logo wall, marks delayed, light and dark, sent
            for the owner's sign-off (an export change, QUALITY BAR); the revisit e2e still green
verify    — tier 1 checker, because it changes what every Studio export captures
