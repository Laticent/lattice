/**
 * Canonical manifest of the engine's self-hosted TEXT faces — the single
 * source of truth that keeps every font surface in lockstep.
 *
 * One list, consumed three ways:
 *   1. dist/lattice.css       — tools/build-css.js emits an `@font-face` block
 *      from this manifest (each face → `url('fonts/<file>.woff2')`, resolved
 *      relative to the stylesheet) and copies the woff2 into dist/fonts/. This
 *      is what replaced the old Google-Fonts `@import`: the published library
 *      now loads type from its own bytes, zero network.
 *   2. lib/fonts/face-css.js  — the ONE `@font-face` builder over this list, used by
 *      the emulator (the PDF page's embedded block AND a standalone SVG's subset) and
 *      by the Mermaid render worker, which has to load these faces into its own page
 *      before Mermaid measures a diagram label (#1674).
 *   3. tools/check-fonts.js   — the parity gate validates that this manifest,
 *      the woff2 on disk (assets/fonts/ + dist/fonts/), the emulator supply,
 *      and the docs web-export supply all describe the same faces.
 *
 * The woff2 source-of-truth lives in assets/fonts/<file>.woff2 (latin subset,
 * pulled from the Google Fonts CSS API). The build copies them to dist/fonts/;
 * dist/ ships in the npm tarball, assets/ does not. To add a weight/family:
 * drop the woff2 in assets/fonts/, add a row here, and run `npm run build` —
 * the gate fails until both supplies carry it.
 *
 * Noto Color Emoji lives in lib/fonts/emoji-faces.js (11 unicode-range slices), not here.
 * See assets/fonts/README.md and engineering/decisions/2026-06-26-local-font-library.md.
 */

