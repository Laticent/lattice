// ⑤ Present — the stage. Angle: open it for real and walk the controls in the order a presenter meets
// them: move, jump, set the room, practice, put it on the right screen, then what the room sees.
// Nothing here changes the deck; leaving Present puts the visitor back on the slide they were on.
//
// Present is a full-screen overlay portalled to <body>, so every target is a whole-document lookup.
// Every line is a member of PRESENT_LINES.

import { PRESENT_LINES as L } from './lines';
import { buttonLabeled, q, type TourBuild, type TourStep, toWalkthrough } from './tour-kit';

const EXIT = '[aria-label="Exit present"]';
const inPresent = (): boolean => !!document.querySelector(EXIT);

export function presentSteps(mobile: boolean): TourStep[] {
	const open: TourStep = { say: L.intro, point: mobile ? buttonLabeled('Present') : q('[data-demo="present"]'), click: true, at: 'begin', act: (a) => a.setPresent(true), until: inPresent, settle: 900 };
	const leave: TourStep = { say: L.exit, point: q(EXIT), click: true, at: 'Escape', act: (a) => a.setPresent(false), settle: 700 };
	if (mobile) return [open, { say: L.move, settle: 900 }, leave, { say: L.close, settle: 700 }];
	return [
		open,
		{ say: L.move, point: q('[aria-label="Next slide"]'), click: true, at: 'arrow', act: (a) => a.press('[aria-label="Next slide"]'), settle: 700 },
		// Put the deck back on the slide it opened on, so leaving Present does not leave the Studio a slide ahead.
		{ instant: true, act: (a) => a.press('[aria-label="Previous slide"]'), settle: 300 },
		{ say: L.slides, point: q('[aria-label="Slides"]'), settle: 700 },
		{ say: L.venue, point: q('[aria-label^="Venue"]'), settle: 700 },
		{ say: L.rehearse, point: buttonLabeled('Rehearse'), settle: 700 },
		{ say: L.screen, point: q('[aria-label="Fullscreen"]'), settle: 700 },
		// The delivery dock sits where the caption bar does, so the bar moves out of the way for these two.
		{ instant: true, act: (a) => a.captionEdge('top'), settle: 250 },
		{ say: L.captions, point: q('[aria-label="Captions"]'), settle: 700 },
		{ say: L.guide, point: q('[aria-label^="Progress rail"]'), settle: 700 },
		{ instant: true, act: (a) => a.captionEdge('bottom'), settle: 250 },
		leave,
		{ say: L.close, settle: 700 },
	];
}

export const present: TourBuild = ({ mobile }) => toWalkthrough(presentSteps(mobile));
