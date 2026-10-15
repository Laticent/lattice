import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createFocusHub, type Focus, type FocusHub, revealOffset, type Scheduler, type Unsafe } from './hub.js';
import { flatPart, partAt, partCount } from './outline.js';
import { createTextOutliner } from './text-outline.js';

// The hub is tested on a plain-text outline, the way any host would use it: a unit begins after
// each `---` line, and a `## ` line opens a part inside a unit. No Lattice code is involved.
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
const OUTLINER = createTextOutliner({
	units: (t) => lineStarts(t, (l) => l.trim() === '---', true),
	parts: (t) => lineStarts(t, (l) => l.startsWith('## ')),
});

// A scheduler the test drives by hand: nothing runs until `drain`.
function manualScheduler() {
	const frames: Array<() => void> = [];
	const idles: Array<() => void> = [];
	const s: Scheduler & { drain(): void } = {
		frame: (cb) => void frames.push(cb),
		idle: (cb) => void idles.push(cb),
		drain() {
			for (let guard = 0; (frames.length || idles.length) && guard < 50; guard++) {
				for (const cb of frames.splice(0)) cb();
				for (const cb of idles.splice(0)) cb();
			}
		},
	};
	return s;
}

const DECK = '# One\n\ntext\n\n---\n\n# Two\n\n## Two b\n\nmore\n\n---\n\n# Three\n\n---\n\n# Four\n';

