// A scrolled stage and a map on the Fuoco hub. Model-based, with failing arms: an editor, a map that
// issues go and step, a paged stage, and a scrolled stage that reports every slide a smooth scroll
// crosses, a settle report and a late scroll-anchoring report. Raise the run count with FUOCO_RUNS.
// Written from the red-team findings in engineering/decisions/2026-10-16-preview-as-library-audit.md §11a.5.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import * as Fixed from './hub.js';
import { createTextOutliner } from './text-outline.js';

type Hub = Fixed.FocusHub;
type Unsafe = Fixed.Unsafe;
type HubKind = { name: string; make: (o: { outliner: unknown; scheduler: Fixed.Scheduler }) => Hub };
const FIXED = (unsafe?: Unsafe): HubKind => ({ name: `fixed${unsafe ? JSON.stringify(unsafe) : ''}`, make: (o) => Fixed.createFocusHub({ ...(o as Fixed.FocusHubOptions), unsafe }) });
const RUNS = Number(process.env.FUOCO_RUNS || 300);

const lineStarts = (text: string, test: (line: string) => boolean, after = false) => {
	const out: number[] = [];
	let at = 0;
	while (at <= text.length) {
		const nl = text.indexOf('\n', at);
		const line = text.slice(at, nl < 0 ? text.length : nl);
		if (test(line)) out.push(after ? (nl < 0 ? text.length : nl + 1) : at);
		if (nl < 0) break;
		at = nl + 1;
	}
	return out;
};
const OUTLINER = createTextOutliner({ units: (t) => lineStarts(t, (l) => l.trim() === '---', true), parts: (t) => lineStarts(t, (l) => l.startsWith('## ')) });
const unitText = (n: string) => `# ${n}\n\nbody\n`;
const deckOf = (n: number) => Array.from({ length: n }, (_, i) => unitText(`U${i}`)).join('\n---\n\n');

function manualScheduler() {
	const frames: Array<() => void> = [];
	const idles: Array<() => void> = [];
	return {
		frame: (cb: () => void) => void frames.push(cb),
		idle: (cb: () => void) => void idles.push(cb),
		drain() {
			for (let g = 0; (frames.length || idles.length) && g < 50; g++) {
				for (const cb of frames.splice(0)) cb();
				for (const cb of idles.splice(0)) cb();
			}
		},
	};
}

// Macrotasks: scroll events, scrollend, a reflow. `later(d)` runs d ticks from now.
function taskQueue() {
	let now = 0;
	const q: Array<{ at: number; fn: () => void }> = [];
	return {
		later(d: number, fn: () => void) {
			q.push({ at: now + d, fn });
		},
		runNext(): boolean {
			if (!q.length) return false;
			now = Math.min(...q.map((t) => t.at));
			const due = q.filter((t) => t.at === now);
			for (const t of due) q.splice(q.indexOf(t), 1);
			for (const t of due) t.fn();
			return true;
		},
		get size() {
			return q.length;
		},
	};
}

// A scrolled view: every unit is one unit tall, `h` units fit, and the "current" unit is the one
// nearest the viewport centre (a tie at a boundary goes to the later or the earlier unit).
interface ScrollView {
	name: string;
	h: number;
	align: 'start' | 'center' | 'end';
	tie: 'later' | 'earlier';
	quiet: boolean; // marks the reports of its own programmatic scrolls quiet
	mode: 'smooth' | 'instant-sync';
	reflowAfter: boolean; // a scroll-anchoring report of its anchor unit, after the scroll settles
	top: number;
	anchor: number;
	heard: number;
}

interface World {
	hub: Hub;
	sch: ReturnType<typeof manualScheduler>;
	tasks: ReturnType<typeof taskQueue>;
	text: string;
	rev: number;
	caret: number;
	mapSel: number;
	mapHeard: number;
	paged: number | null;
	views: ScrollView[];
	v: string[];
}

