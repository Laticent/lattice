// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { scorecardHalves, typeSizeCount, venueFindings } from './engine-facts';
import { SLIDE_JOBS, VENUES } from './room-decks';

const { lintText } = await import('../../../../lib/authoring/lint.js');

// The home page prints these facts from the engine at build time. These tests pin what
// the page CLAIMS, so a change to the engine that would change the claim fails here first
// and the copy is rewritten on purpose, never quietly.
describe('venue demo', () => {
	const v = venueFindings();

	it('shows the four 16:9 rooms in the engine order', () => {
		expect(v.map((x) => x.venue)).toEqual(['laptop', 'huddle', 'conference', 'hall']);
	});

	// The page says: fits a laptop and a meeting-room TV, too full for a conference screen
	// and an auditorium. A change to the `stats` venue budgets (its manifest's venueCapacity)
	// moves these and fails this test.
	it('warns on the one-slide deck at conference and hall only, with capacity-scale', () => {
		const warned = v.filter((x) => x.one.length).map((x) => x.venue);
		expect(warned).toEqual(['conference', 'hall']);
		for (const x of v.filter((y) => y.one.length)) {
			expect(x.one.map((f) => f.rule)).toEqual(['capacity-scale']);
			expect(x.one[0].message).toMatch(/fits about \d+ items .* this slide has 5/);
		}
		expect(v.find((x) => x.venue === 'conference')?.one[0].message).toMatch(/fits about 4 items/);
		expect(v.find((x) => x.venue === 'hall')?.one[0].message).toMatch(/fits about 3 items/);
	});

	it('the two-slide fix is clean at every venue', () => {
		for (const x of v) expect(x.split, x.venue).toEqual([]);
	});

	// The failing arm: the check that passes the fix DOES fire when the fix is not enough.
	// One more tile on the fix's first slide is four, past the auditorium's three.
	it('can fail: a fourth tile on the fix\'s first slide warns in the auditorium', () => {
		const hall = v.find((x) => x.venue === 'hall');
		const crowded = hall?.splitDeck.replace(/(3\. .*\n {3}- .*\n)/, '$14. 2x\n   - pipeline growth\n') ?? '';
		expect(crowded).not.toBe(hall?.splitDeck);
		const hits = (lintText(crowded) as { rule: string; slide: number }[]).filter((f) => f.rule === 'capacity-scale');
		expect(hits.map((f) => f.slide)).toEqual([1]);
	});

	it('names every venue as a viewing condition, never as an audience room', () => {
		for (const x of VENUES) expect(x.label).not.toMatch(/lecture|boardroom|pitch|briefing|mission|review/i);
	});
});

describe('slide jobs', () => {
	it('six jobs, each slide lint-clean', () => {
		expect(SLIDE_JOBS.map((j) => j.job)).toEqual(['Compare', 'Explain', 'Quantify', 'Sequence', 'Teach', 'Decide']);
		for (const j of SLIDE_JOBS) {
			const bad = (lintText(j.sample) as { severity: string; rule: string }[]).filter((f) => f.severity !== 'info');
			expect(bad, j.job).toEqual([]);
			expect(j.sample).toContain(`layout=${j.layout}`);
		}
	});
});

describe('quality layers', () => {
	it('prints the Deck read categories as the scorecard groups them', () => {
		const s = scorecardHalves();
		expect(s.craft).toEqual(['Structure', 'Writing craft', 'Contract']);
		expect(s.style).toEqual(['Brevity', 'Framing', 'Data', 'Pacing']);
		expect(s.profiles).toEqual(['General', 'Teaching', 'Mission']);
	});

	it('the type scale has twelve sizes', () => {
		expect(typeSizeCount()).toBe(12);
	});
});
