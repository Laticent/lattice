// @vitest-environment node
import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import { codeSpanRanges, decksUsingOutsideCode, renameAssetRefsOutsideCode, usesAssetOutsideCode } from './asset-refs';

const R = (s: string) => renameAssetRefsOutsideCode(s, 'hero', 'cover');

// THE ORACLE. The renderer decides what is a reference: markdown-it, configured as the engine configures it (lib/engine/index.js).
// For a deck, every image the renderer shows from `asset:hero` must come back from the rewrite pointing at `asset:cover`, and every
// OTHER `asset:hero` in the rendered text (a code sample, a pre block) must be exactly as it was. The shapes below put a rendered
// reference and a sample side by side, so a scanner that reads a block differently from the renderer fails here.
const md = new MarkdownIt('commonmark', { html: true }).enable(['table', 'strikethrough']);
/** Every reference the renderer RESOLVES: an image source, a link target, a CSS url() inside a tag. */
const imageSources = (s: string) => [...md.render(s).matchAll(/(?:\s(?:src|href)="|url\()(asset:[^")]*)/g)].map((m) => m[1]);
/** `asset:hero` as TEXT the reader sees (a code sample, a pre block, a sentence): the rendered page with every tag removed. */
const sampleCount = (s: string) => (md.render(s).replace(/<[^>]*>/g, '').match(/asset:hero/g) ?? []).length;

function agrees(source: string) {
	const out = R(source);
	const before = imageSources(source);
	expect(before.length, 'the shape must hold a rendered reference or the case proves nothing').toBeGreaterThan(0);
	expect(imageSources(out), `rendered references moved\n${JSON.stringify(source)}`).toEqual(before.map((s) => (s === 'asset:hero' ? 'asset:cover' : s)));
	expect(sampleCount(out), `samples untouched\n${JSON.stringify(source)}`).toBe(sampleCount(source));
	expect(usesAssetOutsideCode(source, 'hero'), 'the count agrees with the rewrite').toBe(out !== source);
}

const SHAPES: Record<string, string> = {
	'a plain image': '# T\n\n![](asset:hero)\n',
	'a background image': '<!-- _class: image -->\n\n## T\n\n![bg](asset:hero)\n',
	'an image with a title': '![alt](asset:hero "A title")\n',
	'a reference-style image': '![alt][r]\n\n[r]: asset:hero\n',

	// unmatched backticks must not reach across a block boundary
	'a stray backtick in one paragraph, its partner two paragraphs later': 'Type a ` to start code.\n\n![](asset:hero)\n\nAnd another ` here.\n',
	'a stray backtick in each of several list items': '- Press ` to start\n- ![](asset:hero)\n- end ` here\n',
	'a heading ends an inline code span': '# Use ` key\n![](asset:hero) and ` more\n',
	'a quote ends an inline code span': '> a ` b\n\n![](asset:hero)\n\n> c ` d\n',
	'a rule ends an inline code span': 'x `\n***\n![](asset:hero) `\n',
	'a table row ends an inline code span': '| `a | b |\n|---|---|\n| ![](asset:hero) | x |\n| c | ` |\n',
	'a setext heading ends an inline code span': 'Title `x\n===\n![](asset:hero) `\n',
	'a code span across the lines of one quote paragraph': '> a ` b\n> ![](asset:hero) `\n\n![](asset:hero)\n',

	// code the renderer does not draw as a picture
	'a backtick fence with a sample': '![](asset:hero)\n\n```md\n![](asset:hero)\n```\n',
	'a tilde fence closed by a longer one': '![](asset:hero)\n\n~~~\n![](asset:hero)\n~~~~\n\n![](asset:hero)\n',
	'a fence that never closes': '![](asset:hero)\n\n```\n![](asset:hero)\n',
	'a fence in a list item': '- item\n\n  ```\n  ![](asset:hero)\n  ```\n\n![](asset:hero)\n',
	'a fence in a list item that ends with the item': '- item\n  ```\n  asset:hero\n\nNext para ![](asset:hero)\n',
	'a fence indented two spaces with an unindented line inside': '![](asset:hero)\n\n  ```\n  code\nasset:hero\n  ```\n',
	'a fence in a numbered item with a short line': '![](asset:hero)\n\n10. a\n\n    ```\n    asset:hero\n   asset:hero\n    ```\n',
	'an indented fence line after paragraph text is text': 'Some text\n    ```\n![](asset:hero)\n',
	'an indented code block': '![](asset:hero)\n\nPara\n\n    ![](asset:hero)\n',
	'a tab-indented code block': '![](asset:hero)\n\nPara\n\n\t![](asset:hero)\n',
	'an indented paragraph in a list is not code': '- item\n\n    ![](asset:hero)\n',
	'a heading right after a list ends the list': '![](asset:hero)\n\n- a\n# H\n\n    asset:hero\n',
	'a pre block with blank lines inside': '![](asset:hero)\n\n<pre>\nline\n\nasset:hero\n\n</pre>\n',
	'a script block': '![](asset:hero)\n\n<script>\nvar a = "asset:hero"\n</script>\n',
	'a style block': '![](asset:hero)\n\n<style>\n/* asset:hero */\n</style>\n',
	'a pre block that never closes': '![](asset:hero)\n\n<pre> never closed\nasset:hero\n',
	'an inline code tag still renders markdown': 'See <code>![](asset:hero)</code> here\n',
	'a pre tag in mid sentence still renders markdown': 'Text <pre>![](asset:hero)</pre> more\n',
	'a raw img tag is a reference': '<img src="asset:hero" alt="x">\n',
	'a raw img tag beside a pre sample': '<img src="asset:hero" alt="x">\n\n<pre>\nasset:hero\n</pre>\n',
	'inline code, double backticks and a reference': 'Write `asset:hero` or ``a `asset:hero` b`` then ![](asset:hero)\n',
	'an escaped backtick opens nothing': 'a \\` b ![](asset:hero) c ` d `asset:hero` e\n',
	'an unmatched backtick is text': 'a ` b ![](asset:hero)\n',
	'a bare mention in prose is a mention, not a picture': 'Write asset:hero to use it.\n\n![](asset:hero)\n',
	'a bare mention in a list item and a heading': '# About asset:hero\n\n- say asset:hero here\n- ![](asset:hero)\n',
	'a link destination': '[download](asset:hero) and ![](asset:hero)\n',
	'a css url in a tag': '<div style="background:url(asset:hero)"></div>\n\n![](asset:hero)\n',
};

