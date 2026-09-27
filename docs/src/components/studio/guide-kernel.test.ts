import { afterEach, describe, expect, it } from 'vitest';
import { DELIVERY_STYLES } from '@/lib/resolve-delivery';
import { aimTarget, createGuideDirector, findCueTarget, findTableRowTarget, focusContent, type GuideLook, planSlide, type SceneRef, type SceneStyle } from './guide-kernel';
import { createPlayerGuide } from './guide-player';

// The director is the Guide's focus POLICY, shared by the Studio's Present and the exported
// player: the rest, the resume after a pause, the plan's budget, the chart walk, the unplanned
// sentence and the aside hold. These pin each rule on a real DOM, so the two surfaces cannot
// drift apart by one of them growing its own copy.

const RESTRAINED: GuideLook = { name: 'restrained', budget: 2, floor: 1, dim: 0.45, dimInner: 0.3, fade: 0, hold: 'none' };
const SOMBER: GuideLook = { name: 'somber', budget: 1, floor: 1, dim: 0.62, dimInner: 0.5, fade: 0, hold: 'aside' };

const TEXTS = [
	'Revenue ahead of plan; payback is slipping.',
	'Hiring continued on plan across every team.',
	'ARR closed at $48.6M, ahead of plan.',
	'The office move finished in August.',
	'CAC payback stretched to 19 months.',
];

function slide(): Element {
	document.body.innerHTML = `<div class="lattice"><section data-lattice-slide="1"><h2>Revenue ahead of plan; payback is slipping.</h2><ul>
		<li>Hiring continued on plan across every team.</li>
		<li>ARR closed at $48.6M, ahead of plan.</li>
		<li>The office move finished in August.</li>
		<li>CAC payback stretched to <strong>19 months</strong>.</li></ul></section></div>`;
	return document.querySelector('section') as Element;
}
const aimIn = (section: Element) => (t: string) => {
	const b = findCueTarget(section, t);
	return b ? aimTarget(b, t).el : null;
};
// What is focused: the element kept at full strength while something recedes. After a lift the
// old peers carry `-undim` for one crossfade before it clears, so a lone `-undim` is not a focus.
const focused = () => (document.querySelector('.lat-guide-dim') ? (document.querySelector('.lat-guide-undim')?.textContent?.trim() ?? null) : null);
const dimmed = () => document.querySelectorAll('.lat-guide-dim').length;

