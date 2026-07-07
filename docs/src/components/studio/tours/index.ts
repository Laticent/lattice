// The TOUR REGISTRY — the "Show Me" menu's source of truth. Each entry is a user-facing tour: a
// label + one-line description (what the viewer GETS, not the internal angle) and a responsive
// `build`. The Studio menu renders this list; `useStudioDemo` looks a tour up by id at start time.
// Order = menu order: lead with the fast hook, then the complete tour, then the specialized angles.

import type { Walkthrough } from '../../../lib/vetrina';
import type { StudioActions } from '../studio-actions';
import { boardDeck } from './board-deck';
import { firstLook } from './first-look';
import { justMarkdown } from './just-markdown';
import { quiet } from './quiet';
import type { TourBuild } from './tour-kit';
import { walkthrough } from './walkthrough';

export type TourMeta = {
	/** Stable id — the argument to `startDemo(id)` and the e2e `data-tour` anchor. */
	id: string;
	/** Menu label — what the viewer gets, in their words. */
	label: string;
	/** One-line menu description. */
	description: string;
	build: TourBuild;
};

export const TOURS: TourMeta[] = [
	{ id: 'first-look', label: 'First look', description: 'The sixty-second version.', build: firstLook },
	{ id: 'walkthrough', label: 'The full walkthrough', description: 'Write, polish, ship — the whole thing.', build: walkthrough },
	{ id: 'board-deck', label: 'Build a board deck', description: 'A deck for the 4 o’clock meeting.', build: boardDeck },
	{ id: 'just-markdown', label: 'It’s just Markdown', description: 'One promise, proven five ways.', build: justMarkdown },
	{ id: 'quiet', label: 'The quiet tour', description: 'Few words — let the slides talk.', build: quiet },
];

/** The tour the standing entry points (welcome banner, ⋯ menu, ⌘K) launch. */
export const DEFAULT_TOUR = 'walkthrough';

/** Resolve a tour by id → its Walkthrough, adapting to the surface. Falls back to the default. */
export function buildTour(id: string, opts: { mobile: boolean }): Walkthrough<StudioActions> {
	const tour = TOURS.find((t) => t.id === id) ?? TOURS.find((t) => t.id === DEFAULT_TOUR);
	// biome-ignore lint/style/noNonNullAssertion: DEFAULT_TOUR is a literal member of TOURS above.
	return tour!.build(opts);
}
