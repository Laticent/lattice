/**
 * Unit: the runtime's `url()` reader (lib/core/css-url.js). The old match ended a URL at its first
 * `)` or `'`, and a percent-encoded SVG data URI carries both, so an `image` slide's picture never
 * loaded wherever the runtime measured it (decisions/2026-10-16-player-as-library-audit.md §11.9).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { firstCssUrl } = require('../../../lib/core/css-url');
const { bytesToDataUri } = require('../../../lib/core/data-uri');

test('a quoted SVG data URI comes back whole, parens and apostrophes included', () => {
	const svg = bytesToDataUri(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><circle fill="url(#glow)" class='x'/></svg>`), 'image/svg+xml');
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