const n = (w: World) => w.hub.outline()?.units.length ?? 0;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const maxTop = (w: World, v: ScrollView) => Math.max(0, n(w) - v.h);
const topFor = (w: World, v: ScrollView, t: number) => clamp(v.align === 'start' ? t : v.align === 'center' ? t + 0.5 - v.h / 2 : t + 1 - v.h, 0, maxTop(w, v));
const centre = (w: World, v: ScrollView, top: number) => {
	const c = top + v.h / 2;
	return clamp(v.tie === 'later' ? Math.floor(c) : Math.ceil(c) - 1, 0, n(w) - 1);
};

function scrollTo(w: World, v: ScrollView, to: number, reader: boolean) {
	const { hub, tasks } = w;
	const from = v.top;
	v.top = to;
	const quiet = !reader && v.quiet ? true : undefined;
	const rev = w.rev;
	if (v.mode === 'instant-sync') {
		// Instant scroll, measured and reported inside the listener: every unit crossed, in order.
		const a = centre(w, v, from);
		const b = centre(w, v, to);
		for (let u = a; u !== b; u += Math.sign(b - a)) if (u !== a) hub.reportUnit(v.name, { unitIndex: u, rev, quiet });
		hub.reportUnit(v.name, { unitIndex: b, rev, quiet });
		return;
	}
	const steps = Math.max(1, Math.ceil(Math.abs(to - from)));
	let last = centre(w, v, from);
	for (let i = 1; i <= steps; i++) {
		const c = centre(w, v, from + ((to - from) * i) / steps);
		if (c !== last) {
			last = c;
			tasks.later(i, () => hub.reportUnit(v.name, { unitIndex: c, rev, quiet }));
		}
	}
	const end = centre(w, v, to);
	tasks.later(steps + 1, () => hub.reportUnit(v.name, { unitIndex: end, rev, quiet })); // scrollend
	if (v.reflowAfter) {
		// Scroll anchoring after a late image or font: the view reports the slide it anchored, as
		// a reader-visible move, because it cannot tell this scroll from the reader's.
		// It reads its anchor when the event fires, as a scroll handler would.
		tasks.later(steps + 3, () => hub.reportUnit(v.name, { unitIndex: v.anchor, rev: w.rev }));
	}
}

interface Config {
	units: number;
	editor: boolean;
	/** Subscribe the editor after the stages, so its reveal runs after the paged stage's report. */
	editorLast?: boolean;
	paged: boolean;
	views: Array<Omit<ScrollView, 'top' | 'anchor' | 'heard'> & { lane: Fixed.Lane }>;
}

function makeWorld(kind: HubKind, cfg: Config): World {
	const sch = manualScheduler();
	const hub = kind.make({ outliner: OUTLINER, scheduler: sch });
	const text = deckOf(cfg.units);
	const w: World = { hub, sch, tasks: taskQueue(), text, rev: 0, caret: 0, mapSel: 0, mapHeard: 0, paged: null, views: [], v: [] };
	w.rev = hub.update(text);
	const editor = () =>
		hub.subscribe(
			(f) => f,
			(f) => {
				if (f.cause !== 'nav' && f.cause !== 'pick') return;
				w.caret = Fixed.revealOffset(hub.outline()!, f);
				hub.report('editor', { head: w.caret, rev: w.rev, quiet: true });
			},
			{ ignoreOrigin: 'editor', equals: (a, b) => a.seq === b.seq },
		);
	if (cfg.editor && !cfg.editorLast) editor();
	hub.subscribe(
		(f) => f.unitIndex,
		(u) => {
			w.mapSel = u;
			w.mapHeard++;
		},
		{ ignoreOrigin: 'map' },
	);
	if (cfg.paged)
		hub.subscribe(
			(f) => `${f.unit}:${f.part}`,
			(_v, f) => {
				w.paged = f.unitIndex;
				hub.pages('paged', { unit: f.unit, part: f.part, count: 1, shown: 0, canSplit: true });
			},
		);
	for (const c of cfg.views) {
		const { lane, ...rest } = c;
		const v: ScrollView = { ...rest, top: 0, anchor: 0, heard: 0 };
		w.views.push(v);
		// It selects the unit id as well as the index: an insert that moves the focused slide to
		// index 6 and a deferred move to the new slide at index 5 can land in one frame, and an
		// index-only selector sees 5 → 5 and never re-scrolls.
		hub.subscribe(
			(f) => `${f.unit}@${f.unitIndex}`,
			(_k, { unitIndex: u }) => {
				v.heard++;
				if (process.env.DBG) console.log(`  ${v.name} hears ${_k} at top ${v.top}`);
				v.anchor = u;
				scrollTo(w, v, topFor(w, v, u), false);
			},
			{ ignoreOrigin: v.name, lane },
		);
	}
	if (cfg.editor && cfg.editorLast) editor();
	hub.go('map', { unitIndex: 0 });
	settle(w);
	w.v.length = 0;
	return w;
}

