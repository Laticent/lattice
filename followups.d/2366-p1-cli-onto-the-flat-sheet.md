---
origin: 2366
priority: P1
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2366
---

# Move the CLI export onto the engine's flat sheet (one-style-delivery-spine §8 step 4)

why now   — the last step of the spine: the CLI is the one surface whose CSS the engine does not
            produce, so the two HTML players are still not byte-comparable. The owner picked
            "now" (fork 3) and asked for the one blocker to be fixed first; #2366 shipped that fix.
where     — lattice-emulator.js (`css = layoutCSS + paletteCSS`, ~line 1176 and the deck
            `<style>` ~3056); tools/palette-sweep.js + lib/core/export-shell-marks.js (the sweep
            splices the palette byte range, and the flat pack strips the `/* @theme` banner);
            test/integration/export/palette-cascade-order.test.js; the player prune's one-colon
            `:before` fix (`legacyPseudoElements`, opt-in since #2366).
done when — the CLI's deck sheet is `themes.cssFor(theme, size, { flat: true })` (wrapper stripped,
            covered faces dropped), palette-sweep re-themes by swapping the whole composed sheet,
            the player prune opts into `legacyPseudoElements`, and the owner has signed off dark and
            light exports.
evidence  — engineering/decisions/2026-09-24-one-style-delivery-spine.md §8.2: a flag-gated
            prototype (.scratch patch, not committed) rendered all 277 committed decks; after the
            #2366 spectrum fix exactly ONE slide changes — print-mode's page number moves to the
            print ink, which is the correct value (the CLI is wrong today).
verify    — `npm run regress` flag-on vs flag-off (only print-mode may differ), palette-sweep.test.js
            and palette-cascade-order.test.js green, and dark + light CLI exports of a
            representative deck sent for export sign-off (Quality Bar).
