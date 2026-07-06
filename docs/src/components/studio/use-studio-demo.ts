import * as React from 'react';
import { type RunHandle, run, type StopReason, type TypeOps } from '../../lib/vetrina';
import { type StudioActions, studioWalkthrough } from './demo-storyboard';

// useStudioDemo — the seam that lets the framework-free Vetrina engine drive the live
// Studio. StudioShell has no ref/context (all state is closure-local), so the demo is
// BORN HERE, inside the component, closing over the real setters. The hook owns the
// run lifecycle: snapshot the global flourishes, mount + play via run(), and — on
// completion, Exit, OR the first real click/keystroke ("take over") — restore. The
// take-over guard, abort-racing, and teardown now live inside run(); this hook just
// binds the Studio's setters and restores its global flourishes on stop.

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
	const [demoActive, setDemoActive] = React.useState(false);
	// Keep the latest bindings in a ref so the run loop never closes over stale setters,
	// and startDemo/stopDemo stay stable (no re-subscribe churn).
	const bindRef = React.useRef(bindings);
	bindRef.current = bindings;
	const handleRef = React.useRef<RunHandle | null>(null);

	const stopDemo = React.useCallback(() => {
		handleRef.current?.stop();
	}, []);

	const startDemo = React.useCallback(() => {
		if (handleRef.current?.active) return; // already running
		const root = rootRef.current;
		if (!root) return;
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
		};

		// Typing lands natively in the editor (append per keystroke run; set for the
		// reduced-motion / large-insert path). The diff baseline is run-scoped in Vetrina.
		const type: TypeOps = {
			set: (t) => bindRef.current.setSource(t),
			append: (t) => bindRef.current.typeTail(t),
		};

		setDemoActive(true);
		handleRef.current = run<StudioActions>({
			root,
			actions,
			play: studioWalkthrough,
			type,
			takeover: { scope: 'window' },
			// The cursor + cues track the live app accent (recolour on the reskin beat),
			// falling back to the house blue — exactly as the old stage did.
			theme: { accent: 'var(--accent, #2b6ef2)' },
			onStop: (reason: StopReason) => {
				const cur = bindRef.current;
				// The deck is NOT restored (the newcomer keeps "My First Deck"). Only the
				// global flourishes are undone — close any stage the demo left open, and put
				// the palette + mode back the way we found them (the demo reskins to cuoio and
				// flips mode purely for show). Every terminal path routes here; the reason
				// only picks the toast. Runs AFTER teardown (I7).
				cur.setPresentOpen(false);
				cur.setShareOpen(false);
				cur.setInspectorOpen(false);
				cur.setDeckMenuOpen(false);
				cur.applyPalette(snap.palette);
				if ((document.documentElement.dataset.mode || 'light') !== snap.mode) cur.toggleMode();
				cur.notify(reason === 'complete' ? 'Demo complete — “My First Deck” is yours to edit.' : 'Demo ended — “My First Deck” is yours to edit.');
				handleRef.current = null;
				setDemoActive(false);
			},
		});
	}, [rootRef]);

	// Safety net: tear down if the Studio unmounts mid-demo.
	React.useEffect(() => () => handleRef.current?.stop(), []);

	return { demoActive, startDemo, stopDemo };
}