function settle(w: World) {
	for (let i = 0; i < 400; i++) {
		w.sch.drain();
		if (!w.tasks.runNext()) {
			w.sch.drain();
			if (!w.tasks.size) return;
		}
	}
	w.v.push('never settled: two views keep moving each other');
}

type Op =
	| { k: 'mapGo'; i: number }
	| { k: 'mapStep'; a: 'next' | 'prev' }
	| { k: 'key'; a: 'next' | 'prev' | 'first' | 'last' }
	| { k: 'key2'; a: 'next' | 'prev' }
	| { k: 'scroll'; view: number; d: number }
	| { k: 'reflow'; view: number }
	| { k: 'insertGo'; c: number };

const navOps: fc.Arbitrary<Op>[] = [
	fc.record({ k: fc.constant('mapGo' as const), i: fc.nat({ max: 9 }) }),
	fc.record({ k: fc.constant('mapStep' as const), a: fc.constantFrom('next' as const, 'prev' as const) }),
	fc.record({ k: fc.constant('key' as const), a: fc.constantFrom('next' as const, 'prev' as const, 'first' as const, 'last' as const) }),
];
const scrollOps: fc.Arbitrary<Op>[] = [
	fc.record({ k: fc.constant('scroll' as const), view: fc.nat({ max: 1 }), d: fc.integer({ min: -3, max: 3 }) }),
	fc.record({ k: fc.constant('reflow' as const), view: fc.nat({ max: 1 }) }),
];
const editOps: fc.Arbitrary<Op>[] = [
	fc.record({ k: fc.constant('key2' as const), a: fc.constantFrom('next' as const, 'prev' as const) }),
	fc.record({ k: fc.constant('insertGo' as const), c: fc.nat({ max: 9 }) }),
];

