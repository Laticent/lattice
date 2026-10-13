// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { type ChatSegment, clampStreaming, escapeHtml, renderMessageSegments, renderMessageSegmentsStreaming, renderProse } from './chat-markdown';

const html = (segs: ChatSegment[]) => segs.filter((s) => s.type === 'html').map((s) => (s as { html: string }).html).join('');
const codes = (segs: ChatSegment[]) => segs.filter((s) => s.type === 'code') as { type: 'code'; lang: string; code: string }[];

describe('escape-first XSS safety', () => {
	it('escapes model HTML in prose (no live tag can execute)', () => {
		const out = renderProse('hello <img src=x onerror=alert(1)> world');
		expect(out).not.toContain('<img');
		expect(out).toContain('&lt;img');
	});
	it('rejects javascript:/data: link schemes (no anchor emitted), allows http', () => {
		const out = renderProse('[click](javascript:alert(1)) and [ok](https://x.com)');
		// The unsafe link never becomes a clickable anchor — it stays inert text.
		expect(out).not.toContain('href="javascript:');
		expect(out).not.toContain('<a href="javascript');
		expect(out).toContain('href="https://x.com"');
	});
	it('inline code with digits does not corrupt surrounding numbers', () => {
		// A bare-number placeholder would have turned "2024" into a <code> — regression guard.
		const out = renderProse('In 2024 we shipped `v2` to 100 users');
		expect(out).toContain('In 2024 we shipped');
		expect(out).toContain('<code>v2</code>');
		expect(out).toContain('to 100 users');
	});
	it('bold and italic render', () => {
		expect(renderProse('**b** and *i*')).toContain('<strong>b</strong>');
		expect(renderProse('**b** and *i*')).toContain('<em>i</em>');
	});
});

describe('code segments (never HTML — the Copy button + highlighter own them)', () => {
	it('splits a reply into prose + code segments', () => {
		const segs = renderMessageSegments('Here is code:\n~~~js\nconst a = 1;\n~~~\nDone.');
		expect(segs.map((s) => s.type)).toEqual(['html', 'code', 'html']);
		expect(codes(segs)[0].code).toBe('const a = 1;');
		expect(codes(segs)[0].lang).toBe('js');
	});
	it('code body is returned RAW (XSS payload stays inert text, not HTML)', () => {
		const segs = renderMessageSegments('~~~html\n<img src=x onerror=alert(1)>\n~~~');
		expect(codes(segs)[0].code).toBe('<img src=x onerror=alert(1)>');
		expect(html(segs)).not.toContain('<img'); // it never enters the prose HTML path
	});
	it('~~~ fence lets ``` appear literally inside (the author’s convention)', () => {
		const segs = renderMessageSegments('~~~md\n```chart\npie\n```\n~~~');
		expect(codes(segs)).toHaveLength(1);
		expect(codes(segs)[0].code).toBe('```chart\npie\n```');
	});
	it('drops the four-backtick lattice-edit protocol block (it becomes a diff card)', () => {
		const segs = renderMessageSegments('Proposed:\n````lattice-edit slide=3\n<!-- _class: cards -->\n## H\n````\nReview below.');
		expect(codes(segs)).toHaveLength(0);
		expect(html(segs)).toContain('Proposed');
		expect(html(segs)).toContain('Review below');
	});
	it('language label is escaped', () => {
		const segs = renderMessageSegments('~~~<script>\nx\n~~~');
		expect(codes(segs)[0].lang).not.toContain('<script>');
	});
});

describe('streaming clamp (no flicker on incomplete constructs)', () => {
	it('holds an unclosed ``` fence', () => {
		expect(clampStreaming('text\n```js\nconst a =')).toBe('text');
	});
	it('holds an unclosed ~~~ fence', () => {
		expect(clampStreaming('text\n~~~js\nconst a =')).toBe('text');
	});
	it('a ``` line inside an open ~~~ block does not prematurely balance it', () => {
		// Only the ~~~ opener is open; the inner ``` must not be treated as its close.
		expect(clampStreaming('~~~md\n```\ninner')).toBe('');
	});
	it('holds an unterminated four-backtick lattice-edit block mid-stream', () => {
		const buf = 'Here:\n````lattice-edit slide=1\n<!-- _class: title -->';
		expect(clampStreaming(buf)).toBe('Here:');
		expect(codes(renderMessageSegmentsStreaming(buf))).toHaveLength(0);
	});
	it('trims a half-typed inline code span', () => {
		expect(clampStreaming('use the `foo')).toBe('use the ');
	});
	it('trims a half-typed link', () => {
		expect(clampStreaming('see [label](http')).toBe('see ');
	});
	it('a closed fence renders fully', () => {
		const segs = renderMessageSegmentsStreaming('~~~js\nconst a = 1;\n~~~');
		expect(codes(segs)[0].code).toBe('const a = 1;');
	});
});

