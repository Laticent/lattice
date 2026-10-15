// THE FOCUS HUB — where the author's focus is, and who needs to hear that it moved.
//
// Every pane that shows or edits the deck talks to one hub instead of to each other:
//
//   · an editor REPORTS a fact about itself: "my caret is at offset 812" (`report`), or,
//     for an editor with no offsets, "my caret is in slide 4" (`reportChunk`);
//   · a navigator REQUESTS a move: the rail, a key, a swipe, Live (`go`, `step`);
//   · the preview REPORTS what it can show: how many pages the shown slide has (`pages`),
//     and later which element the author clicked (`pick`).
//
// The hub resolves each against the slide index (deck-index.ts) and publishes one `Focus`
// record. Subscribers choose the fields they care about (a selector) and a delivery lane,
// and hear only when those fields change. Nothing calls into another pane.
//
// WHAT THIS REMOVES. The Studio used to hold about eight hand-written loop guards: each
// editor remembered the last slide it published (`lastSlideRef`) and pre-seeded it before
// its own programmatic moves; the shell bracketed navigation in a flag and relied on the
// editor's echo arriving synchronously; a step could wait up to 1500 ms for a render. Each
// guard went stale at least once (engineering/decisions/2026-10-15-fuoco-focus-sync.md §3).
// Here the guarantees are the hub's:
//
//   1. ORIGIN. Every publication names its origin, and a subscriber that names itself in
//      `ignoreOrigin` never hears its own moves. An editor revealing a slide and then
//      reporting the caret move that reveal made agrees with the focus already published,
//      so nothing changes and nothing is delivered. No pane keeps a "last published" ref.
//   2. REVISION. Every report may carry the index revision it was computed against. A
//      report against an older revision is dropped, never applied to newer text.
//   3. NO RE-ENTRY. A publication made while a delivery runs is queued until it finishes,
//      so a subscriber that publishes cannot recurse, and every subscriber sees the
//      publications in order.
//   4. DEFERRED REQUESTS. A navigation that targets text not yet applied (insert a slide,
//      then go to it) waits for exactly that text (`go(..., { after })`), not for a frame.
//
// LANES. `sync` delivers before the call returns (for state that must not lag, like the
// React store). `frame` delivers once per animation frame, latest value only, so a held
// key that crosses three slides in one frame moves the preview once. `idle` delivers when
// the browser is idle, with a 500 ms ceiling (persistence, Live awareness).
//
// Framework-free. The React adapter is ./react.ts.

import { type ChunkId, chunkIndexOf, type DeckIndex, diffSpan, type EditSpan, flatSection, sectionAt, sectionOfFlat, sectionStart, updateDeckIndex } from './deck-index';

export type Origin = string;

/** What changed the focus. Panes use it to choose a reaction: an editor reveals on `nav`,
 *  `pick` and `edit`, and leaves its own caret alone on `caret`. */
export type Cause = 'caret' | 'nav' | 'pick' | 'edit' | 'load';

/** A rendered element in the preview, addressed by its source span (phase 4). */
export interface ElementAddr {
	readonly chunk: ChunkId;
	/** Source offsets, relative to the chunk's `from`. */
	readonly start: number;
	readonly end: number;
	readonly kind: string;
}

export interface Focus {
	/** Monotonic per hub. */
	readonly seq: number;
	/** The index revision this focus is expressed against. */
	readonly rev: number;
	readonly origin: Origin;
	readonly cause: Cause;
	/** The stable id of the focused chunk (authored slide), or null for an empty deck. */
	readonly chunk: ChunkId | null;
	/** Its position in the current index, or -1. */
	readonly chunkIndex: number;
	/** The heading section within the chunk (0 unless the deck splits on headings). */
	readonly section: number;
	/** The flat rendered-slide number: what the engine numbers this slide, 0-based. */
	readonly flat: number;
	/** A page of the section's render run that navigation asked for, or null to follow the
	 *  caret. `Infinity` asks for the last page. */
	readonly page: number | null;
	/** The caret, in absolute source offsets, when an editor with offsets reported it. */
	readonly head: number | null;
	readonly anchor: number | null;
	/** The caret line's text, as the reporting editor sees it (split-page pick uses it). */
	readonly line: string;
	readonly element: ElementAddr | null;
}

