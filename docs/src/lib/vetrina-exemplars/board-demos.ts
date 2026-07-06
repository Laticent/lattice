// Vetrina exemplar + stress battery — the v1 PROOF (design doc §15.6, §16). A single
// generic (non-Studio) host — a plain task board — driven by a family of walkthroughs,
// each exercising one surface with edge cases the unit tier can't reach on a real browser
// (HARD RULE #23). A CONSUMER of the public `vetrina` surface (never reaches inside the
// folder), so it also honors the import-boundary gate. Dispatched by `?demo=` from
// docs/src/pages/vetrina-exemplars.astro; asserted by docs/e2e/vetrina-exemplars.spec.ts.

import { loop, type RunHandle, run, type StopReason, scene, storyboard, type Walkthrough, wait } from '../vetrina';

/** The board's own state setters each demo drives (all real DOM mutations). */
export interface BoardHost {
	/** Move list item `fromId` to before `toId` inside widget A (a real reorder). */
	reorder(fromId: string, toId: string): void;
	/** Append a gesture kind to the board's `data-gestures` log. */
	logGesture(kind: string): void;
	/** Set a boolean-ish marker attribute on the board (data-<key>="true"). */
	mark(key: string): void;
	/** Record a numbered step of a composed walkthrough (data-steps="1 2 3"). */
	step(n: number): void;
	/** Set the current phase (drives the e2e's "the stage is readable / interact now" oracle). */
	setPhase(phase: string): void;
	/** Report which widget a root-scoped resolve landed in (proves root-scoping). */
	reportWidget(which: string): void;
}

/** Wire a BoardHost bound to the live board DOM. */
function hostFor(board: HTMLElement): BoardHost {
	const list = board.querySelector('#widget-a ol');
	return {
		reorder: (fromId, toId) => {
			const from = board.querySelector(`#${fromId}`);
			const to = board.querySelector(`#${toId}`);
			if (list && from && to) list.insertBefore(from, to);
		},
		logGesture: (kind) => {
			board.dataset.gestures = `${board.dataset.gestures ? `${board.dataset.gestures} ` : ''}${kind}`;
		},
		mark: (key) => {
			board.dataset[key] = 'true';
		},
		step: (n) => {
			board.dataset.steps = `${board.dataset.steps ? `${board.dataset.steps} ` : ''}${n}`;
		},
		setPhase: (phase) => {
			board.dataset.vtPhase = phase;
		},
		reportWidget: (which) => {
			board.dataset.resolvedWidget = which;
		},
	};
}

// ── The demos ────────────────────────────────────────────────────────────────

/** All five gestures, each with the target that reads its meaning (circle needs one). */
function gesturesPlay(): Walkthrough<BoardHost> {
	const KINDS = ['wave', 'circle', 'check', 'cross', 'shake'] as const;
	return async (ctx) => {
		ctx.actions.setPhase('touring');
		for (const kind of KINDS) {
			ctx.actions.logGesture(kind);
			await ctx.stage.gesture(kind, kind === 'circle' ? '#g-target' : undefined, ctx.signal);
			await wait(180, ctx.signal);
		}
		ctx.actions.setPhase('done');
	};
}

/** A drag whose real reorder SUCCEEDS — the storyboard drops the item at `to`. */
function dragOkPlay(): Walkthrough<BoardHost> {
	return storyboard<BoardHost>('', [
		{
			say: 'Move the third item to the top.',
			drag: { from: '#a3', to: '#a1' },
			act: (a) => a.reorder('a3', 'a1'),
			gesture: 'check',
			settle: 250,
		},
	]);
}

/** A drag whose real reorder is REJECTED — the honest snap-back + cross (the trust invariant). */
function dragFailPlay(): Walkthrough<BoardHost> {
	return async (ctx) => {
		const { stage, actions, signal } = ctx;
		stage.say('This move will be rejected.');
		const handle = await stage.drag('#a1', '#a3', signal);
		try {
			// The real move is denied — the theater must NOT show a completed drop.
			throw new Error('reorder denied by host policy');
		} catch {
			await handle.snapBack(signal); // put it back where it was
			await stage.gesture('cross', '#a1', signal); // honest "it didn't happen"
			actions.mark('dragRejected');
		}
		actions.setPhase('done');
	};
}

/** Pure CSS-first theming: NO JS accent — the stage inherits the host's `:root` --vt-* cascade.
 *  Holds on the stage so the e2e can read computed tokens in light AND dark, then completes. */
function themingPlay(): Walkthrough<BoardHost> {
	return async (ctx) => {
		ctx.stage.say('The whole theater is one token contract.');
		await ctx.stage.point('#g-target', ctx.signal);
		ctx.actions.setPhase('holding'); // stage is mounted + readable; e2e asserts computed --vt-*
		// Hold long enough for the e2e to read tokens across a mode flip, then resume + finish.
		await ctx.awaitUser({ match: () => false, timeout: 6000, onTimeout: 'resume' });
		ctx.actions.setPhase('done');
	};
}

/** Root-scoping: a run scoped to widget A resolves a shared `.scoped-target` INSIDE A only. */
function decouplePlay(): Walkthrough<BoardHost> {
	return async (ctx) => {
		const el = ctx.stage.resolve('.scoped-target');
		ctx.actions.reportWidget(el?.getAttribute('data-widget') ?? 'none');
		await ctx.stage.point('.scoped-target', ctx.signal);
		ctx.stage.say('Scoped to widget A — widget B is never touched.');
		await wait(300, ctx.signal);
		ctx.actions.setPhase('done');
	};
}

