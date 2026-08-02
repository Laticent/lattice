import { describe, expect, it } from 'vitest';
import { slideEditableOffset, slideStartOffset } from './lint';

// #1288 / #1291 — picking a slide in the preview parks the caret in the editor. It
// must land somewhere worth typing: a slide opens with machinery (`<!-- _class -->`
// and friends) and a first keystroke inside a directive comment corrupts it.
describe('slideEditableOffset — where the caret lands on a slide jump', () => {
	const at = (src: string, i: number) => src.slice(slideEditableOffset(src, i)).split('\n')[0];

	it('skips the _class directive to the first line of real content', () => {
		const src = '<!-- _class: kpi -->\n\n# The number\n\nbody';
		expect(at(src, 0)).toBe('# The number');
	});

	it('skips a run of directives and the blank lines between them', () => {
		const src = '<!-- _class: title -->\n<!-- _footer: ACME -->\n\n\n# Hello\n';
		expect(at(src, 0)).toBe('# Hello');
	});

	it('lands on an eyebrow when the eyebrow is what opens the slide', () => {
		const src = '<!-- _class: content -->\n\n`Q4 · FINANCE`\n\n## Where the leverage is\n';
		expect(at(src, 0)).toBe('`Q4 · FINANCE`');
	});

	it('finds the right slide in a multi-slide deck', () => {
		const src = '<!-- _class: title -->\n\n# One\n\n---\n\n<!-- _class: quote -->\n\n> Two\n';
		expect(at(src, 1)).toBe('> Two');
	});

	it('respects front matter — slide 0 is the first slide, not the YAML', () => {
		const src = '---\ntheme: cuoio\n---\n\n<!-- _class: title -->\n\n# One\n';
		expect(at(src, 0)).toBe('# One');
	});

	// A multi-line HTML comment is an authored note, not machinery — the rule keys on
	// a comment that opens AND closes on its own line, so a note stays a landing spot.
	it('treats a multi-line comment as content, not a directive', () => {
		const src = '<!-- _class: content -->\n\n<!-- a speaker note\n   over two lines -->\n\n# Later\n';
		expect(at(src, 0)).toBe('<!-- a speaker note');
	});

	it('falls back to the slide start when a slide is nothing but directives', () => {
		const src = '<!-- _class: divider -->\n';
		expect(slideEditableOffset(src, 0)).toBe(slideStartOffset(src, 0));
	});

	it('never returns an offset outside the slide it was asked for', () => {
		const src = '<!-- _class: title -->\n\n# One\n\n---\n\n<!-- _class: content -->\n\n# Two\n';
		const s1 = slideStartOffset(src, 1);
		expect(slideEditableOffset(src, 1)).toBeGreaterThanOrEqual(s1);
		expect(slideEditableOffset(src, 0)).toBeLessThan(s1);
	});
});
