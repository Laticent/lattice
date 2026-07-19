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
