---
origin: 2728
priority: P1
recorded: 2026-10-16
area: engine
severity: high
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md
source: https://github.com/Laticent/lattice/pull/2728
---

# Make the CLI and the Studio export the same player bytes for the same deck

The owner ruled this the assembler's first step (§7, §10 of the note): host parity before any producer-neutral contract, because host divergence is the measured pain.

why now — the CLI and the Studio already make different files from one deck. The Studio never subsets fonts (`share-export.ts:377`), and the prune orchestration (view cycling, font-usage pass, computed-style gate) is written twice by hand (`lattice.js` `prunePlayerCssInPage` and `docs/src/components/studio/player-prune-browser.ts`). That is HARD RULE #1 debt with or without a library.
where — collapse the two orchestrations into one kernel in `lib/export/player-prune.js` with injected page capabilities. Lift the tail of `assemblePlayer` (CSP builder, `subsetFonts`, `hoistRepeatedAssets`) into one assembler function that takes `{ html, scriptHashes, media }`. Give the prune `{ safelist, skipStyleIds }` options that default to today's constants. Add the new folder to `DOC_STYLE_SINK_ROOTS` if the code moves.
done when — the same deck at the same epoch gives the same SHA from the CLI and the Studio, in Chromium. A test asserts it.
evidence — first bless a second golden on today's code, from a fixture that fires every stage (a real small font, two repeated pictures, an unused rule). Then compare a gallery export's SHA before and after the move. The existing golden reaches none of those stages (checker, §10).
verify — maker-checker at least (export pipeline, two hosts). Any byte change stops for the owner's export sign-off.
