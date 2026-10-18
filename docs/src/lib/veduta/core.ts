// Veduta core — the headless half of a windowed preview. No DOM, no framework, no Lattice.
//
// Given a focus, the facts of each window's viewport and what the connector last said it can hold,
// `windowFor` returns RANKED, ADVISORY mount intent: which units each window should mount, at which
// fidelity tier, in priority order. `settle` takes the connector's report and returns the `previous`
// for the next call. The connector (a frame pool, a one-frame filmstrip, a plain list) does the
// mounting; this module never touches it.
//
// Two windows: the STAGE (what the reader looks at) and the MAP (a second list over the same units,
// drawn as pills, wireframes, posters or live thumbnails). Three policies: `single` mounts one unit,
// `multi` mounts the units near the stage viewport, `pip` is `single` plus a map window. Two stage
// kinds: `paged` re-points one view; `scrolled` is native scroll.
//
// RULES the design settled on (engineering/decisions/2026-10-16-preview-as-library-audit.md §11d):
//   · Capacity is REPORTED by the connector, never inferred. A pool also falls short for tiles
//     outside its observer band, and learning that as its cap starves visible tiles.
//   · A connector holds at least one stage unit, or the focus guarantee breaks.
//   · The live budget is page-global and priced PER CONNECTOR: a frame pool's document costs more
//     than a filmstrip section. A unit over budget falls down the ladder before the pool sees it.
//   · Each window is ranked by ITS OWN viewport; focus is a seed, not the only center.
//
// INLINABLE, like lib/core/present-transport.mjs: each export is self-contained (every helper is
// defined inside it, nothing reads module scope), so `windowFor.toString()` can be inlined into a
// page that cannot `import`. core.test.ts rebuilds both functions from source and compares them.

export type Policy = 'single' | 'multi' | 'pip';
export type StageKind = 'paged' | 'scrolled';
/** The fidelity ladder, richest first. A unit that misses a rung's budget falls to the next. */
export type Tier = 'live' | 'poster' | 'wireframe' | 'placeholder';
export type WindowName = 'stage' | 'map';

/** One list's viewport. `pitch` is one unit plus its gap in px; `top` is where unit 0 starts; `cols` is the map's columns. */
export interface Viewport {
	y: number;
	h: number;
	top: number;
	pitch: number;
	cols?: number;
}
/** Rows held around the view. A move happens when the row one past the view is not held (`need`); a move mounts `mount` around the view and keeps whatever of the old run is inside `keep`. */
export interface Band {
	need: number;
	mount: number;
	keep: number;
}
export interface Budget {
	/** Page-global live budget, in cost units. */
	live: number;
	/** How many posters may be asked for. */
	poster: number;
	/** How many wireframes may be asked for. */
	wireframe: number;
	/** The tier each window asks for first. */
	stageTier: Tier;
	mapTile: Tier;
	/** What one live unit costs in each window's connector. */
	cost: { stage: number; map: number };
}
export interface Caps {
	stage: number;
	map: number;
	live: number;
}
export interface Asked {
	stage: number;
	map: number;
	live: number;
}
export interface Previous {
	runs: { stage?: { lo: number; hi: number }; map?: { lo: number; hi: number } };
	caps: Caps;
}
export interface WindowArgs {
	policy: Policy;
	stage?: StageKind;
	count: number;
	focus: number;
	viewports?: { stage?: Viewport; map?: Viewport };
	overscan?: { stage?: Partial<Band>; map?: Partial<Band> };
	budget?: Partial<Budget>;
	hysteresis?: boolean;
	previous?: Previous | null;
}
export interface RankEntry {
	w: WindowName;
	i: number;
	tier: Tier;
	d: number;
}
export interface Intent {
	stageUnits: number[];
	mapUnits: number[];
	tiers: { stage: Map<number, Tier>; map: Map<number, Tier> };
	rank: RankEntry[];
	state: { runs: Previous['runs']; caps: Caps; asked: Asked };
}
/** What the connector actually mounted. `cap` is its REPORTED capacity and the only thing that changes what is asked next. */
export interface Satisfied {
	stage?: ArrayLike<number> | ReadonlySet<number>;
	map?: ArrayLike<number> | ReadonlySet<number>;
	live?: number;
	cap?: Partial<Caps>;
}
/** Test-only switches: each is a deliberately broken variant a property must catch (the failing arms). Never set in product code. */
export interface Unsafe {
	noHysteresis?: boolean;
	neverUnmount?: boolean;
	lastCeil?: boolean;
	dropFocusSeed?: boolean;
	unseededStage?: boolean;
	singleOverscan?: boolean;
	mapFirst?: boolean;
	mapByFocus?: boolean;
	ignoreCaps?: boolean;
	perWindowBudget?: boolean;
	ignoreCost?: boolean;
	noStageFloor?: boolean;
	/** `settle` learns a shortfall as the cap (the starvation bug). */
	inferCaps?: boolean;
}

