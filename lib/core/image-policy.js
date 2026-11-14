/**
 * lib/core/image-policy.js — what an export does to a deck's pictures, in Lattice's words, decided ONCE for every host.
 *
 * Before this, each export wrote a picture its own way. The PDF and the HTML player embedded the file
 * exactly as the author added it (a 2.5 MB PNG screenshot stayed a 2.5 MB PNG, and the player stored it
 * twice), while the PPTX and ODP wrote each slide as one picture and already chose JPEG for a photograph
 * (docs/src/lib/calco/picture.ts). The same deck came out at 66 MB as a player and 14 MB as a PPTX.
 *
 * The author decides, in one `images:` line (front matter) or `--images` flag: `original` leaves every file
 * alone; a number from 1 to 100 sets the JPEG quality; `images: optimized 90` says both. This file turns those
 * words into numbers (`resolveImagePolicy`), and the numbers ARE the thresholds the image library's `planRecode`
 * and `acceptRecode` take (`@laticent/lastra`, docs/src/lib/lastra/decide.ts). The one place that applies them is
 * lib/core/image-recode.mjs, which the PDF writer (lib/core/pdf-compose), the player assembler
 * (lib/export/player-images.mjs), the CLI and the Studio all go through.
 *
 * A LEAF, deliberately, and it needs nothing else: words in, numbers out. The docs dev server serves a `lib/`
 * CommonJS file to the browser only when it requires nothing (docs/src/plugins/vite-cjs-lib-dev.mjs), and the
 * Studio's export panels read these words in the page. The header reading and the decision live in lastra, which
 * the ES modules import directly, so this file no longer carries a copy of an EXIF parser to stay a leaf.
 */

const IMAGE_MODES = Object.freeze(['optimized', 'original']);

const DEFAULTS = Object.freeze({
  mode: 'optimized',
  /** Long edge, in pixels. A slide shows at most 1920 px wide, so 2560 keeps a 1.33x margin for zoom and print. */
  maxEdge: 2560,
  /** JPEG quality, 1 to 100, for every picture an export writes: source photos AND slide pictures (PPTX, ODP). Measured on 21 photos: 90 costs 10% more than 88 for about 1 dB, and keeps the worst photo above 38 dB. */
  quality: 90,
  /** A file under this is not worth a re-encode: the saving is smaller than the slide-to-slide noise. */
  minBytes: 150 * 1024,
  /** A format change (PNG to JPEG) must come in under this share of the original: lossy only for a real win. Same share as slide pictures. */
  formatShare: 0.7,
  /** A resize or re-encode that keeps the format must come in under this share. */
  sameFormatShare: 0.9,
  /** A JPEG already at or under this many bytes per pixel, at a size we would not shrink, is already tight. */
  tightJpegBytesPerPx: 0.5,
});

/**
 * Read the `images:` value, one line of words like the other multi-word registers (`image-card: 85% sm compact`):
 * a mode word and/or a JPEG quality, in any order. `images: original`, `images: 90`, `images: optimized 90`.
 * @param {unknown} value  the front-matter text, a flag's value, or already `{ mode, quality }`
 * @returns {{ mode: string, quality: string, unknown: string[] }}  `mode` and `quality` are '' when not written; `unknown` holds words that are neither
 */
function parseImagesSetting(value) {
  if (value && typeof value === 'object') return { mode: String(value.mode ?? '').trim().toLowerCase(), quality: String(value.quality ?? '').trim(), unknown: [] };
  const out = { mode: '', quality: '', unknown: [] };
  for (const word of String(value ?? '').split(/[\s,]+/).filter(Boolean)) {
    const w = word.toLowerCase();
    if (IMAGE_MODES.includes(w)) out.mode = w;
    else if (/^\d{1,3}$/.test(w) && Number(w) >= 1 && Number(w) <= 100) out.quality = w;
    else out.unknown.push(word);
  }
  return out;
}

/**
 * A flag's words over the deck's line, word by word: `--images 90` keeps the deck's `original`; `--images original` keeps its quality.
 * The Studio's export panel merges the same way, so a deck and a choice read alike in both hosts.
 * @param {unknown} deck  the deck's `images:` value
 * @param {unknown} over  the flag's (or the panel's) value
 */
function mergeImagesSettings(deck, over) {
  const d = parseImagesSetting(deck);
  const o = parseImagesSetting(over);
  return { mode: o.mode || d.mode, quality: o.quality || d.quality, unknown: [...d.unknown, ...o.unknown] };
}

/**
 * @param {unknown} [setting]  the `images:` value, a flag's value, or `{ mode, quality }` (see `parseImagesSetting`)
 * @returns {{ mode: 'optimized'|'original', quality: number, maxEdge: number, minBytes: number, formatShare: number, sameFormatShare: number, tightJpegBytesPerPx: number }}
 */
function resolveImagePolicy(setting = {}) {
  const parsed = parseImagesSetting(setting);
  const mode = IMAGE_MODES.includes(parsed.mode) ? parsed.mode : DEFAULTS.mode;
  const q = Number.parseInt(parsed.quality, 10);
  const quality = Number.isFinite(q) ? Math.min(100, Math.max(1, q)) : DEFAULTS.quality;
  return { ...DEFAULTS, mode, quality };
}

module.exports = { IMAGE_MODES, DEFAULTS, parseImagesSetting, mergeImagesSettings, resolveImagePolicy };
