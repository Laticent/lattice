/**
 * lib/core/bleed-ink.mjs — WHICH INK A `bleed` SLIDE'S WORDS NEED, decided from its photo.
 *
 * A `bleed` slide paints its picture behind its words (lib/plugins/image/image.styles.css). Its words used to keep the theme's
 * ink whatever the photo held, so a dark photo under a light-mode deck gave dark words on a dark picture, unless the author
 * remembered to add `dark` (the owner's Export-to-Marp sign-off PDFs on #3132). Now the slide picks its ink from the photo, the
 * way a thin spotlight card does (lib/core/card-ink.mjs): the band of the photo under the heading is averaged, and the ink that
 * reads better on it wins, by WCAG contrast. Light ink is the theme's `dark` mode on that slide, dark ink its light mode, so
 * every token (the heading, the rule, the page number, the scrim or the veil) follows from the theme itself. The light mode is
 * written `color-light`, never the bare `light`: that word is also a layout variant (`divider light`, the subtopic divider), the
 * same collision lib/core/resolve-color-mode.js avoids for a deck-wide light mode. Applying an ink takes off every other
 * color-mode token (a deck's `color-light`, `color-system`, `dark`), as a slide's own mode evicts the deck's
 * (lib/core/color-mode.js `slidePinEvictsDeckToken`); a bare `light` stays, because it may be the layout's.
 *
 * THE AUTHOR WINS. A slide whose own `_class` names a color mode keeps it: the decision is only made where the author said
 * nothing about the slide (a deck-wide color mode is the deck's default, not a word about this photo). A `print` deck is left
 * alone: print has its own ink. The checker on #3132 found the first cut writing `dark` beside a deck's `color-light` (which wins
 * on source order: dark words over the dark scrim) and the bare `light` re-laying a divider out as its subtopic variant.
 *
 * Pure and DOM-free (HARD RULE #1), so its two hosts share it: the runtime (lib/transformers/bleed-ink.js: the Studio, the
 * Playground, the fluid viewer and a Marp bundle, which sample the photo in a canvas) and the CLI (lattice.js, which samples the
 * file in its own Chromium before the page renders). Each host only reads pixels; this module decides.
 */

import { coverSourceRect, meanRgb, pickCardInk } from './card-ink.mjs';

/** The band of the slide the heading sits in: its top this fraction, where the words of a `bleed` slide start. */
export const BLEED_BAND = 0.45;
/** Layouts that center their words on the slide: their band is the middle of the slide, not its top. */
const CENTERED = new Set(['divider', 'title', 'statement', 'closing', 'quote', 'big-number']);

/** Every color-mode token (lib/core/color-mode.js `COLOR_MODE_TOKENS`): one the author wrote on the slide is the author's choice. */
const MODE_TOKENS = ['dark', 'light', 'color-light', 'color-system', 'color-inherited', 'print'];
/** The ones an applied ink takes off. A bare `light` stays: it may be a layout's variant (`divider light`). */
const EVICTED = ['dark', 'color-light', 'color-system', 'color-inherited'];

const tokens = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/\s+/)).filter(Boolean);

/**
 * Does this slide pick its ink from its photo? A `bleed` slide (not an `image` slide or a collage, which place pictures their
 * own way) whose own `_class` names no color mode.
 * @param {string[]|string} classes  the slide's resolved classes
 * @param {string[]|string} [own]  the slide's own `_class` words (the engine stamps them as `data-class`)
 */
export function picksBleedInk(classes, own = '') {
  const c = tokens(classes);
  if (!c.includes('bleed') || c.includes('image') || c.includes('collage') || c.includes('print')) return false;
  return !tokens(own).some((t) => MODE_TOKENS.includes(t));
}

/** The band of the slide its words sit in, as `{ top, height }` fractions: the middle for a layout that centers its words. */
export function bleedBandFor(classes) {
  return tokens(classes).some((t) => CENTERED.has(t)) ? { top: (1 - BLEED_BAND) / 2, height: BLEED_BAND } : { top: 0, height: BLEED_BAND };
}

/**
 * Where to read the photo, in the photo's own pixels: the slide's heading band, as `background-size: cover;
 * background-position: center` crops the photo onto a slide of `slideW` × `slideH`. Null when a size is zero.
 */
export function bleedSampleRect(photoW, photoH, slideW = 16, slideH = 9, band = { top: 0, height: BLEED_BAND }) {
  return coverSourceRect(photoW, photoH, slideW, slideH, { x: 0, y: slideH * band.top, w: slideW, h: slideH * band.height });
}

/**
 * The ink for a photo whose heading band averages `rgb`: `light` (white words) or `dark` (near-black words), whichever reads
 * better on it (card-ink's own inks and contrast, at no card backing).
 * @param {number[]} rgb
 * @returns {'light' | 'dark'}
 */
export function bleedInkFor(rgb) {
  return pickCardInk(rgb, 0).ink;
}

/** The ink for a canvas's RGBA pixels of the heading band, or null when none is opaque. */
export function bleedInkOfPixels(rgba) {
  const rgb = meanRgb(rgba);
  return rgb ? bleedInkFor(rgb) : null;
}

/** The color-mode class that carries an ink: `dark` for light ink, `color-light` for dark ink. */
export function modeForInk(ink) {
  return ink === 'light' ? 'dark' : 'color-light';
}

/**
 * A section's class list with the ink applied: any color-mode class taken off, the one that carries the ink put on. The
 * other tokens keep their order.
 * @param {string[]|string} classes
 * @param {'light'|'dark'} ink
 */
export function classesWithInk(classes, ink) {
  return [...tokens(classes).filter((t) => !EVICTED.includes(t)), modeForInk(ink)];
}
