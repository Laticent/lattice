import { describe, expect, it } from 'vitest';
import { createGuideConductor, type GuideDelivery, type GuideStage } from './guide-conductor';
import { findCueTarget, findTableRowTarget, focusContent, type GuideCue, planSlide } from './present-guide';

// The per-sentence rules Present and the exported player share (guide-conductor.ts). The host's
// `aim` / `cue` are stubbed from a text → element table, so these pin the RULES — rest, pause and
// resume, hold, hide — not the resolver, which present-guide.test.ts covers.

const delivery = (over: Partial<GuideDelivery> = {}): GuideDelivery => ({
	name: 'restrained',
	budget: 2,
	floor: 0,
	ink: 'none',
	dim: 0.45,
	dimInner: 0.3,
	fade: 200,
	hold: 'none',
	wordFocus: true,
	strength: 'quiet',
	...over,
});

function setup() {
	document.body.innerHTML = '<section data-lattice-slide="1"><ul><li id="a">Revenue grew.</li><li id="b">Churn fell.</li><li id="c">Hiring held.</li></ul></section>';
	const el = (id: string) => document.getElementById(id) as Element;
	const table: Record<string, Element> = { 'Revenue grew.': el('a'), 'Revenue grew a lot.': el('a'), 'Churn fell.': el('b'), 'Hiring held.': el('c') };
	const gestures: string[] = [];
	let visible = false;
	const stage: GuideStage = {
		gesture: async (kind) => {
			gestures.push(kind);
		},
		setCursorVisible: (v) => {
			visible = v;
		},
	};
	const cue = (t: string): GuideCue | null => {
		const e = table[t];
		if (!e) return null;
		const box = { getBoundingClientRect: () => e.getBoundingClientRect(), getClientRects: () => [] };
		return { el: e, kind: 'underline', strength: 'quiet', target: box, rest: null };
	};
	const g = createGuideConductor({ stage: () => stage, aim: (t) => table[t] ?? null, cue, clearance: 19 });
	const focused = () => [...document.querySelectorAll('li')].filter((li) => !li.classList.contains('lat-guide-dim')).map((li) => li.id);
	return { g, gestures, focused, isVisible: () => visible };
}

const texts = ['Revenue grew.', 'Revenue grew a lot.', 'Churn fell.', 'A long line of commentary the slide does not carry at all.', 'Thank you.'];
const beat = (g: ReturnType<typeof setup>['g'], cue: number, delivering = true, d = delivery()) => g.beat({ slide: 0, cue, texts, track: texts, delivering, delivery: d });

describe('guide-conductor — the per-sentence rules', () => {
	it('focuses the named element and recedes its peers', () => {
		const { g, focused } = setup();
		beat(g, 0);
		expect(focused()).toEqual(['a']);
	});

	it('rests on a sentence that names the element already focused', () => {
		const { g, focused } = setup();
		beat(g, 0);
		const aimed = g.aimed();
		beat(g, 1);
		expect(g.aimed()).toBe(aimed);
		expect(focused()).toEqual(['a']);
	});

	it('moves to the next planned block', () => {
		const { g, focused } = setup();
		beat(g, 0);
		beat(g, 2);
		expect(focused()).toEqual(['b']);
	});

	// Paused on the block's SECOND sentence: the plan gestures only on the first, so without the
	// remembered focus the rest of the block would play bare.
	it('lifts the focus on pause and brings it back on play, without a new stroke', () => {
		const { g, focused, gestures } = setup();
		beat(g, 0);
		beat(g, 1);
		beat(g, 1, false);
		expect(focused()).toEqual(['a', 'b', 'c']);
		beat(g, 1, true);
		expect(focused()).toEqual(['a']);
		expect(gestures).toEqual([]); // restrained draws no ink on a focusable bullet
	});

	it('keeps the paused focus through a reset, as Present did when its stage was rebuilt', () => {
		const { g, focused } = setup();
		beat(g, 0);
		beat(g, 1);
		beat(g, 1, false);
		g.reset();
		beat(g, 1, true);
		expect(focused()).toEqual(['a']);
	});

	it('takes the focus down on commentary the slide does not carry', () => {
		const { g, focused } = setup();
		beat(g, 2);
		beat(g, 3);
		expect(focused()).toEqual(['a', 'b', 'c']);
		expect(g.aimed()).toBeNull();
	});

	it('holds through an aside under a preset that holds, and not under one that does not', () => {
		const held = setup();
		beat(held.g, 2, true, delivery({ hold: 'aside' }));
		beat(held.g, 4, true, delivery({ hold: 'aside' }));
		expect(held.focused()).toEqual(['b']);
		const released = setup();
		beat(released.g, 2);
		beat(released.g, 4);
		expect(released.focused()).toEqual(['a', 'b', 'c']);
	});
});

