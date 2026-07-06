// Vetrina reference tour — the buildless, non-slide, framework-free exemplar
// (design doc §11, §15.6). This is a CONSUMER of the library: it imports the
// public `vetrina` surface (never reaches inside the folder), drives a plain
// DOM widget dashboard, and shows the one cooperative primitive — `awaitUser` —
// across all three of its outcomes:
//   • correct input  → the user does the awaited action, the tour resumes + completes
//   • wrong input    → any other real interaction hands the wheel back (take-over)
//   • timeout        → no interaction within the window ends the tour (exit)
// No React, no slide engine, no bundler assumption — just the DOM + vetrina. The
// same module powers the awaitUser e2e (docs/e2e/vetrina-tour.spec.ts).

import { type RunHandle, run, type StopReason, type TypeOps, type Walkthrough, wait } from '../vetrina';

/** The dashboard's own state setters the tour drives (each a real DOM mutation). */
export interface TourHost {
	/** Increment the live counter (real state — proves theater ≠ substance). */
	bump(): void;
	/** Mark the tour's current phase on the panel (drives the e2e's "now interact" oracle). */
	setPhase(phase: 'idle' | 'touring' | 'awaiting' | 'done'): void;
	/** Complete the dashboard's own task (enable the finished state). */
	finish(): void;
}

/** Is `node` inside the element `sel` resolves to within `root`? (match helper, root-scoped.) */
function within(root: HTMLElement, sel: string, node: EventTarget | null): boolean {
	const el = root.querySelector(sel);
	return !!el && node instanceof Node && el.contains(node);
}

/** The tour itself — a raw Walkthrough (the imperative layer), so `awaitUser` is on show. */
export function tourPlay(root: HTMLElement): Walkthrough<TourHost> {
	return async (ctx) => {
		const { stage, actions, signal } = ctx;

		actions.setPhase('touring');
		stage.say('Welcome to the mini dashboard — let me show you around.');
		await wait(900, signal);

		// Point at the counter, drive a REAL increment, then circle to confirm what rendered.
		await stage.point('#vt-count', signal);
		stage.say('This is a live counter.');
		await wait(650, signal);
		actions.bump();
		await stage.gesture('circle', '#vt-count', signal);
		stage.say('I just bumped it — that was a real state change, not a painted one.');
		await wait(750, signal);

		// A tour-driven typing beat into the notes field (proves type() end-to-end).
		await stage.point('#vt-note', signal);
		await ctx.type('#vt-note', 'Shipped by Vetrina', { cadence: 30 });
		await wait(500, signal);

		// ── The cooperative hand-off. From here the wheel is the viewer's to take. ──
		stage.say('Your turn — click Finish to complete the tour.');
		await stage.point('#vt-finish', signal);
		// Flip to `awaiting` ONLY now, immediately before awaitUser registers its classifier
		// (synchronously, next line). The flag means "a real interaction is now classified,
		// not an instant take-over" — set it any earlier and an eager click during the glide
		// above would still take over. (The e2e keys its interaction off this exact flag.)
		actions.setPhase('awaiting');
		await ctx.awaitUser({
			// A click on (or inside) Finish resolves; ANY other real input is a take-over.
			match: (e) => within(root, '#vt-finish', e.target),
			// Without a timeout a stalled viewer would hang — end the tour after 8s.
			timeout: 8000,
			onTimeout: 'abort',
		});

		// Resumed on the correct action → confirm and finish.
		actions.setPhase('done');
		actions.finish();
		await stage.gesture('check', '#vt-finish', signal);
		stage.say('Nicely done — that’s the whole tour.');
		await wait(900, signal);
	};
}

export interface ReferenceTourOptions {
	/** Fired after teardown with the terminal reason — the host restores + reports. */
	onStop?: (reason: StopReason) => void;
}

/** Start the reference tour over an already-rendered dashboard `root`. Returns the run handle. */
export function startReferenceTour(root: HTMLElement, opts: ReferenceTourOptions = {}): RunHandle {
	const count = root.querySelector<HTMLElement>('#vt-count');
	const note = root.querySelector<HTMLInputElement>('#vt-note');
	const finish = root.querySelector<HTMLButtonElement>('#vt-finish');

	const actions: TourHost = {
		bump: () => {
			if (count) count.textContent = String((Number(count.textContent) || 0) + 1);
		},
		setPhase: (phase) => {
			root.dataset.vtPhase = phase;
		},
		finish: () => {
			root.dataset.vtDone = 'true';
			if (finish) finish.disabled = true;
		},
	};

	// One field, so both TypeOps channels act on the notes input's value.
	const type: TypeOps = {
		set: (t) => {
			if (note) note.value = t;
		},
		append: (t) => {
			if (note) note.value += t;
		},
		read: () => note?.value ?? '',
	};

	return run<TourHost>({
		root,
		actions,
		type,
		play: tourPlay(root),
		takeover: { scope: 'window' },
		// Pure CSS-first: the tour page defines --vt-accent on :root, so the stage inherits it
		// (no JS theme). A `var(--vt-accent,…)` accent here would be a no-op self-reference.
		onStop: (reason) => {
			// Report the terminal reason on the panel for the viewer (and the e2e oracle).
			root.dataset.vtReason = reason;
			if (root.dataset.vtPhase !== 'done') root.dataset.vtPhase = 'idle';
			opts.onStop?.(reason);
		},
	});
}
