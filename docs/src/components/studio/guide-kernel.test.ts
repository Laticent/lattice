import { afterEach, describe, expect, it } from 'vitest';
import { aimTarget, createGuideDirector, findCueTarget, type GuideLook } from './guide-kernel';
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
