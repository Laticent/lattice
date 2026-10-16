// The TOUR REGISTRY — the "Show Me" menu's source of truth. Each entry is a user-facing tour: a
// label + one-line description (what the viewer GETS, not the internal angle). The Studio menu
// renders this list eagerly; the scripts themselves are in ./build, loaded when a tour starts.
// One tour: `first-look`, the showcase. The four longer tours became Studio lessons, which teach
// one question each on the user's own deck (engineering/decisions/2026-10-05-studio-lessons.md).


export type TourMeta = {
	/** Stable id — the argument to `startDemo(id)` and the e2e `data-tour` anchor. */
	id: string;
	/** Menu label — what the viewer gets, in their words. */
	label: string;
	/** One-line menu description. */
	description: string;
};

export const TOURS: TourMeta[] = [
	{ id: 'first-look', label: 'First look', description: 'The sixty-second version.' },
];

/** The tour the standing entry points (welcome banner, ⋯ menu, ⌘K) launch. */
export const DEFAULT_TOUR = 'first-look';

/** The scripts, fetched on the first start: they and the storyboard engine they compile to stay
 *  out of the Studio's startup bundle. */
export const loadTours = (): Promise<typeof import('./build')> => import('./build');
