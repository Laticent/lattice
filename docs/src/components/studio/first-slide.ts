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
