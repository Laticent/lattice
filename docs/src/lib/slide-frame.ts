/**
 * The slide frame, for docs-site and Studio hosts: the box that wraps one live slide.
 *
 * The kernel is `lib/core/slide-frame.mjs`, shared with the exported player and the
 * Playground (HARD RULE #1); read its header for the contract. In short: the ENGINE draws
 * the slide's shape and its 1px edge (in the deck's own --border, spectrum-aware), and the
 * host box adds only a lift shadow. `single-slide-render` tells the engine the on-screen
 * scale (`--slide-edge-k`), so a host using `DeckPreview` has nothing else to do.
 *
 * Usage: `<div className="relative overflow-hidden" data-slide-frame style={slideFrameStyle('tile')}>`.
 * No `rounded-*`, `border`, `shadow-*` or `bg-*` class on that box — `slide-frame-hosts`
 * in test/unit/tools pins that. A selection or hover state goes on the TILE AROUND the
 * frame (an outline with an offset), never on the frame itself.
 */
import { slideFrameShadow } from '../../../lib/core/slide-frame.mjs';

export type SlideFrameLift = 'flat' | 'tile' | 'card' | 'stage';

export { slideFrameShadow };

/** The inline style for a slide host box: its lift shadow. */
export function slideFrameStyle(lift: SlideFrameLift = 'card'): { boxShadow: string } {
	return { boxShadow: slideFrameShadow(lift) };
}