export function windowFor(args: WindowArgs, unsafe?: Unsafe): Intent {
	const u: Unsafe = unsafe || {};
	const policy = args.policy || 'single';
	const stageKind = args.stage || 'paged';
	const count = Math.max(0, Math.floor(args.count || 0));
	const vps = args.viewports || {};
	const os = args.overscan || {};
	const osStage = { need: 1, mount: 3, keep: 5, ...(os.stage || {}) };
	const osMap = { need: 1, mount: 2, keep: 4, ...(os.map || {}) };
	const budget = { live: 4, poster: Infinity, wireframe: Infinity, mapTile: 'wireframe' as Tier, stageTier: 'live' as Tier, ...(args.budget || {}), cost: { stage: 1, map: 1, ...((args.budget?.cost) || {}) } };
	const hyst = args.hysteresis !== false && !u.noHysteresis;
	const prev = args.previous || null;
	const caps: Caps = { stage: Infinity, map: Infinity, live: Infinity, ...((prev?.caps) || {}) };
	if (!u.noStageFloor) caps.stage = Math.max(1, caps.stage);
	const empty: Intent = { stageUnits: [], mapUnits: [], tiers: { stage: new Map(), map: new Map() }, rank: [], state: { runs: {}, caps, asked: { stage: 0, map: 0, live: 0 } } };
	if (count === 0) return empty;
	const focus = Math.max(0, Math.min(count - 1, Math.floor(args.focus || 0)));

	// The same arithmetic as docs/src/playground/virtual-window.js, restated so this function stays
	// self-contained. core.test.ts proves the two agree on random inputs.
	const clampRange = (first: number, last: number, n: number, over: number) => {
		const lo = Math.max(0, Math.min(n - 1, Math.floor(first) - over));
		const hi = Math.max(lo, Math.min(n - 1, Math.ceil(last) + over));
		return { lo, hi };
	};
	const visible = (vp: Viewport | undefined, n: number) => {
		if (!vp || !(vp.pitch > 0)) return null;
		const first = Math.max(0, Math.min(n - 1, Math.floor((vp.y - vp.top) / vp.pitch)));
		const last = Math.max(first, Math.min(n - 1, Math.floor((vp.y + vp.h - vp.top) / vp.pitch)));
		return { first, last: u.lastCeil ? Math.min(n - 1, Math.ceil((vp.y + vp.h - vp.top) / vp.pitch)) : last };
	};
	const inside = (a: { lo: number; hi: number }, b: { lo: number; hi: number }) => a.lo >= b.lo && a.hi <= b.hi;
	// One window's held run, in ROWS. This is deck-render.js syncVirtual's rule, unchanged.
	const band = (vis: { first: number; last: number }, rows: number, o: Band, run: { lo: number; hi: number } | undefined) => {
		const mount = clampRange(vis.first, vis.last, rows, o.mount);
		if (!hyst || !run) return mount;
		if (u.neverUnmount) return { lo: Math.min(run.lo, mount.lo), hi: Math.max(run.hi, mount.hi) };
		const need = clampRange(vis.first, vis.last, rows, o.need);
		const slack = clampRange(vis.first, vis.last, rows, o.keep + o.mount);
		if (inside(need, run) && inside(run, slack)) return run;
		const keep = clampRange(vis.first, vis.last, rows, o.keep);
		const lo = Math.max(run.lo, keep.lo);
		const hi = Math.min(run.hi, keep.hi);
		if (lo > hi || hi < mount.lo - 1 || lo > mount.hi + 1) return mount;
		return { lo: Math.min(lo, mount.lo), hi: Math.max(hi, mount.hi) };
	};
	const dist = (i: number, r: { lo: number; hi: number }) => (i < r.lo ? r.lo - i : i > r.hi ? i - r.hi : 0);
	const runs: Previous['runs'] = {};
	const entries: Array<{ w: WindowName; i: number; d: number; want: Tier }> = [];

	// ── STAGE ──
	if (policy === 'multi' && !u.singleOverscan) {
		const vis = stageKind === 'scrolled' ? visible(vps.stage, count) : { first: focus, last: focus };
		const stageVis = vis ? { lo: vis.first, hi: vis.last } : { lo: focus, hi: focus };
		const run = vis ? band(vis, count, osStage, prev?.runs?.stage) : { lo: focus, hi: focus };
		runs.stage = run;
		const set = new Set<number>();
		for (let i = run.lo; i <= run.hi; i++) set.add(i);
		// FOCUS IS A SEED. A command that jumps (go(n), a caret move) lands before the scroll does;
		// mounting focus +- MOUNT now is what deck-render's mountAround and its 1500 ms pin buy by time.
		if (!u.dropFocusSeed && !set.has(focus)) {
			const f = clampRange(focus, focus, count, osStage.mount);
			for (let i = f.lo; i <= f.hi; i++) set.add(i);
		}
		for (const i of set) entries.push({ w: 'stage', i, d: u.unseededStage ? dist(i, stageVis) : Math.min(dist(i, stageVis), Math.abs(i - focus)), want: budget.stageTier });
	} else {
		// single and pip: the window of one. (`singleOverscan` is the failing arm: neighbors leak in.)
		const lo = u.singleOverscan ? Math.max(0, focus - 1) : focus;
		const hi = u.singleOverscan ? Math.min(count - 1, focus + 1) : focus;
		runs.stage = { lo, hi };
		for (let i = lo; i <= hi; i++) entries.push({ w: 'stage', i, d: Math.abs(i - focus), want: budget.stageTier });
	}

	// ── MAP ── (pip always; multi when a map viewport is given)
	const mapVp = vps.map;
	if (mapVp && (policy === 'pip' || policy === 'multi')) {
		const cols = Math.max(1, Math.floor(mapVp.cols || 1));
		const rows = Math.ceil(count / cols);
		const vis = visible(mapVp, rows);
		if (vis) {
			const run = band(vis, rows, osMap, prev?.runs?.map);
			runs.map = run;
			const visRows = { lo: vis.first, hi: vis.last };
			for (let r = run.lo; r <= run.hi; r++) {
				for (let c = 0; c < cols; c++) {
					const i = r * cols + c;
					if (i >= count) break;
					// Ranked by the MAP'S OWN viewport. `mapByFocus` is the failing arm.
					const d = u.mapByFocus ? Math.abs(i - focus) : dist(r, visRows);
					entries.push({ w: 'map', i, d, want: budget.mapTile });
				}
			}
		}
	}

	// ── RANK ── distance first; on a tie the stage wins, then nearness to focus, then index.
	const order = { stage: u.mapFirst ? 1 : 0, map: u.mapFirst ? 0 : 1 };
	entries.sort((a, b) => a.d - b.d || order[a.w] - order[b.w] || Math.abs(a.i - focus) - Math.abs(b.i - focus) || a.i - b.i);

	// ── CAPACITY ── never ask a window for more than the connector REPORTED it can hold.
	const kept: typeof entries = [];
	const asked: Asked = { stage: 0, map: 0, live: 0 };
	for (const e of entries) {
		const cap = u.ignoreCaps ? Infinity : caps[e.w];
		if (asked[e.w] >= cap) continue;
		asked[e.w]++;
		kept.push(e);
	}

	// ── TIERS ── one page-global live budget across every window, priced per connector.
	const ladder: Tier[] = ['live', 'poster', 'wireframe', 'placeholder'];
	const liveLimit = Math.min(budget.live, u.ignoreCaps ? Infinity : caps.live);
	let liveUsed = 0;
	let posters = 0;
	let wireframes = 0;
	const perWindowLive = { stage: 0, map: 0 };
	const tiers = { stage: new Map<number, Tier>(), map: new Map<number, Tier>() };
	const rank: RankEntry[] = [];
	asked.live = 0;
	for (const e of kept) {
		let tier: Tier = e.want;
		for (let r = ladder.indexOf(tier); r < ladder.length - 1; r++) {
			tier = ladder[r];
			if (tier === 'live') {
				const cost = u.ignoreCost ? 1 : budget.cost[e.w];
				const used = u.perWindowBudget ? perWindowLive[e.w] : liveUsed;
				if (used + cost <= liveLimit) {
					liveUsed += cost;
					perWindowLive[e.w] += cost;
					asked.live++;
					break;
				}
			} else if (tier === 'poster') {
				if (posters < budget.poster) {
					posters++;
					break;
				}
			} else if (tier === 'wireframe') {
				if (wireframes < budget.wireframe) {
					wireframes++;
					break;
				}
			}
			tier = 'placeholder';
		}
		tiers[e.w].set(e.i, tier);
		rank.push({ w: e.w, i: e.i, tier, d: e.d });
	}
	const sorted = (w: WindowName) => [...tiers[w].keys()].sort((a, b) => a - b);
	return { stageUnits: sorted('stage'), mapUnits: sorted('map'), tiers, rank, state: { runs, caps, asked } };
}

