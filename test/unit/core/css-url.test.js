/**
 * Unit: the runtime's `url()` reader (lib/core/css-url.js). The old match ended a URL at its first
 * `)` or `'`, and a percent-encoded SVG data URI carries both, so an `image` slide's picture never
 * loaded wherever the runtime measured it (decisions/2026-10-16-player-as-library-audit.md §11.9).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { firstCssUrl } = require('../../../lib/core/css-url');

// An author's own data URI, written by hand: our encoder (lib/core/data-uri.js) escapes `'` and the
// parens now, but a deck can carry any spelling, and the reader must not truncate one.
test('a quoted SVG data URI comes back whole, parens and apostrophes included', () => {
	const svg = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22%3E%3Ccircle fill=%22url(%23glow)%22 class='x'/%3E%3C/svg%3E";
	assert.match(svg, /\(%23glow\)/, 'the fixture carries the paren that broke the old reader');
	assert.equal(firstCssUrl(`url("${svg}")`), svg);
	assert.equal(firstCssUrl(`background-image: url("${svg}"); color: red`), svg);
	assert.notEqual(/url\(\s*['"]?([^'")]+)/i.exec(`url("${svg}")`)[1], svg, 'the old reader truncated it');
});

test('single quotes, bare URLs, escapes and no url at all', () => {
	assert.equal(firstCssUrl("url('a b.png')"), 'a b.png');
	assert.equal(firstCssUrl('url( /img/a.png )'), '/img/a.png');
	assert.equal(firstCssUrl('url("a\\"b.png")'), 'a"b.png');
	assert.equal(firstCssUrl('none'), null);
	assert.equal(firstCssUrl(''), null);
	assert.equal(firstCssUrl(undefined), null);
});

// THE OLD READER, kept here as the oracle: the scan must return what it returned, on every input it could
// match. It is not the shipped code because WebKit's regex engine gives up on its per-character group past
// about a megabyte (decisions/2026-11-03-pictures-at-drawn-size.md).
const OLD_URL_RE = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)\s]*))\s*\)/i;
function oldFirstCssUrl(text) {
	const m = OLD_URL_RE.exec(String(text ?? ''));
	if (!m) return null;
	const raw = m[1] ?? m[2] ?? m[3] ?? '';
	return raw ? raw.replace(/\\(.)/g, '$1') : null;
}

test('the scan answers exactly as the old regex did, on a fuzzed corpus', () => {
	const pieces = ['url(', 'URL(', ')', '"', "'", '\\', '\\"', ' ', '\n', 'a', 'data:x,1', '%23', '(', ';', 'b c', '\t'];
	let seed = 2026;
	const next = () => {
		seed = (seed * 1103515245 + 12345) >>> 0;
		return seed;
	};
	for (let n = 0; n < 20000; n++) {
		let s = '';
		const len = next() % 14;
		for (let k = 0; k < len; k++) s += pieces[next() % pieces.length];
		assert.equal(firstCssUrl(s), oldFirstCssUrl(s), JSON.stringify(s));
	}
});

test('a multi-megabyte data URI comes back whole, quoted or bare', () => {
	const d = `data:image/jpeg;base64,${'A'.repeat(3_000_000)}`;
	assert.equal(firstCssUrl(`background-image: url("${d}")`), d);
	assert.equal(firstCssUrl(`url('${d}')`), d);
	assert.equal(firstCssUrl(`url(${d})`), d);
});
