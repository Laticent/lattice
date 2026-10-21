import * as React from 'react';
import { notify } from '@/lib/notify';
import type { StopReason } from '../../lib/vetrina';
import { useLazyWalkthrough } from '../../lib/vetrina/react';
import { buildTypeOps } from './demo-typing';
import type { StudioActions } from './studio-actions';
import { DEFAULT_TOUR, loadTours, SPOKEN_TOURS } from './tours';
import type { buildTour as BuildTour } from './tours/build';

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
	setInspectorOpen: (open: boolean) => void;
	applyPalette: (name: string) => void;
	toggleMode: () => void;
	setPresentOpen: (open: boolean) => void;
	setShareOpen: (open: boolean) => void;
	/** Open/close the deck switcher dropdown (the "create a new deck" opener). */
	setDeckMenuOpen: (open: boolean) => void;
	/** Swap the phone's single Edit/Preview pane (mobile only). */
	setMobilePane: (pane: 'edit' | 'preview') => void;
	/** True on a phone (≤699px). Selects the phone-native single-pane storyboard, and starts
	 *  the run on the Preview pane so the fresh deck's editor is minted blank on first swap. */
	mobile: boolean;
	setActiveSlide: (index: number) => void;
	setFocus: (on: boolean) => void;
	/** Set the persisted posture. The tour runs on the full surface (Craft), where the
	 *  deck switcher + activity bar it anchors on live. */
	setPosture: (p: 'read' | 'write' | 'craft') => void;
	/** The posture the visitor is in now, so a tour that needs the editor on screen can put it back after. */
	posture: 'read' | 'write' | 'craft';
	/** A tour finished on its own (not stopped or taken over). The Studio uses it to offer what comes next. */
	onTourComplete?: (tourId: string) => void;
	setCmdOpen: (open: boolean) => void;
	/** In a live session the tour plays on a PRACTICE deck (2026-10-20 live note §7.5): `startPractice`
	 *  stands in for `createFirstDeck` and swaps the editor and preview to a blank local text the session
	 *  never sees; `endPractice` throws it away and puts the shared deck back. Null outside a session. */
	practice: { start: () => void; end: () => boolean } | null;
};

