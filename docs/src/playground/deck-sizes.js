// The deck "Slide size" picker options — the curated subset of the engine's
// `@size` registry (lib/_theme.css) surfaced in the deck-config drawer, with
// human labels. Kept as data (not inlined in deck-config.js) so a unit test can
// assert every value here is a real registered `@size` AND that the social/mobile
// sizes are present — the drift guard that this list missed when #399 added the
// portrait formats (the engine had them; this picker did not).
//
// Aliases (16:9 / 9:16 / 4:5 / 1:1 / HD / 4k) are intentionally omitted — a picker
// wants one entry per format, by its semantic name. Labels are geometry only
// (name · aspect · dimensions): Lattice describes formats by shape, never by
// platform/brand — those date fast and aren't ours to borrow.
//
// test/unit/playground/deck-sizes.test.js guards this against lib/_theme.css.

// Value = the memorable name written to the markdown (`size: story`); label =
// name · resolution (ratio) for the picker. Markdown stays human-readable; the
// UI carries the extra detail.
export const SIZE_OPTIONS = [
  // Landscape (screen)
  ['hd', 'HD · 1280×720 (16:9, default)'],
  ['4K', '4K · 3840×2160 (16:9)'],
  ['standard', 'Standard · 960×720 (4:3)'],
  ['mobile-landscape', 'Mobile landscape · 1560×720 (19.5:9)'],
  // Portrait / square (social & mobile — #399)
  ['square', 'Square · 1080×1080 (1:1)'],
  ['portrait', 'Portrait · 1080×1350 (4:5)'],
  ['story', 'Story · 1080×1920 (9:16)'],
  ['mobile', 'Mobile · 1080×2340 (9:19.5)'],
];
