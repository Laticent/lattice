// Vetrina — the RUNNER: the whole engine. It mounts the stage, installs the
// capture-phase take-over guard, plays a Walkthrough, and routes every terminal path
// (complete / take-over / exit / unmount / error) through one idempotent `stop()`.
//
// The runner — NOT the consumer — enforces the invariants (I1-I9), so every authoring
// layer (the raw Walkthrough, storyboard(), scene()) is equally safe:
//   - I2  take-over: the first real off-stage input aborts + falls through.
//   - I6  idempotent teardown; abort is terminal for narration, not just actuation.
//   - I8  after abort, the actions bag is inert (an abort-guarded proxy).
//   - I9  run-scoped typing baseline on ctx; intro is a runner responsibility.
// There is NO step interpreter here - storyboard()/scene() are library functions that
// return a Walkthrough.

import { createStage, isAbortError, type Stage, type Target, wait } from './stage';
import { resolveTheme, type Theme } from './theme';

/** How typed text LANDS in the host (native editor inserts). Omit if a host never types. */
export interface TypeOps {
	set(text: string): void;
	append(text: string): void;
	/** Optional live read of the current document - lets a composed segment diff against
	 *  the real text rather than a tracked baseline. Falls back to the run-scoped tracker. */
	read?(): string;
}
/** Per-`type` options (distinct from `TypeOps`). */
export interface TypeOpts {
	cadence?: number;
	/** Set the whole text at once with NO keystroke animation (the instant-beat path). */
	instant?: boolean;
}

export type StopReason = 'complete' | 'takeover' | 'exit' | 'error';

/** Cooperative hand-off: suspend take-over for THIS beat, wait for the user's real action. */
export interface AwaitUserOpts {
	/** The expected gesture (e.g. a click on #next). A non-match is still a take-over. */
	match: (e: Event) => boolean;
	/** Without a timeout a wrong-input user can hang - supply one. */
	timeout?: number;
	/** What a timeout does (default 'abort'). */
	onTimeout?: 'abort' | 'resume';
}

/** The context a Walkthrough drives. `A` is the host's action bag - the engine names nothing in it. */
export interface RunContext<A> {
	stage: Stage;
	/** Abort-guarded proxy of the host actions: every call is a no-op once the run aborts (I8). */
	actions: A;
	signal: AbortSignal;
	/** Type toward a target at a human cadence. Requires `TypeOps` on the run (throws otherwise). */
	type(target: Target, text: string, opts?: TypeOpts): Promise<void>;
	/** Cooperative hand-off. Resolves with the user's real event, or per `onTimeout`. */
	awaitUser(opts: AwaitUserOpts): Promise<Event>;
}

export type Walkthrough<A> = (ctx: RunContext<A>) => Promise<void>;

export interface RunHandle {
	readonly active: boolean;
	/** Host-initiated exit; routes through the same teardown as every other terminal path. */
	stop(): void;
}

export interface RunOptions<A> {
	/** The host app subtree the walkthrough drives (string Targets resolve within it). */
	root: HTMLElement;
	/** The host's own state setters (bound to real state). */
	actions: A;
	/** The walkthrough - usually `scene(...).build()` or `storyboard(seed, [...])`. */
	play: Walkthrough<A>;
	/** How text lands, if this host types. */
	type?: TypeOps;
	/** Theming — CSS-first --vt-* tokens, or this JS convenience (accent/speed/pointer/cues) (§9). */
	theme?: Theme;
	/** Called AFTER teardown (I7) - the host restores whatever it wants. */
	onStop?: (reason: StopReason) => void;
	/** Play the opening flourish (materialize + wave) once at the start. Default true. */
	intro?: boolean;
	/** Take-over scope + key policy. */
	takeover?: {
		/** 'window' (default - a full-page demo) or 'root' (an embedded consumer). */
		scope?: 'root' | 'window';
		/** Don't abort a tutorial on a lone Shift/Ctrl/Alt/Meta or an IME composition key. */
		ignoreModifierKeys?: boolean;
	};
	/** Where the overlay mounts (default: the root's document body). */
	portalRoot?: HTMLElement;
	/** Stacking context for hosts that go higher than the default. */
	zIndex?: number;
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);
const SUPPRESS_MS = 350; // swallow the tail of a resolving gesture after awaitUser

