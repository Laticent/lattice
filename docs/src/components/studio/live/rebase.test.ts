import { describe, expect, it } from 'vitest';
import { rebase } from './live-controller';

// `rebase` places an outside write (Compose, AI apply, settings) onto a shared text that may have
// moved on since the writer read it. Applying its result to `cur` must keep the remote change AND
// carry the local one.
const apply = (cur: string, e: { from: number; to: number; insert: string } | null) => {
	if (!e) throw new Error('refused');
	return cur.slice(0, e.from) + e.insert + cur.slice(e.to);
};

describe('rebase', () => {
	it('is a plain diff when nothing moved', () => {
		const base = '# Title\n\nbody\n';
		const next = '# Title\n\nnew body\n';
		expect(apply(base, rebase(base, next, base))).toBe(next);
	});

	it('keeps a remote insert that landed BEFORE the local change', () => {
		const base = '# Title\n\nbody one\n\nbody two\n';
		const next = '# Title\n\nbody one\n\nbody TWO\n';
		const cur = '<!-- remote -->\n# Title\n\nbody one\n\nbody two\n';
		expect(apply(cur, rebase(base, next, cur))).toBe('<!-- remote -->\n# Title\n\nbody one\n\nbody TWO\n');
	});

	it('keeps a remote insert that landed AFTER the local change', () => {
		const base = 'alpha\nbeta\ngamma\n';
		const next = 'ALPHA\nbeta\ngamma\n';
		const cur = 'alpha\nbeta\ngamma\nremote\n';
		expect(apply(cur, rebase(base, next, cur))).toBe('ALPHA\nbeta\ngamma\nremote\n');
	});

	it('picks the occurrence nearest the original spot when the surroundings repeat', () => {
		const block = '---\n\n## Slide\n\ntext\n';
		const base = block + block;
		const next = `${block}---\n\n## Slide\n\nTEXT\n`;
		const cur = `remote\n${block}${block}`;
		expect(apply(cur, rebase(base, next, cur))).toBe(`remote\n${block}---\n\n## Slide\n\nTEXT\n`);
	});

	it('refuses a replacement whose surroundings are gone, rather than doubling the text (inversion 3)', () => {
		// An AI rewrite of most of the deck while someone else typed inside the same range.
		const base = 'slide one\n\nslide two\n\nslide three\n';
		const next = 'REWRITTEN DECK\n';
		const cur = 'slide one — edited by Amina\n\nslide two\n\nslide three\n';
		expect(rebase(base, next, cur)).toBeNull();
	});

	it('still lands a pure insertion whose surroundings are gone', () => {
		const base = 'one two three';
		const next = 'one two three four';
		const cur = 'completely different';
		const out = apply(cur, rebase(base, next, cur));
		// Nothing deleted: every character of `cur` survives, plus the insertion.
		expect(out.length).toBe(cur.length + ' four'.length);
		expect(out.replace(' four', '')).toBe(cur);
	});
});
