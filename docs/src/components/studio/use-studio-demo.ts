import * as React from 'react';
import type { StopReason, TypeOps } from '../../lib/vetrina';
import { useWalkthrough } from '../../lib/vetrina/react';
import { type StudioActions, studioWalkthrough } from './demo-storyboard';
import { studioMobileWalkthrough } from './mobile-demo-storyboard';

// useStudioDemo — the seam that lets the framework-free Vetrina engine drive the live
// Studio. StudioShell has no ref/context (all state is closure-local), so the demo is
// BORN HERE, inside the component, closing over the real setters. The generic run
// lifecycle (single-flight start/stop, active state, unmount teardown) lives in Vetrina's
// shared `useWalkthrough` React adapter; this hook is the Studio-SPECIFIC configuration it
// drives — snapshot the global flourishes, clear the shell, bind the setters, and restore
// the flourishes on stop (completion, Exit, OR the first real click/keystroke: "take over").

/** The Studio setters the demo drives (each already bound to real state). */
export type StudioDemoBindings = {
	/** Active palette NAME (a builtin or a saved-theme name) — snapshotted/restored.
	 *  Read from state, not `data-palette`, so a saved theme restores correctly. */
	palette: string;
	/** Create the demo's real, deduped "My First Deck" and switch to it (blank). It
	 *  persists — the newcomer walks away with it — so nothing here is restored. */
	createFirstDeck: () => void;
	setSource: (source: string) => void;
	/** Append typed text natively in the editor (the demo's typing channel). */
	typeTail: (text: string) => void;
	goToSlide: (index: number) => void;
	setView: (view: 'compose' | 'fabricate') => void;
	setArchitectOpen: (open: boolean) => void;
	setArchitectTab: (tab: 'coach' | 'chat') => void;
	setInspectorOpen: (open: boolean) => void;
	/** Point the (real) Inspector at a scope — 'slide' for per-slide settings,
	 *  'deck' for deck-wide. The demo drives the SAME panel the author uses. */
	setInspectorScope: (scope: 'slide' | 'deck') => void;
	applyPalette: (name: string) => void;
	toggleMode: () => void;
	setPresentOpen: (open: boolean) => void;
	setShareOpen: (open: boolean) => void;
	/** Open/close the deck switcher dropdown (the "create a new deck" opener). */
	setDeckMenuOpen: (open: boolean) => void;
	/** The slide scope's commit funnel — apply a pure transform to the active slide. */
	mutateSlide: (fn: (chunk: string) => string) => void;
	/** Swap the phone's single Edit/Preview pane (mobile only). */
	setMobilePane: (pane: 'edit' | 'preview') => void;
	/** True on a phone (≤699px). Selects the phone-native single-pane storyboard, and starts
	 *  the run on the Preview pane so the fresh deck's editor is minted blank on first swap. */
	mobile: boolean;
	fixAll: () => void;
	setActiveSlide: (index: number) => void;
	setFocus: (on: boolean) => void;
	setWelcomeOpen: (open: boolean) => void;
	setCmdOpen: (open: boolean) => void;
	notify: (message: string) => void;
};

export type StudioDemo = {
	demoActive: boolean;
	startDemo: () => void;
	stopDemo: () => void;
};

