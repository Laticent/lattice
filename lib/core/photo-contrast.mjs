/**
 * lib/core/photo-contrast — does the text on a photo slide read, and would pinning the
 * slide light or dark fix it?
 *
 * Text that sits on a photo is judged against the PHOTO, which no theme can promise
 * anything about: dark ink on a dark picture vanishes. `tools/check-slide-contrast.js`
 * cannot see this (it reads `backgroundColor`, and a photo is a `background-image`; its own
 * header lists raster backdrops as a known limit), so the Studio Coach measures it in the
 * live preview: it reads the photo's mean color behind the text, the card fill over it, and
 * the ink on top, and this module does the arithmetic.
 *
 * The fix it offers first is the slide-level pin (`dark` / `light` class), which flips the whole
 * palette together: surface, card fill and ink. When neither pin clears the floor (the theme's
 * muted body ink can stay under it on either palette), it offers the card ink instead
 * (`ink-light` / `ink-dark`, the thin-card classes), which fixes the card's fill and words
 * whatever the theme. A fix is offered ONLY when it clears the floor. A button that changes the
 * slide and still leaves the words unreadable is worse than none. It is never applied on its
 * own: the Coach shows it and the author clicks it.
 *
 * Pure and DOM-free (HARD RULE #1). The contrast arithmetic is `card-ink.mjs`'s (WCAG 2),
 * the same one `thin-card-no-ink` uses, so the two cannot disagree about a ratio.
 */

import { contrast } from './card-ink.mjs';

/** WCAG AA for body text. Large text is not given 3:1 here, the same stance as check-slide-contrast. */
export const TEXT_FLOOR = 4.5;

/** The pins a slide can take, in the order they are tried. */
export const PINS = Object.freeze(['dark', 'light']);

/** The card inks, tried only when no pin clears: a pin keeps the theme's own look, an ink overrides it. */
export const INKS = Object.freeze(['ink-light', 'ink-dark']);

/**
 * `layer` ([r, g, b] or [r, g, b, a] with a in 0..1) painted over the opaque `under`
 * ([r, g, b]). Browsers composite in gamma-encoded sRGB, so this does too.
 */
export function over(layer, under) {
  const a = layer[3] === undefined ? 1 : Math.min(1, Math.max(0, layer[3]));
  return [0, 1, 2].map((i) => layer[i] * a + under[i] * (1 - a));
}

/**
 * Contrast of `ink` against what is behind it: the photo, with the card's fill over it when the
 * text sits on a card. Ink with its own alpha (the `--on-dark-*` ramp) is composited too.
 * @param {{ photo: number[], card?: number[] | null, ink: number[] | number[][] }} scene
 */
export function inkRatio({ photo, card = null, ink }) {
  const back = card ? over(card, photo) : photo;
  // One ink, or several (a heading and its body can differ): the slide reads only as well as its worst.
  const inks = typeof ink[0] === 'number' ? [ink] : ink;
  return Math.min(...inks.map((i) => contrast(over(i, back), back)));
}

/**
 * Whether the text on a photo reads, and which fix (if any) would make it read.
 * `pins` holds the same scene, re-measured with each fix applied:
 * `{ dark: { card, ink }, light: ..., 'ink-light': ..., 'ink-dark': ... }`. A pin wins over an ink
 * whenever one clears; among a group, the higher ratio wins.
 * @param {{ photo: number[], card?: number[] | null, ink: number[] | number[][],
 *           pins?: Record<string, { card?: number[] | null, ink: number[] | number[][] } | undefined> }} scene
 * @returns {{ ratio: number, floor: number, low: boolean, fix: 'dark' | 'light' | 'ink-light' | 'ink-dark' | null, fixRatio: number | null }}
 */
export function judge(scene) {
  const ratio = inkRatio(scene);
  const low = ratio < TEXT_FLOOR;
  let fix = null;
  let fixRatio = null;
  for (const group of low ? [PINS, INKS] : []) {
    for (const name of group) {
      const alt = scene.pins?.[name];
      if (!alt) continue;
      const r = inkRatio({ photo: scene.photo, card: alt.card, ink: alt.ink });
      if (r >= TEXT_FLOOR && (fixRatio === null || r > fixRatio)) {
        fix = name;
        fixRatio = r;
      }
    }
    if (fix) break;
  }
  return { ratio, floor: TEXT_FLOOR, low, fix, fixRatio };
}

/** The Coach finding's message for a verdict, in plain words. */
export function describe(verdict) {
  const got = verdict.ratio.toFixed(1);
  const lead = `The text on this photo reads at ${got}:1 (needs ${verdict.floor}:1).`;
  const to = verdict.fixRatio?.toFixed(1);
  if (verdict.fix === 'ink-light' || verdict.fix === 'ink-dark') {
    return `${lead} Neither a dark nor a light slide clears it; setting the card ink ${verdict.fix.slice(4)} lifts it to ${to}:1.`;
  }
  if (verdict.fix) return `${lead} Pinning the slide ${verdict.fix} lifts it to ${to}:1.`;
  return `${lead} No pin and no card ink clears it: raise the card backing or choose another photo.`;
}
