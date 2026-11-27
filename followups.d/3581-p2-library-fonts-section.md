---
origin: 3581
priority: P2
recorded: 2026-11-27
area: website
severity: low
swimlane: docs/src/components/studio/Library.tsx
deferred: blocked — no font store exists (design §2.1 of 2026-11-22-local-first-drive-storage.md), and the owner picks the shape at slice 4's card
source: https://github.com/Laticent/lattice/issues/3581
---
# The Studio Library's Fonts section

why now   — Design §7 lists seven Library sections; slice 4 (#3581) shipped six. Fonts has no store at all: §2.1 finds no
            user font files today, so a Fonts pill would be a section that is always empty with no way to add anything.
            The storage desk put three options to the owner at slice 4's 🚦 card: (1) hide Fonts until a font store
            exists (recommended), (2) an empty state that points to the deck's font embedding, (3) add a font store.
where     — docs/src/components/studio/panel-shells.tsx `LIBRARY_SECTIONS` / `LIBRARY_OVERFLOW`; Library.tsx; a new font
            store beside the vault (slice 2's `studioVault()`), never asset-store.js directly.
done when — the owner's pick ships: under (1) this note closes when a font store lands and adds the pill; under (3) a
            font a deck can embed imports through the Library's one Import button and lists under Fonts.
evidence  — e2e on chromium, webkit-phone and gecko; tools/screenshot.js at 1440, 820 and 390. Seven icon pills must
            still fit one row at 320px (library-sections.spec.ts); today six use 246 of 250px, so a seventh folds.
verify    — library-sections.spec.ts and the #34 arms.
