import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { replaceInSlide } from './deck-find';

// THE ESCAPER, CHECKED AGAINST THE ENGINE ITSELF (#3208, the owner on #3318: escape, do not refuse).
//
// deck-find's unit tests check the Markdown it writes. This checks what that Markdown RENDERS to, through
// lib/engine, the renderer the Studio and every export use: the slide must show the replacement as plain
// words, and its HTML structure (the tag sequence) must be the one it had before.

const require = createRequire(import.meta.url);
const engine = require('../../../lib/engine/index.js') as { render: (md: string) => Promise<string | { html: string }> };

async function rendered(slide: string): Promise<{ text: string; tags: string }> {
	const r = await engine.render(`---\ntheme: indaco\n---\n\n${slide}\n`);
	const html = typeof r === 'string' ? r : r.html;
	// The slide's content only, without the escape markers the engine wraps around an escaped character.
	const stage = (/<div class="cell-stage">([\s\S]*?)<\/div><div class="cell-footer">/.exec(html)?.[1] ?? html).replace(/<span data-esc>([\s\S]*?)<\/span>/g, '$1');
	const text = stage
		.replace(/<[^>]+>/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();
	const tags = (stage.match(/<\/?[a-z][a-z0-9-]*/gi) ?? []).join(' ');
	return { text, tags };
}

// [slide, find, replace]: each replacement holds something Markdown would otherwise read as markup.
const CASES: Array<[string, string, string]> = [
	['## Price\n\nIt costs five today', 'five', '$5'],
	['## Price\n\nFrom five to six', 'five', '$5 and $6'],
	['## Price\n\nthe x term', 'x', '$x$'],
	['## Files\n\nsee file now', 'file', 'file_name'],
	['## Files\n\nsee file now', 'file', '_draft_'],
	['## Notes\n\nthe Oct note', 'Oct', 'Q3 [draft]'],
	['## Notes\n\nthe Oct note', 'Oct', '[x](https://evil.test)'],
	['## Stars\n\nsee x here', 'x', 'a *b* c'],
	['## Stars\n\nsee x here', 'x', '**loud**'],
	['## Code\n\nrun x now', 'x', '`npm test`'],
	['## Tags\n\nsee x here', 'x', '<b>bold</b>'],
	['## Tags\n\nsee x here', 'x', '<https://x.test>'],
	['## Ents\n\nsee x here', 'x', '&copy; 2026'],
	['## Strike\n\nsee x here', 'x', '~~gone~~'],
	['## Lines\n\nfive is first', 'five', '# 1'],
	['## Lines\n\nfive is first', 'five', '1. first'],
	['## Lines\n\nfive is first', 'five', '- item'],
	['## Lines\n\nfive is first', 'five', '> quoted'],
	['## Table\n\n| oct | 2 |\n|---|---|\n| a | b |', 'oct', 'x | y'],
	['## Image\n\nsee ![a photo](p.png) here', 'photo', 'shot [1]'],
	['## Bang\n\nsee [x](u) now', 'see ', 'see !'],
	['## Heading x', 'x', '$5 *now*'],
	['- **Oct** sold out', 'Oct', 'Q3 $5'],
	['- x item', 'x', '5. place'],
	['## Ents\n\nAT&amp;T grew', 'AT&T', 'Verizon & co'],
	['## Math\n\n2 * 3 = 6', '2 * 3', '2 * 4'],
];

describe('escaped replacements render as the plain words, with the slide structure unchanged', () => {
	for (const [slide, find, rep] of CASES) {
		it(`${JSON.stringify(find)} → ${JSON.stringify(rep)}`, async () => {
			const r = replaceInSlide(slide, find, rep);
			expect(r.blocked).toBeUndefined();
			expect(r.replaced.length).toBeGreaterThan(0);
			const before = await rendered(slide);
			const after = await rendered(r.text);
			// The words a reader sees are the slide's words with the match swapped for the replacement, verbatim.
			expect(after.text).toBe(before.text.replace(find.trim(), rep.trim()).replace(/\s+/g, ' ').trim());
			expect(after.tags).toBe(before.tags);
		});
	}
});