/** Interleave + mid-run take-over: a built segment, then a loop, then a branch, then a
 *  hand-off where the e2e takes over — proving composition drove state that then persists. */
function interleavePlay(): Walkthrough<BoardHost> {
	return async (ctx) => {
		// A built scene() segment, composed via `await segment(ctx)` (never a nested run()).
		const segment = scene<BoardHost>()
			.say('Segment one.')
			.act((a) => a.step(1))
			.hold(150)
			.build();
		await segment(ctx);

		// A loop recipe.
		await loop(
			async () => {
				ctx.actions.step(2);
				await wait(120, ctx.signal);
			},
			{ times: 1, signal: ctx.signal },
		);

		// A branch (always taken here — the point is that raw control flow composes).
		if (ctx.stage.resolve('#a1')) ctx.actions.step(3);

		// Hand off: no input matches, so ANY real interaction is a take-over. The steps
		// recorded above must survive the take-over (state persists; only the run stops).
		ctx.actions.setPhase('awaiting');
		await ctx.awaitUser({ match: () => false, timeout: 20_000, onTimeout: 'resume' });
		ctx.actions.step(4); // reached ONLY if no take-over happened
		ctx.actions.setPhase('done');
	};
}

/** An INSTANT beat: the reorder applies now — no cursor glide, no drop animation, no gesture —
 *  followed by an `until` gate that holds until the reorder is visible in the DOM (proving the
 *  non-async advance gate end-to-end on the real browser). Holds afterward so the e2e can
 *  confirm the cursor never traveled to the list. */
function instantPlay(): Walkthrough<BoardHost> {
	return async (ctx) => {
		ctx.actions.setPhase('touring');
		await storyboard<BoardHost>('', [
			{
				act: (a) => a.reorder('a3', 'a1'),
				instant: true,
				// Non-async readiness: hold until the reordered DOM shows a3 first (a pollable
				// condition, no promise) — the declarative `until` gate on a real surface.
				until: () => ctx.stage.resolve('#widget-a ol li')?.id === 'a3',
				settle: 0,
			},
		])(ctx);
		ctx.actions.setPhase('holding');
		await ctx.awaitUser({ match: () => false, timeout: 5000, onTimeout: 'resume' });
		ctx.actions.setPhase('done');
	};
}

const DEMOS: Record<string, () => Walkthrough<BoardHost>> = {
	gestures: gesturesPlay,
	'drag-ok': dragOkPlay,
	'drag-fail': dragFailPlay,
	instant: instantPlay,
	theming: themingPlay, // pure CSS-first (no JS theme) — inherits the host :root cascade
	'theming-js': themingPlay, // same hold, but started with a concrete JS accent (below)
	decouple: decouplePlay,
	interleave: interleavePlay,
};

export interface StartOptions {
	onStop?: (reason: StopReason) => void;
	/** Which edge the narration dock sits at (proves the curated `placement` option). */
	placement?: 'top' | 'bottom';
}

/** Start the named demo over the board `board`. Returns the run handle, or null on a rejected
 *  start (an invalid theme throws synchronously from run() — the bad-accent exemplar). */
export function startBoardDemo(name: string, board: HTMLElement, opts: StartOptions = {}): RunHandle | null {
	const actions = hostFor(board);

	// The bad-accent exemplar proves color validation: an exfil-shaped accent (url(...)) is
	// REJECTED by resolveTheme inside run(), which throws synchronously. The host catches it,
	// marks the rejection, and no stage ever mounts. (No walkthrough runs — a start-time reject.)
	if (name === 'bad-accent') {
		try {
			run<BoardHost>({ root: board, actions, play: gesturesPlay(), theme: { accent: 'url(https://evil.example/x.png)' } });
		} catch {
			actions.mark('accentRejected');
			return null;
		}
		return null; // should be unreachable — validation must throw
	}

	const play = DEMOS[name];
	if (!play) throw new Error(`vetrina exemplar: unknown demo '${name}'`);

	// Decouple scopes the run to widget A; everything else runs over the whole board.
	const root = name === 'decouple' ? board.querySelector<HTMLElement>('#widget-a') ?? board : board;

	const finalize = (reason: StopReason) => {
		board.dataset.vtReason = reason;
		if (board.dataset.vtPhase !== 'done') board.dataset.vtPhase = 'idle';
		opts.onStop?.(reason);
	};

	// Theming: `theming` is the PURE CSS-first path (no JS theme) — the stage inherits the
	// host's :root --vt-* cascade (the fix the battery proved). `theming-js` is the JS-theme
	// path with a CONCRETE accent, guarding that both the cursor body AND its cues track it
	// (the derived --vt-cursor-fill regression the checker caught). Every OTHER demo is also
	// pure CSS-first — passing a `var(--vt-accent,…)` self-reference would be a no-op cycle.
	const base = name === 'theming-js' ? { accent: 'rgb(255, 40, 140)' } : {};
	// The narration dock's edge is a curated choice — thread it so the page can exercise
	// `?placement=top` (default 'bottom' when unset).
	const theme = opts.placement ? { ...base, placement: opts.placement } : name === 'theming-js' ? base : undefined;

	return run<BoardHost>({ root, actions, play: play(), takeover: { scope: 'window' }, theme, onStop: finalize });
}

/** The demo names the page/e2e dispatch on (bad-accent has no walkthrough — it's a start-time reject). */
export const DEMO_NAMES = [...Object.keys(DEMOS), 'bad-accent'];