// Each face: { family, weight, style, file } where <file>.woff2 is the basename
// under assets/fonts/ and dist/fonts/. Order groups by family for readability;
// the gate compares as a set, so order is cosmetic.
const TEXT_FACES = [
  { family: 'Playfair Display', weight: 400, style: 'normal', file: 'playfair-400' },
  { family: 'Playfair Display', weight: 700, style: 'normal', file: 'playfair-700' },
  { family: 'Playfair Display', weight: 400, style: 'italic', file: 'playfair-italic-400' },
  { family: 'Playfair Display', weight: 700, style: 'italic', file: 'playfair-italic-700' },
  { family: 'Outfit', weight: 300, style: 'normal', file: 'outfit-300' },
  { family: 'Outfit', weight: 400, style: 'normal', file: 'outfit-400' },
  { family: 'Outfit', weight: 500, style: 'normal', file: 'outfit-500' },
  { family: 'Outfit', weight: 600, style: 'normal', file: 'outfit-600' },
  { family: 'Outfit', weight: 700, style: 'normal', file: 'outfit-700' },
  // The `typography:` sets' faces (lib/core/resolve-typography.js). `sizeAdjust` is the face's
  // @font-face `size-adjust`: it holds the x-height a reader sees when a set swaps Playfair Display /
  // Outfit for this face, WHEREVER the face is drawn (type-hierarchy-study §4 rule 5). Inter 0.55 →
  // 0.87 holds Outfit's 0.48; Newsreader stays 1 (wider at 700, a larger size wraps headings);
  // Fraunces 0.92 brings it back to Playfair's width; Barlow Condensed 1.1 is the poster step, paid for
  // by its narrow advance. The office exports read it off the loaded face (docs/src/lib/calco/reader.ts).
  // A deck that names no set never
  // uses them: the browser fetches a face only when a slide draws it, the CLI's HTML export inlines
  // only the deck's own sets' faces (lattice.js `DECK_FONT_FAMILIES`), and the Studio does not warm them.
  { family: 'Newsreader', weight: 400, style: 'normal', file: 'newsreader-400', ascent: 0.98, descent: 0.26 },
  { family: 'Newsreader', weight: 700, style: 'normal', file: 'newsreader-700', ascent: 0.98, descent: 0.26 },
  { family: 'Newsreader', weight: 400, style: 'italic', file: 'newsreader-italic-400', ascent: 0.98, descent: 0.26 },
  { family: 'Newsreader', weight: 700, style: 'italic', file: 'newsreader-italic-700', ascent: 0.98, descent: 0.26 },
  { family: 'Fraunces', weight: 400, style: 'normal', file: 'fraunces-400', sizeAdjust: 0.92 },
  { family: 'Fraunces', weight: 700, style: 'normal', file: 'fraunces-700', sizeAdjust: 0.92 },
  { family: 'Fraunces', weight: 400, style: 'italic', file: 'fraunces-italic-400', sizeAdjust: 0.92 },
  { family: 'Fraunces', weight: 700, style: 'italic', file: 'fraunces-italic-700', sizeAdjust: 0.92 },
  { family: 'Barlow Condensed', weight: 400, style: 'normal', file: 'barlow-condensed-400', sizeAdjust: 1.1 },
  { family: 'Barlow Condensed', weight: 600, style: 'normal', file: 'barlow-condensed-600', sizeAdjust: 1.1 },
  { family: 'Barlow Condensed', weight: 700, style: 'normal', file: 'barlow-condensed-700', sizeAdjust: 1.1 },
  { family: 'Barlow Condensed', weight: 400, style: 'italic', file: 'barlow-condensed-italic-400', sizeAdjust: 1.1 },
  { family: 'Barlow Condensed', weight: 700, style: 'italic', file: 'barlow-condensed-italic-700', sizeAdjust: 1.1 },
  { family: 'Inter', weight: 300, style: 'normal', file: 'inter-300', sizeAdjust: 0.87 },
  { family: 'Inter', weight: 400, style: 'normal', file: 'inter-400', sizeAdjust: 0.87 },
  { family: 'Inter', weight: 500, style: 'normal', file: 'inter-500', sizeAdjust: 0.87 },
  { family: 'Inter', weight: 600, style: 'normal', file: 'inter-600', sizeAdjust: 0.87 },
  { family: 'Inter', weight: 700, style: 'normal', file: 'inter-700', sizeAdjust: 0.87 },
  { family: 'JetBrains Mono', weight: 400, style: 'normal', file: 'jetbrains-400' },
  { family: 'JetBrains Mono', weight: 500, style: 'normal', file: 'jetbrains-500' },
  { family: 'JetBrains Mono', weight: 600, style: 'normal', file: 'jetbrains-600' },
  { family: 'Caveat', weight: 400, style: 'normal', file: 'caveat-400' },
  { family: 'Caveat', weight: 700, style: 'normal', file: 'caveat-700' },
  { family: 'Shantell Sans', weight: 400, style: 'normal', file: 'shantell-400' },
  { family: 'Shantell Sans', weight: 500, style: 'normal', file: 'shantell-500' },
  { family: 'Shantell Sans', weight: 700, style: 'normal', file: 'shantell-700' },
];

// Stable set key for parity comparisons — (family, weight, style).
const faceKey = (family, weight, style) => `${family} ${weight} ${style}`;

/**
 * The face's metric descriptors, or '' for a face drawn on its own metrics. A `typography:` set face
 * holds the default faces' measures so every layout tuned on Playfair Display and Outfit still fits:
 *   - `sizeAdjust` → `size-adjust`: the x-height (Inter 87% reads at Outfit's).
 *   - `ascent` / `descent` → `ascent-override` / `descent-override`: where the baseline sits in the line.
 *     Newsreader's own metrics (0.735 / 0.265 em) put its baseline 0.13 em higher than Outfit's or the
 *     mono's, and a row that aligns them on one baseline (list-tabular) grows by the difference.
 * Engine and theme CSS set every line-height, so a line in one face keeps its height; a line mixing faces on one
 * baseline is where the height changes. The PDF writer and Calco place baselines from these, not the file's.
 * face-rule.js inlines the same text (it requires nothing); test/unit/parsing/resolve-typography.test.js pins the two
 * together.
 */
const pct = (v) => `${Math.round(v * 1000) / 10}%`;
const faceMetricsDecl = (face) => {
  if (!face) return '';
  let css = '';
  if (face.sizeAdjust && face.sizeAdjust !== 1) css += `size-adjust:${pct(face.sizeAdjust)};`;
  if (face.ascent != null) css += `ascent-override:${pct(face.ascent)};`;
  if (face.descent != null) css += `descent-override:${pct(face.descent)};`;
  return css;
};

module.exports = { TEXT_FACES, faceKey, faceMetricsDecl };
