// ⑥ Share — every way a deck leaves the Studio. Angle: open the sheet for real and point at each
// row as its line names it, top to bottom, so the order on screen is the order of the words.
// Nothing is exported: the tour points and never presses a row.
//
// The sheet is a dialog portalled to <body>, so every target is a whole-document lookup, found by the
// row's own title. Every line is a member of SHARE_LINES.

import { SHARE_LINES as L } from './lines';
import { buttonLabeled, buttonStarting, q, type TourBuild, type TourStep, toWalkthrough } from './tour-kit';

const sheetOpen = (): boolean => !!document.querySelector('[role="dialog"] [data-slot="dialog-close"], [role="dialog"] button[aria-label="Close"]') || [...document.querySelectorAll('[role="dialog"]')].some((d) => /Share “/.test(d.textContent ?? ''));

export function shareSteps(mobile: boolean): TourStep[] {
	const row = (say: string, title: string, settle = 600): TourStep => ({ say, point: buttonStarting(title), settle });
	return [
		{ say: L.intro, point: mobile ? buttonLabeled('Share') : q('[data-demo="share"]'), click: true, at: 'Share', act: (a) => a.setShare(true), until: sheetOpen, settle: 900 },
		row(L.live, 'Collaborate live'),
		row(L.link, 'Present link'),
		row(L.pdf, 'PDF'),
		row(L.office, 'PowerPoint'),
		row(L.images, 'Images'),
		row(L.print, 'Print deck'),
		row(L.web, 'Webpage'),
		row(L.captions, 'Captions'),
		row(L.source, 'Markdown', 700),
		{ say: L.close, act: (a) => a.setShare(false), settle: 700 },
	];
}

export const share: TourBuild = ({ mobile }) => toWalkthrough(shareSteps(mobile));
