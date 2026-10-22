// Playground tour — the Explore-first surface, now narrated and driven by Vetrina.
//
// Same stops as before (mode toggle → pick a component → walk the deck → jump with the Step
// dropdown → Edit the markdown → galleries → deck setup → palette), now spoken in the tour voice,
// which leans toward whatever the cursor points at. The recorded lines live in
// components/studio/tours/lines.ts (PLAYGROUND_LINES), found by exact text, so a line reworded
// there needs `node tools/record-lesson-voice.mjs` before it is heard.
//
// Every step declares the MODE its target needs (`mode: 'read' | 'edit'`). A step whose mode
// differs from where the tour is gets a silent switch beat first, through the same `pg-set-view`
// event the Explore/Edit toggle uses (PlaygroundApp listens for it). The mode flip also sets
// body[data-pane], so the single-pane phone layout reveals the right pane.
//
// The shared helper (guided-tour.js) owns the Tour button, the first-visit offer and the global
// on/off. The offer is a card in PlaygroundApp (the shared WelcomeCard): audio only plays after a
// click, so the card is also where the visitor tests their sound before anything speaks.
import { PLAYGROUND_LINES as L, PLAYGROUND_VOICE_DIR } from '../components/studio/tours/lines';
import { initGuidedTour } from './guided-tour.js';

export { PLAYGROUND_VOICE_DIR as VOICE_DIR };

export const STEPS = [
	{ say: L.hello },
	{ element: '.pg-mode', mode: 'read', say: L.mode },
	{ element: '#pg-template-trigger', mode: 'read', say: L.pick },
	{ element: '#pg-walk', mode: 'read', say: L.walk },
	{ element: '#pg-step', mode: 'read', say: L.step },
	{ element: '#editor-host', mode: 'edit', say: L.edit },
	{ element: '#pg-galleries-trigger', mode: 'read', say: L.galleries },
	{ element: '#pg-setup-trigger', say: L.setup },
	{ element: 'button[aria-label="Theme"]', say: L.palette },
	{ say: L.close },
];

const currentView = () => document.body.getAttribute('data-view') || 'edit';
const setView = (v) => document.dispatchEvent(new CustomEvent('pg-set-view', { detail: v }));
const isMobile = () => window.matchMedia?.('(max-width: 699px)').matches ?? false;

/** The storyboard beats for STEPS, with a silent mode-switch beat wherever the mode has to change. */
export function beats(startView = currentView()) {
	const out = [];
	let view = startView;
	for (const s of STEPS) {
		if (s.mode && s.mode !== view) {
			const to = s.mode;
			const target = s.element;
			out.push({ instant: true, act: () => setView(to), until: () => !!document.querySelector(target), settle: 350 });
			view = to;
		}
		// A step whose target is gone (a build that dropped a control) is skipped, never stranded on.
		out.push(s.element ? { say: s.say, point: () => document.querySelector(s.element), settle: 700 } : { say: s.say, settle: 700 });
	}
	return out;
}

/**
 * Run the narrated tour. Called from the click on the welcome card's Start button, so `sound`
 * has already built (and unlocked) the narrator there. Resolves when the run is set up.
 * @param {{ sound?: boolean }} [opts]
 */
export async function startPlaygroundTour({ sound = true } = {}) {
	const [{ run, storyboard }, voice] = await Promise.all([import('../lib/vetrina/index.js'), import('../components/studio/tours/tour-voice')]);
	const startView = currentView();
	const play = storyboard('', beats(startView));
	try {
		run({
			root: document.body,
			actions: {},
			play,
			narrate: voice.tourNarrator(sound, PLAYGROUND_VOICE_DIR),
			theme: { accent: 'var(--accent, #2b6ef2)', caption: isMobile() ? 'scrim' : 'bar' },
			takeover: { scope: 'window' },
			// Put the visitor back where they were: the tour flips Explore/Edit, and a visitor who
			// stopped it in the middle should not be left in the other view.
			onStop: () => {
				if (currentView() !== startView) setView(startView);
			},
		});
	} catch {
		// A run is already in flight (single-flight): leave it be.
	}
}

export function initPlaygroundTour() {
	// The offer is a React card; this only has to ask for it. The island may not have hydrated when the
	// first-visit timer fires (and its listener is not there yet), so the ask is also left on `window`
	// for the card to find when it mounts.
	return initGuidedTour({
		key: 'playground',
		onStart: () => {
			window.__pgTourOffer = true;
			document.dispatchEvent(new CustomEvent('pg-tour-offer'));
		},
	});
}