/** Module-level single-flight latch (I6d): only one walkthrough runs at a time. */
let activeRun: RunHandle | null = null;

/** Longest common prefix length - the diff pivot for typing (shared with the director). */
function commonPrefix(a: string, b: string): number {
	const n = Math.min(a.length, b.length);
	let i = 0;
	while (i < n && a[i] === b[i]) i++;
	return i;
}

function newAbort(): Error {
	const e = new Error('vetrina aborted');
	e.name = 'AbortError';
	return e;
}

/** Wrap the host actions so every method is a no-op once `signal` aborts (I8). Pure — unit-tested. */
export function guardedActions<A>(actions: A, signal: AbortSignal): A {
	if (typeof actions !== 'object' || actions === null) return actions;
	return new Proxy(actions as object, {
		get(t, k, r) {
			const v = Reflect.get(t, k, r);
			if (typeof v === 'function') {
				return (...args: unknown[]) => (signal.aborted ? undefined : (v as (...a: unknown[]) => unknown).apply(t, args));
			}
			return v;
		},
	}) as A;
}

export function run<A>(opts: RunOptions<A>): RunHandle {
	if (activeRun) {
		// Single-flight: a NAMED throw, never a silent inert handle. Compose with
		// `await segment(ctx)` inside a play - never a nested run().
		throw new Error('vetrina: a walkthrough is already running (single-flight); compose with segment(ctx), not a nested run()');
	}

	const { root, play } = opts;
	const controller = new AbortController();
	const signal = controller.signal;
	const scope: 'root' | 'window' = opts.takeover?.scope ?? 'window';
	const scopeNode: EventTarget = scope === 'root' ? root : window;

	const resolved = resolveTheme(opts.theme); // validates colors up front (throws on url()/invisible)
	const stage = createStage({
		root,
		onExit: () => stop('exit'),
		portalRoot: opts.portalRoot ?? opts.theme?.portalRoot,
		zIndex: opts.zIndex ?? opts.theme?.zIndex,
		theme: resolved,
	});

	let stopped = false;
	// awaitUser state: when set, the guard classifies input instead of aborting on a match.
	let awaiting: { match: (e: Event) => boolean; resolve: (e: Event) => void } | null = null;
	// After a cooperative resolve, ignore real input briefly (a double-tap's tail).
	let suppressUntil = 0;

	// The take-over guard (I2). Capture-phase; it never preventDefaults, so a real event
	// falls through to the control the viewer aimed at.
	function onUserInput(e: Event): void {
		if (stage.contains(e.target)) return; // the demo's own chrome (Exit) - ignore
		if (e.type === 'keydown' && opts.takeover?.ignoreModifierKeys) {
			const ke = e as KeyboardEvent;
			if (ke.isComposing || MODIFIER_KEYS.has(ke.key)) return;
		}
		if (awaiting) {
			// Classifier stays live: a match resolves + resumes; a NON-match is still a
			// legitimate take-over. The guard is never blinded.
			const a = awaiting;
			if (a.match(e)) {
				awaiting = null;
				suppressUntil = performance.now() + SUPPRESS_MS;
				a.resolve(e);
				return;
			}
			// fall through to take-over
		} else if (performance.now() < suppressUntil) {
			return; // the tail of the just-resolved gesture
		}
		stop('takeover');
	}

	function addGuard(): void {
		scopeNode.addEventListener('pointerdown', onUserInput, true);
		scopeNode.addEventListener('keydown', onUserInput, true);
	}
	function removeGuard(): void {
		scopeNode.removeEventListener('pointerdown', onUserInput, true);
		scopeNode.removeEventListener('keydown', onUserInput, true);
	}

	function stop(reason: StopReason): void {
		if (stopped) return;
		stopped = true;
		controller.abort(); // I2: instant - every in-flight await races this signal
		removeGuard();
		awaiting = null;
		stage.destroy(); // I6c: narration no-ops hereafter. Destroy BEFORE onStop (I7).
		activeRun = null;
		opts.onStop?.(reason);
	}

	// The abort-guarded actions proxy (I8): once aborted, every call is a no-op, so
	// "drive the app after the human took over" is structurally impossible.
	const actions = guardedActions(opts.actions, signal);

	// Run-scoped typing baseline (I9): shared across every segment + raw beat, keyed per
	// target, so a composed segment diffs against the LIVE document, not a stale seed.
	const typed = new Map<string, string>();
	const idMap = new WeakMap<object, string>();
	let idSeq = 0;
	const keyOf = (target: Target): string => {
		if (typeof target === 'string') return `s:${target}`;
		let id = idMap.get(target);
		if (!id) {
			id = `n:${++idSeq}`;
			idMap.set(target, id);
		}
		return id;
	};

	async function type(target: Target, text: string, o?: TypeOpts): Promise<void> {
		if (!opts.type) throw new Error('vetrina: this run has no TypeOps, but a beat called type() - wire `type` on run()');
		if (signal.aborted) throw newAbort();
		const ops = opts.type;
		const key = keyOf(target);
		const current = ops.read ? ops.read() : (typed.get(key) ?? '');
		if (current === text) return;
		const cadence = (o?.cadence ?? 22) * stage.pace;
		const keep = commonPrefix(current, text);
		// Instant (no animation at all), the 'still' motion tier, or a huge insert -> set the whole
		// target at once. NOTE: 'legible' (a reduced-motion device) is deliberately NOT here — the
		// typing reveal is content cadence, not a vestibular trigger, so it keeps playing; only
		// 'still' collapses it. Instant skips even the settle wait; the others keep a short beat.
		if (o?.instant || stage.still || text.length - keep > 1600) {
			ops.set(text);
			typed.set(key, text);
			if (!o?.instant) await wait(stage.still ? 60 : 260, signal);
			return;
		}
		if (keep < current.length) {
			ops.set(text.slice(0, keep));
			await wait(90, signal);
		}
		// Reveal the tail, chunking whitespace so it reads as words; jitter each keystroke
		// +/-40%; a longer "render breath" every ~38 chars so a live preview repaints mid-type.
		const BREATH_EVERY = 38;
		let sinceBreath = 0;
		let i = keep;
		while (i < text.length) {
			let next = i + 1;
			if (/\s/.test(text[i])) while (next < text.length && /\s/.test(text[next])) next++;
			ops.append(text.slice(i, next));
			sinceBreath += next - i;
			i = next;
			if (sinceBreath >= BREATH_EVERY && i < text.length) {
				sinceBreath = 0;
				await wait(175, signal);
			} else {
				await wait(cadence * (0.7 + Math.random() * 0.6), signal);
			}
		}
		typed.set(key, text);
	}

	function awaitUser(o: AwaitUserOpts): Promise<Event> {
		return new Promise<Event>((resolve, reject) => {
			if (signal.aborted) return reject(newAbort());
			let timer = 0;
			const onAbort = () => {
				window.clearTimeout(timer);
				awaiting = null;
				reject(newAbort());
			};
			signal.addEventListener('abort', onAbort, { once: true });
			awaiting = {
				match: o.match,
				resolve: (e) => {
					window.clearTimeout(timer);
					signal.removeEventListener('abort', onAbort);
					resolve(e);
				},
			};
			if (o.timeout != null) {
				timer = window.setTimeout(() => {
					awaiting = null;
					signal.removeEventListener('abort', onAbort);
					if ((o.onTimeout ?? 'abort') === 'resume') resolve(new Event('vetrina:timeout'));
					else {
						reject(newAbort());
						stop('exit');
					}
				}, o.timeout);
			}
		});
	}

	const ctx: RunContext<A> = { stage, actions, signal, type, awaitUser };

	const handle: RunHandle = {
		get active() {
			return !stopped;
		},
		stop: () => stop('exit'),
	};
	activeRun = handle;
	addGuard();

	// Kick off - wrapped so a SYNCHRONOUS throw in `play` still tears down (I6b).
	Promise.resolve()
		.then(async () => {
			await wait(stage.reduced ? 120 : 400, signal);
			if (opts.intro !== false) await stage.intro(signal); // I9: intro is the runner's, once per run
			await play(ctx);
			stop('complete');
		})
		.catch((err) => {
			if (isAbortError(err)) return; // stop() already ran (take-over / exit / timeout)
			stop('error');
		});

	return handle;
}