export type Lane = 'sync' | 'frame' | 'idle';

export interface SubscribeOptions<T> {
	lane?: Lane;
	/** Never deliver a change this origin made. The subscriber's baseline still advances. */
	ignoreOrigin?: Origin | readonly Origin[];
	equals?: (a: T, b: T) => boolean;
}

export interface Target {
	/** A chunk by stable id… */
	chunk?: ChunkId;
	/** …or by position in the current index… */
	chunkIndex?: number;
	/** …or a flat rendered-slide number. */
	flat?: number;
	section?: number;
	page?: number | null;
}

export interface Scheduler {
	frame(cb: () => void): void;
	idle(cb: () => void): void;
}

export interface FocusHub {
	get(): Focus;
	index(): DeckIndex | null;
	/** Feed the deck text. Returns the index revision for it. Idempotent for equal text.
	 *  `by` names who changed it; a focus the edit moves is published under that origin. */
	source(text: string, span?: EditSpan, by?: Origin): number;
	/** An editor's caret or selection moved. Offsets are absolute in the text of `rev`. */
	report(origin: Origin, at: { head: number; anchor?: number; line?: string; rev?: number }): void;
	/** An editor without offsets: its caret is in this chunk (position in the current index). */
	reportChunk(origin: Origin, at: { chunkIndex: number; section?: number; line?: string; rev?: number }): void;
	/** Navigate. With `after`, wait until the index holds exactly that text. */
	go(origin: Origin, target: Target, opts?: { after?: string }): void;
	/** Step through pages, then sections, then chunks, as the PDF pages. */
	step(origin: Origin, action: 'next' | 'prev' | 'first' | 'last', view?: readonly number[] | null): boolean;
	/** The preview's report: the section it shows has `count` pages, and it shows `shown`. */
	pages(origin: Origin, at: { chunk: ChunkId | null; section: number; count: number; shown: number }): void;
	/** The author clicked a rendered element. */
	pick(origin: Origin, element: ElementAddr | null): void;
	subscribe<T>(select: (f: Focus) => T, listener: (value: T, focus: Focus) => void, opts?: SubscribeOptions<T>): () => void;
	/** Deliver every pending frame and idle notification now (tests, teardown). */
	flush(): void;
	readonly stats: HubStats;
}

export interface HubStats {
	published: number;
	delivered: number;
	droppedStale: number;
	queued: number;
}

/** Test-only switches that break one guarantee each, for the failing arms. */
export interface Unsafe {
	deliverOwnOrigin?: boolean;
	acceptStale?: boolean;
}

const EMPTY: Focus = Object.freeze({ seq: 0, rev: 0, origin: 'init', cause: 'load', chunk: null, chunkIndex: -1, section: 0, flat: 0, page: null, head: null, anchor: null, line: '', element: null });

function defaultScheduler(): Scheduler {
	const g = globalThis as typeof globalThis & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
	return {
		frame: (cb) => (typeof g.requestAnimationFrame === 'function' ? g.requestAnimationFrame(() => cb()) : setTimeout(cb, 16)),
		idle: (cb) => (typeof g.requestIdleCallback === 'function' ? g.requestIdleCallback(cb, { timeout: 500 }) : setTimeout(cb, 200)),
	} as Scheduler;
}

interface Sub {
	select: (f: Focus) => unknown;
	listener: (value: unknown, focus: Focus) => void;
	lane: Lane;
	ignore: readonly Origin[];
	equals: (a: unknown, b: unknown) => boolean;
	/** The value this subscriber last saw (delivered, or skipped as its own). */
	seen: unknown;
	pending: boolean;
	alive: boolean;
}

