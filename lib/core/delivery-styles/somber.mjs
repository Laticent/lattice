/**
 * lib/core/delivery-styles/somber.mjs — stillness.
 *
 * Bad news, a layoff, a loss. Nothing moves that does not have to.
 * engineering/decisions/2026-09-27-delivery-styles-and-component-scenes.md §4.
 *
 * ITS CHARACTER, IN THREE RULES:
 *   - One gesture a slide, on the scene's KEY beat (the component's manifest `scene.key` picks it:
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
  dim: 0.62,
  dimInner: 0.5,
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
