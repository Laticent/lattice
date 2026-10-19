// THE FOCUS HUB — where the reader's focus is in a document, and who needs to hear that it moved.
//
// Every view of one document talks to one hub instead of to each other: a text editor, a rich
// editor, an outline or table of contents, a rendered preview, a minimap, a slide rail, a
// collaborator's cursor, a narration track. Each one does two things:
//
//   · it REPORTS facts about itself: "my caret is at offset 812" (`report`), or, for a view
//     without offsets, "my caret is in unit 4" (`reportUnit`), or "the part I show has 3 pages"
//     (`pages`), or "the reader clicked this element" (`pick`);
//   · it REQUESTS moves: "go to unit 7" (`go`), "next" (`step`).
//
// The hub resolves each against the document's OUTLINE (./outline.ts — units, parts, stable ids,
// kept current by an outliner the host chooses) and publishes one `Focus` record. Views choose
// the fields they care about with a selector, choose a delivery lane, and hear only when those
// fields change. Nothing calls into another view.
//
// THE GUARANTEES, which are why it exists. The Lattice Studio this was written for kept its
// panes in step with about eight hand-written loop guards — "last index I published" refs
// pre-seeded before every programmatic move, a flag that relied on an echo arriving
// synchronously, a step held up to 1.5 s waiting for a render — and each went stale at least
// once (engineering/decisions/2026-10-15-fuoco-focus-sync.md §3). Here they are the hub's:
//
//   1. ORIGIN. Every publication names its origin, and a subscriber that names itself in
//      `ignoreOrigin` never hears its own moves. A view that reveals what another asked for
//      reports the caret move that reveal made as `quiet`; it agrees with the focus, so nothing
//      is published. No view keeps a "last published" ref.
//   2. REVISION. A report may carry the outline revision it was computed against; a report
//      against older text is dropped, never applied to newer text.
//   3. NO RE-ENTRY. A publication made while a delivery runs is queued until it finishes, so a
//      subscriber that publishes cannot recurse, and every subscriber sees publications in order.
//   4. DEFERRED REQUESTS. A move that targets text not yet applied (insert a unit, then go to
//      it) waits for exactly that text (`go(…, { after })`), not for a timer or a frame.
//
// LANES. `sync` delivers before the call returns (React state through ./react.ts). `frame`
// delivers once per animation frame, latest value only, so a held key that crosses three units
// in one frame moves the view once. `idle` delivers when the browser is idle, with a 500 ms
// ceiling (persistence, presence, analytics).
//
// Framework-free, dependency-free, and DOM-free apart from the default scheduler's
// requestAnimationFrame / requestIdleCallback, both of which can be replaced.

import { diffSpan, type EditSpan, flatPart, mapOffset, type Outline, type Outliner, partAt, partOfFlat, partStart, type UnitId, unitIndexOf } from './outline.js';

export type Origin = string;

/** What moved the focus. Views use it to choose a reaction: an editor reveals on `nav` and
 *  `pick`, and leaves its caret alone on `caret`, `edit` and `page` (another page of the same
 *  part moves a preview, not the text). */
export type Cause = 'caret' | 'nav' | 'page' | 'pick' | 'edit' | 'load' | 'report';

/** A rendered element, addressed by the source span it came from. */
export interface ElementAddr {
	readonly unit: UnitId;
	/** Source offsets, relative to the unit's `from`. */
	readonly start: number;
	readonly end: number;
	/** What kind of element it is, in the host's own words ("pill", "heading", "cell"). */
	readonly kind: string;
}

export interface Focus {
	/** Monotonic per hub. */
	readonly seq: number;
	/** The outline revision this focus is expressed against. */
	readonly rev: number;
	readonly origin: Origin;
	readonly cause: Cause;
	/** The stable id of the focused unit, or null for an empty document. */
	readonly unit: UnitId | null;
	/** Its position in the current outline, or -1. */
	readonly unitIndex: number;
	/** The part within the unit (0 when units are not split). */
	readonly part: number;
	/** The flat part number across the document, 0-based: what a reader counts. */
	readonly flat: number;
	/** A page of the part's rendering that navigation asked for, or null to follow the caret.
	 *  `Infinity` asks for the last page. */
	readonly page: number | null;
	/** How many pages the rendering view last reported for this part (1 until it reports). */
	readonly pages: number;
	/** The page the rendering view shows, as it last reported (0 until it reports). */
	readonly shown: number;
	/** The caret, in absolute source offsets, when a view with offsets reported it. */
	readonly head: number | null;
	readonly anchor: number | null;
	/** The caret line's text, as the reporting view sees it. */
	readonly line: string;
	readonly element: ElementAddr | null;
	/** The move asked the receiving editor to take keyboard focus, not only to show the place.
	 *  A mouse pick does; a key, a swipe or a touch pick does not (touch focus raises the
	 *  software keyboard). */
	readonly grab: boolean;
}

