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
 * Noto Color Emoji is deliberately NOT here: at ~23 MB it is impractical to
 * bundle by default, so color emoji falls back to the installed system emoji
 * font (every stack lists Apple/Segoe/Noto). The opt-in "full" offline tier
 * (`npm run fonts:emoji`) vendors it for air-gapped environments. See
 * assets/fonts/README.md and engineering/decisions/2026-06-26-local-font-library.md.
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

module.exports = { TEXT_FACES, faceKey };
