// ② Welcome — the first-run tour, spoken. Angle: a three-minute master class in the surfaces
// that matter, in the order a newcomer needs them: write → see → arrange → style → move around →
// share. It touches nothing the visitor owns (no new deck, no typing): it walks the deck that is
// already open, so ending it early costs nothing and finishing it changes nothing.
//
// Every line is a member of TOUR_LINES (lines.ts), because the voice is recorded ahead of time.
// The voice leans toward whatever the cursor points at (Vetrina's `setPan`), so the editor speaks
// from the left and the Share button from the right without any script here saying so.

import { TOUR_LINES as L } from './lines';
import { buttonLabeled, q, SEL, type TourBuild, type TourStep, toWalkthrough } from './tour-kit';

/** The slide strip, or the slide map that replaces it beside a slide. */
const rail = (): HTMLElement | null => document.querySelector<HTMLElement>(SEL.rail) ?? document.querySelector<HTMLElement>('[data-map-rail]');
/** The one "New slide" door on screen (the strip's, or the editor's while the preview is collapsed). */
const addSlide = (): HTMLElement | null => [...document.querySelectorAll<HTMLElement>('[aria-label="New slide"]')].find((el) => el.getClientRects().length > 0) ?? null;
const composeToggle = (): HTMLElement | null => document.querySelector<HTMLElement>('[aria-label="Compose — rich editor"]');
const fixAll = (): HTMLElement | null => document.querySelector<HTMLElement>('[aria-label="Fix all issues"]');
/** The nth slide button in the strip (1-based), so the tour can show that a click jumps there. */
const railSlide = (n: number) => (): HTMLElement | null => document.querySelector<HTMLElement>(`${SEL.rail} button:nth-child(${n})`);
const reshape = (): HTMLElement | null => document.querySelector<HTMLElement>('[aria-label="Reshape slide"]');
/** The Read · Write · Craft control as one thing: the group that holds the Write button. */
const posture = (): HTMLElement | null => document.querySelector<HTMLElement>('[aria-label="Write — editor + preview"]')?.parentElement ?? null;

/** The beats, exposed so a test can check every spoken line against TOUR_LINES. */
export function welcomeSteps(mobile: boolean): TourStep[] {
	const steps: TourStep[] = [{ say: L.hello, settle: 500 }];

	if (mobile) {
		// One pane at a time: say where you write, then flip to where it appears.
		steps.push(
			{ say: L.write, point: SEL.paneEdit, click: true, act: (a) => a.setMobilePane('edit'), settle: 400 },
			{ say: L.preview, point: SEL.panePreview, click: true, act: (a) => a.setMobilePane('preview'), circle: SEL.preview, settle: 500 },
			{ say: L.present, point: buttonLabeled('Present'), settle: 700 },
			{ say: L.share, point: buttonLabeled('Share'), settle: 700 },
			{ say: L.close, settle: 800 },
		);
		return steps;
	}

	steps.push(
		{ say: L.write, point: SEL.editor, circle: SEL.editor, settle: 700 },
		{ say: L.preview, point: SEL.preview, circle: SEL.preview, settle: 700 },
		{ say: L.rail, point: rail, at: 'strip', settle: 500 },
		// Show the jump the line promised, then put the deck back on the slide the visitor had.
		{ point: railSlide(3), click: true, act: (a) => a.gotoSlide(2), settle: 1400 },
		{ point: railSlide(1), click: true, act: (a) => a.gotoSlide(0), settle: 700 },
		{ say: L.add, point: addSlide, settle: 700 },
		{ say: L.reshape, point: reshape, settle: 700 },
		{ say: L.compose, point: composeToggle, settle: 700 },
		{ say: L.fixAll, point: fixAll, settle: 700 },
		{ say: L.theme, point: q('[data-demo="theme"]'), circle: q('[data-demo="theme"]'), settle: 700 },
		// Light → dark is the one flourish: it shows a deck re-dressing itself. Put back on the next beat.
		{ say: L.mode, point: q('[data-demo="mode"]'), click: true, act: (a) => a.toggleMode(), settle: 1600 },
		{ say: L.posture, point: posture, act: (a) => a.toggleMode(), settle: 700 },
		{ say: L.search, point: q('[aria-label="Search or run a command"]'), at: 'here', settle: 700 },
		{ say: L.present, point: q('[data-demo="present"]'), at: 'Present', settle: 700 },
		{ say: L.share, point: q('[data-demo="share"]'), at: 'Share', settle: 500 },
		{ say: L.close, settle: 600 },
	);
	return steps;
}

export const welcome: TourBuild = ({ mobile }) => toWalkthrough(welcomeSteps(mobile));