export type Lane = 'sync' | 'frame' | 'idle';

export interface SubscribeOptions<T> {
	lane?: Lane;
	/** Never deliver a change this origin made. The subscriber's baseline still advances. */
	ignoreOrigin?: Origin | readonly Origin[];
	equals?: (a: T, b: T) => boolean;
}

export interface Target {
	/** A unit by stable id… */
	unit?: UnitId;
	/** …or by position in the current outline… */
	unitIndex?: number;
	/** …or a flat part number. */
	flat?: number;
	part?: number;
	page?: number | null;
	/** Ask the receiving editor to take keyboard focus (see `Focus.grab`). */
	grab?: boolean;
}

export type StepAction = 'next' | 'prev' | 'first' | 'last';

export interface StepOptions {
	/** The unit indices a filtered view shows, in order; others are skipped. */
	view?: readonly number[] | null;
	/** `false` when no paging view is on screen: steps move whole parts and never wait. */
	pages?: boolean;
	grab?: boolean;
}

export interface Scheduler {
	frame(cb: () => void): void;
	idle(cb: () => void): void;
}

export interface FocusHub {
	get(): Focus;
	outline(): Outline | null;
	/** Feed the document text. Returns the outline revision for it; idempotent for equal text.
	 *  `span` is the editor's own account of the change (a text diff cannot tell which of two
	 *  equal-looking edits was made, and stable ids depend on it). `by` names who changed it.
	 *  `duringRender`: the caller is a React render — a focus the edit moves then reaches `sync`
	 *  subscribers on a microtask, after the render, never inside it. */
	update(text: string, opts?: { span?: EditSpan; by?: Origin; duringRender?: boolean }): number;
	/** A view's caret or selection moved. Offsets are absolute in the text of `rev`. `quiet`: the
	 *  move was not the reader's (a view revealing what another asked for); inside the focused
	 *  part it refreshes the caret without publishing, and keeps the page navigation chose. */
	report(origin: Origin, at: { head: number; anchor?: number; line?: string; rev?: number; quiet?: boolean }): void;
	/** A view without offsets: its caret is in this unit. Without `part`, a report inside the
	 *  focused unit keeps the focused part and page — such a view cannot tell parts apart.
	 *  `quiet`: the view moved itself to follow the focus (a programmatic scroll, the reflow after
	 *  it). A quiet report never publishes and never cancels a pending move: inside the focused
	 *  unit it refreshes the line silently, and in any other unit it is dropped — a scrolled view
	 *  that cannot centre the focused unit (the last one, a tie at a boundary) must not pull the
	 *  focus to the unit it can centre. */
	reportUnit(origin: Origin, at: { unitIndex: number; part?: number; line?: string; rev?: number; quiet?: boolean }): void;
	/** Move. With `after`, wait until the outline holds exactly that text. */
	go(origin: Origin, target: Target, opts?: { after?: string }): void;
	/** Step through pages, then parts, then units — the order a reader pages a document. */
	step(origin: Origin, action: StepAction, opts?: StepOptions): boolean;
	/** A rendering view's report after each render: the part it shows has `count` pages and
	 *  shows `shown`. `canSplit`: this document's parts can paginate at all, so a step into a part
	 *  whose render has not landed waits for it instead of crossing it blind. */
	pages(origin: Origin, at: { unit: UnitId | null; part: number; count: number; shown: number; canSplit?: boolean }): void;
	/** The reader picked a rendered element (or null to clear the pick). */
	pick(origin: Origin, element: ElementAddr | null): void;
	/** Drop a step waiting for a render: the view it was aimed at went away. */
	cancelWaiting(): void;
	subscribe<T>(select: (f: Focus) => T, listener: (value: T, focus: Focus) => void, opts?: SubscribeOptions<T>): () => void;
	/** Deliver every pending notification now (tests, teardown). */
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
	/** Any report, even one that changes nothing, cancels a deferred move and a waiting step. */
	clearOnAnyReport?: boolean;
	/** Judge a report the moment it is made, even inside a delivery (against stale focus). */
	eagerReports?: boolean;
	/** `reportUnit` ignores `quiet`. */
	loudQuiet?: boolean;
	/** A queued report is judged even when another origin moved the focus after it was made. */
	ignoreBasis?: boolean;
}

