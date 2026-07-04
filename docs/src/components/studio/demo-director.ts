// The DEMO DIRECTOR — a framework-free sequencer that plays a storyboard of steps
// against the live Studio. It knows nothing about React: it drives the visible
// theater through a DemoStage (cursor + caption) and every real state change
// through a DemoActions bag the host binds to the Studio's own setters.
//
// A step is interpreted in a FIXED order — say → point → click → act → type →
// settle — so a storyboard reads top-to-bottom as "narrate, move to the control,
// tap it, make it happen, type, breathe." The cursor NEVER dispatches the action;
// `act()` (a real setter) does. That decoupling is the whole robustness story.

import { type DemoStage, wait } from './demo-stage';

/** The Studio operations a storyboard can trigger — each bound to a real setter. */
export type DemoActions = {
	/** Replace the whole deck source (seed / restore / the rare rewrite). */
	setSource: (source: string) => void;
	/** Append typed text at the editor's tail — a native CodeMirror insert that
	 *  scrolls to follow and flows back to `source` via onChange. The typing channel. */
	typeTail: (text: string) => void;
	/** Select a slide by index (drives the preview + editor reveal). */
	gotoSlide: (index: number) => void;
	setView: (view: 'compose' | 'fabricate') => void;
	openArchitect: (open: boolean) => void;
	setArchitectTab: (tab: 'coach' | 'chat') => void;
	openInspector: (open: boolean) => void;
	/** Apply a palette/theme by name (e.g. 'cuoio'). */
	setPalette: (name: string) => void;
	/** Flip light/dark mode. */
	toggleMode: () => void;
	openPresent: (open: boolean) => void;
	openShare: (open: boolean) => void;
	/** Open/close the deck switcher dropdown (the "create a new deck" opener). */
	openDeckMenu: (open: boolean) => void;
	/** Create (and switch to) the demo's real, persisted "My First Deck" — deleting any
	 *  prior one first, so a re-run never duplicates. The newcomer keeps this deck. */
	createFirstDeck: () => void;
	/** Show a Studio toast (e.g. "New deck created."). */
	notify: (message: string) => void;
	/** Open/close the per-slide settings drawer (the closing polish flourish). */
	openSlideSettings: (open: boolean) => void;
	/** Apply a pure chunk→chunk transform to the ACTIVE slide's source (the drawer's
	 *  own commit channel) — e.g. add a finish or a status stamp. */
	mutateSlide: (fn: (chunk: string) => string) => void;
	/** Run every autofixable lint finding (the editor's "Fix all"). */
	fixAll: () => void;
};

export type DemoStep = {
	/** Narration caption; persists until the next step that sets `say` (''=clear). */
	say?: string;
	/** CSS selector (within the Studio root) to glide the cursor to. An anticipation
	 *  cue (streak + ping) fires toward it before the cursor moves. */
	moveTo?: string;
	/** Play the click burst after arriving. Purely visual — pair with `act`. */
	click?: boolean;
	/** CSS selector to circle with the cursor + frame glow — the "look what
	 *  rendered" gesture. Runs after `act`/`type`. */
	circle?: string;
	/** The real state change — a closure over a bound DemoAction. Runs after the ripple. */
	act?: (a: DemoActions) => void;
	/** Type toward this full source string (character by character from the current). */
	type?: string;
	/** ms per character for `type` (default TYPE_CADENCE). */
	cadence?: number;
	/** ms to hold after the step so the viewer can read the result (default STEP_SETTLE). */
	settle?: number;
};

/** A storyboard is a factory so its `act` closures can reference nothing external. */
export type Storyboard = {
	/** The demo deck's starting source (typed onto / restored from). */
	seed: string;
	steps: DemoStep[];
};

const STEP_SETTLE = 900;
const TYPE_CADENCE = 22;

/** Longest common prefix length of two strings — the diff pivot for typing. */
function commonPrefix(a: string, b: string): number {
	const n = Math.min(a.length, b.length);
	let i = 0;
	while (i < n && a[i] === b[i]) i++;
	return i;
}

/** How the director mutates the deck: replace the whole doc, or append a typed run. */
type TypeOps = { set: (source: string) => void; append: (text: string) => void };

