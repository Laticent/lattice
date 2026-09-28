/**
 * lib/core/delivery-styles/restrained.mjs — the default delivery: the chair's pointer, off.
 *
 * A board member reads the sent deck alone. The deck keeps pace with the voice and never
 * performs. engineering/decisions/2026-09-27-delivery-styles-and-component-scenes.md §4.
 *
 * ITS CHARACTER, IN THREE RULES:
 *   - Continuous. Every sentence that names a part of the slide focuses it: a line chart read in
 *     twelve sentences gets twelve quiet focuses. There is no moment budget.
 *   - Opacity only. The named part keeps its colors and the rest recedes; no ink, no cursor, no
 *     motion beyond one short crossfade.
 *   - Nothing goes dark on its own. A sentence that names nothing holds the focus that is up; a
 *     frame ("each bar's length is its value") brings the whole figure back so it can be read whole.
 *
 * This file is the ONLY place restrained's behavior is decided. The other two deliveries are their
 * own files and share nothing with it but the act vocabulary, so a change here cannot move them
 * (the score goldens in test/unit/core/delivery-scores.test.js pin that).
 */

/** How restrained looks: every number the focus and the caption read. */
export const look = Object.freeze({
  /** No cap: a sentence that resolves to a part by its words (a bullet, a table row) always
   *  focuses it. Finite, because the exported player carries the look as JSON, where Infinity is null. */
  budget: 999,
  floor: 0,
  /** No overlay ink and no cursor, anywhere. */
  ink: 'none',
  strength: 'quiet',
  /** Receded TEXT: 0.7 keeps 3:1 on every theme (guide-contrast.test.js); color carries the emphasis. */
  dim: 0.7,
  /** Receded chart SHAPES sit at the chart hover's own depth (0.45). */
  dimMark: 0.45,
  /** A walked group's other units (a line's other points) drop further, so the one being read stands out. */
  dimInner: 0.3,
  fade: 200,
  hold: 'none',
  caption: 'crawl',
  wordFocus: true,
  motion: 'legible',
});

/**
 * What one bound sentence does under restrained. `act` is the sentence's act in the scene;
 * `ctx.named` says whether it names a unit.
 *
 * @returns {{ focus: 'unit'|'group'|'reset'|'hold'|'none', ink: null, cursor: 'hide' }}
 */
export function express(act, ctx = {}) {
  const hide = { ink: null, cursor: 'hide' };
  switch (act) {
    case 'frame':
      return { focus: 'reset', ...hide };
    case 'enter':
      return { focus: 'group', ...hide };
    case 'visit':
    case 'compare':
    case 'peak':
      return { focus: 'unit', ...hide };
    case 'verdict':
      return { focus: ctx.named ? 'unit' : 'reset', ...hide };
    default:
      // `note`, an aside, a sentence that names nothing: keep what is up.
      return { focus: 'hold', ...hide };
  }
}
