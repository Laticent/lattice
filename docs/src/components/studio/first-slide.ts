// THE STUDIO'S FIRST SLIDE, as a promise. StudioShell resolves it when the live preview first paints a slide
// (`onPreviewFirstRender`); work that the first slide does not need waits on it, so it stops competing with startup.
// Measured on a throttled phone profile, the warm-ups and the lint core ran in the seconds before and just after the
// first slide and kept the main thread 75-83% busy for 3 s (Studio performance audit, PR #2868).
//
// A BACKSTOP, because waiting must never become never: a preview that fails to paint (DeckPreview reports no failure to
// its host) still gets its lint and warm-ups after FIRST_SLIDE_BACKSTOP_MS from this module's load. A Studio that opens
// with the preview hidden (split collapsed, Present open, another view) releases the gate at once (StudioShell).

import { useEffect, useState } from 'react';

export const FIRST_SLIDE_BACKSTOP_MS = 6_000;

let resolveShown: () => void = () => {};
let shown = false;

/** Resolves once the live preview has painted its first slide, or after the backstop. */
export const firstSlideShown: Promise<void> = new Promise<void>((resolve) => {
	resolveShown = () => {
		if (shown) return;
		shown = true;
		resolve();
	};
	if (typeof window !== 'undefined') window.setTimeout(() => resolveShown(), FIRST_SLIDE_BACKSTOP_MS);
});

/** Called by the Studio when the live preview first paints. Idempotent. */
export function markFirstSlideShown(): void {
	resolveShown();
}

/** Whether the first slide has been shown (or the backstop has passed). */
export function isFirstSlideShown(): boolean {
	return shown;
}

/**
 * Run `fn` once the first slide is on screen AND the user has paused: no pointer or key input for `quietMs`. The
 * warm-ups load hundreds of kilobytes of code that nothing on screen needs yet; starting them on the user's first
 * keystrokes would put that work exactly where it hurts. Returns a cancel function.
 */
export function afterFirstSlideAndPause(fn: () => void, quietMs = 3000): () => void {
	let cancelled = false;
	let timer: number | undefined;
	const arm = () => {
		if (timer !== undefined) window.clearTimeout(timer);
		timer = window.setTimeout(fire, quietMs);
	};
	const stopListening = () => {
		window.removeEventListener('pointerdown', arm, true);
		window.removeEventListener('keydown', arm, true);
	};
	function fire() {
		// Foreground work the user is waiting on (`holdWarmUps`) outranks a pause: wait for it to end, then for a fresh pause.
		if (held > 0) {
			void whenNotHeld().then(() => {
				if (!cancelled) arm();
			});
			return;
		}
		stopListening();
		if (!cancelled) fn();
	}
	void firstSlideShown.then(() => {
		if (cancelled) return;
		window.addEventListener('pointerdown', arm, { capture: true, passive: true });
		window.addEventListener('keydown', arm, { capture: true });
		arm();
	});
	return () => {
		cancelled = true;
		stopListening();
		if (timer !== undefined) window.clearTimeout(timer);
	};
}

// THE QUIET GATE for work that must not land while someone is working — or while a tour types for them. Input
// (pointer, key) and source edits (StudioShell calls `noteActivity` on every change, so a tour's programmatic typing
// counts too) mark activity; `whenQuiet` resolves once none has happened for `quietMs`. The font warm-up (#3076) waits
// on it before each file: measured on WebKit, the warm-up landing mid-tour starved the tour's frames (the
// `demo-mobile.spec.ts` follow-the-typing case went from 4/4 to 1/3 passing). Re-armed with a timer, never polled.
let lastActivity = Number.NEGATIVE_INFINITY;
let watchingInput = false;

/** Mark user (or tour) activity now. */
export function noteActivity(): void {
	lastActivity = performance.now();
}

// FOREGROUND WORK holds the gate too. Input is not the only thing a warm-up can starve: the chat's `render_slide` look
// and its draft fit (draft-fit.ts) build a whole capture frame and shoot a slide on this thread, under a 15 s budget,
// and they start from a click, so the 2 s pause after that click ran out about 2 s into the render and the warm-up
// loaded the Compose, Present and Read chunks and then fetched font after font beside it. Measured on webkit-phone under
// 4 workers with Full forced, that overlap put the render past its budget (a Lite device skips the Compose, Present and Read chunks and the fonts, and never went red).
// While any hold is out, no warm-up starts its next item (`whenQuiet`, `heldWarmPanels`, `afterFirstSlideAndPause`); a
// release counts as activity, so the warm-up resumes only after a fresh pause. An item already loading runs on.
let held = 0;
let heldWaiters: Array<() => void> = [];

/** Hold every warm-up while foreground work runs. Returns the release, which is idempotent; always call it (`finally`). */
export function holdWarmUps(): () => void {
	held += 1;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		held -= 1;
		noteActivity();
		if (held > 0) return;
		const waiters = heldWaiters;
		heldWaiters = [];
		for (const w of waiters) w();
	};
}

/** Resolves once no foreground work holds the warm-ups (`holdWarmUps`): at once when none does. */
export function whenNotHeld(): Promise<void> {
	return held === 0 ? Promise.resolve() : new Promise<void>((resolve) => heldWaiters.push(resolve));
}

/**
 * `lazy-panel.tsx` › warmPanels, held: each item waits for `whenNotHeld` before it starts loading; an item already
 * loading runs on, and one still waiting when the queue is cancelled never loads. The Studio schedules its queues through this. It lives here, not in `warmPanels`, because the
 * Playground imports `lazy-panel.tsx` at startup and runs no draft render: importing this module there cost it 443
 * bytes of eager JavaScript.
 */
type Warm = { load(): Promise<void> };
export function heldWarmPanels(warm: (queue: ReadonlyArray<Warm>) => () => void): (queue: ReadonlyArray<Warm>) => () => void {
	return (queue) => {
		let cancelled = false;
		// A cancel while an item waits for the release means it never loads, as it would not have started.
		const cancel = warm(queue.map((w) => ({ load: () => whenNotHeld().then(() => (cancelled ? undefined : w.load())) })));
		return () => {
			cancelled = true;
			cancel();
		};
	};
}

/** Resolves once there has been no input and no source edit for `quietMs`, and no foreground work holds the gate. */
export function whenQuiet(quietMs = 2000): Promise<void> {
	if (!watchingInput && typeof window !== 'undefined') {
		watchingInput = true;
		window.addEventListener('pointerdown', noteActivity, { capture: true, passive: true });
		window.addEventListener('keydown', noteActivity, { capture: true });
	}
	return new Promise<void>((resolve) => {
		const check = () => {
			if (held > 0) {
				void whenNotHeld().then(check);
				return;
			}
			const idle = performance.now() - lastActivity;
			if (idle >= quietMs) resolve();
			else window.setTimeout(check, quietMs - idle);
		};
		check();
	});
}

/**
 * React hook over the gate: false until the first slide is on screen (or the backstop passes), then true for good.
 * A surface the first slide does not need uses it to mount after the slide instead of beside it.
 */
export function useFirstSlideShown(): boolean {
	const [shown, setShown] = useState(isFirstSlideShown);
	useEffect(() => {
		if (shown) return;
		let live = true;
		void firstSlideShown.then(() => {
			if (live) setShown(true);
		});
		return () => {
			live = false;
		};
	}, [shown]);
	return shown;
}
