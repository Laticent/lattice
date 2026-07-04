import * as React from 'react';
import { type DemoActions, runStoryboard } from './demo-director';
import { createDemoStage, isAbortError } from './demo-stage';
import { studioWalkthrough } from './demo-storyboard';

// useStudioDemo — the seam that lets a framework-free director drive the live
// Studio. StudioShell has no ref/context (all state is closure-local), so the demo
// is BORN HERE, inside the component, closing over the real setters. The hook owns
// the run lifecycle: snapshot the viewer's deck, mount the stage, play the
// storyboard, and — on completion, Exit, OR the first real click/keystroke
// ("take over") — tear the stage down and restore exactly what was on screen.

/** The Studio setters the demo drives (each already bound to real state). */
export type StudioDemoBindings = {
	/** Latest deck source — snapshotted at start, restored at end. */
	source: string;
	/** Active palette NAME (a builtin or a saved-theme name) — snapshotted/restored.
	 *  Read from state, not `data-palette`, so a saved theme restores correctly. */
	palette: string;
	/** Set true while the demo runs, so StudioShell's autosave stands down and the
	 *  demo's sample deck never persists over the viewer's stored deck. */
	demoActiveRef: React.MutableRefObject<boolean>;
	setSource: (source: string) => void;
	/** Append typed text natively in the editor (the demo's typing channel). */
	typeTail: (text: string) => void;
	goToSlide: (index: number) => void;
	setView: (view: 'compose' | 'fabricate') => void;
	setArchitectOpen: (open: boolean) => void;
	setArchitectTab: (tab: 'coach' | 'chat') => void;
	setInspectorOpen: (open: boolean) => void;
	applyPalette: (name: string) => void;
	toggleMode: () => void;
	setPresentOpen: (open: boolean) => void;
	setShareOpen: (open: boolean) => void;
	/** Open/close the per-slide settings drawer (`notesOpen`). */
	setNotesOpen: (open: boolean) => void;
	/** Open/close the deck switcher dropdown (the "create a new deck" opener). */
	setDeckMenuOpen: (open: boolean) => void;
	/** The drawer's commit funnel — apply a pure transform to the active slide. */
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

export function useStudioDemo(
	rootRef: React.RefObject<HTMLElement | null>,
	bindings: StudioDemoBindings,
): StudioDemo {
	const [demoActive, setDemoActive] = React.useState(false);
	// Keep the latest bindings in a ref so the run loop never closes over stale
	// setters, and startDemo/stopDemo stay stable (no re-subscribe churn).
	const bindRef = React.useRef(bindings);
	bindRef.current = bindings;
	// Live run handle: the abort controller, the mounted stage, the take-over
	// listeners, and the snapshot to restore. Null when no demo is running.
	const runRef = React.useRef<{
		controller: AbortController;
		stop: (reason: 'complete' | 'takeover' | 'exit') => void;
	} | null>(null);

	const stopDemo = React.useCallback(() => {
		runRef.current?.stop('exit');
	}, []);

	const startDemo = React.useCallback(() => {
		if (runRef.current) return; // already running
		const root = rootRef.current;
		if (!root) return;
		const b = bindRef.current;

		// Snapshot everything the demo will mutate, so any exit restores it. The
		// palette comes from state (a saved theme keeps its name); mode from the DOM
		// (site-chrome writes `data-mode` synchronously, so it's a settled read).
		const snap = {
			source: b.source,
			palette: b.palette,
			mode: document.documentElement.dataset.mode || 'light',
		};

		const controller = new AbortController();
		let stopped = false;
		// Persistence stands down for the whole run (restored inside stop()).
		b.demoActiveRef.current = true;

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

		const stage = createDemoStage(root, () => runRef.current?.stop('exit'));

		// Any REAL pointer/keydown that isn't on the demo chrome = the viewer taking
		// over. Capture phase so we see it before the Studio does; the click still
		// falls through to the control the viewer aimed at.
		const onUserInput = (e: Event) => {
			if (stage.contains(e.target)) return;
			runRef.current?.stop('takeover');
		};

		const stop = (reason: 'complete' | 'takeover' | 'exit') => {
			if (stopped) return;
			stopped = true;
			controller.abort();
			window.removeEventListener('pointerdown', onUserInput, true);
			window.removeEventListener('keydown', onUserInput, true);
			stage.destroy();
			runRef.current = null;
			setDemoActive(false);

			const cur = bindRef.current;
			// Re-enable persistence BEFORE the restore writes, so the healing
			// setSource re-saves the viewer's own deck (not the demo's sample).
			cur.demoActiveRef.current = false;
			// EVERY exit restores the viewer's deck, theme, and mode — including
			// take-over and Escape (both route through onUserInput). Never leave the
			// sample deck behind: it would otherwise persist over their real deck the
			// moment they typed. The reason only changes the toast wording.
			cur.setPresentOpen(false);
			cur.setShareOpen(false);
			cur.setSource(snap.source);
			cur.setActiveSlide(0);
			cur.applyPalette(snap.palette);
			if ((document.documentElement.dataset.mode || 'light') !== snap.mode) cur.toggleMode();
			cur.notify(reason === 'complete' ? 'Demo complete — your deck is back.' : 'Demo ended — your deck is back.');
		};

		runRef.current = { controller, stop };
		setDemoActive(true);
		window.addEventListener('pointerdown', onUserInput, true);
		window.addEventListener('keydown', onUserInput, true);

		// The action bag: every step's `act` pokes a live setter through this ref, so
		// a long-running demo always drives the freshest state.
		const actions: DemoActions = {
			setSource: (s) => bindRef.current.setSource(s),
			typeTail: (t) => bindRef.current.typeTail(t),
			gotoSlide: (i) => bindRef.current.goToSlide(i),
			setView: (v) => bindRef.current.setView(v),
			openArchitect: (o) => bindRef.current.setArchitectOpen(o),
			setArchitectTab: (t) => bindRef.current.setArchitectTab(t),
			openInspector: (o) => bindRef.current.setInspectorOpen(o),
			setPalette: (n) => bindRef.current.applyPalette(n),
			toggleMode: () => bindRef.current.toggleMode(),
			openPresent: (o) => bindRef.current.setPresentOpen(o),
			openShare: (o) => bindRef.current.setShareOpen(o),
			openSlideSettings: (o) => bindRef.current.setNotesOpen(o),
			openDeckMenu: (o) => bindRef.current.setDeckMenuOpen(o),
			mutateSlide: (fn) => bindRef.current.mutateSlide(fn),
			notify: (m) => bindRef.current.notify(m),
			fixAll: () => bindRef.current.fixAll(),
		};

		runStoryboard(stage, actions, studioWalkthrough, controller.signal)
			.then(() => stop('complete'))
			.catch((err) => {
				if (isAbortError(err)) return; // stop() already ran (takeover / exit)
				stop('exit');
			});
	}, [rootRef]);

	// Safety net: tear down if the Studio unmounts mid-demo.
	React.useEffect(() => () => runRef.current?.stop('exit'), []);

	return { demoActive, startDemo, stopDemo };
}
