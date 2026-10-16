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
where     — the CLI's `htmlDoc` scaffold in lattice.js against share-export.ts `buildSelfContainedDoc`; the font files each bundles; the provenance stamp.
done when — one deck at one epoch gives one SHA from the CLI and the Studio in Chromium, asserted by a test that renders from markdown in both hosts.
evidence  — the diff between the two `docHtml` for examples/html-player.md, shrinking to zero.
verify    — tier 1 checker; any byte change stops for the owner's export sign-off.
