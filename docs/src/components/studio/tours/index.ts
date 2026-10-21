// The TOUR REGISTRY — the "Show Me" menu's source of truth. Each entry is a user-facing tour: a
// label + one-line description (what the viewer GETS, not the internal angle). The Studio menu
// renders this list eagerly; the scripts themselves are in ./build, loaded when a tour starts.
//
// The tours are one course, in order: Welcome → Read → Craft → Present → Share, and each ends by
// offering the next (`next`), the last by offering the lessons. Every one is SPOKEN, in the one
// Studio voice, from clips recorded ahead of time (./lines.ts), so the whole list is narrated.
// `first-look` stands apart: the sixty-second build, which makes a deck, so it is not a step in the course.
// The long hands-on tours became Studio lessons (engineering/decisions/2026-10-05-studio-lessons.md).
import { CRAFT_VOICE_DIR, FIRST_LOOK_VOICE_DIR, PRESENT_VOICE_DIR, READ_VOICE_DIR, SHARE_VOICE_DIR, TOUR_VOICE_DIR } from './lines';

export type TourPosture = 'read' | 'write' | 'craft';

export type TourMeta = {
	/** Stable id — the argument to `startDemo(id)` and the e2e `data-tour` anchor. */
	id: string;
	/** Menu label — what the viewer gets, in their words. */
	label: string;
	/** One-line menu description. */
	description: string;
	/** The folder of recorded clips this tour speaks from (docs/public/lesson-voice/<dir>). */
	dir: string;
	/** The posture the tour needs on screen. It starts there and puts the visitor back after. */
	posture: TourPosture;
	/** The tour that "Go further" opens when this one finishes by itself; none means the lessons. */
	next?: string;
	/** Ends on the go-further card (the course) rather than a toast. */
	endCard?: boolean;
	/** Words for that card: its heading and what comes next. */
	endTitle?: string;
	/** The tour makes a deck the visitor keeps, so the slide they were on is not restored. */
	buildsDeck?: boolean;
	/** Needs the desktop chrome (the activity bar, the posture control); hidden on a phone or tablet. */
	desktopOnly?: boolean;
};

export const TOURS: TourMeta[] = [
	{ id: 'welcome', label: 'Welcome tour', description: 'A narrated walk through the Studio. About two minutes.', dir: TOUR_VOICE_DIR, posture: 'write', next: 'read', endCard: true, endTitle: 'That’s the shape of it' },
	{ id: 'read', label: 'Read tour', description: 'The quiet view: just the slides, or the deck as an article.', dir: READ_VOICE_DIR, posture: 'read', next: 'craft', endCard: true, endTitle: 'That’s Read', desktopOnly: true },
	{ id: 'craft', label: 'Craft tour', description: 'The full workshop: every panel, one by one.', dir: CRAFT_VOICE_DIR, posture: 'craft', next: 'present', endCard: true, endTitle: 'That’s every panel', desktopOnly: true },
	{ id: 'present', label: 'Present tour', description: 'Play the deck full screen, and every control in the room.', dir: PRESENT_VOICE_DIR, posture: 'write', next: 'share', endCard: true, endTitle: 'That’s Present' },
	{ id: 'share', label: 'Share tour', description: 'Every way a deck can leave the Studio.', dir: SHARE_VOICE_DIR, posture: 'write', endCard: true, endTitle: 'That’s Share' },
	{ id: 'first-look', label: 'First look', description: 'The sixty-second version: watch a deck build itself.', dir: FIRST_LOOK_VOICE_DIR, posture: 'craft', buildsDeck: true },
];

/** The tour the standing entry points (welcome banner, ⋯ menu, ⌘K) launch. */
export const DEFAULT_TOUR = 'welcome';

/** Tours that speak. Starting one builds the narrator inside the click and plays the recorded voice. */
export const SPOKEN_TOURS: readonly string[] = TOURS.map((t) => t.id);

export const tourMeta = (id: string): TourMeta => TOURS.find((t) => t.id === id) ?? TOURS[0];

/** The scripts, fetched on the first start: they and the storyboard engine they compile to stay
 *  out of the Studio's startup bundle. */
export const loadTours = (): Promise<typeof import('./build')> => import('./build');
