// #1958 — CodeQL js/incomplete-sanitization on `quoteIfNeeded`. It escaped `"` but not `\`, so
// a value ending in a backslash swallowed its own closing quote. The written scalar must read
// back as the value it was given, both through the panel's own reader and through the engine's.
import { describe, expect, it } from 'vitest';
import { frontMatterScalar } from '../../../lib/core/front-matter-key.js';
import { readFrontMatter, writeFrontMatter } from './deck-config.js';

const SRC = '---\ntheme: indaco\n---\n\n# Deck\n';
const written = (v: string) => /^header: (.*)$/m.exec(writeFrontMatter(SRC, 'header', v))?.[1] ?? '';

describe('front-matter quoting round-trips a value through both readers', () => {
	for (const v of ['C:\\deck: q3\\', 'say "hi": now', 'a\\"b: c', 'plain: value', '#tag', "Q3's C:\\drive: plan", "it's: fine"]) {
		it(JSON.stringify(v), () => {
			expect(frontMatterScalar(written(v))).toBe(v);
			expect(readFrontMatter(writeFrontMatter(SRC, 'header', v)).header).toBe(v);
		});
	}
	// The red team on the first cut: a value holding `'` and `\` took the escaping branch, the
	// engine read the doubled backslash, and every later panel edit doubled it again.
	it('a value with an apostrophe and a backslash is stable across repeated edits', () => {
		let src = writeFrontMatter(SRC, 'header', "Q3's C:\\drive: plan");
		for (let i = 0; i < 3; i++) src = writeFrontMatter(src, 'paginate', i % 2 ? 'true' : 'false');
		expect(readFrontMatter(src).header).toBe("Q3's C:\\drive: plan");
	});
	// CodeQL on PR 2910: the last branch escaped `"` but not `\`, so `it's C:\` still ended in `\"`.
	it('a value with an apostrophe and a trailing backslash cannot swallow the next key', () => {
		for (const v of ["it's C:\\", 'it\'s "q": x\\']) {
			const src = writeFrontMatter(writeFrontMatter(SRC, 'header', v), 'footer', 'next: key');
			expect(readFrontMatter(src).footer).toBe('next: key');
			const line = /^header: (.*)$/m.exec(src)?.[1] ?? '';
			expect(line.endsWith('"') && !line.endsWith('\\"') || line.endsWith('\\\\"')).toBe(true);
		}
	});
	// The checker on the second cut: a value holding both quote marks took the escaping branch,
	// neither reader undid it, and every unrelated panel edit escaped the escapes again.
	it('values holding both quote marks are stable across repeated panel edits', () => {
		for (const v of ['Acme\'s "Q3": plan', 'a\'b:"c', "it's C:\\", "it's a\\\\b: x"]) {
			let src = writeFrontMatter(SRC, 'header', v);
			const first = src;
			for (let i = 0; i < 3; i++) src = writeFrontMatter(src, 'paginate', i % 2 ? 'true' : 'false');
			expect(readFrontMatter(src).header).toBe(v);
			expect(/^header: .*$/m.exec(src)?.[0]).toBe(/^header: .*$/m.exec(first)?.[0]);
		}
	});
	it('an ordinary value is written exactly as before', () => {
		expect(written('Q3: review')).toBe('"Q3: review"');
	});
});
