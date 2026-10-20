/**
 * lib/core/card-ink — which ink a thin photo card needs, decided from the photo.
 *
 * A spotlight card is a panel of the theme's background over a full-bleed photo, with the
 * theme's own ink on it. At full opacity that is the theme's own contrast. As the backing
 * thins, the photo shows through and the theme's ink is judged against the PHOTO, which no
 * theme can promise anything about. `ink-light` (white words on a near-black card) and
 * `ink-dark` (near-black words on a near-white card) swap the card's fill and its ink
 * together, so either one restores a contrast floor; this module picks the better of the two
 * for the pixels behind the card.
 *
 * Pure and DOM-free (HARD RULE #1), so three callers share it: the linter, which only asks
 * whether a thin card has an ink at all (`needsInk`); the Studio, which samples the photo and
 * asks which ink (`pickCardInk`); and the unit tests, which pin the arithmetic. It is an .mjs
 * because the Studio imports it directly and lint-core can `require` it, the way it already
 * does `meta-record.mjs`. The contrast arithmetic is WCAG 2 relative luminance, the same
 * formula as `contrastRatio` in lib/theme/color.js; a test pins the two together, because
 * that file is CommonJS and the Studio cannot import it (engineering/science.md).
 *
 * The constants below restate the fills and inks image.styles.css paints for `ink-light` and
 * `ink-dark`. A test reads that stylesheet and fails if they drift.
 */

/** A spotlight card thinner than this (percent opaque) needs an explicit ink. */
export const THIN_BACKING = 60;

/** The card's fill under each ink (`--_card-fill`) and the heading ink on it. */
export const INK_FILL = Object.freeze({ light: [12, 18, 28], dark: [250, 249, 246] });
export const INK_TEXT = Object.freeze({ light: [255, 255, 255], dark: [14, 18, 26] });

const NAMED_BACKING = Object.freeze({ 'card-solid': 100, 'card-soft': 80, 'card-sheer': 55, 'card-clear': 0 });
const LEVEL_CLASS = /^card-o(\d{1,2})$/;
const INK_CLASSES = ['ink-light', 'ink-dark'];

/** The card's opacity, in percent, that a class list sets; `null` when it sets none. The last word wins. */
export function backingPercent(classes) {
  let found = null;
  for (const c of classes || []) {
    if (Object.hasOwn(NAMED_BACKING, c)) found = NAMED_BACKING[c];
    else {
      const m = LEVEL_CLASS.exec(c);
      if (m) found = Number(m[1]);
    }
  }
  return found;
}

/** `light` or `dark` when a class list names an ink; `null` when it does not. */
export function inkOf(classes) {
  let found = null;
  for (const c of classes || []) if (INK_CLASSES.includes(c)) found = c.slice('ink-'.length);
  return found;
}

/**
 * The card a slide ends up with: its own class on an axis wins, then the deck's `image-card:`
 * words (as the classes they stamp), then the layout's default (a solid card, no ink).
 */
export function effectiveCard(slideClasses, deckClasses = []) {
  const backing = backingPercent(slideClasses) ?? backingPercent(deckClasses) ?? 100;
  const ink = inkOf(slideClasses) ?? inkOf(deckClasses);
  return { backing, ink };
}

/**
 * Whether a slide has a thin spotlight card and no ink to read it by. Only a spotlight card
 * qualifies: a statement's ink is fixed white on a dark scrim, so thinning it never leaves the
 * theme's ink on a photo. The composition is the one the slide NAMES; the linter cannot see the
 * one the engine resolves from the photo's shape, but the Studio can and passes it in.
 */
export function needsInk(slideClasses, deckClasses = [], composition) {
  const named = composition ?? ((slideClasses || []).includes('spotlight') || (slideClasses || []).includes('full') ? 'spotlight' : null);
  if (named !== 'spotlight') return false;
  const { backing, ink } = effectiveCard(slideClasses, deckClasses);
  return ink === null && backing < THIN_BACKING;
}

const toLinear = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v) => {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * 255);
};

/** WCAG 2 relative luminance of an sRGB triple (0–255). */
export function luminance([r, g, b]) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2 contrast ratio of two sRGB triples. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The mean colour of RGBA pixels (a canvas's `data`), averaged in linear light. */
export function meanRgb(rgba) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    r += toLinear(rgba[i]);
    g += toLinear(rgba[i + 1]);
    b += toLinear(rgba[i + 2]);
    n += 1;
  }
  return n ? [fromLinear(r / n), fromLinear(g / n), fromLinear(b / n)] : null;
}

/**
 * Which ink reads better on a card `percent` opaque over a photo whose colour behind the
 * card averages `photo`. The card's fill (under each ink) shows through at `percent`; the photo
 * at the rest. Returns the winner and both ratios so a caller can say why.
 * @param {number[]} photo
 * @param {number} percent
 * @returns {{ ink: 'light' | 'dark', light: number, dark: number }}
 */
export function pickCardInk(photo, percent) {
  const a = Math.min(100, Math.max(0, percent)) / 100;
  const ratio = (ink) => {
    const back = INK_FILL[ink].map((f, i) => f * a + photo[i] * (1 - a));
    return contrast(INK_TEXT[ink], back);
  };
  const light = ratio('light');
  const dark = ratio('dark');
  /** @type {'light' | 'dark'} */
  const ink = light >= dark ? 'light' : 'dark';
  return { ink, light, dark };
}

/**
 * Where a box inside a `background-size: cover; background-position: center` panel falls on the
 * photo itself, in the photo's own pixels. `rect` is in panel pixels; the result is clamped to
 * the photo. Null when any size is zero.
 */
export function coverSourceRect(photoW, photoH, panelW, panelH, rect) {
  if (!(photoW > 0 && photoH > 0 && panelW > 0 && panelH > 0)) return null;
  const scale = Math.max(panelW / photoW, panelH / photoH);
  const offX = (panelW - photoW * scale) / 2;
  const offY = (panelH - photoH * scale) / 2;
  const x0 = Math.max(0, (rect.x - offX) / scale);
  const y0 = Math.max(0, (rect.y - offY) / scale);
  const x1 = Math.min(photoW, (rect.x + rect.w - offX) / scale);
  const y1 = Math.min(photoH, (rect.y + rect.h - offY) / scale);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
