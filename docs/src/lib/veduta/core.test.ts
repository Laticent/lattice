// Property tests for the Veduta core. Style copied from ../fuoco/hub.test.ts: every property runs
// once against the real core and once per FAILING ARM, a deliberately broken variant (`Unsafe`) that
// must go red. A seeded PRNG makes a failure reproduce: VEDUTA_SEED, VEDUTA_RUNS (default 300).
import { describe, expect, it } from 'vitest';
import { visibleRange, windowRange } from '../../playground/virtual-window.js';
import { createVeduta, type Intent, type Previous, type Satisfied, settle, type Unsafe, type WindowArgs, windowFor } from './core.js';

// The Playground's arithmetic, the thing the core must agree with. Both return null only for an empty list, which no property here uses.
const vr = (...a: Parameters<typeof visibleRange>) => visibleRange(...a) as { first: number; last: number };
const wr = (...a: Parameters<typeof windowRange>) => windowRange(...a) as { lo: number; hi: number };

const RUNS = Number(process.env.VEDUTA_RUNS || 300);
const SEED = Number(process.env.VEDUTA_SEED || 20261017);

function mulberry32(a: number) {
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const gen = (seed: number) => {
	const r = mulberry32(seed);
	const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
	const pick = <T,>(xs: readonly T[]): T => xs[int(0, xs.length - 1)];
	return { r, int, pick };
};
type G = ReturnType<typeof gen>;
type VP = { y: number; h: number; top: number; pitch: number; cols: number };
const COUNTS = [10, 37, 120, 1000, 10000, 100000];
const OS = { stage: { need: 1, mount: 3, keep: 5 }, map: { need: 1, mount: 2, keep: 4 } };

function randomViewport(g: G, count: number, cols = 1): VP {
	const pitch = g.int(40, 800);
	const h = Math.round(pitch * (0.3 + g.r() * 2.7));
	const top = g.int(0, 40);
	const rows = Math.ceil(count / cols);
	return { pitch, h, top, cols, y: g.int(0, Math.max(0, rows * pitch - h)) };
}
function randomArgs(g: G, over: Partial<WindowArgs> = {}): WindowArgs & { viewports: { stage: VP; map?: VP } } {
	const count = g.pick(COUNTS);
	return {
		policy: g.pick(['single', 'multi', 'pip'] as const),
		stage: g.pick(['paged', 'scrolled'] as const),
		count,
		focus: g.int(0, count - 1),
		viewports: { stage: randomViewport(g, count), map: g.r() < 0.8 ? randomViewport(g, count, g.int(1, 5)) : undefined },
		overscan: OS,
		budget: { live: g.int(1, 6), mapTile: g.pick(['poster', 'live', 'wireframe'] as const), stageTier: 'live' },
		hysteresis: g.r() < 0.8,
		previous: null,
		...over,
	} as WindowArgs & { viewports: { stage: VP; map?: VP } };
}
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((x, i) => x === b[i]);
const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
const rowDist = (r: number, lo: number, hi: number) => (r < lo ? lo - r : r > hi ? r - hi : 0);

type Body = (g: G, unsafe?: Unsafe) => string | null;
// Runs `body` RUNS times; returns the first violation message or null.
function check(name: string, body: Body, unsafe?: Unsafe): string | null {
	for (let run = 0; run < RUNS; run++) {
		const v = body(gen(SEED + run * 7919), unsafe);
		if (v) return `${name} run ${run}: ${v}`;
	}
	return null;
}
function property(name: string, body: Body, arms: Unsafe[]) {
	describe(name, () => {
		it('holds', () => expect(check(name, body)).toBeNull());
		for (const arm of arms) it(`FAILING ARM: ${Object.keys(arm).join('+')} goes red`, () => expect(check(name, body, arm)).not.toBeNull());
	});
}
const everything = (out: Intent): Satisfied => ({ stage: out.stageUnits, map: out.mapUnits, live: out.state.asked.live });

// A scroll history: a random walk with occasional long jumps, carrying `previous` forward.
function walk(g: G, args: ReturnType<typeof randomArgs>, steps: number, unsafe: Unsafe | undefined, onStep: (out: Intent, s: number) => string | null): string | null {
	let prev: Previous | null = null;
	const vp = args.viewports.stage;
	const mp = args.viewports.map;
	for (let s = 0; s < steps; s++) {
		const jump = g.r() < 0.1;
		vp.y = Math.max(0, jump ? g.int(0, args.count * vp.pitch) : vp.y + g.int(-2, 2) * Math.round(vp.pitch * g.r()));
		if (mp) mp.y = Math.max(0, jump ? g.int(0, Math.ceil(args.count / mp.cols) * mp.pitch) : mp.y + g.int(-2, 2) * Math.round(mp.pitch * g.r()));
		if (g.r() < 0.3) args.focus = g.int(0, args.count - 1);
		else if (args.stage === 'scrolled') args.focus = vr(vp.y, vp.h, vp.top, vp.pitch, args.count).first;
		const out = windowFor({ ...args, previous: prev }, unsafe);
		const v = onStep(out, s);
		if (v) return v;
		prev = settle(out, everything(out));
	}
	return null;
}

// 1. The focused unit is always mounted on the stage.
property(
	'focus is always in the stage set',
	(g, unsafe) => {
		const args = randomArgs(g);
		return walk(g, args, 30, unsafe, (out) => (out.stageUnits.includes(args.focus) ? null : `focus ${args.focus} missing from ${out.stageUnits.slice(0, 5)}… (${args.policy}/${args.stage})`));
	},
	[{ dropFocusSeed: true }],
);

// 2. The mounted count is bounded by a constant that depends on the viewports and overscan only.
const boundOf = (args: ReturnType<typeof randomArgs>) => {
	const band = (vp: VP, o: { keep: number; mount: number }) => Math.ceil(vp.h / vp.pitch) + 2 + 2 * (o.keep + o.mount);
	let c = args.policy === 'multi' ? band(args.viewports.stage, OS.stage) + 2 * OS.stage.mount + 1 : 1;
	if (args.viewports.map && args.policy !== 'single') c += band(args.viewports.map, OS.map) * args.viewports.map.cols;
	return c;
};
property(
	'mounted count is bounded independent of N',
	(g, unsafe) => {
		const args = randomArgs(g, { count: g.pick([10, 100, 1000, 10000, 100000]) });
		const C = boundOf(args);
		if (C > 200) return `bound ${C} is not a small constant`;
		return walk(g, args, 60, unsafe, (out) => {
			const n = out.stageUnits.length + out.mapUnits.length;
			return n > C ? `${n} mounted > bound ${C} at N=${args.count}` : null;
		});
	},
	[{ neverUnmount: true }],
);

// 3. multi's mounted range is what virtual-window.js gives for the same viewport (imported, not
//    restated): cold, with hysteresis off, and step by step against a replay of syncVirtual's rule.
function syncVirtualReplay(count: number, vp: VP, ys: number[], M: number, N: number, K: number) {
	let real: Set<number> | null = null;
	const out: number[][] = [];
	for (const y of ys) {
		const vis = vr(y, vp.h, vp.top, vp.pitch, count);
		if (real) {
			const xs = [...real].sort((a, b) => a - b);
			const run = { lo: xs[0], hi: xs[xs.length - 1] };
			const contiguous = run.hi - run.lo + 1 === xs.length;
			const need = wr(vis.first, vis.last, count, N);
			const slack = wr(vis.first, vis.last, count, K + M);
			if (contiguous && need.lo >= run.lo && need.hi <= run.hi && run.lo >= slack.lo && run.hi <= slack.hi) {
				out.push(xs);
				continue;
			}
		}
		// applyWindow: mount every placeholder in MOUNT, unmount every real slide outside KEEP.
		const mount = wr(vis.first, vis.last, count, M);
		const keep = wr(vis.first, vis.last, count, K);
		const next = new Set(range(mount.lo, mount.hi));
		if (real) for (const i of real) if (i >= keep.lo && i <= keep.hi) next.add(i);
		real = next;
		out.push([...real].sort((a, b) => a - b));
	}
	return out;
}
property(
	'multi equals virtual-window.js visibleRange + windowRange',
	(g, unsafe) => {
		const count = g.pick(COUNTS);
		const vp = randomViewport(g, count);
		const M = g.int(1, 4);
		const N = g.int(0, M - 1);
		const K = M + g.int(0, 3);
		const os = { stage: { need: N, mount: M, keep: K } };
		for (const hysteresis of [true, false]) {
			const vis = vr(vp.y, vp.h, vp.top, vp.pitch, count);
			const want = wr(vis.first, vis.last, count, M);
			const out = windowFor({ policy: 'multi', stage: 'scrolled', count, focus: vis.first, viewports: { stage: vp }, overscan: os, hysteresis, budget: { live: 1e9 } }, unsafe);
			if (!same(out.stageUnits, range(want.lo, want.hi))) return `cold ${hysteresis}: core ${out.stageUnits[0]}..${out.stageUnits.at(-1)} vs ${want.lo}..${want.hi}`;
		}
		const ys: number[] = [];
		let y = vp.y;
		for (let s = 0; s < 40; s++) {
			y = Math.max(0, g.r() < 0.1 ? g.int(0, count * vp.pitch) : y + Math.round((g.r() - 0.5) * 3 * vp.pitch));
			ys.push(y);
		}
		const ref = syncVirtualReplay(count, vp, ys, M, N, K);
		let prev: Previous | null = null;
		for (let s = 0; s < ys.length; s++) {
			const v = { ...vp, y: ys[s] };
			const focus = vr(v.y, v.h, v.top, v.pitch, count).first;
			const out = windowFor({ policy: 'multi', stage: 'scrolled', count, focus, viewports: { stage: v }, overscan: os, budget: { live: 1e9 }, previous: prev }, unsafe);
			const r = ref[s];
			// deck-render.js can leave a HOLE (a placeholder between two real slides); the core keeps one run. Stop comparing there.
			if (r[r.length - 1] - r[0] + 1 !== r.length) break;
			if (!same(out.stageUnits, r)) return `step ${s}: core ${out.stageUnits[0]}..${out.stageUnits.at(-1)} vs syncVirtual ${r[0]}..${r[r.length - 1]}`;
			prev = settle(out, { stage: out.stageUnits });
		}
		return null;
	},
	[{ lastCeil: true }, { noHysteresis: true }],
);

// 4. single is exactly the window of one, whatever else is passed.
property(
	'single is exactly [focus]',
	(g, unsafe) => {
		const args = randomArgs(g, { policy: 'single' });
		const out = windowFor(args, unsafe);
		return same(out.stageUnits, [args.focus]) && out.mapUnits.length === 0 ? null : `single gave ${out.stageUnits} + map ${out.mapUnits.length} for focus ${args.focus}`;
	},
	[{ singleOverscan: true }],
);

// 5. pip = single + a map window, and the map never changes the stage's set or tier.
property(
	'pip stage equals single; the map does not touch it',
	(g, unsafe) => {
		const args = randomArgs(g, { policy: 'pip', budget: { live: g.int(1, 3), mapTile: 'live' } });
		args.viewports.map ??= randomViewport(g, args.count, 3);
		const single = windowFor({ ...args, policy: 'single' }, unsafe);
		const pip = windowFor(args, unsafe);
		const moved = windowFor({ ...args, viewports: { ...args.viewports, map: { ...args.viewports.map, y: g.int(0, args.count * 50) } } }, unsafe);
		for (const o of [pip, moved]) {
			if (!same(o.stageUnits, single.stageUnits)) return 'stage set differs';
			if (o.tiers.stage.get(args.focus) !== single.tiers.stage.get(args.focus)) return `stage tier ${o.tiers.stage.get(args.focus)} vs single ${single.tiers.stage.get(args.focus)}`;
		}
		return pip.mapUnits.length > 0 ? null : 'pip has no map window';
	},
	[{ mapFirst: true }],
);

// 6. Hysteresis: once the core has moved a window, jitter under (mount - need) rows changes nothing.
property(
	'jitter inside the band changes nothing',
	(g, unsafe) => {
		const args = randomArgs(g, { policy: g.pick(['multi', 'pip'] as const), stage: 'scrolled', hysteresis: true });
		const vp = args.viewports.stage;
		args.viewports.map ??= randomViewport(g, args.count, 2);
		const mp = args.viewports.map;
		args.focus = vr(vp.y, vp.h, vp.top, vp.pitch, args.count).first;
		const base = windowFor({ ...args, previous: null }, unsafe);
		let prev = settle(base, everything(base));
		const y0 = vp.y;
		const m0 = mp.y;
		for (let s = 0; s < 40; s++) {
			const jit = (o: { mount: number; need: number }, p: number) => Math.round((g.r() * 2 - 1) * ((o.mount - o.need) * p - 1));
			const out = windowFor({ ...args, viewports: { stage: { ...vp, y: Math.max(0, y0 + jit(OS.stage, vp.pitch)) }, map: { ...mp, y: Math.max(0, m0 + jit(OS.map, mp.pitch)) } }, previous: prev }, unsafe);
			if (!same(out.stageUnits, base.stageUnits) || !same(out.mapUnits, base.mapUnits)) return `jitter ${s} changed the set (${args.policy})`;
			prev = settle(out, everything(out));
		}
		return null;
	},
	[{ noHysteresis: true }],
);

// 7. Rank is monotone in each window's distance from ITS OWN viewport; a map scrolled far from focus
//    ranks its own visible tiles first.
property(
	'rank is monotone per window by its own viewport',
	(g, unsafe) => {
		const count = g.pick([1000, 10000, 100000]);
		const cols = g.int(1, 5);
		const map = randomViewport(g, count, cols);
		const rows = Math.ceil(count / cols);
		const vis = vr(map.y, map.h, map.top, map.pitch, rows);
		const far = vis.first * cols > count / 2 ? 0 : count - 1;
		const out = windowFor({ policy: g.pick(['pip', 'multi'] as const), stage: 'paged', count, focus: far, viewports: { map }, overscan: OS, budget: { live: 2 } }, unsafe);
		const ds = out.rank.filter((e) => e.w === 'map').map((e) => rowDist(Math.floor(e.i / cols), vis.first, vis.last));
		for (let k = 1; k < ds.length; k++) if (ds[k] < ds[k - 1]) return `map rank not monotone at ${k}: ${ds[k - 1]} then ${ds[k]}`;
		const firstMap = out.rank.find((e) => e.w === 'map');
		if (!firstMap || rowDist(Math.floor(firstMap.i / cols), vis.first, vis.last) !== 0) return 'first map entry is not on the map screen';
		const ss = out.rank.filter((e) => e.w === 'stage').map((e) => Math.abs(e.i - far));
		for (let k = 1; k < ss.length; k++) if (ss[k] < ss[k - 1]) return 'stage rank not monotone';
		return null;
	},
	[{ mapByFocus: true }],
);

// 8. The live tier is one page-global budget across stage and map.
property(
	'live total never exceeds the page budget',
	(g, unsafe) => {
		const args = randomArgs(g, { policy: g.pick(['multi', 'pip'] as const), budget: { live: g.int(1, 6), mapTile: 'live', stageTier: 'live' } });
		args.viewports.map ??= randomViewport(g, args.count, 3);
		return walk(g, args, 20, unsafe, (out) => {
			const live = [...out.tiers.stage.values(), ...out.tiers.map.values()].filter((t) => t === 'live').length;
			return live > (args.budget?.live ?? 0) ? `${live} live > budget ${args.budget?.live}` : null;
		});
	},
	[{ perWindowBudget: true }],
);

// 9. The live budget is priced PER CONNECTOR: a cheap connector gets more live units from the same
//    budget, the cost-weighted total stays within the budget, and the budget is used up.
property(
	'live budget is priced per connector',
	(g, unsafe) => {
		const live = g.int(2, 5);
		const cost = { stage: 1, map: 0.25 };
		const count = 1000;
		const map = { pitch: 100, h: 2000, top: 0, y: 0, cols: 1 };
		const out = windowFor({ policy: 'pip', stage: 'paged', count, focus: 0, viewports: { map }, overscan: OS, budget: { live, mapTile: 'live', stageTier: 'live', cost } }, unsafe);
		const sl = [...out.tiers.stage.values()].filter((t) => t === 'live').length;
		const ml = [...out.tiers.map.values()].filter((t) => t === 'live').length;
		const used = sl * cost.stage + ml * cost.map;
		if (used > live) return `cost ${used} > budget ${live}`;
		if (out.mapUnits.length > ml && used + cost.map <= live) return `budget under-used: ${used} of ${live} with tiles left over`;
		return null;
	},
	[{ ignoreCost: true }],
);

// 10. Convergence: a connector that satisfies only part of the intent and REPORTS its capacity. The
//     core never asks for more than it was told, and the loop reaches a fixed point.
property(
	'a partial connector that reports its capacity converges and is never over-asked',
	(g, unsafe) => {
		const args = randomArgs(g, { policy: g.pick(['multi', 'pip'] as const), budget: { live: g.int(2, 8), mapTile: g.pick(['poster', 'live'] as const) } });
		args.viewports.map ??= randomViewport(g, args.count, 3);
		const hidden = { stage: g.int(1, 6), map: g.int(1, 12), live: g.int(1, 4) };
		let prev: Previous | null = null;
		let told: { stage: number; map: number; live: number } | null = null;
		let last: string | null = null;
		let stable = 0;
		for (let round = 0; round < 8; round++) {
			const out = windowFor({ ...args, previous: prev }, unsafe);
			if (told) for (const w of ['stage', 'map', 'live'] as const) if (out.state.asked[w] > told[w]) return `round ${round}: asked ${w} ${out.state.asked[w]} > told ${told[w]}`;
			const gotStage = out.stageUnits.slice(0, hidden.stage);
			const gotMap = out.mapUnits.slice(0, hidden.map);
			const sat: Satisfied = { stage: gotStage, map: gotMap, live: Math.min(out.state.asked.live, hidden.live), cap: hidden };
			const full = gotStage.length === out.stageUnits.length && gotMap.length === out.mapUnits.length && sat.live === out.state.asked.live;
			const key = JSON.stringify([out.stageUnits, out.mapUnits, [...out.tiers.stage], [...out.tiers.map]]);
			stable = key === last && full ? stable + 1 : 0;
			last = key;
			prev = settle(out, sat, unsafe);
			told = { stage: prev.caps.stage, map: prev.caps.map, live: prev.caps.live };
		}
		return stable >= 3 ? null : 'no fixed point within 8 rounds';
	},
	[{ ignoreCaps: true }],
);

// 11. Capacity is REPORTED, never inferred: a connector that mounts fewer than asked and says
//     nothing is not believed to be full, so a slow or off-band connector is never starved.
property(
	'an unreported shortfall never lowers what is asked',
	(g, unsafe) => {
		const args = randomArgs(g, { policy: g.pick(['multi', 'pip'] as const) });
		args.viewports.map ??= randomViewport(g, args.count, 2);
		const first = windowFor(args, unsafe);
		const short: Satisfied = { stage: first.stageUnits.slice(0, 1), map: first.mapUnits.slice(0, 1), live: 0 };
		const next = windowFor({ ...args, previous: settle(first, short, unsafe) }, unsafe);
		return same(next.stageUnits, first.stageUnits) && same(next.mapUnits, first.mapUnits) ? null : `asked ${first.stageUnits.length}+${first.mapUnits.length}, then ${next.stageUnits.length}+${next.mapUnits.length} after an unreported shortfall`;
	},
	[{ inferCaps: true }],
);

// 12. A connector holds at least one stage unit, even if it reports a capacity of 0.
property(
	'the stage cap is never below one',
	(g, unsafe) => {
		const args = randomArgs(g, { policy: g.pick(['single', 'multi', 'pip'] as const) });
		const first = windowFor(args, unsafe);
		const out = windowFor({ ...args, previous: settle(first, { cap: { stage: 0 } }, unsafe) }, unsafe);
		return out.stageUnits.includes(args.focus) ? null : `stage empty after a reported cap of 0 (focus ${args.focus})`;
	},
	[{ noStageFloor: true }],
);

// 13. Cost per call does not grow with the deck (O(window), not O(N)).
describe('cost is O(window)', () => {
	it('does the same amount of work at N = 120 and N = 1,000,000', () => {
		const time = (count: number) => {
			const args: WindowArgs = { policy: 'pip', stage: 'scrolled', count, focus: Math.floor(count / 2), viewports: { stage: { y: Math.floor(count / 2) * 400, h: 800, top: 0, pitch: 400 }, map: { y: Math.floor(count / 2) * 100, h: 800, top: 0, pitch: 100, cols: 3 } }, overscan: OS, budget: { live: 4 } };
			const t = performance.now();
			let prev: Previous | null = null;
			for (let k = 0; k < 2000; k++) {
				const out = windowFor({ ...args, previous: prev });
				prev = settle(out, { stage: out.stageUnits });
			}
			return performance.now() - t;
		};
		time(120);
		const small = time(120);
		const big = time(1_000_000);
		// Allow generous noise; a loop over N would be four orders of magnitude slower.
		expect(big).toBeLessThan(small * 10 + 50);
	});
});

// 14. Inlinable: the source of each export rebuilds into a working function (the present-transport rule).
describe('inlinable by .toString()', () => {
	it('windowFor and settle rebuilt from source agree with the module', () => {
		const wf = new Function(`return ${windowFor.toString()}`)() as typeof windowFor;
		const st = new Function(`return ${settle.toString()}`)() as typeof settle;
		for (let run = 0; run < RUNS; run++) {
			const a = randomArgs(gen(SEED + run));
			const x = windowFor(a);
			const y = wf(a);
			expect([y.stageUnits, y.mapUnits, y.rank]).toEqual([x.stageUnits, x.mapUnits, x.rank]);
			expect(st(y, { stage: [] })).toEqual(settle(x, { stage: [] }));
		}
	});
});

describe('createVeduta', () => {
	it('carries `previous` between calls', () => {
		const v = createVeduta();
		const args: WindowArgs = { policy: 'multi', stage: 'scrolled', count: 500, focus: 100, viewports: { stage: { y: 40000, h: 800, top: 0, pitch: 400 } }, budget: { live: 3 } };
		const a = v.windowFor(args);
		v.settle({ stage: a.stageUnits, cap: { stage: 2 } });
		const b = v.windowFor(args);
		expect(b.stageUnits.length).toBeLessThanOrEqual(2);
		expect(a.stageUnits.length).toBeGreaterThan(2);
	});
});