function run(w: World, op: Op, expectOne: boolean) {
	const { hub } = w;
	const before = hub.stats.published;
	const f0 = hub.get().unitIndex;
	const N = n(w);
	let want: number | null = null; // where the focus must end
	let maxPubs = Number.POSITIVE_INFINITY;
	switch (op.k) {
		case 'mapGo':
			w.mapSel = clamp(op.i, 0, N - 1);
			hub.go('map', { unitIndex: w.mapSel });
			want = w.mapSel;
			maxPubs = 1; // a go to the focused slide still publishes (a re-click re-reveals)
			break;
		case 'mapStep':
			// The map does not hear its own step (ignoreOrigin), so it reads the result back.
			hub.step('map', op.a, { pages: false });
			w.mapSel = hub.get().unitIndex;
			want = clamp(f0 + (op.a === 'next' ? 1 : -1), 0, N - 1);
			maxPubs = want === f0 ? 0 : 1;
			break;
		case 'key':
			hub.step('keys', op.a);
			want = op.a === 'first' ? 0 : op.a === 'last' ? N - 1 : clamp(f0 + (op.a === 'next' ? 1 : -1), 0, N - 1);
			maxPubs = want === f0 ? 0 : 1;
			break;
		case 'key2':
			// Two fast presses: the second waits for the paged stage to report the part just entered.
			hub.step('keys', op.a);
			hub.step('keys', op.a);
			want = clamp(f0 + (op.a === 'next' ? 2 : -2), 0, N - 1);
			maxPubs = Math.abs(want - f0);
			break;
		case 'scroll': {
			const v = w.views[op.view % w.views.length];
			if (!v) return;
			const to = clamp(v.top + op.d, 0, maxTop(w, v));
			if (to === v.top) return; // nothing scrolls, no scroll events
			v.anchor = centre(w, v, to);
			scrollTo(w, v, to, true);
			// The reader's scroll decides: the focus ends on the slide nearest the centre.
			want = centre(w, v, to);
			maxPubs = Math.abs(op.d) + 1;
			break;
		}
		case 'reflow': {
			const v = w.views[op.view % w.views.length];
			if (!v) return;
			hub.reportUnit(v.name, { unitIndex: v.anchor, rev: w.rev });
			want = f0;
			maxPubs = 0;
			break;
		}
		case 'insertGo': {
			// The editor inserts a slide after unit c and asks to go to it once the text lands.
			const ol = hub.outline()!;
			const c = op.c % N;
			const following = w.views.map((v) => v.top === topFor(w, v, v.anchor));
			const at = ol.units[c].end;
			const ins = c === N - 1 ? `\n---\n\n${unitText('New')}` : `${unitText('New')}\n---\n\n`;
			const next = w.text.slice(0, at) + ins + w.text.slice(at);
			hub.go('editor', { unitIndex: c + 1 }, { after: next });
			// Before the text lands, the stage reflows (scroll anchoring) and reports its anchor.
			for (const v of w.views) if (v.reflowAfter) hub.reportUnit(v.name, { unitIndex: v.anchor, rev: w.rev });
			w.tasks.runNext();
			w.sch.drain();
			w.text = next;
			w.rev = hub.update(next, { by: 'editor', span: { from: at, toA: at, toB: at + ins.length } });
			// Scroll anchoring keeps each view on the slide ELEMENT it showed — keyed by unit id, so
			// it shifts only when that id moved to another index.
			const after = hub.outline()!;
			for (const v of w.views) {
				const id = ol.units[v.anchor]?.id;
				const to = after.units.findIndex((x) => x.id === id);
				if (to >= 0 && to !== v.anchor) {
					v.top = clamp(v.top + (to - v.anchor), 0, maxTop(w, v));
					v.anchor = to;
				}
			}
			// A view that was following the focus re-applies it after its layout changed (more room
			// below lets it centre a slide it could not): a programmatic, quiet scroll.
			w.views.forEach((v, i) => {
				if (following[i] && v.top !== topFor(w, v, v.anchor)) scrollTo(w, v, topFor(w, v, v.anchor), false);
			});
			want = c + 1;
			maxPubs = 2;
			break;
		}
	}
	settle(w);
	const f = hub.get();
	const pubs = hub.stats.published - before;
	const tag = `${JSON.stringify(op)}`;
	if (want !== null && f.unitIndex !== want) w.v.push(`focus ${f.unitIndex} (origin ${f.origin}), wanted ${want} after ${tag}`);
	if (expectOne && pubs > maxPubs) w.v.push(`${pubs} publications, at most ${maxPubs} allowed, after ${tag}`);
	if (expectOne && want !== null && want !== f0 && op.k !== 'key2' && op.k !== 'insertGo' && op.k !== 'scroll' && pubs !== 1) w.v.push(`${pubs} publications for one move after ${tag}`);
	if (w.mapSel !== f.unitIndex) w.v.push(`map shows ${w.mapSel}, focus ${f.unitIndex} after ${tag}`);
	if (w.paged !== null && w.paged !== f.unitIndex) w.v.push(`paged stage shows ${w.paged}, focus ${f.unitIndex} after ${tag}`);
	for (const v of w.views) {
		const ok = v.top === topFor(w, v, f.unitIndex) || centre(w, v, v.top) === f.unitIndex;
		if (!ok) w.v.push(`${v.name} scrolled to ${v.top} (centre ${centre(w, v, v.top)}), focus ${f.unitIndex} after ${tag}`);
	}
}

