import * as React from 'react';
import { notify } from '@/lib/notify';
import type { StopReason } from '../../lib/vetrina';
import { useWalkthrough } from '../../lib/vetrina/react';
import { buildTypeOps } from './demo-typing';
import type { StudioActions } from './studio-actions';
import { buildTour, DEFAULT_TOUR } from './tours';

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
	/** Scroll the editor's view to the END of the document, caret untouched. The controlled
	 *  typing path needs it explicitly; a native `typeTail` gets the same reveal for free by
	 *  moving the caret. */
	revealEditorTail: () => void;
	/** True once the lazy editor has mounted. When false (a "Take a tour" click in the
	 *  brief cold-load window before the CodeMirror chunk mounts), the demo types through
	 *  the controlled `setSource` path instead of the native `typeTail`, so no characters
	 *  drop into a not-yet-mounted editor. */
	editorReady: () => boolean;
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
	/** Set the persisted posture. The tour runs on the full surface (Craft), where the
	 *  deck switcher + activity bar it anchors on live. */
	setPosture: (p: 'write' | 'craft') => void;
	setCmdOpen: (open: boolean) => void;
};

export type StudioDemo = {
	demoActive: boolean;
	/** Launch a tour by id (from the "Show Me" menu). Omit for the default tour (welcome banner,
	 *  ⋯ menu, ⌘K all pass nothing). Unknown ids fall back to the default. */
	startDemo: (tourId?: string) => void;
	stopDemo: () => void;
};

export function useStudioDemo(rootRef: React.RefObject<HTMLElement | null>, bindings: StudioDemoBindings): StudioDemo {
	// Keep the latest bindings in a ref so the run loop never closes over stale setters,
	// and start/stop stay stable (no re-subscribe churn).
	const bindRef = React.useRef(bindings);
	bindRef.current = bindings;

	// Which tour to play — set by startDemo(id) right before the run's `configure` closure reads
	// it. A ref (not state) so startDemo stays referentially stable and needs no re-render.
	const tourIdRef = React.useRef<string>(DEFAULT_TOUR);

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
		b.setFocus(false);
		// The tour anchors on the deck switcher + activity bar, which render only in Craft;
		// establish the full surface so no beat resolves a missing selector to a no-op.
		b.setPosture('craft');
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
		// The typing channel — which sink a tour's characters land in — is built by
		// `buildTypeOps` (./demo-typing), where the two channels and the reason a controlled write
		// owes a reveal are written down. What stays here is the DOM scheduling it cannot own:
		//
		// The double rAF is for the one thing that is genuinely ordering rather than measurement:
		// the DOCUMENT. `setSource` is React state, and the value-sync effect that writes it into
		// the editor runs after the commit, so a reveal fired synchronously would reveal the tail
		// as it was before this keystroke. Two frames clear the commit and its passive effects.
		//
		// And the reveal ASKS CODEMIRROR (`revealEditorTail` -> `EditorHandle.revealTail`) rather
		// than setting `scrollTop = scrollHeight` on a selector-found `.cm-scroller`, which was two
		// guesses in one line: the extent (`scrollHeight` is whatever CodeMirror has measured so
		// far, so arriving before its measure cycle scrolls to the pre-insert height) and the
		// element (`.cm-scroller` is the scroller only while the editor is the height-constrained
		// box on this surface, on this engine). CodeMirror measures its own document and walks the
		// real scrollable ancestors; if the reveal still lands early it shows the previous tail —
		// one line behind — rather than parking at the top.
		const followEditor = () => {
			requestAnimationFrame(() => requestAnimationFrame(() => bindRef.current.revealEditorTail()));
		};
		// Native `typeTail` needs the mounted editor; take the controlled path on a phone OR when
		// the lazy editor has not mounted yet (a fast "Take a tour" click during the cold-load chunk
		// fetch). Decided once per run — if the editor mounts mid-run the controlled path keeps
		// working, since its `value` is what drives the editor.
		const type = buildTypeOps({
			controlled: bindRef.current.mobile || !bindRef.current.editorReady(),
			setSource: (t) => bindRef.current.setSource(t),
			typeTail: (t) => bindRef.current.typeTail(t),
			follow: followEditor,
		});

		return {
			actions,
			// The selected tour, built responsively — one script adapts to the phone's single pane
			// (per-slide alternation) vs. the desktop/tablet side-by-side. tourIdRef was set by
			// startDemo(id) just before this closure ran.
			play: buildTour(tourIdRef.current, { mobile: b.mobile }),
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
				// the palette + mode back the way we found them (the demo reskins to carbone and
				// flips mode purely for show). Every terminal path routes here; the reason
				// only picks the toast. Runs AFTER teardown (I7); the hook resets `active`.
				cur.setPresentOpen(false);
				cur.setShareOpen(false);
				cur.setInspectorOpen(false);
				cur.setDeckMenuOpen(false);
				cur.applyPalette(snap.palette);
				if ((document.documentElement.dataset.mode || 'light') !== snap.mode) cur.toggleMode();
				// Names no deck: a deck is titled by its first heading now, so by the time a tour
				// finishes it is called whatever the tour typed — not “My First Deck”.
				notify(reason === 'complete' ? 'Demo complete — the deck is yours to edit.' : 'Demo ended — the deck is yours to edit.');
			},
		};
	});

	// startDemo(id) records the tour, THEN starts — the run's configure closure reads the ref.
	const startDemo = React.useCallback(
		(tourId?: string) => {
			// Coerce defensively: some entry points wire startDemo straight to onClick/onSelect,
			// which would pass a DOM event — anything non-string means "the default tour."
			tourIdRef.current = typeof tourId === 'string' ? tourId : DEFAULT_TOUR;
			demo.start();
		},
		[demo.start],
	);

	return { demoActive: demo.active, startDemo, stopDemo: demo.stop };
}