export type StudioDemo = {
	demoActive: boolean;
	/** Launch a tour by id (from the "Show Me" menu). Omit for the default tour (welcome banner,
	 *  ⋯ menu, ⌘K all pass nothing). Unknown ids fall back to the default. */
	startDemo: (tourId?: string, opts?: { sound?: boolean }) => void;
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
	// Whether a spoken tour plays its recorded voice (false = captions and timing only). Set with the id.
	const soundRef = React.useRef(true);
	// The voice module, loaded with the engine (never in the startup bundle). A spoken tour's narrator is
	// built from it inside the click that starts the run, so iOS lets it play.
	const voiceRef = React.useRef<typeof import('./tours/tour-voice') | null>(null);

	// The generic run lifecycle (single-flight start, stop, active state, unmount teardown)
	// lives in the shared `useWalkthrough` adapter. This hook supplies only the Studio-specific
	// configuration — snapshot the global look, clear the shell, bind the setters — at start().
	// The scripts' builder, set by the engine load below before `configure` runs.
	const buildRef = React.useRef<typeof BuildTour | null>(null);
	const demo = useLazyWalkthrough<StudioActions>(rootRef, () => {
		const buildTour = buildRef.current;
		if (!buildTour) return null;
		const b = bindRef.current;

		// Snapshot only the GLOBAL look the demo flourishes with — palette (from state, so
		// a saved theme keeps its name) and mode (from the DOM, a settled read). The deck
		// itself is NOT snapshotted: the demo builds a real, persisted "My First Deck".
		const tourId = tourIdRef.current;
		const snap = { posture: b.posture, palette: b.palette, mode: document.documentElement.dataset.mode || 'light' };
		// Decided once per run: a tour that started in a session stays a practice run to its end.
		const practice = b.practice;

		// Clear the shell to a clean compose canvas before the cursor appears.
		b.setCmdOpen(false);
		b.setFocus(false);
		// The tour anchors on the deck switcher + activity bar, which render only in Craft;
		// establish the full surface so no beat resolves a missing selector to a no-op.
		// The welcome tour walks the editor and preview, so it needs Write at least; it leaves a Craft
		// visitor in Craft and puts a Read visitor back in Read when it ends. The others open the full surface.
		const welcome = tourIdRef.current === 'welcome';
		if (!welcome) b.setPosture('craft');
		else if (b.posture === 'read') b.setPosture('write');
		b.setView('compose');
		// In a session, Present may be the room's (someone presenting to everyone): the tour leaves it be.
		if (!practice) b.setPresentOpen(false);
		b.setShareOpen(false);
		b.setArchitectOpen(false);
		b.setInspectorOpen(false);
		b.setActiveSlide(0);
		// On a phone, start on Preview — the fresh "My First Deck" then mints its editor doc
		// blank on the first swap-to-edit (no seed to append onto), and the preview is home.
		if (b.mobile) b.setMobilePane('preview');

		// The action bag: every step's `act` pokes a live setter through the ref, so a
		// long-running demo always drives the freshest state.
		// In a session the deck menu stays shut (its items leave the session) and the new deck is a practice one.
		const actions: StudioActions = {
			openDeckMenu: (o) => {
				if (!practice) bindRef.current.setDeckMenuOpen(o);
			},
			createFirstDeck: () => (practice ? practice.start() : bindRef.current.createFirstDeck()),
			gotoSlide: (i) => bindRef.current.goToSlide(i),
			setMobilePane: (pane) => bindRef.current.setMobilePane(pane),
			toggleMode: () => bindRef.current.toggleMode(),
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
			// A spoken tour plays the recorded voice, which leans toward the cursor's target; the others stay silent.
			narrate: SPOKEN_TOURS.includes(tourIdRef.current) ? voiceRef.current?.tourNarrator(soundRef.current) : undefined,
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
				if (practice) {
					// The practice deck goes; the shared deck comes back. The look was never touched.
					// False when the session ended mid-tour and already put the deck back: there is no shared deck now.
					const back = practice.end();
					cur.setInspectorOpen(false);
					notify(!back ? 'Tour ended.' : reason === 'complete' ? 'Tour complete. You are back on the shared deck.' : 'Tour ended. You are back on the shared deck.');
					return;
				}
				// The deck is NOT restored (the newcomer keeps "My First Deck"). Only the
				// global flourishes are undone — close any stage the demo left open, and put
				// the palette + mode back the way we found them (the demo reskins to carbone and
				// flips mode purely for show). Every terminal path routes here; the reason
				// only picks the toast. Runs AFTER teardown (I7); the hook resets `active`.
				cur.setPresentOpen(false);
				cur.setShareOpen(false);
				cur.setInspectorOpen(false);
				cur.setDeckMenuOpen(false);
				if (welcome && snap.posture === 'read') cur.setPosture('read');
				cur.applyPalette(snap.palette);
				if ((document.documentElement.dataset.mode || 'light') !== snap.mode) cur.toggleMode();
				// Names no deck: a deck is titled by its first heading now, so by the time a tour
				// finishes it is called whatever the tour typed — not “My First Deck”.
				// A SPOKEN tour that ends by itself hands over to the host's own next step (the Studio opens its
				// "go further" card); every other ending, and every other tour, keeps the plain toast.
				if (reason === 'complete' && SPOKEN_TOURS.includes(tourId) && cur.onTourComplete) cur.onTourComplete(tourId);
				else notify(reason === 'complete' ? 'Demo complete — the deck is yours to edit.' : 'Demo ended — the deck is yours to edit.');
			},
		};
	}, () =>
		// The engine and the tour scripts load together on the first start (route budget: neither
		// is in the Studio's startup bundle).
		Promise.all([import('../../lib/vetrina/index.js'), loadTours(), SPOKEN_TOURS.includes(tourIdRef.current) ? import('./tours/tour-voice') : null]).then(([engine, tours, voice]) => {
			buildRef.current = tours.buildTour;
			voiceRef.current = voice;
			return engine;
		}),
	);

	// startDemo(id) records the tour, THEN starts — the run's configure closure reads the ref.
	const startDemo = React.useCallback(
		(tourId?: string, opts?: { sound?: boolean }) => {
			// Coerce defensively: some entry points wire startDemo straight to onClick/onSelect,
			// which would pass a DOM event — anything non-string means "the default tour."
			tourIdRef.current = typeof tourId === 'string' ? tourId : DEFAULT_TOUR;
			soundRef.current = opts?.sound !== false;
			// Build the narrator NOW, inside the click, when its module is already here (the welcome card
			// preloads it); otherwise it is built once the import lands and unlocks on the next gesture.
			if (SPOKEN_TOURS.includes(tourIdRef.current) && soundRef.current) voiceRef.current?.prepareTourVoice();
			// A refused start (a lesson already holds Vetrina's one run) or a failed chunk load leaves
			// the Studio as it was; the hook has already unlatched `active`.
			demo.start().catch(() => notify('The tour could not start. If a lesson is running, finish or close it first.'));
		},
		[demo.start],
	);

	return { demoActive: demo.active, startDemo, stopDemo: demo.stop };
}
