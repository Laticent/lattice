---
origin: 3023
priority: P2
recorded: 2026-11-04
area: website
severity: medium
swimlane: engineering/decisions/2026-11-04-switch-vocabulary.md
deferred: off-path — the owner asked for this in a separate PR (2026-11-04); PR #3023 changes the switch vocabulary, not the Studio's settings layout
source: https://github.com/Laticent/lattice/pull/3023
---

# Every switch has a toggle in the Studio's Deck Settings and Slide Settings, organized one way

why now   — PR #3023 made every on/off one table, `SWITCHES` in `lib/core/switches.mjs` (19 today: header, footer,
            pagination, progress, logo, note, period, row-label, spine, heading-rule, callout, motion, spectrum,
            spectrum-edge, spectrum-card, spectrum-trim, treatment, finish, backdrop), with one rule: `with-X` beats
            `no-X` beats `silent`. The Studio already shows some of them (the Chrome tab rows for header, footer,
            page number, section rail and logo in `docs/src/components/studio/SlideContext.tsx`, and the Motion tab),
            but nobody has checked that every switch has a control, at the deck level AND the slide level, grouped
            where an author would look for it. The owner asked to make sure they exist and are organized correctly.
where     — `docs/src/components/studio/SlideContext.tsx` (Slide Settings tabs: Chrome, Notes, Motion),
            `slide-variants.ts`, `slide-provenance.ts`, `motion-sheet.ts`, and the Deck Settings panel; the table
            itself is `lib/core/switches.mjs`.
done when — (1) an inventory lists, for each of the 19 switches, its Deck Settings control and its Slide Settings
            control, or why it has none (some are front-matter registers, e.g. `motion:`, `spectrum:`, `rule:`);
            (2) the owner has picked one grouping (for example Chrome: header, footer, page number, section rail,
            logo; Text: period, heading rule, note; Tables and panes: row label, spine; Color: spectrum family,
            finish, treatment, backdrop; Motion; Callouts) in one decision round; (3) every switch has its controls in
            that grouping, each reads the switch from `SWITCHES` (not a local list), and each shows what the slide
            actually does under the deck's setting and writes the right `no-X` or `with-X`, as the Chrome rows do
            today; (4) a test fails when a switch is added to `SWITCHES` without a Studio control or a stated reason.
verify    — Studio at 1440, 820 and 390 px (`tools/screenshot.js`): toggle each switch at the deck level, then
            override it on one slide, and check the preview and the written class match the engine's render.
