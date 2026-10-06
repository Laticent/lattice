import { describe, expect, it } from 'vitest';
import { rebase } from './use-live-session';

// `rebase` places an outside write (Compose, AI apply, settings) onto a shared text that may have
// moved on since the writer read it. Applying its result to `cur` must keep the remote change AND
// carry the local one.
const apply = (cur: string, e: { from: number; to: number; insert: string }) => cur.slice(0, e.from) + e.insert + cur.slice(e.to);

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

	it('never deletes text it did not see when its surroundings are gone', () => {
		const base = 'one two three';
		const next = 'one 2 three';
		const cur = 'completely different';
		const out = apply(cur, rebase(base, next, cur));
		expect(out).toContain('completely different'.slice(0, 4));
		expect(out.length).toBeGreaterThanOrEqual(cur.length);
	});
});
