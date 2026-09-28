/**
 * lib/core/delivery-styles/somber.mjs — stillness.
 *
 * Bad news, a layoff, a loss. Nothing moves that does not have to.
 * engineering/decisions/2026-09-27-delivery-styles-and-component-scenes.md §4.
 *
 * ITS CHARACTER, IN THREE RULES:
 *   - One gesture a slide, on the scene's KEY beat (the component's `gesture` key picks it:
 *     a funnel's last stage, a line's largest move), and only there. The figure stays whole and
 *     still through every other sentence. It is not a walk cut down to one step: there is no walk.
 *   - The focus arrives slowly and stays to the end of the slide.
 *   - No cursor, no ink, no read-along; the caption shows the line in one still ink.
 *
 * This file is the ONLY place somber's behavior is decided.
 */

export const look = Object.freeze({
  /** A slide the narrator does not bind (prose) gets its single top-ranked moment, as before. */
  budget: 1,
  floor: 1,
  ink: 'none',
  strength: 'quiet',
  /** As deep as restrained's (owner, 2026-09-27): somber is quiet because it gestures once and
   *  slowly, not because its one gesture is faint. At 0.62 it was barely visible on a phone. */
  /** Receded TEXT: 0.7 keeps 3:1 on every theme (guide-contrast.test.js); color carries the emphasis. */
  dim: 0.7,
  /** Receded chart SHAPES: context, not text. */
  dimMark: 0.45,
  dimInner: 0.3,
  fade: 600,
  hold: 'aside',
  caption: 'still',
  wordFocus: false,
  motion: 'legible',
});

/**
 * What one bound sentence does under somber: focus on the key beat, hold after it, nothing before.
 *
 * @returns {{ focus: 'unit'|'hold'|'none', ink: null, cursor: 'hide' }}
 */
export function express(_act, ctx = {}) {
  if (ctx.key) return { focus: 'unit', ink: null, cursor: 'hide' };
  return { focus: ctx.afterKey ? 'hold' : 'none', ink: null, cursor: 'hide' };
}
