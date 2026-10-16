---
origin: 2739
priority: P1
recorded: 2026-10-16
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §11.1
source: https://github.com/Laticent/lattice/pull/2739
---

# Make the same deck give the same player bytes from the CLI and the Studio, end to end

why now   — #2739 put the PACKER at parity (same input, same bytes, asserted by test/integration/export/player-host-parity.test.js). The two hosts still render a deck to different `docHtml` (different engine bundle, the Studio's minified flat sheet, different font files), and the Studio stamps `build: 'studio'`, so the owner's acceptance test — same deck, same epoch, same SHA — holds only at the seam.
where     — measured in engineering/decisions/2026-10-16-player-as-library-audit.md §11.9, one row per gap: (1) the Studio's vendored woff2 copies in docs/src/playground/fonts/ differ from assets/fonts/ for Caveat 700, Outfit 400/700, Shantell 400/700 (this also changes the Studio preview); (2) the Studio fetches dist/lattice-min.css, the CLI reads dist/lattice.css (different minifier output, 2 rules apart); (3) the Studio injects six more texture pattern sets; (4) the Studio's bake serializes `style` through the browser and keeps the `--_sec-1cqi` stamps; (5) the deck record's `build` / `playerVersion` / `config`. The overflow-marker level, once a sixth row, was fixed in #2739 (§11.8).
done when — one deck at one epoch gives one SHA from the CLI and the Studio in Chromium, asserted by a test that renders from markdown in both hosts.
evidence  — the diff between the two `docHtml` for examples/html-player.md, shrinking to zero.
verify    — tier 1 checker; any byte change stops for the owner's export sign-off.
