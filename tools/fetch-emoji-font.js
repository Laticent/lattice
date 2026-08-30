#!/usr/bin/env node
/**
 * Vendor Noto Color Emoji for the opt-in FULL-OFFLINE tier.
 *
 * The library self-hosts every TEXT face by default (zero network), but color
 * emoji is a ~23 MB font — too heavy to bundle for everyone, so by default emoji
 * fall back to the installed system emoji font. Air-gapped / locked-down
 * corporate environments that can't rely on a system emoji font run this ONCE
 * while still online to vendor the font into dist/fonts/noto-color-emoji.ttf;
 * dist/lattice-emoji.css (committed, shipped) then resolves it locally.
 *
 * The file is deliberately EXCLUDED from the npm tarball (package.json `files`),
 * so it never bloats a normal install — it is fetched on demand here.
 *
 *   node tools/fetch-emoji-font.js        # download into dist/fonts/
 *   node tools/fetch-emoji-font.js --check # verify presence (non-zero if absent)
 *
 * Resolves the current font URL from the Google Fonts CSS API (the src URL
 * carries a version hash), then downloads it. Network required.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DEST = path.join(ROOT, 'dist', 'fonts', 'noto-color-emoji.ttf');
const CSS_API = 'https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap';
// A LEGACY UA makes the API serve the single monolithic ~25 MB TrueType `.ttf`
// (full glyph coverage). A modern UA instead serves ~10 unicode-range-subsetted
// woff2 blocks — grabbing the first would vendor a tiny flag-only stub under a
// .ttf name, mismatching dist/lattice-emoji.css's format('truetype'). So we ask
// as a legacy client and get exactly the one face the CSS expects.
const UA = 'Mozilla/4.0';
// Plausibility floor: the real font is ~25 MB; anything under this is a stub /
// subset / error page, never the full face.
const MIN_BYTES = 5_000_000;
// TrueType sfnt magic: 0x00010000 ('\0\1\0\0') or 'true' / 'ttcf'.
const SFNT_MAGICS = new Set(['00010000', '74727565', '74746366']);

async function fetchRes(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res;
}

function looksLikeFullTtf(buf) {
  return buf.length >= MIN_BYTES && SFNT_MAGICS.has(buf.subarray(0, 4).toString('hex'));
}

async function main(argv) {
  if (argv.includes('--check')) {
    if (fs.existsSync(DEST) && looksLikeFullTtf(fs.readFileSync(DEST))) {
      process.stdout.write(`Noto Color Emoji present (${(fs.statSync(DEST).size / 1e6).toFixed(1)} MB) at dist/fonts/.\n`);
      return 0;
    }
    process.stderr.write('Noto Color Emoji not vendored (or a stub) — run `npm run fonts:emoji` (full-offline tier).\n');
    return 1;
  }

  process.stdout.write('Resolving Noto Color Emoji font URL from the Google Fonts API…\n');
  const css = await (await fetchRes(CSS_API)).text();
  const m = css.match(/src:\s*url\(([^)]+)\)/);
  if (!m) throw new Error(`could not find a font src URL in the CSS API response:\n${css}`);
  const fontUrl = m[1].replace(/['"]/g, '');
  if (!fontUrl.endsWith('.ttf')) {
    throw new Error(
      `expected a .ttf URL (the full TrueType face) but the API returned:\n  ${fontUrl}\n` +
        'The Google Fonts API may have changed its UA negotiation — check the legacy-UA path.',
    );
  }

  process.stdout.write(`Downloading ${fontUrl}\n`);
  const buf = Buffer.from(await (await fetchRes(fontUrl)).arrayBuffer());
  if (!looksLikeFullTtf(buf)) {
    throw new Error(
      `downloaded ${(buf.length / 1e6).toFixed(1)} MB but it is not a full TrueType font ` +
        `(expected ≥${MIN_BYTES / 1e6} MB with an sfnt magic). Refusing to vendor a stub.`,
    );
  }
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  fs.writeFileSync(DEST, buf);
  process.stdout.write(
    `Wrote dist/fonts/noto-color-emoji.ttf (${(buf.length / 1e6).toFixed(1)} MB). ` +
      'Link dist/lattice-emoji.css after lattice.css for full-offline color emoji.\n',
  );
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`fetch-emoji-font failed: ${err.message}\n`);
      process.exit(1);
    },
  );
}

module.exports = { DEST };
