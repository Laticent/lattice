/**
 * Node-side font embedding for the standalone chart-SVG export (CLI surface).
 *
 * The browser surface (Drawing Board) reuses docs/src/playground/font-embed.js,
 * which imports the vendored woff2 through Vite. The CLI runs in Node, so it
 * reads the SAME vendored faces from disk and base64-inlines them into a
 * `@font-face` stylesheet. The two MUST stay in sync — same families, same
 * files — so this manifest mirrors font-embed.js's FACES exactly (Noto Color
 * Emoji excluded, as there). If the engine's font set changes, update both.
 *
 * `buildChartFontFaceCss(families)` subsets to only the families a given chart
 * uses (from standalone-svg.js `collectFontFamilies`), keeping the export small.
 */

const fs = require('fs');
const path = require('path');

const { TEXT_FACES, faceKey, faceMetricsDecl } = require('../../lib/fonts/text-faces.js');

const FONT_DIR = path.join(__dirname, '..', '..', 'docs', 'src', 'playground', 'fonts');

// One entry per engine face — mirrors docs/src/playground/font-embed.js FACES,
// by on-disk filename rather than Vite import.
const FACES = [
  { family: 'Playfair Display', weight: 400, style: 'normal', file: 'playfair-display-400.woff2' },
  { family: 'Playfair Display', weight: 400, style: 'italic', file: 'playfair-display-400-italic.woff2' },
  { family: 'Playfair Display', weight: 700, style: 'normal', file: 'playfair-display-700.woff2' },
  { family: 'Playfair Display', weight: 700, style: 'italic', file: 'playfair-display-700-italic.woff2' },
  { family: 'Outfit', weight: 300, style: 'normal', file: 'outfit-300.woff2' },
  { family: 'Outfit', weight: 400, style: 'normal', file: 'outfit-400.woff2' },
  { family: 'Outfit', weight: 500, style: 'normal', file: 'outfit-500.woff2' },
  { family: 'Outfit', weight: 600, style: 'normal', file: 'outfit-600.woff2' },
  { family: 'Outfit', weight: 700, style: 'normal', file: 'outfit-700.woff2' },
  { family: 'JetBrains Mono', weight: 400, style: 'normal', file: 'jetbrains-mono-400.woff2' },
  { family: 'JetBrains Mono', weight: 500, style: 'normal', file: 'jetbrains-mono-500.woff2' },
  { family: 'JetBrains Mono', weight: 600, style: 'normal', file: 'jetbrains-mono-600.woff2' },
  { family: 'Caveat', weight: 400, style: 'normal', file: 'caveat-400.woff2' },
  { family: 'Caveat', weight: 700, style: 'normal', file: 'caveat-700.woff2' },
  { family: 'Shantell Sans', weight: 400, style: 'normal', file: 'shantell-sans-400.woff2' },
  { family: 'Shantell Sans', weight: 500, style: 'normal', file: 'shantell-sans-500.woff2' },
  { family: 'Shantell Sans', weight: 700, style: 'normal', file: 'shantell-sans-700.woff2' },
  // The `typography:` set faces (lib/core/resolve-typography.js). Their `size-adjust` comes from the one
  // manifest, lib/fonts/text-faces.js, so a chart in Inter draws at the size the slide drew it.
  { family: 'Newsreader', weight: 400, style: 'normal', file: 'newsreader-400.woff2' },
  { family: 'Newsreader', weight: 700, style: 'normal', file: 'newsreader-700.woff2' },
  { family: 'Newsreader', weight: 400, style: 'italic', file: 'newsreader-400-italic.woff2' },
  { family: 'Newsreader', weight: 700, style: 'italic', file: 'newsreader-700-italic.woff2' },
  { family: 'Fraunces', weight: 400, style: 'normal', file: 'fraunces-400.woff2' },
  { family: 'Fraunces', weight: 700, style: 'normal', file: 'fraunces-700.woff2' },
  { family: 'Fraunces', weight: 400, style: 'italic', file: 'fraunces-400-italic.woff2' },
  { family: 'Fraunces', weight: 700, style: 'italic', file: 'fraunces-700-italic.woff2' },
  { family: 'Barlow Condensed', weight: 400, style: 'normal', file: 'barlow-condensed-400.woff2' },
  { family: 'Barlow Condensed', weight: 600, style: 'normal', file: 'barlow-condensed-600.woff2' },
  { family: 'Barlow Condensed', weight: 700, style: 'normal', file: 'barlow-condensed-700.woff2' },
  { family: 'Barlow Condensed', weight: 400, style: 'italic', file: 'barlow-condensed-400-italic.woff2' },
  { family: 'Barlow Condensed', weight: 700, style: 'italic', file: 'barlow-condensed-700-italic.woff2' },
  { family: 'Inter', weight: 300, style: 'normal', file: 'inter-300.woff2' },
  { family: 'Inter', weight: 400, style: 'normal', file: 'inter-400.woff2' },
  { family: 'Inter', weight: 500, style: 'normal', file: 'inter-500.woff2' },
  { family: 'Inter', weight: 600, style: 'normal', file: 'inter-600.woff2' },
  { family: 'Inter', weight: 700, style: 'normal', file: 'inter-700.woff2' },
];

const MANIFEST_FACE = new Map(TEXT_FACES.map((f) => [faceKey(f.family, f.weight, f.style), f]));

function faceDataUri(file) {
  const buf = fs.readFileSync(path.join(FONT_DIR, file));
  return `data:font/woff2;base64,${buf.toString('base64')}`;
}

function faceRule(face, src) {
  return (
    '@font-face{' +
    `font-family:'${face.family}';` +
    `font-style:${face.style};` +
    `font-weight:${face.weight};` +
    'font-display:swap;' +
    faceMetricsDecl(MANIFEST_FACE.get(faceKey(face.family, face.weight, face.style))) +
    `src:url(${src}) format('woff2')` +
    '}'
  );
}

/**
 * Build a data-URI `@font-face` stylesheet for the given families. With no
 * `families` arg, embeds every face. Pass the chart's used families (lower-case
 * insensitive) to subset — a pie key uses only the label sans + mono, so its
 * export carries 2–3 faces, not 17.
 *
 * @param {string[]} [families] - family names to include (case-insensitive)
 * @returns {string} concatenated @font-face rules
 */
function buildChartFontFaceCss(families) {
  let faces = FACES;
  if (Array.isArray(families) && families.length) {
    const want = new Set(families.map((f) => String(f).toLowerCase()));
    faces = FACES.filter((f) => want.has(f.family.toLowerCase()));
  }
  return faces.map((f) => faceRule(f, faceDataUri(f.file))).join('\n');
}

module.exports = { FACES, FONT_DIR, buildChartFontFaceCss };
