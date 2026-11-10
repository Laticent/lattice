/**
 * text-measure.js — how wide a chart label paints, from the face it paints in.
 *
 * WHY. A chart lays its pieces out around its text (an axis band as tall as its names, a key as wide as its
 * labels), so a width estimate that is wrong by a third moves every piece by a third. The flat estimate the
 * family used (0.6 em a character, 0.52 on the phone ladder) missed the real width by -49% to +55% over the
 * 2,638 label runs of the 28 chart galleries; a per-glyph table read off the shipped woff2s misses by 0% at the
 * median and +2% at p95 (engineering/decisions/2026-11-10-chart-form.md § 8, the bake-off).
 *
 * THE TABLE (./text-advance.generated.js) holds each glyph's advance in thousandths of an em, measured in
 * Chromium with lining tabular figures, the numerals every chart label prints with. Kerning is ignored (it
 * moves a word by under 2%), and so is any ligature. A character the table does not hold bills at a wide
 * default: a CJK ideograph at its full em, anything else at the face's widest glyph, so an unknown script wraps
 * early rather than overrunning its box.
 *
 * THE BAKE-OFF SWITCH. `LATTICE_CHART_MEASURE` picks the estimator while the owner decides: `table` (the
 * default), `flat` (the ladder's 0.52); the third, widths measured in Chromium for exactly these strings (the
 * stand-in for a measuring layout pass), is installed by the bake-off harness through `setWidthOverride`.
 *
 * Pure: no DOM. The env read is guarded so a browser bundle sees `table`.
 */

const { CHARS, FACES } = require('./text-advance.generated');

const INDEX = new Map([...CHARS].map((ch, i) => [ch, i]));
const WIDEST = Object.fromEntries(Object.entries(FACES).map(([k, row]) => [k, Math.max(...row) / 1000]));

// The weights the table holds per face; a weight between two bills at the heavier (the wider) one.
const WEIGHTS = { clean: [400, 500, 600, 700], hand: [400, 500, 700] };
function faceRow(face, weight) {
  const ws = WEIGHTS[face] || WEIGHTS.clean;
  const w = ws.find((x) => x >= weight) ?? ws[ws.length - 1];
  return `${WEIGHTS[face] ? face : 'clean'}-${w}`;
}

const env = typeof process !== 'undefined' && process.env ? process.env : {};
const MODE = String(env.LATTICE_CHART_MEASURE || 'table');
// The bake-off's third candidate, widths measured in Chromium, reaches here only through this hook, set by a harness
// preloaded into the CLI (never by the shipped code): `(row, text) => em width | null`.
let override = null;
/** Install (or clear, with null) a measured-width source; for the measurement bake-off only. */
function setWidthOverride(fn) { override = typeof fn === 'function' ? fn : null; }

const isCjk = (cp) => (cp >= 0x3040 && cp <= 0x30ff) || (cp >= 0x3400 && cp <= 0x9fff) || (cp >= 0xac00 && cp <= 0xd7af) ||
  (cp >= 0xff00 && cp <= 0xffef);

/** The table's width of `text` in ems, before tracking. */
function tableEm(text, row) {
  const adv = FACES[row];
  const widest = WIDEST[row];
  let em = 0;
  for (const ch of text) {
    const i = INDEX.get(ch);
    if (i !== undefined) { em += adv[i] / 1000; continue; }
    em += isCjk(ch.codePointAt(0)) ? 1 : widest;
  }
  return em;
}

/**
 * The painted width of `text` at `fontSize`, in the same units as `fontSize`.
 * @param {string} text
 * @param {number} fontSize
 * @param {object} [o]
 * @param {number} [o.weight=600]   the CSS weight; the table holds 400 to 700
 * @param {'clean'|'hand'} [o.face='clean']   the body face (Outfit) or the sketch hand (Shantell Sans)
 * @param {number} [o.tracking=0]   letter-spacing in em, added per character
 * @param {boolean} [o.upper=false] painted with `text-transform: uppercase`
 */
function textWidth(text, fontSize, { weight = 600, face = 'clean', tracking = 0, upper = false } = {}) {
  let s = String(text == null ? '' : text);
  if (upper) s = s.toUpperCase();
  if (!s) return 0;
  const n = [...s].length;
  if (MODE === 'flat') return (n * 0.52 + n * tracking) * fontSize;
  const row = faceRow(face, weight);
  if (override) {
    const em = override(row, s);
    if (em != null) return (em + n * tracking) * fontSize;
  }
  return (tableEm(s, row) + n * tracking) * fontSize;
}

/**
 * Break `text` into lines no wider than `width`, at spaces only. A word is never broken: a word wider than
 * `width` sits alone on its line and the result says so (`fits: false`), so the caller can give the piece more
 * room or take its next form instead of cutting a name mid-word.
 * @returns {{ lines: string[], widest: number, fits: boolean }}
 */
function wrapWords(text, width, fontSize, opts) {
  const words = String(text == null ? '' : text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  let fits = true;
  let widest = 0;
  const space = textWidth(' ', fontSize, opts);
  let curW = 0;
  for (const w of words) {
    const ww = textWidth(w, fontSize, opts);
    if (ww > width) fits = false;
    if (cur && curW + space + ww <= width) { cur += ` ${w}`; curW += space + ww; continue; }
    if (cur) { lines.push(cur); widest = Math.max(widest, curW); }
    cur = w; curW = ww;
  }
  if (cur) { lines.push(cur); widest = Math.max(widest, curW); }
  return { lines, widest, fits };
}

/** The widest single word of `text`: the narrowest box that can hold it without a mid-word break. */
function widestWord(text, fontSize, opts) {
  return String(text == null ? '' : text).trim().split(/\s+/).reduce((m, w) => Math.max(m, textWidth(w, fontSize, opts)), 0);
}

module.exports = { textWidth, wrapWords, widestWord, setWidthOverride, MEASURE_MODE: MODE };