/** Drive one sentence through the director the way the player does: beat, then land on the aim. */
function play(d: ReturnType<typeof createGuideDirector>, section: Element, k: number, look = RESTRAINED, track: unknown = TEXTS) {
	const aimOf = aimIn(section);
	const text = TEXTS[k] ?? '';
	const aim = text ? aimOf(text) : null;
	const step = d.beat({ slide: 1, track, texts: TEXTS, cue: k, text, aim, aimOf }, look);
	if (step.kind === 'moment' && d.land(aim, text, 1, look) === 'focused') d.markShown();
	return step;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('createGuideDirector — one focus policy', () => {
	it('spends the budget on the salient moments and lifts the focus on an unplanned sentence', () => {
		const section = slide();
		const d = createGuideDirector();
		// restrained's budget of 2 goes to the emphasized number and the bare number (2 and 4).
		expect(play(d, section, 1).kind).toBe('clear');
		expect(focused()).toBeNull();
		expect(play(d, section, 2)).toEqual({ kind: 'moment', top: false });
		expect(focused()).toBe('ARR closed at $48.6M, ahead of plan.');
		expect(dimmed()).toBe(3);
		expect(play(d, section, 3).kind).toBe('clear');
		expect(dimmed()).toBe(0);
		expect(play(d, section, 4)).toEqual({ kind: 'moment', top: true });
		expect(focused()).toBe('CAC payback stretched to 19 months.');
	});

	it('rests when the next sentence names what is already focused', () => {
		const section = slide();
		const d = createGuideDirector();
		play(d, section, 2);
		const aimOf = aimIn(section);
		const aim = aimOf(TEXTS[2]);
		expect(d.beat({ slide: 1, track: TEXTS, texts: TEXTS, cue: 2, text: TEXTS[2], aim, aimOf }, RESTRAINED).kind).toBe('rest');
		expect(focused()).toBe('ARR closed at $48.6M, ahead of plan.');
	});

	it('lifts on pause and restores the held focus on play while the sentence still names it', () => {
		const section = slide();
		const d = createGuideDirector();
		play(d, section, 2);
		d.pause(1);
		expect(dimmed()).toBe(0);
		expect(focused()).toBeNull();
		expect(play(d, section, 2).kind).toBe('resume');
		expect(focused()).toBe('ARR closed at $48.6M, ahead of plan.');
	});

	it('does not resume on another slide', () => {
		const section = slide();
		const d = createGuideDirector();
		play(d, section, 2);
		d.pause(1);
		const aimOf = aimIn(section);
		const aim = aimOf(TEXTS[2]);
		expect(d.beat({ slide: 2, track: TEXTS, texts: TEXTS, cue: 2, text: TEXTS[2], aim, aimOf }, RESTRAINED).kind).not.toBe('resume');
	});

	it('holds through a short aside only where the preset asks (somber), and never for a longer sentence', () => {
		const section = slide();
		const d = createGuideDirector();
		play(d, section, 4, SOMBER);
		expect(focused()).toBe('CAC payback stretched to 19 months.');
		expect(d.land(null, 'Thank you.', 1, SOMBER)).toBe('hold');
		expect(focused()).toBe('CAC payback stretched to 19 months.');
		expect(d.land(null, 'Thank you.', 1, RESTRAINED)).toBe('clear');
		expect(focused()).toBeNull();
	});

	it('walks a chart: a later sentence inside the planned chart takes the focus at no budget cost', () => {
		document.body.innerHTML = `<div class="lattice"><section><h2>Two regions carried the year.</h2><div class="chart-body"><svg>
			<rect data-mark="0" data-label="North America" data-value="$4.2M"></rect>
			<rect data-mark="1" data-label="EMEA" data-value="$3.1M"></rect>
			<rect data-mark="2" data-label="APAC" data-value="$1.8M"></rect></svg></div></section></div>`;
		const section = document.querySelector('section') as Element;
		const texts = ['North America, four point two million dollars.', 'EMEA, three point one million dollars.', 'APAC, one point eight million dollars.'];
		const aimOf = aimIn(section);
		const d = createGuideDirector();
		const one: GuideLook = { ...RESTRAINED, budget: 1 };
		const kinds = texts.map((text, k) => {
			const aim = aimOf(text);
			const step = d.beat({ slide: 1, track: texts, texts, cue: k, text, aim, aimOf }, one);
			if (step.kind === 'moment') d.land(aim, text, 1, one);
			return step.kind;
		});
		expect(kinds).toEqual(['moment', 'walk', 'walk']);
		expect(document.querySelector('.lat-guide-undim')?.getAttribute('data-label')).toBe('APAC');
	});

	it('keeps the walked point focused through a note that names only its category band', () => {
		// A line category's detail note resolves to the category's hit band (`.line-hit`), which the
		// focus cannot isolate. It is still about the point just read, so that point stays focused.
		document.body.innerHTML = `<div class="lattice"><section><div class="chart-body"><svg>
			<path class="line-path" data-series="0" data-label="EMEA"></path>
			<circle data-series="0" data-label="Jan 2026" data-value="4.1" cx="100" cy="50"></circle>
			<circle data-series="0" data-label="Feb 2026" data-value="3.2" cx="300" cy="60"></circle>
			<rect class="line-hit" data-mark="1" x="200" y="0" width="200" height="400"></rect></svg>
			<div class="chart-details" hidden><template class="chart-detail" data-mark="1">The processor outage cost two weeks</template></div></div></section></div>`;
		const section = document.querySelector('section') as Element;
		const band = section.querySelector('.line-hit') as Element;
		const texts = ['Jan 2026, four point one.', 'Feb 2026, three point two.', 'The processor outage cost two weeks.'];
		const aimOf = (t: string) => (t === texts[2] ? band : aimIn(section)(t));
		const d = createGuideDirector();
		const one: GuideLook = { ...RESTRAINED, budget: 1, floor: 0 };
		const kinds = texts.map((text, k) => {
			const aim = aimOf(text);
			const step = d.beat({ slide: 1, track: texts, texts, cue: k, text, aim, aimOf }, one);
			if (step.kind === 'moment') d.land(aim, text, 1, one);
			return step.kind;
		});
		expect(kinds).toEqual(['moment', 'walk', 'rest']);
		expect(document.querySelector('circle.lat-guide-undim')?.getAttribute('data-label')).toBe('Feb 2026');
	});

	it('lifts the focus for any other unfocusable aim inside the walked chart', () => {
		// The chart body (where a sentence about the whole chart lands), or a band of a DIFFERENT
		// category than the point up, is not about that point: the walk lifts, as before.
		document.body.innerHTML = `<div class="lattice"><section><div class="chart-body"><svg>
			<path class="line-path" data-series="0" data-label="EMEA"></path>
			<circle data-series="0" data-label="Jan 2026" data-value="4.1" cx="100" cy="50"></circle>
			<circle data-series="0" data-label="Feb 2026" data-value="3.2" cx="300" cy="60"></circle>
			<rect class="line-hit" data-mark="2" x="400" y="0" width="200" height="400"></rect></svg></div></section></div>`;
		const section = document.querySelector('section') as Element;
		const body = section.querySelector('.chart-body') as Element;
		const other = section.querySelector('.line-hit') as Element;
		for (const stray of [body, other]) {
			const texts = ['Jan 2026, four point one.', 'Feb 2026, three point two.', 'Something else entirely.'];
			const aimOf = (t: string) => (t === texts[2] ? stray : aimIn(section)(t));
			const d = createGuideDirector();
			const one: GuideLook = { ...RESTRAINED, budget: 1, floor: 0 };
			const kinds = texts.map((text, k) => {
				const aim = aimOf(text);
				const step = d.beat({ slide: 1, track: texts, texts, cue: k, text, aim, aimOf }, one);
				if (step.kind === 'moment') d.land(aim, text, 1, one);
				return step.kind;
			});
			expect(kinds).toEqual(['moment', 'walk', 'clear']);
		}
	});

	it('leaves the focus to a busy hand on an unplanned sentence, lifting only the recede', () => {
		const section = slide();
		const d = createGuideDirector();
		play(d, section, 2);
		const aimOf = aimIn(section);
		const aim = aimOf(TEXTS[3]);
		const step = d.beat({ slide: 1, track: TEXTS, texts: TEXTS, cue: 3, text: TEXTS[3], aim, aimOf }, RESTRAINED, () => true);
		expect(step.kind).toBe('idle');
		expect(dimmed()).toBe(0);
		expect(d.aim?.textContent?.trim()).toBe('ARR closed at $48.6M, ahead of plan.');
	});
});

describe('createPlayerGuide — the exported player’s hooks', () => {
	const track = { cues: TEXTS.map((t) => ({ words: t.split(' ').map((display) => ({ display })) })) };

	it('focuses on a sentence, lifts on pause and on idle, and restores on play', () => {
		const section = slide();
		const g = createPlayerGuide({ ...RESTRAINED, wordFocus: true });
		g.cue(section, 1, track, 2);
		expect(focused()).toBe('ARR closed at $48.6M, ahead of plan.');
		g.pause();
		expect(focused()).toBeNull();
		g.cue(section, 1, track, 2);
		expect(focused()).toBe('ARR closed at $48.6M, ahead of plan.');
		g.idle();
		expect(dimmed()).toBe(0);
	});

	it('ignores a missing section or track rather than throwing', () => {
		const g = createPlayerGuide({ ...RESTRAINED, wordFocus: true });
		expect(() => g.cue(null, 0, track, 0)).not.toThrow();
		expect(() => g.cue(slide(), 0, null, 0)).not.toThrow();
		expect(() => g.word(null, 0, 0)).not.toThrow();
	});
});

describe('restrained audit fixes (owner, 2026-09-27)', () => {
	it('walks a planned chart from its FIRST named mark, not from the planned one', () => {
		// A dumbbell's first row came before the plan's moment and stayed dark.
		document.body.innerHTML = `<div class="lattice"><section><div class="chart-body"><svg>
			<line data-mark="0" data-series="0" data-label="Platform" data-value=""></line>
			<line data-mark="1" data-series="1" data-label="Payments" data-value=""></line>
			<line data-mark="2" data-series="2" data-label="Growth" data-value="$19M"></line></svg></div></section></div>`;
		const section = document.querySelector('section') as Element;
		const marks = [...section.querySelectorAll('line')];
		const texts = ['Platform rose seven.', 'Payments fell four.', 'Growth rose to $19M.'];
		const aimOf = (t: string) => marks[texts.indexOf(t)] ?? null;
		// Budget 1, spent on Growth (the only measured mark, the last sentence): the chart is still
		// walked from Platform, its first named mark.
		const look: GuideLook = { ...RESTRAINED, budget: 1 };
		expect([...planSlide(texts, aimOf, 1, 1).gesture]).toEqual([2]);
		const d = createGuideDirector();
		const kinds = texts.map((text, k) => {
			const aim = aimOf(text);
			const step = d.beat({ slide: 1, track: texts, texts, cue: k, text, aim, aimOf }, look);
			if (step.kind === 'moment') d.land(aim, text, 1, look);
			return [step.kind, document.querySelector('.lat-guide-undim')?.getAttribute('data-label') ?? null];
		});
		expect(kinds[0]).toEqual(['walk', 'Platform']);
		expect(kinds.map((k) => k[1])).toEqual(['Platform', 'Payments', 'Growth']);
	});

	it('resolves a table row read as "Row — Col: value; …" to the row', () => {
		document.body.innerHTML = `<div class="lattice"><section><table><thead><tr><th>Segment</th><th>Q3</th><th>Q4</th><th>EMEA</th></tr></thead>
			<tbody><tr><td>Enterprise</td><td>1.2%</td><td>1.1%</td><td>0.9%</td></tr><tr><td>SMB</td><td>7.8%</td><td>9.4%</td><td>6.1%</td></tr></tbody></table></section></div>`;
		const section = document.querySelector('section') as Element;
		const hit = findCueTarget(section, 'SMB — Q3: 7.8%; Q4: 9.4%; EMEA: 6.1%.');
		expect(hit?.textContent).toBe('SMB');
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
		const feb = document.querySelectorAll('circle')[1];
		const undo = focusContent(feb, { dim: 0.45, dimInner: 0.3, fade: 0 });
		const [jan, febLabel] = [...document.querySelectorAll('text.cart-cat')];
		expect(febLabel.classList.contains('lat-guide-undim')).toBe(true);
		expect(jan.classList.contains('lat-guide-dim')).toBe(true);
		undo?.();
	});
});

// THE SCENE — a bound sentence played in its delivery's own style (2026-09-27 note). The chart
// narrator binds each sentence to an act and a unit; the line manifest's scene finds the unit; the
// style file decides what the act does. These pin the three characters on one line chart.
describe('scene: a bound sentence in its delivery style', () => {
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
	const look = (name: string): GuideLook => ({ name, budget: 999, floor: 0, dim: 0.45, dimInner: 0.3, fade: 0, hold: 'none' });
	const style = (name: string) => (DELIVERY_STYLES as Record<string, { express: SceneStyle }>)[name].express;
	const up = () => [...document.querySelectorAll('.lat-guide-undim')].map((e) => `${e.tagName.toLowerCase()}:${e.getAttribute('data-label') ?? e.textContent}`);
	const inner = () => [...document.querySelectorAll('.lat-guide-dim-inner')].map((e) => e.getAttribute('data-label'));
	const play = (name: string, at: number, slide = 0) => {
		const section = document.querySelector('section') as Element;
		return director.scene({ slide, section, refs: REFS, at }, look(name), style(name));
	};
	let director = createGuideDirector();
	afterEach(() => {
		director.lift();
		director = createGuideDirector();
	});

	it('restrained walks every named part: the line, then each point on it, with its category held', () => {
		document.body.innerHTML = LINE;
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
	});

	it('somber is still until the key beat (the line with the largest move), then holds it', () => {
		document.body.innerHTML = LINE;
		play('somber', 0);
		play('somber', 20);
		expect(document.querySelectorAll('.lat-guide-dim').length).toBe(0);
		// `line`'s key is `largest`: EMEA's enter (0.8) beats APAC's (0.3), so it is the one gesture.
		// It sits before the points, so the points after it only hold it.
		document.body.innerHTML = LINE;
		director.lift();
		play('somber', 10);
		expect(up()).toContain('path:EMEA');
		play('somber', 30);
		// Held: the whole EMEA line stays up and APAC stays down; the point sentence moved nothing.
		expect(up()).toContain('path:EMEA');
		expect(document.querySelector('path[data-label="APAC"]')?.classList.contains('lat-guide-dim')).toBe(true);
		expect(inner()).toEqual([]);
	});

	it('expressive asks for ink on each act, and the focus the same parts as restrained', () => {
		document.body.innerHTML = LINE;
		expect(play('expressive', 30)?.expr.ink).toEqual({ kind: 'tap', on: 'unit', strength: 'quiet' });
		expect(up()).toContain('circle:Feb 2026');
		expect(play('expressive', 10)?.expr.ink?.kind).toBe('trace');
	});

	it('a pause lifts the focus, and playing a held sentence brings it back', () => {
		document.body.innerHTML = LINE;
		play('restrained', 30);
		director.pause(0);
		expect(document.querySelectorAll('.lat-guide-undim, .lat-guide-dim').length).toBeGreaterThanOrEqual(0);
		expect(director.marked).toBe(false);
		play('restrained', 40);
		expect(up()).toContain('circle:Feb 2026');
	});

	it('nothing carries across a slide change', () => {
		document.body.innerHTML = LINE;
		play('restrained', 30, 0);
		expect(director.marked).toBe(true);
		play('restrained', 0, 1);
		expect(document.querySelectorAll('.lat-guide-dim, .lat-guide-dim-inner').length).toBe(0);
	});

	it('a binding this render does not draw falls back to the words, rather than going dark', () => {
		document.body.innerHTML = LINE;
		const section = document.querySelector('section') as Element;
		const missing: SceneRef[] = [{ start: 0, end: 10, act: 'visit', unit: 'point', id: { series: 9, cat: 'Dec 2031' } }];
		expect(director.scene({ slide: 0, section, refs: missing, at: 0 }, look('restrained'), style('restrained'))).toBeNull();
	});

	it('somber keeps its key focus when the deck resumes on a sentence with no binding after it', () => {
		document.body.innerHTML = LINE;
		const section = document.querySelector('section') as Element;
		// EMEA's enter (10–20) is the key; 60+ is an unbound closing aside.
		play('somber', 10);
		director.pause(0);
		expect(director.marked).toBe(false);
		director.scene({ slide: 0, section, refs: REFS, at: 65 }, look('somber'), style('somber'));
		expect(up()).toContain('path:EMEA');
	});

	it('a slide with no scene is not the scene path’s: the caller reads the words', () => {
		document.body.innerHTML = '<div class="lattice"><section class="content"><p>Hello.</p></section></div>';
		expect(play('restrained', 0)).toBeNull();
	});
});
