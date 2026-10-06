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

	it('refuses an insertion whose surroundings are gone, rather than landing it mid-sentence (red-team round 2)', () => {
		const base = 'Intro paragraph\n\nRevenue line\n';
		const next = 'Intro paragraph\nUp 12% on Q2\n\nRevenue line\n';
		const cur = 'Intro paragraph written by a peer, longer now\n\nRevenue line\n';
		expect(rebase(base, next, cur)).toBeNull();
	});

	it('still lands an insertion whose surroundings survived the remote edit', () => {
		const base = 'alpha\n\nbeta\n\ngamma\n';
		const next = 'alpha\n\nbeta\nNEW\n\ngamma\n';
		const cur = 'remote\nalpha\n\nbeta\n\ngamma\n';
		expect(apply(cur, rebase(base, next, cur))).toBe('remote\nalpha\n\nbeta\nNEW\n\ngamma\n');
	});
});
