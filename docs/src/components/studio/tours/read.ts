// ③ Read — the quiet view. Angle: what Read is FOR (looking, not editing), shown by doing the two
// things it offers: jump around the strip, and turn the deck into an article. It changes nothing the
// visitor owns, and the layout reset/restore puts them back in the stop they started in.
//
// Desktop only: Read is a posture of the desktop chrome. Every line is a member of READ_LINES.

import { READ_LINES as L } from './lines';
import { buttonLabeled, q, SEL, type TourBuild, type TourStep, toWalkthrough } from './tour-kit';

const strip = (): HTMLElement | null => document.querySelector<HTMLElement>(SEL.rail) ?? document.querySelector<HTMLElement>('[aria-label^="Slide 1"]')?.parentElement ?? null;

export function readSteps(): TourStep[] {
	return [
		{ say: L.intro, settle: 700 },
		{ say: L.strip, point: strip, settle: 500 },
		// Show the jump the line promised, then put the deck back on the slide the visitor had.
		{ point: q('[aria-label^="Slide 3"]'), click: true, act: (a) => a.press('[aria-label^="Slide 3"]'), settle: 1500 },
		{ point: q('[aria-label^="Slide 1"]'), click: true, act: (a) => a.press('[aria-label^="Slide 1"]'), settle: 700 },
		{ say: L.theme, point: q('[data-demo="theme"]'), circle: q('[data-demo="theme"]'), settle: 700 },
		{ say: L.article, point: q('[aria-label="Read as an article"]'), click: true, at: 'article', act: (a) => a.press('[aria-label="Read as an article"]'), settle: 1600 },
		{ say: L.back, point: buttonLabeled('Back to the deck'), click: true, at: 'Back', act: (a) => a.press(buttonLabeled('Back to the deck')), settle: 900 },
		{ say: L.edit, point: buttonLabeled('Edit this slide'), settle: 700 },
		{ say: L.actions, point: q('[data-demo="present"]'), at: 'Present', settle: 700 },
		{ say: L.close, settle: 700 },
	];
}

export const read: TourBuild = () => toWalkthrough(readSteps());
