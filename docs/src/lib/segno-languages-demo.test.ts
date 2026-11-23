import { describe, expect, it } from 'vitest';
import { breakLines, build, SAMPLE, slideEnd, slideViews, step, titleEnd } from './segno-languages-demo';

// The demo page claims what the real deck model does with its sample; these keep the claims true.
const insert = (text: string, at: number, add: string) => text.slice(0, at) + add + text.slice(at);

describe('the Segno Languages demo deck', () => {
	it('reads five slides, and none of the three `---` lines that are not breaks', () => {
		const model = build(SAMPLE);
		const views = slideViews(model);
		expect(views.map((v) => v.title)).toEqual(['Quarterly review', 'Two ways to ship', 'A fence keeps its dashes', 'Under a line of text', 'Next steps']);
		const lines = SAMPLE.split('\n');
		// Every break the model names is a `---` line, four of the deck's nine such lines.
		const dashes = lines.flatMap((l, i) => (l === '---' ? [i + 1] : []));
		expect(dashes).toHaveLength(9);
		expect(breakLines(model)).toHaveLength(4);
		for (const b of breakLines(model)) expect(lines[b - 1]).toBe('---');
		// Two in the front matter, two in the fence, one under a line of text: none splits a slide.
		expect(dashes.filter((d) => !breakLines(model).includes(d))).toHaveLength(5);
		expect(views[1].directives).toBe(1);
		expect(views[2].fences).toBe(1);
		expect(views[0].sep).toBeNull();
		expect(views[1].sep).toBe(breakLines(model)[0]);
		// Editor lines: the first slide opens on the line after the front matter's blank line.
		expect(lines[(views[0].from as number) - 1]).toBe('');
		expect(lines[(views[4].to as number) - 1]).toBe('2. Close the audit');
	});

	it('re-reads only the slide an edit touches, and reuses every other one', () => {
		const prev = build(SAMPLE);
		const next = insert(SAMPLE, titleEnd(prev, 2), ' again');
		expect(next).toContain('## A fence keeps its dashes again\n');
		const r = step(prev, next);
		expect(r.full).toBe(false);
		expect(r.reread).toEqual([2]);
		expect(r.rereadLines).toBeGreaterThan(0);
		expect(r.rereadLines).toBeLessThan(prev.lines / 3);
		// The spliced model answers as a parse from nothing does.
		const fresh = build(next);
		expect(Array.from(r.model.boundaries)).toEqual(Array.from(fresh.boundaries));
		expect(slideViews(r.model)).toEqual(slideViews(fresh));
	});

	it('re-reads two slides when an edit splits one, and the whole deck when the front matter changes', () => {
		const prev = build(SAMPLE);
		const split = step(prev, insert(SAMPLE, slideEnd(prev, 1), '\n\n---\n\n## A new slide'));
		expect(split.full).toBe(false);
		expect(split.reread).toEqual([1, 2]);
		expect(slideViews(split.model)).toHaveLength(6);
		expect(slideViews(split.model)).toEqual(slideViews(build(split.model.source)));

		const fm = step(prev, SAMPLE.replace('paginate: true', 'paginate: false'));
		expect(fm.full).toBe(true);
		expect(fm.reread).toEqual([0, 1, 2, 3, 4]);
		expect(fm.rereadLines).toBe(prev.lines);
	});

	it('reads nothing again when the text did not change', () => {
		const prev = build(SAMPLE);
		const r = step(prev, SAMPLE);
		expect(r.model).toBe(prev);
		expect(r.rereadLines).toBe(0);
		expect(r.reread).toEqual([]);
	});
});