export function createFocusHub(opts: { scheduler?: Scheduler; unsafe?: Unsafe } = {}): FocusHub {
	const scheduler = opts.scheduler ?? defaultScheduler();
	const unsafe = opts.unsafe ?? {};
	let ix: DeckIndex | null = null;
	let focus: Focus = EMPTY;
	let seq = 0;
	const subs = new Set<Sub>();
	const stats: HubStats = { published: 0, delivered: 0, droppedStale: 0, queued: 0 };
	// Pages the preview reported for the section it shows, keyed by chunk id + section.
	let shownPages: { chunk: ChunkId | null; section: number; count: number; shown: number } | null = null;
	let deferred: { origin: Origin; target: Target; after: string } | null = null;

	// ── Delivery ──────────────────────────────────────────────────────────────
	let delivering = false;
	const queue: Array<() => void> = [];
	let frameArmed = false;
	let idleArmed = false;

	function deliver(sub: Sub) {
		if (!sub.alive) return;
		sub.pending = false;
		const f = focus;
		const value = sub.select(f);
		if (sub.equals(value, sub.seen)) return;
		sub.seen = value;
		if (!unsafe.deliverOwnOrigin && sub.ignore.includes(f.origin)) return;
		stats.delivered++;
		sub.listener(value, f);
	}

	function runLane(lane: Lane) {
		if (lane === 'frame') frameArmed = false;
		if (lane === 'idle') idleArmed = false;
		guarded(() => {
			for (const s of subs) if (s.lane === lane && s.pending) deliver(s);
		});
	}

	// Run `fn` with re-entry protection: publications made inside it queue until it returns.
	function guarded(fn: () => void) {
		if (delivering) {
			stats.queued++;
			queue.push(fn);
			return;
		}
		delivering = true;
		try {
			fn();
			while (queue.length) queue.shift()?.();
		} finally {
			delivering = false;
		}
	}

	function publish(next: Omit<Focus, 'seq' | 'rev' | 'flat'>) {
		guarded(() => {
			const flat = ix && next.chunkIndex >= 0 ? flatSection(ix, next.chunkIndex, next.section) : 0;
			focus = Object.freeze({ ...next, seq: ++seq, rev: ix?.rev ?? 0, flat });
			stats.published++;
			for (const s of subs) {
				if (s.lane === 'sync') deliver(s);
				else s.pending = true;
			}
			if (!frameArmed && [...subs].some((s) => s.lane === 'frame' && s.pending)) {
				frameArmed = true;
				scheduler.frame(() => runLane('frame'));
			}
			if (!idleArmed && [...subs].some((s) => s.lane === 'idle' && s.pending)) {
				idleArmed = true;
				scheduler.idle(() => runLane('idle'));
			}
		});
	}

	// ── Resolving ─────────────────────────────────────────────────────────────
	function resolve(t: Target): { chunkIndex: number; section: number } | null {
		if (!ix?.chunks.length) return null;
		if (typeof t.flat === 'number') {
			const r = sectionOfFlat(ix, t.flat);
			return r ? { chunkIndex: r.chunk, section: r.section } : null;
		}
		let c = -1;
		if (t.chunk !== undefined) c = chunkIndexOf(ix, t.chunk);
		else if (typeof t.chunkIndex === 'number') c = Math.max(0, Math.min(t.chunkIndex, ix.chunks.length - 1));
		if (c < 0) return null;
		const n = ix.chunks[c].sections.length;
		const k = t.section === undefined ? 0 : t.section === Number.POSITIVE_INFINITY ? n - 1 : Math.max(0, Math.min(t.section, n - 1));
		return { chunkIndex: c, section: k };
	}

	function navigate(origin: Origin, t: Target, cause: Cause) {
		const r = resolve(t);
		if (!r || !ix) return;
		const ch = ix.chunks[r.chunkIndex];
		publish({ origin, cause, chunk: ch.id, chunkIndex: r.chunkIndex, section: r.section, page: t.page === undefined ? 0 : t.page, head: null, anchor: null, line: '', element: null });
	}

	const stale = (rev?: number) => !unsafe.acceptStale && rev !== undefined && ix !== null && rev !== ix.rev;

	const hub: FocusHub = {
		get: () => focus,
		index: () => ix,
		stats,

		source(text, span, by = 'source') {
			const prev = ix;
			ix = updateDeckIndex(ix, text, span ? { span } : undefined);
			if (ix === prev) return ix.rev;
			// Re-express the focus against the new text. A chunk id that survived keeps its
			// slide; a deleted one falls to the slide that now holds its old position.
			if (focus.chunk !== null) {
				let c = chunkIndexOf(ix, focus.chunk);
				let section = focus.section;
				if (c < 0) {
					c = Math.max(0, Math.min(focus.chunkIndex, ix.chunks.length - 1));
					section = 0;
				}
				if (c >= 0 && ix.chunks.length) {
					section = Math.min(section, ix.chunks[c].sections.length - 1);
					const head = focus.head === null ? null : mapThrough(focus.head, prev, text, span);
					const anchor = focus.anchor === null ? null : mapThrough(focus.anchor, prev, text, span);
					const byCaret = head !== null ? sectionAt(ix, head) : null;
					const cc = byCaret ? byCaret.chunk : c;
					const ss = byCaret ? byCaret.section : section;
					const ch = ix.chunks[cc];
					if (ch.id !== focus.chunk || ss !== focus.section || cc !== focus.chunkIndex || head !== focus.head) {
						publish({ ...focus, origin: by, cause: 'edit', chunk: ch.id, chunkIndex: cc, section: ss, head, anchor });
					} else {
						// Same slide, same caret: refresh the revision and flat number silently.
						focus = Object.freeze({ ...focus, rev: ix.rev, flat: flatSection(ix, cc, ss) });
					}
				} else if (!ix.chunks.length) publish({ ...EMPTY, origin: by, cause: 'edit' });
			}
			if (deferred && deferred.after === text) {
				const d = deferred;
				deferred = null;
				navigate(d.origin, d.target, 'nav');
			}
			return ix.rev;
		},

		report(origin, at) {
			if (stale(at.rev)) {
				stats.droppedStale++;
				return;
			}
			if (!ix) return;
			deferred = null;
			const s = sectionAt(ix, at.head);
			if (!s) return;
			const ch = ix.chunks[s.chunk];
			const anchor = at.anchor ?? at.head;
			const line = at.line ?? '';
			// A caret move that changes nothing a subscriber could select is not a publication.
			if (focus.chunk === ch.id && focus.section === s.section && focus.head === at.head && focus.anchor === anchor && focus.line === line && focus.page === null && focus.element === null) return;
			publish({ origin, cause: 'caret', chunk: ch.id, chunkIndex: s.chunk, section: s.section, page: null, head: at.head, anchor, line, element: null });
		},

		reportChunk(origin, at) {
			if (stale(at.rev)) {
				stats.droppedStale++;
				return;
			}
			if (!ix?.chunks.length) return;
			deferred = null;
			const c = Math.max(0, Math.min(at.chunkIndex, ix.chunks.length - 1));
			const ch = ix.chunks[c];
			const k = Math.max(0, Math.min(at.section ?? 0, ch.sections.length - 1));
			const line = at.line ?? '';
			if (focus.chunk === ch.id && focus.section === k && focus.line === line && focus.head === null && focus.page === null) return;
			publish({ origin, cause: 'caret', chunk: ch.id, chunkIndex: c, section: k, page: null, head: null, anchor: null, line, element: null });
		},

		go(origin, target, o) {
			if (o?.after !== undefined && (!ix || ix.source !== o.after)) {
				deferred = { origin, target, after: o.after };
				return;
			}
			deferred = null;
			navigate(origin, target, 'nav');
		},

		step(origin, action, view) {
			if (!ix?.chunks.length) return false;
			const allowed = view ?? null;
			const okChunk = (c: number) => !allowed || allowed.includes(c);
			const cur = focus.chunkIndex >= 0 ? focus.chunkIndex : 0;
			const k = focus.section;
			// Pages first, while the preview shows this section and has more to show.
			const run = shownPages && shownPages.chunk === focus.chunk && shownPages.section === k ? shownPages : null;
			if (run && run.count > 1 && (action === 'next' || action === 'prev')) {
				const from = focus.page === null ? run.shown : Math.min(focus.page, run.count - 1);
				const p = from + (action === 'next' ? 1 : -1);
				if (p >= 0 && p < run.count) {
					publish({ ...focus, origin, cause: 'nav', page: p, element: null });
					return true;
				}
			}
			// Then sections and chunks, in the viewed order.
			const order: Array<{ c: number; s: number }> = [];
			for (let c = 0; c < ix.chunks.length; c++) if (okChunk(c)) for (let s = 0; s < ix.chunks[c].sections.length; s++) order.push({ c, s });
			if (!order.length) return false;
			const at = order.findIndex((o) => o.c === cur && o.s === k);
			// The focused slide may be outside the view (a reader lens hides it): then "next" is
			// the first viewed slide after it and "prev" the last one before it.
			const after = at >= 0 ? at + 1 : order.findIndex((o) => o.c > cur || (o.c === cur && o.s > k));
			const next = after < 0 ? order.length : after;
			const to = action === 'next' ? next : action === 'prev' ? (at >= 0 ? at : next) - 1 : action === 'first' ? 0 : order.length - 1;
			if (to < 0 || to >= order.length) return false;
			if (to === at) {
				if (run && run.count > 1) {
					publish({ ...focus, origin, cause: 'nav', page: action === 'last' ? Number.POSITIVE_INFINITY : 0, element: null });
					return true;
				}
				return false;
			}
			const dest = order[to];
			navigate(origin, { chunkIndex: dest.c, section: dest.s, page: action === 'prev' || action === 'last' ? Number.POSITIVE_INFINITY : 0 }, 'nav');
			return true;
		},

		pages(_origin, at) {
			shownPages = { ...at };
		},

		pick(origin, element) {
			if (!ix || !element) {
				if (focus.element) publish({ ...focus, origin, cause: 'pick', element: null });
				return;
			}
			const c = chunkIndexOf(ix, element.chunk);
			if (c < 0) return;
			const ch = ix.chunks[c];
			const s = sectionAt(ix, ch.from + element.start);
			publish({ origin, cause: 'pick', chunk: ch.id, chunkIndex: c, section: s ? s.section : 0, page: focus.page, head: ch.from + element.end, anchor: ch.from + element.start, line: '', element });
		},

		subscribe(select, listener, o = {}) {
			const ignore = o.ignoreOrigin === undefined ? [] : typeof o.ignoreOrigin === 'string' ? [o.ignoreOrigin] : o.ignoreOrigin;
			const sub: Sub = {
				select: select as (f: Focus) => unknown,
				listener: listener as (v: unknown, f: Focus) => void,
				lane: o.lane ?? 'frame',
				ignore,
				equals: (o.equals as (a: unknown, b: unknown) => boolean) ?? Object.is,
				seen: select(focus),
				pending: false,
				alive: true,
			};
			subs.add(sub);
			return () => {
				sub.alive = false;
				subs.delete(sub);
			};
		},

		flush() {
			runLane('frame');
			runLane('idle');
		},
	};
	return hub;
}

// Map an offset through an edit. Inside a deleted span it lands at the edit's end in the
// new text; after it, it shifts by the length change.
function mapThrough(o: number, prev: DeckIndex | null, next: string, span?: EditSpan): number {
	if (!prev) return Math.min(o, next.length);
	const s = span ?? diffSpan(prev.source, next);
	if (o <= s.from) return o;
	if (o >= s.toA) return o + (s.toB - s.toA);
	return s.toB;
}

/** Where an editor should put its caret to show `f`: the section's start. */
export function revealOffset(ix: DeckIndex, f: Focus): number {
	if (f.chunkIndex < 0) return 0;
	return sectionStart(ix, f.chunkIndex, f.section);
}

