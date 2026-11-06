import { describe, expect, it } from 'vitest';
import { slideSourceHidden } from '../../../../lib/diagnostics/slice-equivalence-core.mjs';
import { isHiddenAt, setHiddenAt, withHidden } from './deck-ops';

const deck = '---\ntheme: indaco\n---\n\n# One\n\n---\n\n# Two\n\nBody.\n\n---\n\n# Three\n';

describe('hide / show a slide (2026-11-06-hidden-slides.md)', () => {
	it('Hide writes `<!-- hide -->` on the slide and touches nothing else', () => {
		const r = setHiddenAt(deck, { unit: 1, part: 0 }, true);
		expect(r.source).toBe('---\ntheme: indaco\n---\n\n# One\n\n---\n\n<!-- hide -->\n# Two\n\nBody.\n\n---\n\n# Three\n');
		expect(isHiddenAt(r.source, { unit: 1, part: 0 })).toBe(true);
		expect(isHiddenAt(r.source, { unit: 0, part: 0 })).toBe(false);
		expect(r.active).toBe(1);
	});

	it('Show removes it, byte for byte back to the original', () => {
		const hidden = setHiddenAt(deck, { unit: 1, part: 0 }, true).source;
		expect(setHiddenAt(hidden, { unit: 1, part: 0 }, false).source).toBe(deck);
	});

	it('Show removes every hide line, either spelling', () => {
		const out = withHidden('<!-- _hide: true -->\n<!-- _class: content -->\n<!-- hide -->\n# Two', false);
		expect(out).toBe('<!-- _class: content -->\n# Two');
		expect(slideSourceHidden(out)).toBe(false);
	});

	it('a hide shown in a code sample is not a directive and survives Show', () => {
		const sample = '# Teaching\n\n```md\n<!-- hide -->\n```';
		expect(slideSourceHidden(sample)).toBe(false);
		expect(withHidden(sample, false)).toBe(sample);
		const hidden = withHidden(sample, true);
		expect(slideSourceHidden(hidden)).toBe(true);
		expect(withHidden(hidden, false)).toBe(sample);
	});

	it('a no-op when the slide is already in that state', () => {
		expect(setHiddenAt(deck, { unit: 0, part: 0 }, false).source).toBe(deck);
	});

	it('under split: headings, Hide on a part hides its whole `---` block, without cutting it', () => {
		const split = '---\nsplit: headings\n---\n\n## A\n\n---\n\n## B1\n\nb\n\n## B2\n\nb2\n';
		const r = setHiddenAt(split, { unit: 1, part: 1 }, true);
		expect(r.source).toBe('---\nsplit: headings\n---\n\n## A\n\n---\n\n<!-- hide -->\n## B1\n\nb\n\n## B2\n\nb2\n');
		expect(isHiddenAt(r.source, { unit: 1, part: 0 })).toBe(true);
		expect(isHiddenAt(r.source, { unit: 1, part: 1 })).toBe(true);
		expect(setHiddenAt(r.source, { unit: 1, part: 1 }, false).source).toBe(split);
	});

	it('a `hide:` note survives Hide then Show, and a hide in indented code is left alone', () => {
		const note = '<!-- hide: if short on time -->\n## A';
		const hidden = withHidden(note, true);
		expect(slideSourceHidden(hidden)).toBe(true);
		expect(withHidden(hidden, false)).toBe(note);
		const code = '## A\n\n    <!-- hide -->';
		expect(withHidden(withHidden(code, true), false)).toBe(code);
	});

	it('Hide wins over an older `_hide: false` on the slide', () => {
		const shown = '## A\n\nbody\n\n<!-- _hide: false -->';
		const hidden = withHidden(shown, true);
		expect(slideSourceHidden(hidden)).toBe(true);
		expect(hidden).toBe('<!-- hide -->\n## A\n\nbody');
	});

	it('a hide comment that is not top level (a list item, an HTML block) is the author\'s, kept by Hide and Show', () => {
		const list = '- item\n  <!-- hide -->\n\nbody';
		expect(withHidden(list, true)).toBe(`<!-- hide -->\n${list}`);
		expect(withHidden(withHidden(list, true), false)).toBe(list);
		const block = '## A\n\n<div>\n<!-- hide -->\n</div>';
		expect(withHidden(withHidden(block, true), false)).toBe(block);
	});

	it('removing a hide line in the middle of a slide leaves no extra blank line', () => {
		const mid = '## A\n\n<!-- _hide: false -->\n\nbody';
		const hidden = withHidden(mid, true);
		expect(hidden).toBe('<!-- hide -->\n## A\n\nbody');
		expect(withHidden(hidden, false)).toBe('## A\n\nbody');
	});
});