const property = (kind: HubKind, cfg: Config, ops: fc.Arbitrary<Op>[], expectOne = true) =>
	fc.property(fc.array(fc.oneof(...ops), { minLength: 1, maxLength: 25 }), (seq) => {
		const w = makeWorld(kind, cfg);
		for (const op of seq) {
			run(w, op, expectOne);
			if (w.v.length) throw new Error(`VIOLATION ${w.v[0]}`);
		}
	});

// THE MAIN WORLD: an editor, a map, a paged stage and a scrolled stage (3 slides fit, centred,
// so the first and last slide cannot be centred), smooth scrolls, scrollend and a late reflow.
const STAGE = { name: 'stage', h: 3, align: 'center' as const, tie: 'later' as const, quiet: true, mode: 'smooth' as const, reflowAfter: true, lane: 'frame' as const };
const MAIN: Config = { units: 6, editor: true, paged: true, views: [STAGE] };
// (b): a stage that scrolls instantly and reports every slide it crosses, inside the delivery.
const SYNC_STAGE: Config = { units: 7, editor: false, paged: false, views: [{ name: 'stage', h: 1, align: 'start', tie: 'later', quiet: false, mode: 'instant-sync', reflowAfter: false, lane: 'sync' }] };
// Ping-pong: two scrolled views, 2 slides fit each, so the centre is a slide boundary; they align
// and break the tie differently (start/later vs end/earlier).
const TWO: Config = {
	units: 7,
	editor: false,
	paged: false,
	views: [
		{ name: 'stage', h: 2, align: 'start', tie: 'later', quiet: true, mode: 'smooth', reflowAfter: false, lane: 'frame' },
		{ name: 'strip', h: 2, align: 'end', tie: 'earlier', quiet: true, mode: 'smooth', reflowAfter: false, lane: 'frame' },
	],
};

const passes = (kind: HubKind, cfg: Config, ops: fc.Arbitrary<Op>[], runs = RUNS, expectOne = true) => fc.assert(property(kind, cfg, ops, expectOne), { numRuns: runs });
const fails = (label: string, kind: HubKind, cfg: Config, ops: fc.Arbitrary<Op>[], expectOne = true) => {
	let msg = '';
	try {
		fc.assert(property(kind, cfg, ops, expectOne), { numRuns: 300 });
	} catch (e) {
		msg = String((e as Error).message).split('\n').find((l) => l.includes('Counterexample')) ?? 'threw';
		const m = String((e as Error).message);
		const why = String((e as { cause?: unknown }).cause ?? m).match(/VIOLATION (.*)/)?.[1] ?? m.slice(0, 200);
		console.log(`  red as expected — ${label} on ${kind.name}: ${msg.replace('Counterexample: ', '')}\n      → ${why}`);
		return;
	}
	throw new Error(`${kind.name} should have gone red`);
};

