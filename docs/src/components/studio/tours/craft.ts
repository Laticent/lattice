// ④ Craft — the full workshop: every panel on the activity bar, opened one by one by clicking the
// real button. A panel is shown for exactly as long as its line, then the next one takes its place;
// the tools share one slot, so each press replaces the last. The layout reset closes everything first
// and the restore puts the visitor's panels back, so a tour that opens ten panels leaves none behind.
//
// Desktop only: the activity bar is a desktop surface. Every line is a member of CRAFT_LINES.

import { CRAFT_LINES as L } from './lines';
import { q, type TourBuild, type TourStep, toWalkthrough } from './tour-kit';

const COACH = '[aria-label="Toggle Coach"]';
const CHAT = '[aria-label="Toggle Chat"]';
const LIVE = '[aria-label="Toggle Live"]';
const LIBRARY = '[aria-label="Open Library"]';
const VIEWS = '[aria-label="Toggle Reader views"]';
const SLIDE = '[aria-label="Slide settings"]';
const DECK = '[aria-label="Deck scope"]';
const HISTORY = '[aria-label="Version history"]';
const SETUP = '[aria-label="Workspace settings"]';

/** A beat that opens a panel by pressing its bar button, with the line that explains it. `at` is the word
 *  that names the panel: the cursor arrives and the click lands on that word, so the panel opens as it is said. */
const panel = (say: string, sel: string, at: string, settle = 900): TourStep => ({ say, point: q(sel), click: true, at, act: (a) => a.press(sel), settle });

export function craftSteps(): TourStep[] {
	return [
		{ say: L.intro, point: q(COACH), settle: 700 },
		panel(L.coach, COACH, 'Coach'),
		panel(L.chat, CHAT, 'Chat'),
		panel(L.live, LIVE, 'Live'),
		panel(L.library, LIBRARY, 'Library'),
		panel(L.views, VIEWS, 'Views'),
		// The settings panels are their own slot, beside the tools. Close the last tool so the two never crowd the editor.
		{ instant: true, act: (a) => a.press(VIEWS), settle: 300 },
		panel(L.slide, SLIDE, 'Slide'),
		panel(L.deck, DECK, 'Deck'),
		{ instant: true, act: (a) => a.closeAll(), settle: 400 },
		panel(L.history, HISTORY, 'Version'),
		{ instant: true, act: (a) => a.closeAll(), settle: 400 },
		panel(L.setup, SETUP, 'Setup', 1000),
		{ say: L.close, act: (a) => a.closeAll(), settle: 700 },
	];
}

export const craft: TourBuild = () => toWalkthrough(craftSteps());