// Type toward `target` from `current`. Append-only storyboards (ours) are pure
// forward typing via `ops.append` (a native editor insert per keystroke run); the
// prefix logic just keeps it correct if a step ever rewrites earlier text.
async function typeTo(
	current: string,
	target: string,
	cadence: number,
	reduced: boolean,
	ops: TypeOps,
	signal: AbortSignal,
): Promise<void> {
	if (current === target) return;
	const keep = commonPrefix(current, target);
	// Reduced motion (or an enormous insert) skips the keystroke animation — set the
	// whole target at once (a full-doc replace is fine when there's no animation). The
	// "fast-forward the rest of the deck" beat (~1k chars at a tiny cadence) stays under
	// this, so it still animates + scrolls rather than snapping in.
	const tail = target.length - keep;
	if (reduced || tail > 1600) {
		ops.set(target);
		await wait(reduced ? 60 : 260, signal);
		return;
	}
	// A rewrite of earlier text (not append-only) → reset to the shared prefix first,
	// then append the new tail. Ours never hits this, but it keeps typeTo total.
	if (keep < current.length) {
		ops.set(target.slice(0, keep));
		await wait(90, signal);
	}
	// Reveal the tail, chunking whitespace so typing reads as words, not a metronome —
	// a newline/space run lands in one tick. Each keystroke's delay is jittered ±40%
	// so the rhythm feels human, not machine-uniform. Every ~28 chars we take a longer
	// "render breath" (past the preview's ~140ms debounce) so the preview repaints the
	// partial slide MID-typing — otherwise the debounce holds it on the prior slide for
	// the whole run and editor + preview drift out of sync.
	const BREATH_EVERY = 38;
	let sinceBreath = 0;
	let i = keep;
	while (i < target.length) {
		let next = i + 1;
		if (/\s/.test(target[i])) {
			while (next < target.length && /\s/.test(target[next])) next++;
		}
		ops.append(target.slice(i, next));
		sinceBreath += next - i;
		i = next;
		if (sinceBreath >= BREATH_EVERY && i < target.length) {
			// This loop only runs with motion on (the reduced path returned above), so
			// the breath is always the full 175ms.
			sinceBreath = 0;
			await wait(175, signal);
		} else {
			await wait(cadence * (0.7 + Math.random() * 0.6), signal);
		}
	}
}

/**
 * Play a storyboard. Resolves when the last step's settle completes; rejects with
 * an AbortError the instant `signal` aborts (the take-over / exit path). The host
 * is responsible for teardown on either outcome.
 */
export async function runStoryboard(
	stage: DemoStage,
	actions: DemoActions,
	board: Storyboard,
	signal: AbortSignal,
): Promise<void> {
	// `current` tracks the typed source for the diff engine. The storyboard owns the
	// starting state (its opening "new deck" beat blanks the canvas), so we do NOT seed
	// here — the demo opens on the viewer's real current deck, then creates a new one.
	let current = board.seed;
	await wait(stage.reduced ? 120 : 400, signal);
	// The opening flourish — the cursor materializes at center and waves hello.
	await stage.intro(signal);

	for (const step of board.steps) {
		if (signal.aborted) return;
		if (step.say != null) stage.say(step.say);
		if (step.moveTo) {
			const el = stage.resolve(step.moveTo);
			if (el) {
				// Lead the eye first: fire the anticipation cue, let it register, then move.
				stage.anticipate(el);
				await wait(stage.reduced ? 0 : 480, signal);
				await stage.moveToEl(el, signal);
			}
		}
		if (step.click) await stage.press(signal);
		if (step.act) step.act(actions);
		if (step.type != null) {
			await typeTo(
				current,
				step.type,
				step.cadence ?? TYPE_CADENCE,
				stage.reduced,
				{ set: actions.setSource, append: actions.typeTail },
				signal,
			);
			current = step.type;
		}
		if (step.circle) {
			const el = stage.resolve(step.circle);
			if (el) await stage.circle(el, signal);
		}
		await wait(step.settle ?? (stage.reduced ? 300 : STEP_SETTLE), signal);
	}
}
