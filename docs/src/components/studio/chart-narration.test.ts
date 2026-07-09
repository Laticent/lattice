import { describe, expect, it } from 'vitest';
import { narrateChart, narrateFunnel } from './chart-narration';

// narrateFunnel speaks the funnel's stage values AND the stage-to-stage conversion
// rate — the number funnel.transform.js computes at render time and burns into SVG
// text, which never exists in the raw slide Markdown slideToSpeech reads.
describe('narrateFunnel', () => {
	const skeleton = [
		'<!-- _class: funnel -->',
		'',
		'## Where the flow drops off.',
		'',
		'- Visitors `12,000`',
		'- Signups `4,800`',
		'- Activated `2,160`',
	].join('\n');

	it('returns null for a non-funnel slide', () => {
		expect(narrateFunnel('<!-- _class: kpi -->\n\n## Revenue\n\n- A `1`\n- B `2`')).toBeNull();
	});

	it('returns null with fewer than two stages (mirrors the transform bailout)', () => {
		expect(narrateFunnel('<!-- _class: funnel -->\n\n## One stage\n\n- Visitors `12,000`')).toBeNull();
	});

	it('speaks the heading, each stage value, and the computed conversion %', () => {
		const out = narrateFunnel(skeleton);
		expect(out).toContain('Where the flow drops off.');
		expect(out).toContain('Visitors: twelve thousand.');
		// 4,800 / 12,000 = 40% — computed here, never authored on the slide.
		expect(out).toContain('Signups: four thousand eight hundred, forty percent of the prior stage.');
		// 2,160 / 4,800 = 45%
		expect(out).toContain('Activated: two thousand one hundred sixty, forty-five percent of the prior stage.');
	});

	it('ignores an indented detail sublist line (not itself a stage)', () => {
		const md = [
			'<!-- _class: funnel -->',
			'',
			'## Stages.',
			'',
			'- Visitors `12,000`',
			'  - Two-thirds arrive from inbound',
			'- Signups `4,800`',
		].join('\n');
		const out = narrateFunnel(md);
		expect(out).not.toContain('inbound');
		expect(out).toContain('Signups: four thousand eight hundred, forty percent of the prior stage.');
	});

	it('skips a fenced code block that happens to contain stage-like syntax', () => {
		const md = [
			'<!-- _class: funnel -->',
			'',
			'## Stages.',
			'',
			'```',
			'- Fake `999`',
			'```',
			'',
			'- Visitors `12,000`',
			'- Signups `4,800`',
		].join('\n');
		const out = narrateFunnel(md);
		expect(out).not.toContain('Fake');
	});

	it('recognizes a funnel slide combined with a base modifier', () => {
		// lib/base/base.docs.md — `funnel dark` / `funnel compact` / `funnel accent`
		// are real, shipping combinations (funnel.gallery.md); a bare `funnel`
		// string match misses all three.
		for (const cls of ['funnel dark', 'funnel compact', 'funnel accent']) {
			const md = `<!-- _class: ${cls} -->\n\n## Stages.\n\n- A \`100\`\n- B \`50\``;
			expect(narrateFunnel(md), cls).toContain('fifty percent');
		}
	});

	it('does not mistake a substring class for funnel', () => {
		expect(narrateFunnel('<!-- _class: funnel-detail -->\n\n## Stages.\n\n- A `100`\n- B `50`')).toBeNull();
	});

	it('ignores a heading inside a fenced code block', () => {
		const md = [
			'<!-- _class: funnel -->',
			'',
			'```',
			'## Not the real heading',
			'```',
			'',
			'## The real heading.',
			'',
			'- Visitors `100`',
			'- Signups `50`',
		].join('\n');
		const out = narrateFunnel(md);
		expect(out).toContain('The real heading.');
		expect(out).not.toContain('Not the real heading');
	});

	it('ignores a fenced _class: funnel directive shown as a doc example', () => {
		const md = [
			'<!-- _class: kpi -->',
			'',
			'## How to author a funnel',
			'',
			'```',
			'<!-- _class: funnel -->',
			'- A `100`',
			'- B `50`',
			'```',
			'',
			'- Not `1`',
			'- Stages `2`',
		].join('\n');
		expect(narrateFunnel(md)).toBeNull();
	});

	it('strips a Markdown link label from a stage name', () => {
		const md = '<!-- _class: funnel -->\n\n## Stages.\n\n- [Visitors](https://x.example/report) `100`\n- Signups `50`';
		const out = narrateFunnel(md);
		expect(out).toContain('Visitors: one hundred');
		expect(out).not.toContain('https://x.example');
		expect(out).not.toContain('[');
	});
});

describe('narrateChart', () => {
	it('recognizes a funnel slide', () => {
		expect(narrateChart('<!-- _class: funnel -->\n\n## Stages.\n\n- A `100`\n- B `50`')).toContain('fifty percent');
	});

	it('returns null for a slide no pilot narrator recognizes', () => {
		expect(narrateChart('<!-- _class: kpi -->\n\n## Revenue\n\nWe grew.')).toBeNull();
	});
});
