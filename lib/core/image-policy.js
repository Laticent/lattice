/**
 * lib/core/image-policy.js — what an export does to a deck's pictures, decided ONCE for every host.
 *
 * Before this, each export wrote a picture its own way. The PDF and the HTML player embedded the file
 * exactly as the author added it (a 2.5 MB PNG screenshot stayed a 2.5 MB PNG, and the player stored it
 * twice), while the PPTX and ODP wrote each slide as one picture and already chose JPEG for a photograph
 * (docs/src/lib/calco/picture.ts). The same deck came out at 66 MB as a player and 14 MB as a PPTX.
 *
 * The plan lives here and nowhere else: the PDF writer (lib/core/pdf-compose), the player assembler
 * (lib/export/player-core.mjs), the CLI and the Studio all call `planRecode` and `acceptRecode`. A host
 * supplies only the ENCODER (lib/core/image-recode.mjs), which is Chromium's canvas in both, so the same
 * file produces the same bytes on either.
 *
 * The author decides, in one `images:` line (front matter) or `--images` flag: `original` leaves every file
 * alone; a number from 1 to 100 sets the JPEG quality; `images: optimized 90` says both.
 *
 * A LEAF, deliberately: no `require` (the docs dev server serves a `lib/` CommonJS file to the browser
 * only when it requires nothing). Pure: bytes in, numbers out.
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

const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/**
 * Format, pixel size and (for a PNG) whether it MAY carry transparency, read from the header alone.
 * @param {Uint8Array} b
 * @returns {{ mime: 'image/png'|'image/jpeg', width: number, height: number, alpha: boolean } | null}  null for anything else (GIF, WebP, SVG, damaged)
 */
function readImageInfo(b) {
  if (!b || b.length < 24) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const colorType = b[25];
    let alpha = colorType === 4 || colorType === 6;
    // A palette or gray PNG carries transparency in a tRNS chunk, which sits before the first IDAT.
    for (let o = 8; !alpha && o + 8 < b.length; ) {
      const len = u32(b, o);
      const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
      if (type === 'tRNS') alpha = true;
      if (type === 'IDAT' || type === 'IEND') break;
      o += 12 + len;
    }
    return { mime: 'image/png', width: u32(b, 16), height: u32(b, 20), alpha };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let o = 2; o + 9 < b.length; ) {
      if (b[o] !== 0xff) return null;
      const marker = b[o + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        o += 2;
        continue;
      }
      const len = (b[o + 2] << 8) | b[o + 3];
      // SOF0..SOF15 except DHT (c4), JPG (c8) and DAC (cc) hold the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mime: 'image/jpeg', height: (b[o + 5] << 8) | b[o + 6], width: (b[o + 7] << 8) | b[o + 8], alpha: false };
      }
      o += 2 + len;
    }
  }
  return null;
}

/**
 * What to do with one picture. `null` keeps the file exactly as it is.
 * @param {{ mime: string, width: number, height: number, alpha: boolean } | null} info  from `readImageInfo`
 * @param {number} byteLength
 * @param {ReturnType<typeof resolveImagePolicy>} policy
 * @returns {{ width: number, height: number, quality: number, checkAlpha: boolean, formatChange: boolean } | null}
 */
function planRecode(info, byteLength, policy) {
  if (!info || policy.mode !== 'optimized' || byteLength < policy.minBytes) return null;
  if (!(info.width > 0 && info.height > 0)) return null;
  const long = Math.max(info.width, info.height);
  const scale = Math.min(1, policy.maxEdge / long);
  const width = Math.max(1, Math.round(info.width * scale));
  const height = Math.max(1, Math.round(info.height * scale));
  const resized = scale < 1;
  if (info.mime === 'image/jpeg' && !resized && byteLength / (info.width * info.height) <= policy.tightJpegBytesPerPx) return null;
  return { width, height, quality: policy.quality, checkAlpha: info.alpha, formatChange: info.mime !== 'image/jpeg' };
}

/** Whether the re-encoded bytes replace the original: smaller by the policy's share, otherwise the original stays. */
function acceptRecode(originalLength, recodedLength, plan, policy) {
  const share = plan.formatChange ? policy.formatShare : policy.sameFormatShare;
  return recodedLength > 0 && recodedLength < originalLength * share;
}

module.exports = { IMAGE_MODES, DEFAULTS, parseImagesSetting, resolveImagePolicy, readImageInfo, planRecode, acceptRecode };
