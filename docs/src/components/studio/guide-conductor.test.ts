import { describe, expect, it } from 'vitest';
import { DELIVERY_STYLES, resolveDelivery } from '@/lib/resolve-delivery';
import { createGuideConductor, type GuideDelivery, type GuideStage } from './guide-conductor';
import { findCueTarget, findTableRowTarget, focusContent, type GuideCue, planSlide, type SceneRef, type SceneStyle } from './present-guide';

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
		expect(undimmed()).toEqual(['feb']); // the walk reached Feb before the note
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

	it('never finds a row in a chart’s hidden screen-reader table', () => {
		document.body.innerHTML = `<div class="lattice"><section><div class="chart-body"><svg><path class="line-path" data-series="0" data-label="EMEA"></path></svg>
			<table class="chart-sr-only"><tbody><tr><th scope="row">EMEA</th><td>4.1</td></tr></tbody></table></div></section></div>`;
		expect(findTableRowTarget(document.querySelector('section') as Element, 'EMEA — Jan 2026: 4.1.')).toBeNull();
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

// THE SCENE — a bound sentence played in its delivery's own style (2026-09-27 note). The chart
// narrator binds each sentence to an act and a unit; the line manifest's gesture finds the unit;
// the style file decides what the act does. These pin the three characters on one line chart.
describe('guide-conductor — a bound sentence in its delivery style', () => {
	const LINE = `<div class="lattice"><section class="line"><div class="chart-body"><svg>
		<path class="line-path" data-series="0" data-label="EMEA"></path>
		<circle class="line-dot" data-series="0" data-label="Jan 2026"></circle><circle class="line-dot" data-series="0" data-label="Feb 2026"></circle>
		<path class="line-path" data-series="1" data-label="APAC"></path>
		<circle class="line-dot" data-series="1" data-label="Jan 2026"></circle><circle class="line-dot" data-series="1" data-label="Feb 2026"></circle>
		<text class="cart-cat" data-label="Jan 2026">Jan 2026</text><text class="cart-cat" data-label="Feb 2026">Feb 2026</text>
		<text class="cart-series" data-series-for="0">EMEA</text><text class="cart-series" data-series-for="1">APAC</text></svg></div></section></div>`;
	// The narration's spans, as `narrateChartScript` binds a two-series line (each sentence 10 chars).
	const REFS: SceneRef[] = [
		{ start: 0, end: 10, act: 'frame' },
		{ start: 10, end: 20, act: 'enter', unit: 'series', id: { series: 0 }, value: 0.8 },
		{ start: 20, end: 30, act: 'visit', unit: 'point', id: { series: 0, cat: 'Jan 2026' } },
		{ start: 30, end: 40, act: 'visit', unit: 'point', id: { series: 0, cat: 'Feb 2026' } },
		{ start: 40, end: 50, act: 'note', unit: 'point', id: { series: 0, cat: 'Feb 2026' } },
		{ start: 50, end: 60, act: 'enter', unit: 'series', id: { series: 1 }, value: 0.3 },
	];
	const TEXTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
	const up = () => [...document.querySelectorAll('.lat-guide-undim')].map((e) => `${e.tagName.toLowerCase()}:${e.getAttribute('data-label') ?? e.textContent}`);
	const inner = () => [...document.querySelectorAll('.lat-guide-dim-inner')].map((e) => e.getAttribute('data-label'));
	function rig(fallbackSel: string | null = null) {
		document.body.innerHTML = LINE;
		const fallbackAim = fallbackSel ? document.querySelector(fallbackSel) : null;
		const inks: string[] = [];
		const stage: GuideStage = { gesture: async (kind) => void inks.push(kind), setCursorVisible: () => {} };
		const cue = (el: Element): GuideCue => ({ el, kind: 'underline', strength: 'quiet', target: { getBoundingClientRect: () => el.getBoundingClientRect(), getClientRects: () => [] }, rest: null });
		const g = createGuideConductor({
			stage: () => stage,
			aim: () => fallbackAim,
			cue: () => (fallbackAim ? cue(fallbackAim) : null),
			clearance: 19,
			section: () => document.querySelector('section'),
			sceneCue: (_s, els, kind) => (els[0] ? { ...cue(els[0]), kind } : null),
		});
		const play = (name: string, at: number, { slide = 0, delivering = true, refs = REFS }: { slide?: number; delivering?: boolean; refs?: SceneRef[] } = {}) => {
			const style = (DELIVERY_STYLES as Record<string, { express: SceneStyle }>)[name].express;
			const d = { ...(resolveDelivery(name) as GuideDelivery), fade: 0 };
			g.beat({ slide, cue: Math.floor(at / 10), texts: TEXTS, track: TEXTS, delivering, delivery: d, scene: { refs, at, style } });
		};
		return { g, play, inks };
	}

	it('restrained walks every named part: the line, then each point on it, with its category held', () => {
		const { play, inks } = rig();
		play('restrained', 10);
		expect(up()).toEqual(expect.arrayContaining(['path:EMEA', 'text:EMEA']));
		expect(document.querySelector('path[data-label="APAC"]')?.classList.contains('lat-guide-dim')).toBe(true);
		play('restrained', 30);
		// The Feb point, its own line and the Feb category label stay; EMEA's other point drops
		// deeper than the rest, because the line being walked is the open group.
		expect(up()).toEqual(expect.arrayContaining(['circle:Feb 2026', 'path:EMEA', 'text:Feb 2026']));
		expect(inner()).toContain('Jan 2026');
		// A note holds the point, and the frame brings the whole figure back.
		const before = up();
		play('restrained', 40);
		expect(up()).toEqual(before);
		play('restrained', 0);
		expect(document.querySelectorAll('.lat-guide-dim').length).toBe(0);
		expect(inks).toEqual([]); // restrained draws nothing
	});

	it('somber is still until the key beat (the line with the largest move), then holds it', () => {
		const { play, inks } = rig();
		play('somber', 0);
		play('somber', 20);
		expect(document.querySelectorAll('.lat-guide-dim').length).toBe(0);
		// `line`'s key is `largest`: EMEA's enter (0.8) beats APAC's (0.3), so it is the one gesture.
		const again = rig();
		again.play('somber', 10);
		expect(up()).toContain('path:EMEA');
		again.play('somber', 30);
		// Held: the whole EMEA line stays up and APAC stays down; the point sentence moved nothing.
		expect(up()).toContain('path:EMEA');
		expect(document.querySelector('path[data-label="APAC"]')?.classList.contains('lat-guide-dim')).toBe(true);
		expect(inner()).toEqual([]);
		expect([...inks, ...again.inks]).toEqual([]);
	});

	it('expressive inks each act, and focuses the same parts as restrained', async () => {
		const { play, inks } = rig();
		play('expressive', 30);
		expect(up()).toContain('circle:Feb 2026');
		play('expressive', 10);
		expect(inks).toEqual(['tap', 'trace']);
	});

	it('a pause lifts the focus, and playing a held sentence brings it back', () => {
		const { play } = rig();
		play('restrained', 30);
		play('restrained', 30, { delivering: false });
		expect(document.querySelectorAll('.lat-guide-dim, .lat-guide-dim-inner').length).toBe(0);
		play('restrained', 40);
		expect(up()).toContain('circle:Feb 2026');
	});

	it('nothing carries across a slide change', () => {
		const { play } = rig();
		play('restrained', 30, { slide: 0 });
		play('restrained', 0, { slide: 1 });
		expect(document.querySelectorAll('.lat-guide-dim, .lat-guide-dim-inner').length).toBe(0);
	});

	it('a binding this render does not draw falls back to the words, rather than going dark', () => {
		// The text path's aim answers with the APAC line; the binding names a point that is not drawn.
		const { play } = rig('path[data-label="APAC"]');
		play('restrained', 0, { refs: [{ start: 0, end: 10, act: 'visit', unit: 'point', id: { series: 9, cat: 'Dec 2031' } }] });
		expect(up()).toContain('path:APAC');
	});

	it('somber keeps its key focus when the deck resumes on a sentence with no binding after it', () => {
		const { play } = rig();
		// EMEA's enter (10–20) is the key; 60+ is an unbound closing aside.
		play('somber', 10);
		play('somber', 10, { delivering: false });
		expect(document.querySelectorAll('.lat-guide-dim').length).toBe(0);
		play('somber', 65);
		expect(up()).toContain('path:EMEA');
	});
});

describe('guide-conductor — a binding that is not the slide’s', () => {
	it('a slide whose binding names none of its units reads its words instead', () => {
		// A chart narrator that reads a prose slide as a board names `column`, which `content` lacks.
		document.body.innerHTML = '<div class="lattice"><section class="content"><ul><li id="a">Hello there.</li><li id="b">Goodbye.</li></ul></section></div>';
		const a = document.getElementById('a') as Element;
		const stage: GuideStage = { gesture: async () => {}, setCursorVisible: () => {} };
		const cue = (): GuideCue => ({ el: a, kind: 'underline', strength: 'quiet', target: { getBoundingClientRect: () => a.getBoundingClientRect(), getClientRects: () => [] }, rest: null });
		const g = createGuideConductor({ stage: () => stage, aim: () => a, cue, clearance: 19, section: () => document.querySelector('section') });
		const style = (DELIVERY_STYLES as Record<string, { express: SceneStyle }>).restrained.express;
		const refs: SceneRef[] = [{ start: 0, end: 12, act: 'enter', unit: 'column', id: { column: 'Hello there' } }];
		g.beat({ slide: 0, cue: 0, texts: ['Hello there.'], track: 't', delivering: true, delivery: delivery(), scene: { refs, at: 0, style } });
		// The text path found the item from its words.
		expect(a.classList.contains('lat-guide-undim')).toBe(true);
		expect(document.getElementById('b')?.classList.contains('lat-guide-dim')).toBe(true);
	});
});

describe('guide-conductor — prose, bullets and rows bound by the narration builder', () => {
	// The refs `bindingRefsFor` writes: ordinal ids over the slide's structure units. The focus they
	// play recedes what the text path would (`focusUnit`), so a bound sentence and a matched one match.
	function rig(html: string, cls = 'content') {
		document.body.innerHTML = `<div class="lattice"><section class="${cls}">${html}</section></div>`;
		const stage: GuideStage = { gesture: async () => {}, setCursorVisible: () => {} };
		const g = createGuideConductor({ stage: () => stage, aim: () => null, cue: () => null, clearance: 19, section: () => document.querySelector('section') });
		const play = (refs: SceneRef[], at: number, name = 'restrained') => {
			const style = (DELIVERY_STYLES as Record<string, { express: SceneStyle }>)[name].express;
			g.beat({ slide: 0, cue: 0, texts: ['x'], track: refs, delivering: true, delivery: delivery({ name }), scene: { refs, at, style } });
		};
		const dim = (id: string) => document.getElementById(id)?.classList.contains('lat-guide-dim') ?? false;
		return { g, play, dim };
	}

	const listRefs: SceneRef[] = [
		{ start: 0, end: 9, act: 'frame', unit: 'heading', id: { i: 1 } },
		{ start: 10, end: 23, act: 'visit', unit: 'item', id: { i: 1 } },
		{ start: 24, end: 35, act: 'visit', unit: 'item', id: { i: 2 } },
	];
	const list = '<h2 id="h">Outlook.</h2><ul><li id="a">Revenue grew.</li><li id="b">Churn fell.</li></ul>';

	it('a heading frames: nothing is focused', () => {
		const { play, dim } = rig(list);
		play(listRefs, 0);
		expect(['h', 'a', 'b'].some(dim)).toBe(false);
	});

	it('a bullet is focused and its siblings recede; the headline never does', () => {
		const { play, dim } = rig(list);
		play(listRefs, 10);
		expect(dim('a')).toBe(false);
		expect(dim('b')).toBe(true);
		expect(dim('h')).toBe(false);
		play(listRefs, 24);
		expect(dim('a')).toBe(true);
		expect(dim('b')).toBe(false);
	});

	it('a slide no component claims plays as a statement', () => {
		const { play, dim } = rig(list, '');
		play(listRefs, 10);
		expect(dim('b')).toBe(true);
	});

	it('a table row is focused as the text path focuses a row: its cells up, the other body cells down', () => {
		const { play, dim } = rig('<table><thead><tr><th>Region</th><th>ARR</th></tr></thead><tbody><tr><td id="r1">EMEA</td><td id="v1">4</td></tr><tr><td id="r2">APAC</td><td id="v2">3</td></tr></tbody></table>');
		play([{ start: 0, end: 10, act: 'visit', unit: 'row', id: { i: 2 } }], 0);
		expect(dim('r2') || dim('v2')).toBe(false);
		expect(dim('v1')).toBe(true);
	});

	it('a lone paragraph shows nothing: the narration is enough', () => {
		const { play, dim } = rig('<p id="p">One thought, said once.</p>');
		play([{ start: 0, end: 22, act: 'visit', unit: 'paragraph', id: { i: 1 } }], 0);
		expect(dim('p')).toBe(false);
		expect(document.querySelector('.lat-guide-undim')).toBeNull();
	});

	it('a sentence the builder left unbound reads its words, as it did before prose was bound', () => {
		// Only the heading binds (say the two lines were said twice elsewhere); the text path matches them.
		document.body.innerHTML = '<div class="lattice"><section class="content"><h2>Terms.</h2><ul><li id="a">Alpha.</li><li id="b">Beta.</li></ul></section></div>';
		const b = document.getElementById('b') as Element;
		const stage: GuideStage = { gesture: async () => {}, setCursorVisible: () => {} };
		const cue = (): GuideCue => ({ el: b, kind: 'underline', strength: 'quiet', target: { getBoundingClientRect: () => b.getBoundingClientRect(), getClientRects: () => [] }, rest: null });
		const g = createGuideConductor({ stage: () => stage, aim: (t) => (t === 'Beta.' ? b : null), cue, clearance: 19, section: () => document.querySelector('section') });
		const style = (DELIVERY_STYLES as Record<string, { express: SceneStyle }>).restrained.express;
		const refs: SceneRef[] = [{ start: 0, end: 6, act: 'frame', unit: 'heading', id: { i: 1 } }];
		g.beat({ slide: 0, cue: 1, texts: ['Terms.', 'Beta.'], track: refs, delivering: true, delivery: delivery(), scene: { refs, at: 7, style } });
		expect(document.getElementById('a')?.classList.contains('lat-guide-dim')).toBe(true);
		expect(b.classList.contains('lat-guide-dim')).toBe(false);
	});

	it('a diagram\'s runtime labels are not the slide\'s paragraphs', () => {
		// Mermaid draws `<p>` node labels inside its svg after the narration counted the paragraphs.
		const { play, dim } = rig('<svg><foreignObject><p id="n">A</p></foreignObject></svg><p id="p1">The caption.</p><p id="p2">The note.</p>');
		play([{ start: 0, end: 12, act: 'visit', unit: 'paragraph', id: { i: 1 } }], 0);
		expect(dim('p2')).toBe(true);
		expect(dim('p1')).toBe(false);
	});

	it('one act per PART: the next sentences of a paragraph rest, and play resumes the part', () => {
		// A paragraph is ONE ref over all of its sentences. Each sentence is a beat, and replaying the
		// act on every beat redrew the same underline once a sentence (present-guide.spec.ts "one
		// gesture per BLOCK" saw four strokes on one paragraph).
		document.body.innerHTML = '<div class="lattice"><section class="content"><h2 id="h">The quarter.</h2><p id="p">Growth held. Spend stayed disciplined. The quarter landed.</p></section></div>';
		const inks: string[] = [];
		const stage: GuideStage = { gesture: async (kind) => void inks.push(kind), setCursorVisible: () => {} };
		const p = document.getElementById('p') as Element;
		const sceneCue = (_s: Element, els: readonly Element[], kind: GuideCue['kind']): GuideCue => ({ el: els[0] ?? p, kind, strength: 'quiet', target: { getBoundingClientRect: () => p.getBoundingClientRect(), getClientRects: () => [] }, rest: null });
		const g = createGuideConductor({ stage: () => stage, aim: () => null, cue: () => null, clearance: 19, section: () => document.querySelector('section'), sceneCue });
		const style = (DELIVERY_STYLES as Record<string, { express: SceneStyle }>).expressive.express;
		const refs: SceneRef[] = [
			{ start: 0, end: 12, act: 'frame', unit: 'heading', id: { i: 1 } },
			{ start: 13, end: 71, act: 'visit', unit: 'paragraph', id: { i: 1 } },
		];
		const beat = (at: number, delivering = true) => g.beat({ slide: 0, cue: 0, texts: ['x'], track: refs, delivering, delivery: delivery({ name: 'expressive', ink: 'all' }), scene: { refs, at, style } });
		beat(13); // the paragraph's first sentence: its underline
		beat(26); // its second
		beat(53); // its third
		expect(inks).toEqual(['underline']);
		beat(53, false); // paused…
		beat(53); // …and played again: the part comes back
		expect(inks).toEqual(['underline', 'underline']);
		// A delivery changed mid-part plays the part in the new delivery's own way.
		g.beat({ slide: 0, cue: 0, texts: ['x'], track: refs, delivering: true, delivery: delivery({ name: 'expressive-2', ink: 'all' }), scene: { refs, at: 53, style } });
		expect(inks).toEqual(['underline', 'underline', 'underline']);
	});

	it('somber focuses only its key beat (the first bullet) and holds it', () => {
		const { play, dim } = rig(list);
		play(listRefs, 0, 'somber');
		expect(dim('b')).toBe(false);
		play(listRefs, 10, 'somber');
		expect(dim('b')).toBe(true);
		play(listRefs, 24, 'somber');
		expect(dim('b')).toBe(true);
		expect(dim('a')).toBe(false);
	});
});
