/**
 * The slide frame, for docs-site and Studio hosts: the box that wraps one live slide.
 *
 * The kernel is `lib/core/slide-frame.mjs`, shared with the exported player and the
 * Playground (HARD RULE #1). Read its header for the contract. In short: the engine
 * owns the slide's corner, the host box never rounds, borders or shadows a slide, and
 * the edge + lift come from this `filter`, which traces the slide the engine painted.
 * A square deck gets a square edge and a rounded deck a rounded one, with no radius to
 * read and no timing to race.
 *
 * Usage: `<div className="relative overflow-hidden" style={slideFrameStyle('tile')}>`.
 * No `rounded-*`, `border`, `shadow-*` or `bg-*` class on that box — `slide-frame-hosts`
 * in test/unit/tools pins that. A selection or hover state goes on the TILE AROUND the
 * frame (an outline with an offset), never on the frame itself.
 */
import { slideFrameFilter } from '../../../lib/core/slide-frame.mjs';

export type SlideFrameLift = 'flat' | 'tile' | 'card' | 'stage';

export { slideFrameFilter };

/** The inline style for a slide host box. `edge: null` drops the edge line. */
export function slideFrameStyle(lift: SlideFrameLift = 'card', opts: { edge?: string | null } = {}): { filter: string } {
	return { filter: slideFrameFilter(lift, opts) };
}