export function useStudioDemo(rootRef: React.RefObject<HTMLElement | null>, bindings: StudioDemoBindings): StudioDemo {
	// Keep the latest bindings in a ref so the run loop never closes over stale setters,
	// and start/stop stay stable (no re-subscribe churn).
	const bindRef = React.useRef(bindings);
	bindRef.current = bindings;

	// The generic run lifecycle (single-flight start, stop, active state, unmount teardown)
	// lives in the shared `useWalkthrough` adapter. This hook supplies only the Studio-specific
	// configuration — snapshot the global look, clear the shell, bind the setters — at start().
	const demo = useWalkthrough<StudioActions>(rootRef, () => {
		const b = bindRef.current;

		// Snapshot only the GLOBAL look the demo flourishes with — palette (from state, so
		// a saved theme keeps its name) and mode (from the DOM, a settled read). The deck
		// itself is NOT snapshotted: the demo builds a real, persisted "My First Deck".
		const snap = { palette: b.palette, mode: document.documentElement.dataset.mode || 'light' };

		// Clear the shell to a clean compose canvas before the cursor appears.
		b.setCmdOpen(false);
		b.setWelcomeOpen(false);
		b.setFocus(false);
		b.setView('compose');
		b.setPresentOpen(false);
		b.setShareOpen(false);
		b.setArchitectOpen(false);
		b.setInspectorOpen(false);
		b.setActiveSlide(0);
		// On a phone, start on Preview — the fresh "My First Deck" then mints its editor doc
		// blank on the first swap-to-edit (no seed to append onto), and the preview is home.
		if (b.mobile) b.setMobilePane('preview');

		// The action bag: every step's `act` pokes a live setter through the ref, so a
		// long-running demo always drives the freshest state.
		const actions: StudioActions = {
			openDeckMenu: (o) => bindRef.current.setDeckMenuOpen(o),
			createFirstDeck: () => bindRef.current.createFirstDeck(),
			gotoSlide: (i) => bindRef.current.goToSlide(i),
			// The reskin beat is deck-wide — point the real Inspector at deck scope.
			openInspector: (o) => {
				if (o) bindRef.current.setInspectorScope('deck');
				bindRef.current.setInspectorOpen(o);
			},
			setPalette: (n) => bindRef.current.applyPalette(n),
			toggleMode: () => bindRef.current.toggleMode(),
			openArchitect: (o) => bindRef.current.setArchitectOpen(o),
			setArchitectTab: (t) => bindRef.current.setArchitectTab(t),
			openPresent: (o) => bindRef.current.setPresentOpen(o),
			openShare: (o) => bindRef.current.setShareOpen(o),
			// "Every slide has its own controls" — the SAME right-hand panel the author
			// uses, at slide scope. No separate modal drawer; the demo drives the real UI.
			openSlideSettings: (o) => {
				if (o) bindRef.current.setInspectorScope('slide');
				bindRef.current.setInspectorOpen(o);
			},
			mutateSlide: (fn) => bindRef.current.mutateSlide(fn),
			setMobilePane: (pane) => bindRef.current.setMobilePane(pane),
		};

		// Typing lands natively in the editor (append per keystroke run; set for the
		// reduced-motion / large-insert path). The diff baseline is run-scoped in Vetrina.
		// DESKTOP types NATIVELY (typeTail) for real caret + scroll-follow. MOBILE routes typing
		// through the CONTROLLED setSource path: a native typeTail insert makes the CodeMirror doc
		// run AHEAD of the React `value` prop, and the editor's value-sync then diffs against the
		// lagging value and DELETES the chars typed since — intermittent DROPPED CHARACTERS
		// (garbled slides), likelier since the preview re-renders during typing (both panes mounted
		// now). The single controlled writer removes the race; React coalesces so it still reads as
		// typing. `acc` mirrors the doc so an `append(delta)` re-sets the whole growing string.
		let acc = '';
		const type: TypeOps = bindRef.current.mobile
			? {
					set: (t) => {
						acc = t;
						bindRef.current.setSource(t);
					},
					append: (t) => {
						acc += t;
						bindRef.current.setSource(acc);
					},
				}
			: {
					set: (t) => bindRef.current.setSource(t),
					append: (t) => bindRef.current.typeTail(t),
				};

		return {
			actions,
			// A phone gets the single-pane storyboard (per-slide alternation across the swappable
			// Edit/Preview pane); desktop + tablet get the side-by-side script.
			play: b.mobile ? studioMobileWalkthrough : studioWalkthrough,
			type,
			takeover: { scope: 'window' },
			// The cursor + cues track the live app accent (recolor on the reskin beat), falling
			// back to the house blue. Caption style is breakpoint-aware: 'scrim' (film-subtitle,
			// no box) on a PHONE — its short beats ride the dark bottom of the mobile preview and
			// it frees the cramped width; 'bar' (a centered pill) on desktop/tablet, where the
			// preview is light and the narration is longer/multi-line (scrim would drop below AA
			// contrast on its upper lines there). Both keep Exit an always-reachable icon.
			theme: { accent: 'var(--accent, #2b6ef2)', caption: b.mobile ? 'scrim' : 'bar' },
			onStop: (reason: StopReason) => {
				const cur = bindRef.current;
				// The deck is NOT restored (the newcomer keeps "My First Deck"). Only the
				// global flourishes are undone — close any stage the demo left open, and put
				// the palette + mode back the way we found them (the demo reskins to cuoio and
				// flips mode purely for show). Every terminal path routes here; the reason
				// only picks the toast. Runs AFTER teardown (I7); the hook resets `active`.
				cur.setPresentOpen(false);
				cur.setShareOpen(false);
				cur.setInspectorOpen(false);
				cur.setDeckMenuOpen(false);
				cur.applyPalette(snap.palette);
				if ((document.documentElement.dataset.mode || 'light') !== snap.mode) cur.toggleMode();
				cur.notify(reason === 'complete' ? 'Demo complete — “My First Deck” is yours to edit.' : 'Demo ended — “My First Deck” is yours to edit.');
			},
		};
	});

	return { demoActive: demo.active, startDemo: demo.start, stopDemo: demo.stop };
}