describe('escapeHtml', () => {
	it('escapes the five dangerous chars', () => {
		expect(escapeHtml('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;');
	});
});

describe('numbered lists keep their numbers', () => {
	it('one list across blank lines — the screenshot shape, where every item read "1."', () => {
		const out = renderProse('1. **The ask has no priority.** Slide 40 lists four things.\n\n1. **The ending says the same thing four times.** Slides 40, 51.\n\n1. **The opening is four slides on one idea.** Slides 3 to 6.');
		expect(out.match(/<ol/g)).toHaveLength(1);
		expect(out.match(/<li>/g)).toHaveLength(3);
		expect(out).not.toContain('start=');
	});
	it('honors the number a list starts at', () => {
		expect(renderProse('3. third\n4. fourth')).toContain('<ol class="cm-md-list" start="3">');
	});
	it('a list interrupted by a paragraph resumes at its own number', () => {
		const out = renderProse('1. one\n\nA paragraph between.\n\n2. two');
		expect(out.match(/<ol/g)).toHaveLength(2);
		expect(out).toContain('start="2"');
	});
	it('an indented paragraph after a blank line stays inside its item', () => {
		const out = renderProse('1. first\n\n   more about first\n\n2. second');
		expect(out.match(/<ol/g)).toHaveLength(1);
		expect(out).toContain('<div class="cm-md-li-p">more about first</div>');
	});
	it('a lazy continuation line joins its item instead of ending the list', () => {
		const out = renderProse('- alpha\ncontinued\n- beta');
		expect(out.match(/<li>/g)).toHaveLength(2);
		expect(out).toContain('alpha<br>continued');
	});
	it('nests by indent and switches list type at the same level', () => {
		const out = renderProse('- parent\n  - child\n  - child two\n- parent two\n\n1. a\n2. b');
		expect(out).toContain('<li>parent<ul class="cm-md-list"><li>child</li><li>child two</li></ul></li>');
		expect(out.match(/<ol/g)).toHaveLength(1);
	});
});

describe('tables', () => {
	const T = '| Dimension | Score | Why |\n|---|:---:|--:|\n| Argument | 9.5 | The headings carry it. |\n| Voice | 9.8 | Reads as yours. |';
	it('renders a header, alignment and rows', () => {
		const out = renderProse(T);
		expect(out).toContain('<table class="cm-md-table">');
		expect(out).toContain('<th>Dimension</th><th class="cm-al-c">Score</th><th class="cm-al-r">Why</th>');
		expect(out).toContain('<td>Argument</td><td class="cm-al-c">9.5</td><td class="cm-al-r">The headings carry it.</td>');
		expect(out.match(/<tr>/g)).toHaveLength(3);
	});
	it('works without outer pipes, pads short rows and ignores extra cells', () => {
		const out = renderProse('a | b\n--- | ---\n1 |\n2 | 3 | 4');
		expect(out).toContain('<td>1</td><td></td>');
		expect(out).toContain('<td>2</td><td>3</td>');
		expect(out).not.toContain('>4<');
	});
	it('applies inline formatting in cells and keeps an escaped pipe inside its cell', () => {
		const out = renderProse('| a | b |\n|---|---|\n| **bold** `x\\|y` | z |');
		expect(out).toContain('<strong>bold</strong>');
		expect(out).toContain('<code>x|y</code>');
	});
	it('is not fooled by prose that merely contains a pipe', () => {
		expect(renderProse('a | b is not a table\nbecause no separator row follows')).not.toContain('<table');
		expect(renderProse('| a | b |\n| --- |\nrow')).not.toContain('<table'); // cell counts differ
	});
	it('escapes model HTML in cells', () => {
		const out = renderProse('| a |\n|---|\n| <img src=x onerror=alert(1)> |');
		expect(out).not.toContain('<img');
	});
	it('ends at the first non-table line', () => {
		const out = renderProse(`${T}\nAfter the table.`);
		expect(out).toContain('</table></div><p>After the table.</p>');
	});
	it('renders in the streamed path too', () => {
		expect(html(renderMessageSegmentsStreaming(`${T}\n\nDone`))).toContain('<table');
	});
});

describe('quotes and rules', () => {
	it('renders a blockquote with its own blocks', () => {
		const out = renderProse('> quoted **bold**\n> - item');
		expect(out).toContain('<blockquote class="cm-md-quote"><p>quoted <strong>bold</strong></p><ul');
	});
	it('a horizontal rule is not a list item', () => {
		expect(renderProse('above\n\n---\n\nbelow')).toContain('<hr class="cm-md-hr">');
		expect(renderProse('* * *')).toContain('<hr');
	});
});

describe('hostile line endings and nesting (found by the checker pass)', () => {
	it('a list line ending in CR, CRLF, U+2028 or U+2029 renders and returns', () => {
		for (const eol of ['\r', '\r\n', '\u2028', '\u2029']) {
			const out = renderProse(`hello${eol}- a${eol}- b${eol}`);
			expect(out, JSON.stringify(eol)).toContain('<li>a</li><li>b</li>');
			expect(renderProse(`1. x${eol}`)).toContain('<li>x</li>');
			expect(html(renderMessageSegmentsStreaming(`- a${eol}- b`))).toContain('<li>b</li>');
		}
	});
	it('thousands of nested quote markers render as text instead of overflowing the stack', () => {
		const out = renderProse(`${'> '.repeat(5000)}x`);
		expect(out).toContain('x');
		expect((out.match(/<blockquote/g) ?? []).length).toBeLessThanOrEqual(9);
	});
});
