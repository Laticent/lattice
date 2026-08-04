import { describe, expect, it } from 'vitest';
import { applyChartNarration, resolveNarration } from './narration-resolve';

// The precedence ladder every Studio narration surface shares. What makes these worth
// pinning is not the ordering itself but the CONSEQUENCE of getting it wrong: the webpage
// export looks each spoken sentence up in the on-device clip store by a content-complete
// key, so a rung resolved differently from the surface that synthesized the audio does not
// produce slightly-off narration — it produces NO narration, with nothing the author can do
// about it. See narration-resolve.ts.

describe('resolveNarration', () => {
	it('takes the highest non-blank rung', () => {
		const full = { caption: 'cap', fmCaption: 'fm', note: 'note', chart: 'chart', projected: 'proj', fallback: 'flat' };
		expect(resolveNarration(full)).toBe('cap');
		expect(resolveNarration({ ...full, caption: null })).toBe('fm');
		expect(resolveNarration({ ...full, caption: null, fmCaption: null })).toBe('note');
		expect(resolveNarration({ ...full, caption: null, fmCaption: null, note: null })).toBe('chart');
		expect(resolveNarration({ ...full, caption: null, fmCaption: null, note: null, chart: null })).toBe('proj');
		expect(resolveNarration({ fallback: 'flat' })).toBe('flat');
	});

	it('reads a contentless slide as silence rather than inventing text', () => {
		expect(resolveNarration({})).toBe('');
		expect(resolveNarration({ caption: '', note: null, projected: '' })).toBe('');
	});

	it('treats a whitespace-only rung as absent, on EVERY rung', () => {
		// The trim guard has to be uniform. It was not: Present accepted a whitespace-only
		// inline caption or note (a bare truthiness check) while the export's merge trimmed
		// and fell through — so the two surfaces narrated that slide differently, which is
		// exactly the shape that makes a clip lookup miss forever.
		expect(resolveNarration({ caption: '   ', note: 'note' })).toBe('note');
		expect(resolveNarration({ note: '\n\t ', projected: 'proj' })).toBe('proj');
		expect(resolveNarration({ fmCaption: ' ', chart: 'chart' })).toBe('chart');
	});

	it('keeps a rung’s own surrounding whitespace once it wins', () => {
		// Trim decides IF a rung wins, never what it says — the author's spacing is theirs,
		// and normalization for speech belongs to buildTrack.
		expect(resolveNarration({ caption: '  Revenue grew.  ' })).toBe('  Revenue grew.  ');
	});
});

describe('applyChartNarration', () => {
	const narrator = (md: string) => (md.includes('funnel') ? 'Half the visitors sign up.' : null);

	it('substitutes computed chart facts at PROJECTION precedence', () => {
		const slides = ['# Intro', '<!-- _class: funnel -->', '# Outro'];
		const projected = ['Intro.', 'Where the flow drops off.', 'Outro.'];
		expect(applyChartNarration(slides, projected, narrator)).toEqual(['Intro.', 'Half the visitors sign up.', 'Outro.']);
	});

	it('does not mutate the projection it was handed', () => {
		const projected = ['a', 'b'];
		applyChartNarration(['x', 'funnel'], projected, narrator);
		expect(projected).toEqual(['a', 'b']);
	});

	it('stands down wholesale when the index mapping cannot be trusted', () => {
		// A length disagreement means a chart's facts could bind to the WRONG slide, which is
		// worse than the heading-only caption it would have replaced.
		const projected = ['a', 'b', 'c'];
		expect(applyChartNarration(['funnel', 'x'], projected, narrator)).toEqual(projected);
		expect(applyChartNarration([], projected, narrator)).toEqual(projected);
	});

	it('lets one pathological slide fail without taking the deck down', () => {
		const hostile = (md: string) => {
			if (md === 'boom') throw new Error('narrator exploded');
			return md === 'funnel' ? 'facts' : null;
		};
		expect(applyChartNarration(['boom', 'funnel'], ['a', 'b'], hostile)).toEqual(['a', 'facts']);
	});

	it('ignores a narrator that returns blank', () => {
		expect(applyChartNarration(['x'], ['proj'], () => '   ')).toEqual(['proj']);
	});
});