describe('guide-conductor — a line chart walked point by point', () => {
	// A line category's detail note resolves to the category's hit band (`.line-hit`), which the focus
	// cannot isolate. When the band holds the point just read, the note is about that point.
	function line(bandX: number) {
		document.body.innerHTML = `<div class="lattice"><section><div class="chart-body"><svg>
			<path class="line-path" data-series="0" data-label="EMEA"></path>
			<circle id="jan" data-series="0" data-label="Jan 2026" data-value="4.1" cx="100" cy="50"></circle>
			<circle id="feb" data-series="0" data-label="Feb 2026" data-value="3.2" cx="300" cy="60"></circle>
			<rect id="band" class="line-hit" x="${bandX}" y="0" width="200" height="400"></rect></svg></div></section></div>`;
		const el = (id: string) => document.getElementById(id) as Element;
		const walked = ['Jan 2026, four point one.', 'Feb 2026, three point two.', 'The processor outage cost two weeks.'];
		const table: Record<string, Element> = { [walked[0]]: el('jan'), [walked[1]]: el('feb'), [walked[2]]: el('band') };
		const stage: GuideStage = { gesture: async () => {}, setCursorVisible: () => {} };
		const cue = (t: string): GuideCue | null => {
			const e = table[t];
			if (!e) return null;
			return { el: e, kind: 'underline', strength: 'quiet', target: { getBoundingClientRect: () => e.getBoundingClientRect(), getClientRects: () => [] }, rest: null };
		};
		const g = createGuideConductor({ stage: () => stage, aim: (t) => table[t] ?? null, cue, clearance: 19 });
		const one = delivery({ budget: 1 });
		const play = (k: number) => g.beat({ slide: 0, cue: k, texts: walked, track: walked, delivering: true, delivery: one });
		// The point in focus carries `-undim`; the line's other points recede as `-dim-inner`.
		const undimmed = () => [...document.querySelectorAll('circle.lat-guide-undim')].map((c) => c.id);
		return { play, undimmed, g };
	}

	it('keeps the walked point focused through a note that names only its category band', () => {
		const { play, undimmed } = line(200);
		play(0);
		play(1);
		expect(undimmed()).toEqual(['feb']);
		play(2);
		expect(undimmed()).toEqual(['feb']);
	});

	it('lifts the focus for a band of a different category', () => {
		const { play, undimmed } = line(400);
		play(0);
		play(1);
		play(2);
		// Lifted: nothing recedes any more (the `-undim` fade-up clears itself after its transition).
		expect(document.querySelectorAll('.lat-guide-dim, .lat-guide-dim-inner').length).toBe(0);
	});
});

describe('restrained audit fixes (owner, 2026-09-27)', () => {
	it('walks a planned chart from its FIRST named mark, not from the planned one', () => {
		// A dumbbell's first row came before the plan's moment and stayed dark.
		document.body.innerHTML = `<div class="lattice"><section><div class="chart-body"><svg>
			<line data-mark="0" data-series="0" data-label="Platform" data-value=""></line>
			<line data-mark="1" data-series="1" data-label="Payments" data-value=""></line>
			<line data-mark="2" data-series="2" data-label="Growth" data-value="$19M"></line></svg></div></section></div>`;
		const marks = [...document.querySelectorAll('line')];
		const walked = ['Platform rose seven.', 'Payments fell four.', 'Growth rose to $19M.'];
		const aim = (t: string) => marks[walked.indexOf(t)] ?? null;
		// Budget 1, spent on Growth (the only measured mark, the last sentence): the chart is still
		// walked from Platform, its first named mark.
		expect([...planSlide(walked, aim, 1, 1).gesture]).toEqual([2]);
		const cue = (t: string): GuideCue | null => {
			const e = aim(t);
			return e ? { el: e, kind: 'underline', strength: 'quiet', target: { getBoundingClientRect: () => e.getBoundingClientRect(), getClientRects: () => [] }, rest: null } : null;
		};
		const stage: GuideStage = { gesture: async () => {}, setCursorVisible: () => {} };
		const g = createGuideConductor({ stage: () => stage, aim, cue, clearance: 19 });
		const on = walked.map((_, k) => {
			g.beat({ slide: 1, cue: k, texts: walked, track: walked, delivering: true, delivery: delivery({ budget: 1, floor: 1 }) });
			return document.querySelector('.lat-guide-undim')?.getAttribute('data-label') ?? null;
		});
		expect(on).toEqual(['Platform', 'Payments', 'Growth']);
	});

	it('resolves a table row read as "Row — Col: value; …" to the row', () => {
		document.body.innerHTML = `<div class="lattice"><section><table><thead><tr><th>Segment</th><th>Q3</th><th>Q4</th><th>EMEA</th></tr></thead>
			<tbody><tr><td>Enterprise</td><td>1.2%</td><td>1.1%</td><td>0.9%</td></tr><tr><td>SMB</td><td>7.8%</td><td>9.4%</td><td>6.1%</td></tr></tbody></table></section></div>`;
		const section = document.querySelector('section') as Element;
		expect(findCueTarget(section, 'SMB — Q3: 7.8%; Q4: 9.4%; EMEA: 6.1%.')?.textContent).toBe('SMB');
		// A row that is not in the table is not found by this tier.
		expect(findTableRowTarget(section, 'Mid-market — Q3: 3.1%.')).toBeNull();
	});

	it('keeps a line point’s category label full and recedes the other categories', () => {
		document.body.innerHTML = `<div class="lattice"><section><div class="chart-body"><svg>
			<path class="line-path" data-series="0" data-label="EMEA"></path>
			<circle data-series="0" data-label="Jan 2026" data-value="4.1" cx="100"></circle>
			<circle data-series="0" data-label="Feb 2026" data-value="3.2" cx="300"></circle>
			<text class="cart-cat" data-label="Jan 2026">Jan 2026</text><text class="cart-cat" data-label="Feb 2026">Feb 2026</text></svg></div></section></div>`;
		const undo = focusContent(document.querySelectorAll('circle')[1], { dim: 0.45, dimInner: 0.3, fade: 0 });
		const [jan, feb] = [...document.querySelectorAll('text.cart-cat')];
		expect(feb.classList.contains('lat-guide-undim')).toBe(true);
		expect(jan.classList.contains('lat-guide-dim')).toBe(true);
		undo?.();
	});
});