describe('hub — basics', () => {
	it('maps a caret report to the unit and part holding it', () => {
		const hub = createFocusHub({ outliner: OUTLINER, scheduler: manualScheduler() });
		hub.update(DECK);
		hub.report('markdown', { head: DECK.indexOf('more') });
		const f = hub.get();
		expect(f.unitIndex).toBe(1);
		expect(f.part).toBe(1);
		expect(f.flat).toBe(2);
	});

	it('a caret move inside the same slide publishes caret fields only to those who select them', () => {
		const sch = manualScheduler();
		const hub = createFocusHub({ outliner: OUTLINER, scheduler: sch });
		hub.update(DECK);
		hub.report('markdown', { head: DECK.indexOf('text') });
		sch.drain();
		const slides: number[] = [];
		const carets: number[] = [];
		hub.subscribe((f) => f.flat, (v) => slides.push(v));
		hub.subscribe((f) => f.head, (v) => carets.push(v ?? -1));
		hub.report('markdown', { head: DECK.indexOf('text') + 2 });
		hub.report('markdown', { head: DECK.indexOf('text') + 3 });
		sch.drain();
		expect(slides).toEqual([]);
		// Frame lane: two moves in one frame deliver once, the latest.
		expect(carets).toEqual([DECK.indexOf('text') + 3]);
	});

	it('a subscriber never hears its own origin, and its baseline still advances', () => {
		const sch = manualScheduler();
		const hub = createFocusHub({ outliner: OUTLINER, scheduler: sch });
		hub.update(DECK);
		const heard: string[] = [];
		hub.subscribe((f) => f.flat, (_v, f) => heard.push(f.origin), { ignoreOrigin: 'markdown' });
		hub.report('markdown', { head: DECK.indexOf('Three') });
		sch.drain();
		expect(heard).toEqual([]);
		hub.go('rail', { flat: 3 });
		sch.drain();
		// flat 3 (Three) is what markdown already moved to: no change, no delivery.
		expect(heard).toEqual([]);
		hub.go('rail', { flat: 0 });
		sch.drain();
		expect(heard).toEqual(['rail']);
	});

	it('drops a report computed against an older revision', () => {
		const hub = createFocusHub({ outliner: OUTLINER, scheduler: manualScheduler() });
		const old = hub.update(DECK);
		hub.update(DECK.replace('# One', '# One!'));
		hub.report('markdown', { head: 3, rev: old });
		expect(hub.stats.droppedStale).toBe(1);
		expect(hub.get().unit).toBeNull();
	});

	it('a navigation that targets text not yet applied waits for exactly that text', () => {
		const hub = createFocusHub({ outliner: OUTLINER, scheduler: manualScheduler() });
		hub.update(DECK);
		const next = `${DECK}\n---\n\n# Five\n`;
		hub.go('shell', { unitIndex: 4 }, { after: next });
		expect(hub.get().unitIndex).toBe(-1);
		hub.update(next);
		expect(hub.get().unitIndex).toBe(4);
		expect(hub.get().origin).toBe('shell');
	});

	it('a publication made inside a delivery is queued, not re-entered', () => {
		const hub = createFocusHub({ outliner: OUTLINER, scheduler: manualScheduler() });
		hub.update(DECK);
		const order: string[] = [];
		hub.subscribe(
			(f) => f.seq,
			(_v, f) => {
				order.push(`a:${f.origin}`);
				if (f.origin === 'rail') hub.report('markdown', { head: revealOffset(hub.outline()!, f) });
			},
			{ lane: 'sync' },
		);
		hub.subscribe((f) => f.seq, (_v, f) => order.push(`b:${f.origin}`), { lane: 'sync' });
		hub.go('rail', { flat: 1 });
		// b hears the rail move before anyone hears the report it caused.
		expect(order.slice(0, 2)).toEqual(['a:rail', 'b:rail']);
		expect(hub.stats.queued).toBeGreaterThan(0);
	});

	it('a focus an edit moves during a render reaches sync subscribers after it, on a microtask', async () => {
		const hub = createFocusHub({ outliner: OUTLINER, scheduler: manualScheduler() });
		hub.update(DECK);
		hub.go('rail', { unitIndex: 3 });
		const heard: number[] = [];
		hub.subscribe((f) => f.unitIndex, (v) => heard.push(v), { lane: 'sync' });
		hub.update(DECK.replace('# Three\n\n---\n\n', ''), { by: 'shell', duringRender: true });
		expect(heard).toEqual([]);
		await Promise.resolve();
		expect(heard).toEqual([2]);
	});

	it('a view without parts keeps the part and page navigation chose in its unit', () => {
		const hub = createFocusHub({ outliner: OUTLINER, scheduler: manualScheduler() });
		hub.update(DECK);
		hub.go('rail', { unitIndex: 1, part: 1, page: Number.POSITIVE_INFINITY });
		// A unit-level view reveals the unit, and its own caret callback reports back.
		hub.reportUnit('compose', { unitIndex: 1, line: 'Two' });
		expect([hub.get().part, hub.get().page, hub.get().origin]).toEqual([1, Number.POSITIVE_INFINITY, 'rail']);
		// Into another unit, it moves as usual.
		hub.reportUnit('compose', { unitIndex: 2, line: 'Three' });
		expect([hub.get().unitIndex, hub.get().part, hub.get().page]).toEqual([2, 0, null]);
	});

	it('a step never waits for a slide a reader lens hides (the preview never reports it)', () => {
		const hub = createFocusHub({ outliner: OUTLINER, scheduler: manualScheduler() });
		hub.update(DECK);
		hub.go('rail', { unitIndex: 0 });
		hub.pages('preview', { unit: hub.get().unit, part: 0, count: 1, shown: 0, canSplit: true });
		hub.go('shell', { unitIndex: 1 }); // a slide the lens below hides
		hub.step('keys', 'next', { view: [0, 3] });
		expect(hub.get().unitIndex).toBe(3);
	});

	it('a waiting step is dropped when its surface goes away', () => {
		const hub = createFocusHub({ outliner: OUTLINER, scheduler: manualScheduler() });
		hub.update(DECK);
		hub.go('rail', { unitIndex: 0 });
		hub.pages('preview', { unit: hub.get().unit, part: 0, count: 1, shown: 0, canSplit: true });
		hub.step('keys', 'next');
		hub.step('keys', 'next'); // waits for slide 1's render
		hub.cancelWaiting();
		hub.pages('preview', { unit: hub.get().unit, part: 0, count: 1, shown: 0, canSplit: true });
		expect([hub.get().unitIndex, hub.get().part]).toEqual([1, 0]);
	});

	it('a page step does not ask the editors to reveal', () => {
		const hub = createFocusHub({ outliner: OUTLINER, scheduler: manualScheduler() });
		hub.update(DECK);
		hub.go('rail', { unitIndex: 0 });
		hub.pages('preview', { unit: hub.get().unit, part: 0, count: 2, shown: 0 });
		hub.step('keys', 'next');
		expect([hub.get().cause, hub.get().page]).toEqual(['page', 1]);
	});

	it('steps through pages, then parts, then units', () => {
		const hub = createFocusHub({ outliner: OUTLINER, scheduler: manualScheduler() });
		hub.update(DECK);
		hub.go('rail', { unitIndex: 0 });
		hub.pages('preview', { unit: hub.get().unit, part: 0, count: 2, shown: 0 });
		hub.step('keys', 'next');
		expect([hub.get().flat, hub.get().page]).toEqual([0, 1]);
		hub.step('keys', 'next');
		expect([hub.get().unitIndex, hub.get().part]).toEqual([1, 0]);
		hub.step('keys', 'next');
		expect([hub.get().unitIndex, hub.get().part]).toEqual([1, 1]);
		hub.step('keys', 'prev');
		expect([hub.get().unitIndex, hub.get().part]).toEqual([1, 0]);
		// A reader lens that shows only slides 0 and 3.
		hub.step('keys', 'next', { view: [0, 3] });
		expect(hub.get().unitIndex).toBe(3);
	});

	it('a step into a slide whose render has not reported waits for it, on a deck that can split', () => {
		const hub = createFocusHub({ outliner: OUTLINER, scheduler: manualScheduler() });
		hub.update(DECK);
		hub.go('rail', { unitIndex: 0 });
		hub.pages('preview', { unit: hub.get().unit, part: 0, count: 1, shown: 0, canSplit: true });
		hub.step('keys', 'next');
		expect(hub.get().unitIndex).toBe(1);
		// A fast second press, before slide 1 rendered: it waits…
		hub.step('keys', 'next');
		expect([hub.get().unitIndex, hub.get().part]).toEqual([1, 0]);
		// …and runs when the render lands: slide 1 has two pages, so it pages.
		hub.pages('preview', { unit: hub.get().unit, part: 0, count: 2, shown: 0, canSplit: true });
		expect([hub.get().unitIndex, hub.get().page]).toEqual([1, 1]);
	});

	it('with the preview hidden, steps move whole slides and never wait', () => {
		const hub = createFocusHub({ outliner: OUTLINER, scheduler: manualScheduler() });
		hub.update(DECK);
		hub.go('rail', { unitIndex: 0 });
		hub.pages('preview', { unit: hub.get().unit, part: 0, count: 3, shown: 0, canSplit: true });
		hub.step('keys', 'next', { pages: false });
		hub.step('keys', 'next', { pages: false });
		expect([hub.get().unitIndex, hub.get().part]).toEqual([1, 1]);
	});

	it('a navigation carries whether the editor should take focus', () => {
		const hub = createFocusHub({ outliner: OUTLINER, scheduler: manualScheduler() });
		hub.update(DECK);
		hub.go('rail', { unitIndex: 2, grab: true });
		expect(hub.get().grab).toBe(true);
		hub.step('keys', 'next');
		expect(hub.get().grab).toBe(false);
	});

	it('an edit that deletes the focused slide lands on the slide now in its place', () => {
		const hub = createFocusHub({ outliner: OUTLINER, scheduler: manualScheduler() });
		hub.update(DECK);
		hub.go('rail', { unitIndex: 2 });
		hub.update(DECK.replace('# Three\n\n---\n\n', ''), { by: 'shell' });
		// Slide 2 is now "Four", and the focus is still on slide 2.
		expect(hub.get().unitIndex).toBe(2);
		expect(hub.outline()!.source.slice(hub.outline()!.units[2].start).startsWith('# Four')).toBe(true);
	});
});

