/**
 * The player ships no `@font-face` it cannot load (followups.d/2728-p2, closed by
 * engineering/decisions/2026-10-16-player-as-library-audit.md §11.2).
 *
 * The player's policy is `font-src data:`, so a face whose every source is another URL can only
 * fail. The CLI's deck sheet names its faces `url(fonts/…)`, which `assemblePlayer` always
 * stripped; the Studio's names them `url(/playground/v/<hash>/themes/fonts/…)`, which it did not.
 * Shipped, those dead faces put `error` entries in `document.fonts`, made Chromium pick a broken
 * exact weight over a working merged range (the #2728 toolbar regression), and blocked the
 * identical-file font merge in every Studio export. One rule now covers both hosts.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlayerHtml } = require('../../../lib/export/html-player.js');

const face = (family, src) => `@font-face{font-family:${family};font-weight:400;src:${src}}`;

test('stripUnloadableFontFaces drops a face whose every source is a non-data URL, and nothing else', async () => {
	const { stripUnloadableFontFaces } = await import('../../../lib/export/player-core.mjs');
	const keep = [
		face('Embedded', 'url(data:font/woff2;base64,AA)format("woff2")'),
		face('LocalFirst', 'local(LocalFirst),url(https://example.com/a.woff2)'),
		face('Mixed', 'url(fonts/a.woff2),url(data:font/woff2;base64,AA)'),
	];
	const drop = [
		face('CliRelative', "url('fonts/playfair-400.woff2')"),
		face('StudioAbsolute', 'url(/playground/v/1a96cd309b82/themes/fonts/outfit-400.woff2)format("woff2")'),
		face('Remote', 'url("https://example.com/x.woff2")'),
	];
	const css = `a{color:red}${drop[0]}${keep[0]}${drop[1]}${keep[1]}${drop[2]}${keep[2]}b{color:blue}`;
	assert.equal(stripUnloadableFontFaces(css), `a{color:red}${keep.join('')}b{color:blue}`);
});

test('an assembled player keeps no @font-face outside the embedded block, from either host shape', async () => {
	const docHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Faces</title>
<style id="lattice-embedded-fonts">@font-face{font-family:Outfit;font-weight:400;src:url(data:font/woff2;base64,AA)}</style>
<style>${face('Outfit', 'url(fonts/outfit-400.woff2)')}${face('Outfit', 'url(/playground/v/1a96cd309b82/themes/fonts/outfit-400.woff2)format("woff2")')}section[data-lattice-slide]{font-family:Outfit}</style>
</head><body><section data-lattice-slide="1" id="1"><h1>Faces</h1></section></body></html>`;
	const { html } = await buildPlayerHtml({ docHtml, source: '# Faces\n', now: 0 });
	for (const [, attrs, body] of html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)) {
		if (/lattice-embedded-fonts/.test(attrs)) {
			assert.match(body, /@font-face/, 'the embedded faces ship');
			continue;
		}
		assert.doesNotMatch(body, /@font-face/, `a dead face survived in <style${attrs}>`);
	}
	assert.match(html, /section\[data-lattice-slide\]\{font-family:Outfit\}/, 'the rules around the dead faces still ship');
});

// Found by the checker on the change that widened the strip. Run on the element's MARKUP, the strip
// could join `</sty` and `le>` around a deleted face into a live `</style>`, and everything after it
// parsed as markup in the shipped file. It runs on the CSS now, before sanitizeStyleText (HARD RULE #22).
test('stripping a face never splices a live </style> out of the text around it (HARD RULE #22)', async () => {
	const docHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Splice</title>
<style id="lattice-embedded-fonts">@font-face{font-family:X;src:url(data:font/woff2;base64,AA)}</style>
<style>.a{color:red}</sty@font-face{src:url(https://e.com/x.woff2)}le><svg id="INJECTED"><a href="https://e.com">x</a></svg>section{outline:0}</style>
</head><body><section data-lattice-slide="1" id="1"><h1>Splice</h1></section></body></html>`;
	const { html } = await buildPlayerHtml({ docHtml, source: '# Splice\n', now: 0 });
	const openers = (html.match(/<style[\s>]/gi) || []).length;
	const closers = (html.match(/<\/style/gi) || []).length;
	assert.equal(closers, openers, 'a </style> was spliced together and closed the element early');
	// The text stays, as inert CSS inside the element; what must not exist is an ELEMENT built from it.
	const { JSDOM } = require('jsdom');
	assert.equal(new JSDOM(html).window.document.getElementById('INJECTED'), null, 'the text after the splice parsed as markup');
});

test('a quoted family holding a brace does not cut the face short and swallow the next rule', async () => {
	const { stripUnloadableFontFaces } = await import('../../../lib/export/player-core.mjs');
	assert.equal(stripUnloadableFontFaces('@font-face{src:url(x.woff2);font-family:"a}b"}.keep{color:red}'), '.keep{color:red}');
	// A quote inside a data: URI does not hide that source and drop a face that loads.
	const live = `@font-face{font-family:Q;src:url("data:font/woff2;base64,A'B"),url(x.woff2)}`;
	assert.equal(stripUnloadableFontFaces(live), live);
});
