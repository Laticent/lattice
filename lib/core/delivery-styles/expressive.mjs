/**
 * lib/core/delivery-styles/expressive.mjs — the presenter's hand.
 *
 * A sales room, a prospect, a lesson. The hand leads the eye and the ink says what kind of
 * sentence is being spoken. engineering/decisions/2026-09-27-delivery-styles-and-component-scenes.md §4.
 *
 * ITS CHARACTER, IN THREE RULES:
 *   - The cursor is always on, and it travels to each part as it is named.
 *   - Ink marks ACTS, not moments (owner, 2026-09-27): a peak is circled, a comparison bracketed,
 *     a line traced, a visit tapped, the verdict underlined. The ink is how a viewer can tell,
 *     without the sound, what the sentence is doing.
 *   - The focus is deeper than restrained's, so the part the hand is on reads from across a room.
 *
 * The exported player does not ship Vetrina yet (owner, 2026-09-27), so a SENT expressive deck
 * plays the focus below and none of the ink or the cursor.
 *
 * This file is the ONLY place expressive's behavior is decided.
 */

export const look = Object.freeze({
  /** No cap. Finite, because the exported player carries the look as JSON, where Infinity is null. */
  budget: 999,
  floor: 0,
  /** Ink on every act that has one below (the Studio draws it; the exported player does not yet). */
  ink: 'all',
  strength: 'notable',
  /** Receded TEXT: 0.7 keeps 3:1 on every theme (guide-contrast.test.js); color carries the emphasis. */
  dim: 0.7,
  /** Receded chart SHAPES: context, not text. */
  dimMark: 0.3,
  dimInner: 0.2,
  fade: 160,
  hold: 'none',
  caption: 'crawl',
  wordFocus: true,
  motion: 'full',
});

/**
 * What one bound sentence does under expressive.
 *
 * `ink.on` names what the stroke is drawn around: `unit` (the named part), `labels` (the text that
 * names it), `figure` (the whole chart), `heading` (the slide's claim). `trace` is drawn along a
 * path and falls back to a bracket where the unit has no path.
 *
 * @returns {{ focus: string, ink: null | { kind: string, on: string, strength: 'quiet'|'notable' }, cursor: 'point'|'rest'|'keep' }}
 */
export function express(act, ctx = {}) {
  switch (act) {
    case 'frame':
      return { focus: 'reset', ink: { kind: 'bracket', on: 'figure', strength: 'quiet' }, cursor: 'point' };
    case 'enter':
      return { focus: 'group', ink: { kind: 'trace', on: 'unit', strength: 'quiet' }, cursor: 'point' };
    case 'visit':
      return { focus: 'unit', ink: { kind: 'tap', on: 'unit', strength: 'quiet' }, cursor: 'point' };
    case 'note':
      return { focus: 'hold', ink: ctx.labelled ? { kind: 'wash', on: 'labels', strength: 'quiet' } : null, cursor: 'keep' };
    case 'compare':
      return { focus: 'unit', ink: { kind: 'bracket', on: 'unit', strength: 'quiet' }, cursor: 'point' };
    case 'peak':
      return { focus: 'unit', ink: { kind: 'circle', on: 'unit', strength: 'notable' }, cursor: 'point' };
    case 'verdict':
      return ctx.named
        ? { focus: 'unit', ink: { kind: 'underline', on: 'labels', strength: 'notable' }, cursor: 'point' }
        : { focus: 'reset', ink: { kind: 'underline', on: 'heading', strength: 'notable' }, cursor: 'point' };
    default:
      return { focus: 'hold', ink: null, cursor: 'rest' };
  }
}