describe('scrolled stage — main world (editor, map, paged stage, scrolled stage)', () => {
	const ops = [...navOps, ...scrollOps, ...editOps];
	const aOps = [editOps[1], scrollOps[1], editOps[0]]; // insert-then-go, reflow, double press
	it('hub: every view agrees, deferred moves survive no-op reports, one publication per move', () => passes(FIXED(), MAIN, ops));
	it('fixed hub, editor subscribed last: same property', () => passes(FIXED(), { ...MAIN, editorLast: true }, ops));
	it('FAILING ARM (a): any report cancels a deferred move or a waiting step', () => fails('(a)', FIXED({ clearOnAnyReport: true }), MAIN, aOps));
	it('FAILING ARM (c): reportUnit ignores quiet', () => fails('(c)', FIXED({ loudQuiet: true }), MAIN, navOps));
	it('FAILING ARM (b, basis): a queued report judged after another view moved the focus', () => fails('(b basis)', FIXED({ ignoreBasis: true }), { ...MAIN, editorLast: true }, ops));
});

describe('(b) a stage that reports inside the delivery', () => {
	it('hub: the last report wins', () => passes(FIXED(), SYNC_STAGE, navOps, RUNS, false));
	it('FAILING ARM (b): reports judged the moment they are made', () => fails('(b)', FIXED({ eagerReports: true }), SYNC_STAGE, navOps, false));
});

describe('two scrolled views', () => {
	const ops = [...navOps, ...scrollOps];
	it('hub: no ping-pong, one publication per move', () => passes(FIXED(), TWO, ops));
	it('FAILING ARM: reportUnit ignores quiet → ping-pong', () => fails('ping-pong', FIXED({ loudQuiet: true }), TWO, navOps));
});

describe('scenario: five presses of next, scrolled stage + map', () => {
	const scenario = (kind: HubKind, quiet: boolean, lane: Fixed.Lane) => {
		const w = makeWorld(kind, { units: 6, editor: false, paged: false, views: [{ ...STAGE, quiet, lane }] });
		const st = w.views[0];
		const rows: Array<{ pubs: number; stageHeard: number; mapHeard: number; focus: number; origins: string }> = [];
		for (let i = 0; i < 5; i++) {
			const p0 = w.hub.stats.published;
			const s0 = st.heard;
			const m0 = w.mapHeard;
			const origins: string[] = [];
			const off = w.hub.subscribe((f) => f.seq, (_s, f) => origins.push(f.origin), { lane: 'sync' });
			w.hub.step('keys', 'next', { pages: false });
			settle(w);
			off();
			rows.push({ pubs: w.hub.stats.published - p0, stageHeard: st.heard - s0, mapHeard: w.mapHeard - m0, focus: w.hub.get().unitIndex, origins: origins.join(',') });
		}
		console.log(`  ${kind.name} quiet=${quiet} lane=${lane}: ${rows.map((r) => `${r.pubs}[${r.origins}]→${r.focus}`).join('  ')}`);
		return rows;
	};
	it('hub: exactly one publication per press, no echo, none on settle', () => {
		for (const lane of ['frame', 'sync'] as const) {
			const rows = scenario(FIXED(), true, lane);
			expect(rows.map((r) => r.pubs)).toEqual([1, 1, 1, 1, 1]);
			expect(rows.map((r) => r.focus)).toEqual([1, 2, 3, 4, 5]);
			expect(rows.every((r) => r.stageHeard === 1 && r.mapHeard === 1 && r.origins === 'keys')).toBe(true);
		}
	});
	it('for contrast: a stage that does not say quiet pulls the focus back', () => {
		const rows = scenario(FIXED(), false, 'frame');
		expect(rows.some((r) => r.pubs > 1)).toBe(true);
	});
});

describe.skipIf(!process.env.DBG)('debug', () => {
	it('trace', () => {
		const w = makeWorld(FIXED(), MAIN);
		const log: string[] = [];
		w.hub.subscribe((f) => f.seq, (_s, f) => log.push(`${f.origin}/${f.cause}:${f.unitIndex}.${f.part}p${f.page}`), { lane: 'sync' });
		for (const op of JSON.parse(process.env.DBG!)) {
			run(w, op, true);
			console.log(JSON.stringify(op), log.splice(0).join('  '), w.v, w.views.map((v) => `${v.name} top ${v.top} anchor ${v.anchor}`));
		}
	});
});
