import { describe, expect, it } from 'vitest';
import { rebase } from './live-controller';
import { applyOnto } from './text-rebase';

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

// Compose merges its edit onto a co-editor's change held during an IME composition (ComposeView.tsx `liveHoldRef`).
describe('applyOnto', () => {
	it('keeps the held change and carries the composed text, in either order on the page', () => {
		const base = '# A\n\nBody one.\n\n---\n\nBody three.\n';
		const held = '# A\n\nBody one.\n\n---\n\nBody three. HOST\n';
		expect(applyOnto(base, '# A\n\nBody one.にほん\n\n---\n\nBody three.\n', held)).toBe('# A\n\nBody one.にほん\n\n---\n\nBody three. HOST\n');
		const held2 = '# A HOST\n\nBody one.\n\n---\n\nBody three.\n';
		expect(applyOnto(base, '# A\n\nBody one.\n\n---\n\nBody three.に\n', held2)).toBe('# A HOST\n\nBody one.\n\n---\n\nBody three.に\n');
	});
	it('refuses an edit whose surrounding text the co-editor removed', () => {
		expect(applyOnto('one two three', 'one TWO three', 'one three')).toBeNull();
	});
});

describe('applyOnto, by brute force', () => {
	// Two writers each change one span of a short text, in every arrangement with untouched text between them: the merge
	// keeps both changes. The letters are distinct, so each edit's span is exactly where it was made.
	it('keeps both changes whenever untouched text separates them', () => {
		const base = 'abcdefgh';
		type Edit = [number, number, string];
		const edits = (ins: string): Edit[] => {
			const out: Edit[] = [];
			for (let a = 0; a <= base.length; a++) for (let b = a; b <= base.length; b++) for (const i of ['', ins]) if (b > a || i) out.push([a, b, i]);
			return out;
		};
		const apply = (t: string, [a, b, i]: Edit) => t.slice(0, a) + i + t.slice(b);
		let checked = 0;
		for (const ours of edits('XY'))
			for (const theirs of edits('zw')) {
				if (!(ours[1] < theirs[0] || theirs[1] < ours[0])) continue;
				// Applied right to left, so the left edit's positions still hold.
				const want = ours[0] > theirs[0] ? apply(apply(base, ours), theirs) : apply(apply(base, theirs), ours);
				expect(applyOnto(base, apply(base, ours), apply(base, theirs)), `${ours} onto ${theirs}`).toBe(want);
				checked++;
			}
		expect(checked).toBeGreaterThan(500);
	});
});
