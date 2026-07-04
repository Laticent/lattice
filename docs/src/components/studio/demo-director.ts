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
	/** Replace the deck source (drives the editor, preview, rail, Coach). */
	setSource: (source: string) => void;
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
	/** Run every autofixable lint finding (the editor's "Fix all"). */
	fixAll: () => void;
};

export type DemoStep = {
	/** Narration caption; persists until the next step that sets `say` (''=clear). */
	say?: string;
	/** CSS selector (within the Studio root) to glide the cursor to. */
	moveTo?: string;
	/** Play a click ripple after arriving. Purely visual — pair with `act`. */
	click?: boolean;
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

// Type toward `target` from `current`: back out to the shared prefix, then reveal
// the new tail. Our storyboards are append-only, so this is pure forward typing;
// the prefix logic just keeps it correct if a step ever rewrites earlier text.
async function typeTo(
	current: string,
	target: string,
	cadence: number,
	reduced: boolean,
	emit: (s: string) => void,
	signal: AbortSignal,
): Promise<void> {
	if (current === target) return;
	const keep = commonPrefix(current, target);
	// Reduced motion (or a very long insert) skips the keystroke animation.
	const tail = target.length - keep;
	if (reduced || tail > 900) {
		emit(target);
		await wait(reduced ? 60 : 260, signal);
		return;
	}
	// Delete back to the shared prefix in a couple of quick chunks (rare path).
	if (keep < current.length) {
		emit(target.slice(0, keep));
		await wait(90, signal);
	}
	// Reveal the tail, chunking whitespace so typing feels like words, not a
	// metronome — a newline/space run lands in one tick.
	let i = keep;
	while (i < target.length) {
		let next = i + 1;
		if (/\s/.test(target[i])) {
			while (next < target.length && /\s/.test(target[next])) next++;
		}
		emit(target.slice(0, next));
		i = next;
		await wait(cadence, signal);
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
	let current = board.seed;
	// Seed the deck before the first step so the demo always starts from a known deck.
	actions.setSource(current);
	await wait(stage.reduced ? 120 : 500, signal);

	for (const step of board.steps) {
		if (signal.aborted) return;
		if (step.say != null) stage.say(step.say);
		if (step.moveTo) {
			const el = stage.resolve(step.moveTo);
			if (el) await stage.moveToEl(el, signal);
		}
		if (step.click) await stage.press(signal);
		if (step.act) step.act(actions);
		if (step.type != null) {
			await typeTo(
				current,
				step.type,
				step.cadence ?? TYPE_CADENCE,
				stage.reduced,
				actions.setSource,
				signal,
			);
			current = step.type;
		}
		await wait(step.settle ?? (stage.reduced ? 300 : STEP_SETTLE), signal);
	}
}
