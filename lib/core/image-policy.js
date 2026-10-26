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

/** A JPEG's EXIF Orientation tag, 1 to 8 (1 when there is none). The frame header stores the pixels UNROTATED; a browser decodes them rotated. */
function exifOrientation(b) {
  let o = 2;
  while (o + 4 < b.length && b[o] === 0xff) {
    const marker = b[o + 1];
    const len = (b[o + 2] << 8) | b[o + 3];
    if (marker === 0xe1 && b[o + 4] === 0x45 && b[o + 5] === 0x78 && b[o + 6] === 0x69 && b[o + 7] === 0x66) {
      const t = o + 10; // TIFF header
      const little = b[t] === 0x49;
      const u16 = (p) => (little ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]);
      const u32le = (p) => (little ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0 : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0);
      const ifd = t + u32le(t + 4);
      const n = u16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (u16(e) === 0x0112) return u16(e + 8) || 1;
      }
      return 1;
    }
    if (marker === 0xda || marker === 0xd9) break;
    o += 2 + len;
  }
  return 1;
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

const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/**
 * Format, pixel size and (for a PNG) whether it MAY carry transparency, read from the header alone.
 * @param {Uint8Array} b
 * @returns {{ mime: 'image/png'|'image/jpeg', width: number, height: number, alpha: boolean, orientation: number } | null}  null for anything else (GIF, WebP, SVG, damaged); `orientation` is the JPEG's EXIF Orientation (1 when absent)
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
    return { mime: 'image/png', width: u32(b, 16), height: u32(b, 20), alpha, orientation: 1 };
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
        return { mime: 'image/jpeg', height: (b[o + 5] << 8) | b[o + 6], width: (b[o + 7] << 8) | b[o + 8], alpha: false, orientation: exifOrientation(b) };
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
  // A rotated JPEG (a phone's portrait) is left as it is: its pixels are stored sideways, the encoder would squeeze the upright bitmap into the sideways box, and the PDF writer already keeps such a picture in the photo.
  if (info.orientation > 1) return null;
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

/**
 * The sizes rule for a picture an Office export writes (a whole slide, or a photograph cropped out of one): a flat picture is a lossless PNG, a
 * photograph is a JPEG when that is much smaller. Measured on a 35-slide deck of mostly photographs (2026-10-21): 76.6 MB as PNG, 15.1 MB choosing
 * per slide, and every one of the 35 was smaller as JPEG. Calco (the Office writer) is told these numbers and the policy; it holds none.
 */
const PICTURE = Object.freeze({
  /** A PNG at or under this many bytes is a flat picture: keep it, lossless, with no JPEG tried. */
  flatBytes: 600 * 1024,
  /** A JPEG must be under this share of its PNG to win; a marginal saving is not worth a lossy picture. */
  share: 0.7,
  /** A continuous-tone picture's JPEG at or over this many bytes is kept without ever taking the PNG (the smallest photo or wash in the deck was 158 KB). */
  toneBytes: 100 * 1024,
});

/**
 * ONE slide picture, chosen the same way by the command line and the Studio. The host supplies how to take each shot and how big one is.
 * `tone` is whether the slide is continuous tone (a host asks Calco's `isContinuousTone`); `opaque` is false for a picture with transparency, which a
 * JPEG would paint black. The ORDER of the shots is the cost: a continuous-tone slide is a JPEG first, and the PNG is never taken when the JPEG is large;
 * any other slide is a PNG first.
 * @template T
 * @param {{ png: () => Promise<T>, jpeg: (quality: number) => Promise<T | null>, size: (picture: T) => number }} shooter  `jpeg` takes a quality from 1 to 100 and may return null when the host cannot encode one
 * @param {{ tone: boolean, opaque?: boolean }} slide
 * @param {unknown} [setting]  the `images:` value, a flag's value, or `{ mode, quality }`
 * @returns {Promise<T>}
 */
async function choosePicture(shooter, { tone, opaque = true }, setting = {}) {
  const policy = resolveImagePolicy(setting);
  if (!opaque || policy.mode === 'original') return shooter.png();
  const size = shooter.size;
  if (tone) {
    const jpeg = await shooter.jpeg(policy.quality);
    if (jpeg && size(jpeg) >= PICTURE.toneBytes) return jpeg;
    // A small JPEG: not much continuous tone after all, so let the sizes decide.
    const png = await shooter.png();
    return jpeg && size(png) > PICTURE.flatBytes && size(jpeg) < size(png) * PICTURE.share ? jpeg : png;
  }
  const png = await shooter.png();
  if (size(png) <= PICTURE.flatBytes) return png;
  const jpeg = await shooter.jpeg(policy.quality);
  return jpeg && size(jpeg) < size(png) * PICTURE.share ? jpeg : png;
}

/**
 * What Calco is told for the pictures it crops out of a slide (a photo, an icon): lossless under `images: original`, else a JPEG when it wins, by this
 * policy's quality (0 to 1, a canvas's scale) and the sizes rule above.
 * @param {unknown} [setting]  see `choosePicture`
 * @returns {{ lossless: boolean, quality: number, toneBytes: number, flatBytes: number, share: number }}
 */
function cropRules(setting = {}) {
  const policy = resolveImagePolicy(setting);
  return { lossless: policy.mode === 'original', quality: policy.quality / 100, toneBytes: PICTURE.toneBytes, flatBytes: PICTURE.flatBytes, share: PICTURE.share };
}

module.exports = { IMAGE_MODES, DEFAULTS, PICTURE, parseImagesSetting, mergeImagesSettings, resolveImagePolicy, readImageInfo, planRecode, acceptRecode, choosePicture, cropRules };