/**
 * Take the connector's report and return the `previous` for the next call. Only an explicit `cap`
 * changes what is asked next: a connector that mounts fewer than asked WITHOUT reporting a cap is
 * not believed to be full, because it may simply be slow or outside its observer band. The stage
 * cap is never below 1.
 */
export function settle(intent: Intent, satisfied?: Satisfied, unsafe?: Unsafe): Previous {
	const st = intent.state;
	const s: Satisfied = satisfied || {};
	const caps: Caps = { ...st.caps };
	for (const w of ['stage', 'map'] as const) {
		const v = s.cap?.[w];
		if (v != null) caps[w] = v;
		else if (unsafe?.inferCaps && s[w] != null) {
			const got = (s[w] as ArrayLike<number> & { size?: number }).size ?? (s[w] as ArrayLike<number>).length;
			if (got < st.asked[w]) caps[w] = got;
		}
	}
	if (s.cap && s.cap.live != null) caps.live = s.cap.live;
	if (unsafe?.noStageFloor) return { runs: st.runs, caps };
	caps.stage = Math.max(1, caps.stage);
	return { runs: st.runs, caps };
}

/** A stateful convenience over the two pure functions: `windowFor(args)` then `settle(report)`. */
export function createVeduta() {
	let previous: Previous | null = null;
	let last: Intent | null = null;
	return {
		windowFor(args: WindowArgs): Intent {
			last = windowFor({ ...args, previous });
			return last;
		},
		settle(satisfied?: Satisfied): Previous | null {
			if (last) previous = settle(last, satisfied);
			return previous;
		},
	};
}