// ── The model: an editor, a rail and a preview, driven at random ───────────────

type Op =
	| { k: 'type'; s: string }
	| { k: 'move'; at: number }
	| { k: 'rail'; flat: number }
	| { k: 'step'; a: 'next' | 'prev' | 'first' | 'last' }
	| { k: 'delete'; unit: number; goFirst: boolean }
	| { k: 'late' };

const opArb: fc.Arbitrary<Op> = fc.oneof(
	fc.record({ k: fc.constant('type' as const), s: fc.constantFrom('x', '\n', '\n\n---\n\n# New\n', '## Sub\n', 'word ') }),
	fc.record({ k: fc.constant('move' as const), at: fc.nat() }),
	fc.record({ k: fc.constant('rail' as const), flat: fc.nat({ max: 12 }) }),
	fc.record({ k: fc.constant('step' as const), a: fc.constantFrom('next' as const, 'prev' as const, 'first' as const, 'last' as const) }),
	fc.record({ k: fc.constant('delete' as const), unit: fc.nat({ max: 6 }), goFirst: fc.boolean() }),
	fc.record({ k: fc.constant('late' as const) }),
);

interface World {
	hub: FocusHub;
	sch: ReturnType<typeof manualScheduler>;
	text: string;
	caret: number;
	rev: number;
	railFlat: number;
	violations: string[];
	old: { head: number; rev: number } | null;
}