describe('the rewrite agrees with the renderer on every deck shape', () => {
	for (const [name, source] of Object.entries(SHAPES)) {
		it(name, () => agrees(source));
	}

	it('the same holds with Windows line endings', () => {
		for (const [name, source] of Object.entries(SHAPES)) {
			const crlf = source.replace(/\n/g, '\r\n');
			const out = R(crlf);
			expect(imageSources(out), name).toEqual(imageSources(crlf).map((s) => (s === 'asset:hero' ? 'asset:cover' : s)));
			expect(sampleCount(out), name).toBe(sampleCount(crlf));
		}
	});
});

describe('what is not an image', () => {
	it('rewrites a front-matter value and leaves the body to the parser', () => {
		expect(R('---\nlogo: asset:hero\ntitle: x\n---\n\n![](asset:hero)\n')).toBe('---\nlogo: asset:cover\ntitle: x\n---\n\n![](asset:cover)\n');
	});

	it('is case-insensitive, like the grammar, and whole-name only', () => {
		expect(R('![](asset:Hero) ![](asset:hero-2) ![](asset:hero_b) ![](asset:heroes)')).toBe('![](asset:cover) ![](asset:hero-2) ![](asset:hero_b) ![](asset:heroes)');
	});

	it('does not touch a name that is not a valid reference', () => {
		expect(R('![](asset:hero.jpg)')).toBe('![](asset:hero.jpg)');
		expect(R('Sentence ends with ![](asset:hero).')).toBe('Sentence ends with ![](asset:cover).');
	});

	it('returns a source with no asset reference unchanged', () => {
		const md2 = 'plain\n\n```\ncode\n```\n';
		expect(R(md2)).toBe(md2);
	});

	it('never loses a character', () => {
		const messy = '  ```\r\nx\r\n  ```\n![](asset:hero) \n| a |\n|---|\n| ![](asset:hero) |\n';
		expect(R(messy).replaceAll('cover', 'hero')).toBe(messy);
	});

	it('counts what renders, and the count is exactly the decks the rewrite would change', () => {
		const sources = ['![](asset:hero)', '`asset:hero` only in code', '```\nasset:hero\n```', 'no photos', '![](asset:hero-2)', '![](asset:HERO)'];
		expect(decksUsingOutsideCode('hero', sources)).toBe(2);
		for (const s of sources) expect(usesAssetOutsideCode(s, 'hero')).toBe(R(s) !== s);
	});
});

describe('inline code spans', () => {
	it('closes a run at the next run of exactly its length', () => {
		expect(codeSpanRanges('a `b` c')).toEqual([[2, 5]]);
		expect(codeSpanRanges('a ``b ` c`` d')).toEqual([[2, 11]]);
		expect(codeSpanRanges('a ``b` c')).toEqual([]);
		expect(codeSpanRanges('`a` and `b`')).toEqual([
			[0, 3],
			[8, 11],
		]);
	});

	it('treats an unmatched run as text and an escaped opener as text', () => {
		expect(codeSpanRanges('a ` b')).toEqual([]);
		expect(codeSpanRanges('a \\` b `c`')).toEqual([[7, 10]]);
		expect(codeSpanRanges('a \\\\` b `')).toEqual([[4, 9]]);
	});
});

describe('hostile and very large decks', () => {
	it('survives a block of a hundred and fifty thousand lines with no blank line, in reasonable time', () => {
		const deck = `${'| a | b |\n'.repeat(150_000)}![](asset:hero)\n`;
		const start = performance.now();
		const out = R(deck);
		expect(out.endsWith('![](asset:cover)\n')).toBe(true);
		expect(performance.now() - start).toBeLessThan(8000);
	});

	it('handles pathological backtick and fence patterns in time proportional to their size', () => {
		const N = 80_000;
		const cases = ['`a``b```c````d'.repeat(Math.floor(N / 14)), '- ```\n'.repeat(N / 6), '<pre'.repeat(N / 4), '![](asset:hero) `'.repeat(N / 17), '\n\n    x'.repeat(N / 8), '`'.repeat(N)];
		for (const c of cases) {
			const start = performance.now();
			R(c);
			decksUsingOutsideCode('hero', [c]);
			expect(performance.now() - start, c.slice(0, 16)).toBeLessThan(4000);
		}
	});
});
