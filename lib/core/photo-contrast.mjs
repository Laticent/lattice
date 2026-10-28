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
 * THIS IS THE SPINE. The Coach's finding and the editor's photo warnings (`thin-card-no-ink`'s tooltip, the measured
 * `photo-contrast` underline) render one verdict from `judge`, worded by `describe` and labelled by `fixLabel`, so the two
 * views cannot disagree about the ratio or the fix (docs/src/components/studio/photo-verdict.ts reads the page for both).
 *
 * The fixes are the slide-level pin (`dark` / `light` class, which flips the whole palette together), the card ink
 * (`ink-light` / `ink-dark`, which fixes the card's fill and words whatever the theme) and, last, a solid card. Which goes
 * first is `fixOrder`. A fix is offered ONLY when it clears the floor. A button that changes the slide and still leaves
 * the words unreadable is worse than none. It is never applied on its own: the author clicks it.
 *
 * A statement slide has no card: its words sit on the `.image-scrim` gradient. `strongestScrim`
 * turns that gradient into the one layer it is at its densest, so a statement is flagged only when
 * its text fails even there; its fixes are judged with the scrim OFF, so one is offered only when it
 * clears however thin the scrim is where the words are.
 *
 * Pure and DOM-free (HARD RULE #1). The contrast arithmetic is `card-ink.mjs`'s (WCAG 2),
 * the same one `thin-card-no-ink` uses, so the two cannot disagree about a ratio.
 */

import { contrast, INK_BODY, INK_FILL, INK_TEXT } from './card-ink.mjs';

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
 * A statement's scrim at its STRONGEST, as one [r, g, b, a] layer, or null when it paints nothing.
 * The scrim is gradient layers (`.image-scrim`), and where each is densest depends on the angle,
 * the `at-*` placement and the band variant, so this does not guess which point sits under the
 * words. It takes every layer at its densest stop and stacks them. Judged against that, text that
 * still fails is sure to fail under the real scrim (on the mean photo), so the Coach never flags a
 * statement the scrim actually rescues. With `card-clear` every stop is transparent and the result
 * is exact: no backing.
 * @param {number[][][]} layers each layer's color stops, [r, g, b, a] with a in 0..1
 * @returns {number[] | null}
 */
export function strongestScrim(layers) {
  let rgb = [0, 0, 0];
  let alpha = 0;
  for (const stops of layers) {
    const top = stops.reduce((best, c) => ((c[3] ?? 1) > (best?.[3] ?? -1) ? c : best), null);
    const a = top ? Math.min(1, Math.max(0, top[3] ?? 1)) : 0;
    if (a <= 0) continue;
    // Later layers are painted first (CSS lists the top layer first), so this one goes UNDER what is stacked so far.
    const out = alpha + a * (1 - alpha);
    rgb = [0, 1, 2].map((i) => (rgb[i] * alpha + top[i] * a * (1 - alpha)) / out);
    alpha = out;
  }
  return alpha > 0 ? [...rgb, alpha] : null;
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

/** The fix that always reads on a spotlight: a solid card carries the theme's own contrast, whatever the photo. */
export const SOLID = 'solid';

/**
 * The fixes to try, in order. A thin card with no ink is what lint's `thin-card-no-ink` flags, and only an ink class
 * clears that warning, so there the inks go first and a pin is never offered: one click must clear the Coach finding and
 * the editor warning together. Anywhere else a pin goes first, because it keeps the theme's own look (#2932).
 * @param {boolean} inkFirst
 */
export function fixOrder(inkFirst) {
  return inkFirst ? [INKS] : [PINS, INKS];
}

/**
 * The verdict for one slide: whether its text reads, and the ONE fix both the Coach and the editor offer.
 * `scene.pins` holds the same scene with each fix applied: `{ dark: { card, ink }, light, 'ink-light', 'ink-dark' }`.
 * Within a group the higher ratio wins, and a fix is offered only when it clears the floor.
 *   - `scene.ink` null means the current ink is not known (an estimate from the photo file, the slide off screen):
 *     there is no ratio, and the caller is asking only which fix reads.
 *   - `opts.inkFirst`: the card is one lint flags (see `fixOrder`).
 *   - `opts.wantFix`: return the fix even when the text reads. Lint can flag a thin card whose theme ink happens to
 *     read on this photo; the editor still owes the author the ink lint asks for.
 *   - `opts.solidReads`: a solid card is the fallback when nothing else clears. True for a spotlight only: a statement's
 *     words can sit where its scrim fades to nothing, so a solid statement scrim promises nothing.
 * @param {{ photo: number[], card?: number[] | null, ink: number[] | number[][] | null,
 *           pins?: Record<string, { card?: number[] | null, ink: number[] | number[][] } | undefined> }} scene
 * @param {{ inkFirst?: boolean, wantFix?: boolean, solidReads?: boolean }} [opts]
 * @returns {{ ratio: number | null, floor: number, low: boolean, fix: string | null, fixRatio: number | null }}
 */
export function judge(scene, opts = {}) {
  const { inkFirst = false, wantFix = false, solidReads = false } = opts;
  const ratio = scene.ink ? inkRatio(scene) : null;
  const low = ratio === null || ratio < TEXT_FLOOR;
  let fix = null;
  let fixRatio = null;
  if (low || wantFix) {
    for (const group of fixOrder(inkFirst)) {
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
    if (!fix && solidReads) fix = SOLID;
  }
  return { ratio, floor: TEXT_FLOOR, low, fix, fixRatio };
}

/**
 * The scenes a card ink would paint, from the stylesheet's own fills and inks (card-ink.mjs restates them, and a test
 * pins them to image.styles.css). For a slide the preview cannot show: the estimate needs no page. `backing` is the
 * card's opacity in percent (a spotlight's card under the ink); a statement's ink is judged with no backing, as its live
 * fixes are. `body`: the slide has a paragraph or list row under the heading, whose ink is lighter.
 * @param {'spotlight' | 'statement'} composition
 * @param {number} backing
 * @param {boolean} body
 */
export function inkScenes(composition, backing, body) {
  const out = {};
  for (const ink of ['light', 'dark']) {
    const card = composition === 'spotlight' && backing > 0 ? [...INK_FILL[ink], backing / 100] : null;
    out[`ink-${ink}`] = { card, ink: body ? [INK_TEXT[ink], INK_BODY[ink]] : [INK_TEXT[ink]] };
  }
  return out;
}

/** The label on the one button both views show for `fix`. */
export function fixLabel(fix) {
  if (fix === 'ink-light' || fix === 'ink-dark') return `Set card ink ${fix.slice(4)}`;
  if (fix === SOLID) return 'Use a solid card';
  return `Pin this slide ${fix}`;
}

/**
 * The message for a verdict, in plain words: the same sentence in the Coach and in the editor.
 * `verdict.atMost`: a statement judged against its scrim at its strongest, so the real ratio is this or lower.
 * `verdict.estimate`: read from the photo file, not the painted slide (it is not on screen).
 */
export function describe(verdict) {
  // Rounded DOWN: 4.46 is a failure, and "reads at 4.5:1 (needs 4.5:1)" would read as a pass.
  const down = (r) => (Math.floor(r * 10) / 10).toFixed(1);
  const lead = verdict.ratio === null ? '' : `The text on this photo reads at ${verdict.atMost ? 'most ' : ''}${down(verdict.ratio)}:1 (needs ${verdict.floor}:1). `;
  const to = verdict.fixRatio === null || verdict.fixRatio === undefined ? undefined : down(verdict.fixRatio);
  let fix;
  if (verdict.fix === 'ink-light' || verdict.fix === 'ink-dark') fix = `Setting the card ink ${verdict.fix.slice(4)} lifts it to ${to}:1.`;
  else if (verdict.fix === SOLID) fix = 'No card ink reads on this photo; a solid card does.';
  else if (verdict.fix) fix = `Pinning the slide ${verdict.fix} lifts it to ${to}:1.`;
  else fix = 'No fix here clears it: choose another photo, or move the words where the photo is calmer.';
  return `${lead}${fix}${verdict.estimate ? ' (Estimated from the photo file: this slide is not on screen.)' : ''}`;
}