function makeWorld(unsafe?: Unsafe): World {
	const sch = manualScheduler();
	const hub = createFocusHub({ outliner: OUTLINER, scheduler: sch, unsafe });
	const w: World = { hub, sch, text: DECK, caret: 0, rev: 0, railFlat: 0, violations: [], old: null };
	w.rev = hub.update(DECK);
	// The editor: reveals what others ask for, then reports where its caret landed.
	hub.subscribe(
		(f) => f,
		(f: Focus) => {
			if (f.origin === 'markdown') w.violations.push('editor heard its own move');
			if (f.cause !== 'nav' && f.cause !== 'pick') return;
			const ix = hub.outline();
			if (!ix) return;
			w.caret = revealOffset(ix, f);
			// The real editor reports its own reveal as a QUIET move (not the author's).
			hub.report('markdown', { head: w.caret, rev: w.rev, quiet: true });
		},
		{ ignoreOrigin: 'markdown', equals: (a, b) => (a as Focus).seq === (b as Focus).seq },
	);
	// The rail: shows the focused rendered slide.
	hub.subscribe(
		(f) => f.flat,
		(v, f) => {
			if (f.origin === 'rail') w.violations.push('rail heard its own move');
			w.railFlat = v;
		},
		{ ignoreOrigin: 'rail' },
	);
	// The preview: reports a page run whose length depends on the slide.
	hub.subscribe(
		(f) => `${f.unit}:${f.part}:${f.page}`,
		(_v, f) => {
			const count = f.unit === null ? 1 : (f.unit % 3) + 1;
			hub.pages('preview', { unit: f.unit, part: f.part, count, shown: f.page === null ? 0 : Math.min(f.page, count - 1), canSplit: true });
		},
	);
	return w;
}