export interface FocusHubOptions {
	/** How the document becomes an outline (./text-outline.ts, or the host's own). */
	outliner: Outliner;
	scheduler?: Scheduler;
	unsafe?: Unsafe;
}

const EMPTY: Focus = Object.freeze({ seq: 0, rev: 0, origin: 'init', cause: 'load', unit: null, unitIndex: -1, part: 0, flat: 0, page: null, pages: 1, shown: 0, head: null, anchor: null, line: '', element: null, grab: false });

function defaultScheduler(): Scheduler {
	const g = globalThis as typeof globalThis & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
	return {
		frame: (cb) => void (typeof g.requestAnimationFrame === 'function' ? g.requestAnimationFrame(() => cb()) : setTimeout(cb, 16)),
		idle: (cb) => void (typeof g.requestIdleCallback === 'function' ? g.requestIdleCallback(cb, { timeout: 500 }) : setTimeout(cb, 200)),
	};
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

type Draft = Omit<Focus, 'seq' | 'rev' | 'flat' | 'pages' | 'shown'>;
const draftOf = (f: Focus): Draft => {
	const { seq: _s, rev: _r, flat: _f, pages: _p, shown: _w, ...rest } = f;
	return rest;
};

export function createFocusHub(opts: FocusHubOptions): FocusHub {
	const { outliner } = opts;
	const scheduler = opts.scheduler ?? defaultScheduler();
	const unsafe = opts.unsafe ?? {};
	let ol: Outline | null = null;
	let focus: Focus = EMPTY;
	let seq = 0;
	const subs = new Set<Sub>();
	const stats: HubStats = { published: 0, delivered: 0, droppedStale: 0, queued: 0 };
	// The page run the rendering view last reported, for the part it shows.
	let shownPages: { unit: UnitId | null; part: number; count: number; shown: number; canSplit?: boolean } | null = null;
	let deferred: { origin: Origin; target: Target; after: string } | null = null;
	// ONE step may wait for the part just entered to report its pages. One, not a queue: a held
	// key must stop when the key does. It runs when that report lands, or is dropped by any move.
	let waitingStep: { origin: Origin; action: StepAction; opts: StepOptions } | null = null;
	// The last publication each origin made, by seq: a queued report is stale when ANOTHER origin
	// moved the focus after the report was made (the focus analogue of `rev`).
	const lastBy = new Map<Origin, number>();

	// ── Delivery ──────────────────────────────────────────────────────────────
	// `delivering`: a subscriber loop is running. `draining`: the queue of calls made during one
	// is being worked off. Queued calls run in order, each OUTSIDE any delivery, so a call reads
	// the focus every call queued before it produced.
	let delivering = false;
	let draining = false;
	const queue: Array<() => void> = [];
	let frameArmed = false;
	let idleArmed = false;
	let syncArmed = false;
	let inRender = false;

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
		if (lane === 'sync') syncArmed = false;
		guarded(() =>
			delivery(() => {
				for (const s of subs) if (s.lane === lane && s.pending) deliver(s);
			}),
		);
	}

	function delivery(fn: () => void) {
		delivering = true;
		try {
			fn();
		} finally {
			delivering = false;
		}
	}

	// Run `fn` with re-entry protection: a call made while a delivery runs queues until that
	// delivery returns, then runs — in the order the calls were made, and each one fully (its own
	// publication delivered) before the next is judged.
	function guarded(fn: () => void) {
		if (delivering) {
			stats.queued++;
			queue.push(fn);
			return;
		}
		fn();
		if (draining) return;
		draining = true;
		try {
			while (queue.length) queue.shift()?.();
		} finally {
			draining = false;
		}
	}

	function publish(next: Draft) {
		guarded(() => {
			const flat = ol && next.unitIndex >= 0 ? flatPart(ol, next.unitIndex, next.part) : 0;
			const run = shownPages && shownPages.unit === next.unit && shownPages.part === next.part ? shownPages : null;
			focus = Object.freeze({ ...next, seq: ++seq, rev: ol?.rev ?? 0, flat, pages: run ? run.count : 1, shown: run ? run.shown : 0 });
			stats.published++;
			lastBy.set(next.origin, seq);
			let frame = false;
			let idle = false;
			let sync = false;
			delivery(() => {
				for (const s of subs) {
					if (s.lane === 'sync' && !inRender) deliver(s);
					else {
						s.pending = true;
						if (s.lane === 'frame') frame = true;
						else if (s.lane === 'idle') idle = true;
						else sync = true;
					}
				}
			});
			if (sync && !syncArmed) {
				syncArmed = true;
				queueMicrotask(() => runLane('sync'));
			}
			if (frame && !frameArmed) {
				frameArmed = true;
				scheduler.frame(() => runLane('frame'));
			}
			if (idle && !idleArmed) {
				idleArmed = true;
				scheduler.idle(() => runLane('idle'));
			}
		});
	}

	// ── Resolving ─────────────────────────────────────────────────────────────
	function resolve(t: Target): { unitIndex: number; part: number } | null {
		if (!ol?.units.length) return null;
		if (typeof t.flat === 'number') {
			const r = partOfFlat(ol, t.flat);
			return r ? { unitIndex: r.unit, part: r.part } : null;
		}
		let u = -1;
		if (t.unit !== undefined) u = unitIndexOf(ol, t.unit);
		else if (typeof t.unitIndex === 'number') u = Math.max(0, Math.min(t.unitIndex, ol.units.length - 1));
		if (u < 0) return null;
		const n = ol.units[u].parts.length;
		const k = t.part === undefined ? 0 : t.part === Number.POSITIVE_INFINITY ? n - 1 : Math.max(0, Math.min(t.part, n - 1));
		return { unitIndex: u, part: k };
	}

	function navigate(origin: Origin, t: Target, cause: Cause) {
		const r = resolve(t);
		if (!r || !ol) return;
		const unit = ol.units[r.unitIndex];
		publish({ origin, cause, unit: unit.id, unitIndex: r.unitIndex, part: r.part, page: t.page === undefined ? 0 : t.page, head: null, anchor: null, line: '', element: null, grab: t.grab === true });
	}

	const stale = (rev?: number) => !unsafe.acceptStale && rev !== undefined && ol !== null && rev !== ol.rev;

	// A report cancels a deferred move and a waiting step only when it PUBLISHES: a report that
	// agrees with the focus (a reflow, scroll anchoring, a quiet reveal) is not a new request.
	function movedByOther(origin: Origin, basis: number) {
		if (unsafe.ignoreBasis) return false;
		for (const [o, s] of lastBy) if (o !== origin && s > basis) return true;
		return false;
	}

	function cancelPending() {
		deferred = null;
		waitingStep = null;
	}

	function reportNow(origin: Origin, at: { head: number; anchor?: number; line?: string; rev?: number; quiet?: boolean; basis: number }) {
		if (stale(at.rev) || movedByOther(origin, at.basis)) {
			stats.droppedStale++;
			return;
		}
		if (!ol) return;
		if (unsafe.clearOnAnyReport) cancelPending();
		const p = partAt(ol, at.head);
		if (!p) return;
		const unit = ol.units[p.unit];
		const anchor = at.anchor ?? at.head;
		const line = at.line ?? '';
		if (at.quiet && focus.unit === unit.id && focus.part === p.part) {
			// While navigation holds a page, the caret line decides nothing: refresh silently.
			// While the rendering follows the caret (page null), a new line is news — but a quiet
			// one, so it does not cancel what is pending.
			if (focus.page !== null || focus.line === line) {
				focus = Object.freeze({ ...focus, head: at.head, anchor, line });
				return;
			}
			publish({ ...draftOf(focus), origin, cause: 'caret', head: at.head, anchor, line });
			return;
		}
		// A caret move that changes nothing a subscriber could select is not a publication.
		if (focus.unit === unit.id && focus.part === p.part && focus.head === at.head && focus.anchor === anchor && focus.line === line && focus.page === null && focus.element === null) return;
		cancelPending();
		publish({ origin, cause: 'caret', unit: unit.id, unitIndex: p.unit, part: p.part, page: null, head: at.head, anchor, line, element: null, grab: false });
	}

	function reportUnitNow(origin: Origin, at: { unitIndex: number; part?: number; line?: string; rev?: number; quiet?: boolean; basis: number }) {
		if (stale(at.rev) || movedByOther(origin, at.basis)) {
			stats.droppedStale++;
			return;
		}
		if (!ol?.units.length) return;
		if (unsafe.clearOnAnyReport) cancelPending();
		const u = Math.max(0, Math.min(at.unitIndex, ol.units.length - 1));
		const unit = ol.units[u];
		const line = at.line ?? '';
		if (at.quiet && !unsafe.loudQuiet) {
			if (focus.unit === unit.id) focus = Object.freeze({ ...focus, line });
			return;
		}
		if (at.part === undefined && focus.unit === unit.id) {
			// Same unit, no part information: keep the part and page navigation chose. A line
			// change is news only while the rendering follows the caret (page null).
			if (focus.page !== null || focus.line === line) {
				focus = Object.freeze({ ...focus, line });
				return;
			}
			cancelPending();
			publish({ ...draftOf(focus), origin, cause: 'caret', head: null, anchor: null, line });
			return;
		}
		const k = Math.max(0, Math.min(at.part ?? 0, unit.parts.length - 1));
		if (focus.unit === unit.id && focus.part === k && focus.line === line && focus.head === null && focus.page === null) return;
		cancelPending();
		publish({ origin, cause: 'caret', unit: unit.id, unitIndex: u, part: k, page: null, head: null, anchor: null, line, element: null, grab: false });
	}

	const hub: FocusHub = {
		get: () => focus,
		outline: () => ol,
		stats,

		update(text, o = {}) {
			if (o.duringRender) {
				inRender = true;
				try {
					return hub.update(text, { span: o.span, by: o.by });
				} finally {
					inRender = false;
				}
			}
			const by = o.by ?? 'source';
			const prev = ol;
			ol = outliner.update(ol, text, o.span ? { span: o.span } : undefined);
			if (ol === prev) return ol.rev;
			// Re-express the focus against the new text. A unit id that survived keeps its place;
			// a deleted one falls to the unit that now holds its old position.
			if (focus.unit !== null) {
				let u = unitIndexOf(ol, focus.unit);
				let part = focus.part;
				if (u < 0) {
					u = Math.max(0, Math.min(focus.unitIndex, ol.units.length - 1));
					part = 0;
				}
				if (u >= 0 && ol.units.length) {
					part = Math.min(part, ol.units[u].parts.length - 1);
					const span = prev && (o.span ?? diffSpan(prev.source, text));
					const head = focus.head === null || !span ? focus.head : Math.min(mapOffset(focus.head, span), text.length);
					const anchor = focus.anchor === null || !span ? focus.anchor : Math.min(mapOffset(focus.anchor, span), text.length);
					const byCaret = head !== null ? partAt(ol, head) : null;
					const uu = byCaret ? byCaret.unit : u;
					const pp = byCaret ? byCaret.part : part;
					const unit = ol.units[uu];
					if (unit.id !== focus.unit || pp !== focus.part || uu !== focus.unitIndex || head !== focus.head) {
						publish({ ...draftOf(focus), origin: by, cause: 'edit', unit: unit.id, unitIndex: uu, part: pp, head, anchor });
					} else {
						// Same place, same caret: refresh the revision and flat number silently.
						focus = Object.freeze({ ...focus, rev: ol.rev, flat: flatPart(ol, uu, pp) });
					}
				} else if (!ol.units.length) publish({ ...draftOf(EMPTY), origin: by, cause: 'edit' });
			}
			if (deferred && deferred.after === text) {
				const d = deferred;
				deferred = null;
				navigate(d.origin, d.target, 'nav');
			}
			return ol.rev;
		},

		report(origin, at) {
			// The revision and the focus are fixed when the report is MADE: a report queued behind an
			// edit, or behind another view's move, is stale.
			const r = { ...at, rev: at.rev ?? ol?.rev, basis: focus.seq };
			if (unsafe.eagerReports) reportNow(origin, r);
			else guarded(() => reportNow(origin, r));
		},

		reportUnit(origin, at) {
			const r = { ...at, rev: at.rev ?? ol?.rev, basis: focus.seq };
			if (unsafe.eagerReports) reportUnitNow(origin, r);
			else guarded(() => reportUnitNow(origin, r));
		},

		go(origin, target, o) {
			if (o?.after !== undefined && (!ol || ol.source !== o.after)) {
				deferred = { origin, target, after: o.after };
				return;
			}
			deferred = null;
			waitingStep = null;
			navigate(origin, target, 'nav');
		},

		step(origin, action, o = {}) {
			if (!ol?.units.length) return false;
			const allowed = o.view ?? null;
			const paging = o.pages !== false;
			const grab = o.grab === true;
			const shown = (u: number) => !allowed || allowed.includes(u);
			const cur = focus.unitIndex >= 0 ? focus.unitIndex : 0;
			const k = focus.part;
			const run = paging && shownPages && shownPages.unit === focus.unit && shownPages.part === k ? shownPages : null;
			// Just moved to a part whose render has not reported, in a document that can paginate:
			// wait for it rather than step past pages nobody has counted yet. Only for a unit the
			// view shows — a rendering view reports what it shows, so a focus on a filtered-out
			// unit would wait for a report that never comes.
			if (paging && !run && shownPages?.canSplit && focus.cause === 'nav' && focus.unit !== null && shown(cur)) {
				waitingStep ??= { origin, action, opts: o };
				return true;
			}
			// Pages first, while the rendering shows this part and has more to show.
			if (run && run.count > 1 && (action === 'next' || action === 'prev')) {
				const from = focus.page === null ? run.shown : Math.min(focus.page, run.count - 1);
				const p = from + (action === 'next' ? 1 : -1);
				if (p >= 0 && p < run.count) {
					publish({ ...draftOf(focus), origin, cause: 'page', page: p, element: null, grab });
					return true;
				}
			}
			// Then parts and units, in the viewed order.
			const order: Array<{ u: number; k: number }> = [];
			for (let u = 0; u < ol.units.length; u++) if (shown(u)) for (let p = 0; p < ol.units[u].parts.length; p++) order.push({ u, k: p });
			if (!order.length) return false;
			const at = order.findIndex((x) => x.u === cur && x.k === k);
			// The focused unit may be outside the view: then "next" is the first viewed part after
			// it and "prev" the last one before it.
			const after = at >= 0 ? at + 1 : order.findIndex((x) => x.u > cur || (x.u === cur && x.k > k));
			const next = after < 0 ? order.length : after;
			const to = action === 'next' ? next : action === 'prev' ? (at >= 0 ? at : next) - 1 : action === 'first' ? 0 : order.length - 1;
			if (to < 0 || to >= order.length) return false;
			if (to === at) {
				// Home/End on the part already shown: its first or last page, if it paginates.
				if (run && run.count > 1) {
					publish({ ...draftOf(focus), origin, cause: 'page', page: action === 'last' ? Number.POSITIVE_INFINITY : 0, element: null, grab });
					return true;
				}
				return false;
			}
			const dest = order[to];
			navigate(origin, { unitIndex: dest.u, part: dest.k, page: action === 'prev' || action === 'last' ? Number.POSITIVE_INFINITY : 0, grab }, 'nav');
			return true;
		},

		pages(origin, at) {
			shownPages = { ...at };
			// The focused part's run changed: publish it, so a control that says whether "next"
			// stays on this part (and a page indicator) re-reads.
			if (at.unit === focus.unit && at.part === focus.part && (at.count !== focus.pages || at.shown !== focus.shown)) {
				publish({ ...draftOf(focus), origin, cause: 'report' });
			}
			const w = waitingStep;
			if (w && at.unit === focus.unit && at.part === focus.part) {
				waitingStep = null;
				hub.step(w.origin, w.action, w.opts);
			}
		},

		cancelWaiting() {
			waitingStep = null;
		},

		pick(origin, element) {
			if (!ol || !element) {
				if (focus.element) publish({ ...draftOf(focus), origin, cause: 'pick', element: null });
				return;
			}
			const u = unitIndexOf(ol, element.unit);
			if (u < 0) return;
			const unit = ol.units[u];
			const p = partAt(ol, unit.from + element.start);
			publish({ origin, cause: 'pick', unit: unit.id, unitIndex: u, part: p ? p.part : 0, page: focus.page, head: unit.from + element.end, anchor: unit.from + element.start, line: '', element, grab: false });
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
			runLane('sync');
			runLane('frame');
			runLane('idle');
		},
	};
	return hub;
}

/** Where an editor should put its caret to show `f`: its part's start. */
export function revealOffset(o: Outline, f: Focus): number {
	if (f.unitIndex < 0) return 0;
	return partStart(o, f.unitIndex, f.part);
}