function run(w: World, op: Op) {
	const { hub } = w;
	const before = hub.stats.published;
	switch (op.k) {
		case 'type': {
			const at = w.caret;
			w.old = { head: w.caret, rev: w.rev };
			w.text = w.text.slice(0, at) + op.s + w.text.slice(at);
			w.rev = hub.update(w.text, { span: { from: at, toA: at, toB: at + op.s.length }, by: 'markdown' });
			w.caret = at + op.s.length;
			hub.report('markdown', { head: w.caret, rev: w.rev });
			w.sch.drain();
			if (w.caret !== at + op.s.length) w.violations.push('typing moved the caret');
			break;
		}
		case 'move':
			w.caret = op.at % (w.text.length + 1);
			hub.report('markdown', { head: w.caret, rev: w.rev });
			break;
		case 'rail':
			// The rail moves itself, then tells the hub.
			w.railFlat = Math.min(op.flat, (hub.outline()?.partBase.at(-1) ?? 1) - 1);
			hub.go('rail', { flat: w.railFlat });
			break;
		case 'step':
			hub.step('keys', op.a);
			break;
		case 'delete': {
			const ix = hub.outline();
			if (!ix || ix.units.length < 2) return;
			const c = op.unit % ix.units.length;
			// A unit runs to the next one's start, its trailing `---` line included.
			const a = ix.units[c].from;
			const b = ix.units[c].end;
			w.old = { head: w.caret, rev: w.rev };
			const next = w.text.slice(0, a) + w.text.slice(b);
			// The editor maps its own caret through the deletion, as CodeMirror does.
			const caret = w.caret <= a ? w.caret : w.caret >= b ? w.caret - (b - a) : a;
			const target = Math.max(0, c - 1);
			if (op.goFirst) hub.go('shell', { unitIndex: target }, { after: next });
			w.text = next;
			w.rev = hub.update(next, { by: 'shell' });
			w.caret = Math.min(caret, next.length);
			hub.report('markdown', { head: w.caret, rev: w.rev });
			if (!op.goFirst) hub.go('shell', { unitIndex: target });
			break;
		}
		case 'late':
			// A report computed before the last edit arrives now.
			if (w.old) hub.report('markdown', { head: w.old.head, rev: w.old.rev });
			break;
	}
	w.sch.drain();
	if (hub.stats.published - before > 6) w.violations.push(`one action published ${hub.stats.published - before} times`);
	// The invariants, after the dust settles.
	const ix = hub.outline()!;
	const f = hub.get();
	const atCaret = partAt(ix, w.caret);
	if (atCaret && (atCaret.unit !== f.unitIndex || atCaret.part !== f.part)) w.violations.push(`editor caret is in ${atCaret.unit}.${atCaret.part}, focus says ${f.unitIndex}.${f.part} after ${op.k}`);
	if (f.unitIndex >= 0 && f.flat !== flatPart(ix, f.unitIndex, f.part)) w.violations.push('flat number out of step');
	if (w.railFlat !== f.flat) w.violations.push(`rail shows ${w.railFlat}, focus ${f.flat} after ${op.k}`);
	if (f.rev !== ix.rev) w.violations.push('focus expressed against an old revision');
}

const property = (unsafe?: Unsafe) =>
	fc.property(fc.array(opArb, { minLength: 1, maxLength: 30 }), (ops) => {
		const w = makeWorld(unsafe);
		w.hub.report('markdown', { head: 0, rev: w.rev });
		w.sch.drain();
		for (const op of ops) {
			run(w, op);
			expect(w.violations, JSON.stringify(ops)).toEqual([]);
		}
	});

describe('hub — model: every pane agrees after every action', () => {
	it('holds over random sequences of typing, moves, rail picks, steps, deletions and late reports', () => {
		fc.assert(property(), { numRuns: Number(process.env.FUOCO_RUNS || 300) });
	});

	it('FAILING ARM: delivering a pane its own moves breaks it', () => {
		expect(() => fc.assert(property({ deliverOwnOrigin: true }), { numRuns: 300 })).toThrow();
	});

	it('FAILING ARM: accepting a stale report breaks agreement', () => {
		expect(() => fc.assert(property({ acceptStale: true }), { numRuns: 300 })).toThrow();
	});

	it('the outline the model runs on has the parts the cases assume', () => {
		expect(partCount(OUTLINER.update(null, DECK))).toBe(5);
	});
});
