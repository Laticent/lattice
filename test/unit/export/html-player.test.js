const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { buildPlayerHtml, fileToDataUri } = require('../../../lib/export/html-player.js');
const { parseEnvelope } = require('../../../lib/core/lattice-doc.js');

// The self-contained .html PLAYER assembler (lib/export/html-player.js) — P2 slice 3
// of 2026-07-07-html-lattice-player.md. These pin the §Security v1 gate: the shipped
// file is offline (no file://), the slide DOM is sanitized, the ONE player script is
// covered by a sha256 CSP, and the verbatim source round-trips.

// A tiny on-disk SVG so we can exercise real file:// image inlining.
const tmpSvg = path.join(os.tmpdir(), `lp-test-${process.pid}.svg`);
fs.writeFileSync(tmpSvg, '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>');
const imgUrl = pathToFileURL(tmpSvg).href;

const source = '---\ntheme: indaco\n---\n\n# Deck\n\nA `code` span and a <!-- note -->.\n';

// A minimal emulator-style cleanDocHtml: embedded-fonts style, a stray file:// KaTeX
// link (no math → should be dropped), two slides (one carrying a hostile onerror +
// a file:// image), and an authoring inline <script> (should be stripped).
const docHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Deck</title>
<style id="lattice-embedded-fonts">@font-face{font-family:X;src:url(data:font/woff2;base64,AA)}</style>
<link rel="stylesheet" href="file:///nonexistent/katex.min.css">
<style>section[data-lattice-slide]{color:red}@font-face{font-family:Playfair;src:url('fonts/playfair-400.woff2')}</style>
</head><body>
<section data-lattice-slide="1" id="1" class="title"><h1>Deck</h1><p>Intro paragraph.</p>
<img src="${imgUrl}"><img src="x" onerror="steal(localStorage.k)"></section>
<section data-lattice-slide="2" id="2" class="content"><h2>Second</h2><ul><li>a<ul><li>nested</li></ul></li></ul></section>
<script>/* overflow watcher */ document.title='watched';</script>
</body></html>`;

test('produces a self-contained file — no file:// survives', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, title: 'Deck', now: 0 });
	assert.doesNotMatch(html, /file:\/\//, 'no file:// references may remain');
});

test('sanitizes the slide DOM — hostile onerror is stripped (the #616 gate)', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.doesNotMatch(html, /onerror/i, 'onerror handler must be stripped');
	assert.doesNotMatch(html, /steal\(/, 'the injected payload must be gone');
});

test('ships exactly ONE executable script + the non-exec envelope; watcher stripped', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	const execScripts = html.match(/<script(?![^>]*type="application\/lattice\+json")[^>]*>/gi) || [];
	assert.equal(execScripts.length, 1, 'only the single hashed player script may execute');
	assert.doesNotMatch(html, /overflow watcher|watched/, 'the authoring watcher must be stripped');
	assert.match(html, /<script type="application\/lattice\+json"/, 'the envelope node is present');
});

test('the CSP sha256 actually covers the shipped player script (freeze-surviving)', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	const cspHash = (html.match(/script-src 'sha256-([^']+)'/) || [])[1];
	assert.ok(cspHash, 'a sha256 script-src must be present');
	// Extract the executable player script body and hash it — must match the CSP.
	const body = html.match(/<script>([\s\S]*?)<\/script>/);
	assert.ok(body, 'the player script block is present');
	const actual = crypto.createHash('sha256').update(body[1], 'utf8').digest('base64');
	assert.equal(actual, cspHash, 'CSP hash must match the exact shipped script — else it is blocked or a hole');
	assert.match(html, /default-src 'none'/, 'default-src none locks down the file');
});

test('embeds the verbatim source envelope, round-tripping byte-exact', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, title: 'Deck', now: 0 });
	assert.equal(parseEnvelope(html).source, source);
});

test('a math-less deck drops the KaTeX file:// link entirely', async () => {
	const { html, report } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.doesNotMatch(html, /katex/i, 'no KaTeX link/style for a deck with no math');
	assert.equal(report.math, false);
});

test('inlines a real file:// image to a data: URI and reports the count', async () => {
	const { html, report } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.match(html, /data:image\/svg\+xml/, 'the file:// image is inlined as a data: URI');
	assert.equal(report.images, 1, 'exactly one image inlined');
	assert.deepEqual(report.missing, [], 'no un-inlinable assets for this fixture');
});

test('carries the three view controls + the Typora TOC shell', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	for (const v of ['present', 'read-slides', 'read-article']) {
		assert.match(html, new RegExp(`data-lp-btn="${v}"`), `view control ${v} present`);
	}
	assert.match(html, /id="lp-toc"/, 'the article TOC shell is present');
});

test('fileToDataUri returns null for a missing file (feeds the honesty report)', () => {
	assert.equal(fileToDataUri('/no/such/file.png'), null);
});

test('a runtime-inflated file:// <script> is REPORTED as stripped, not counted as an image', async () => {
	// Finding 1 regression: the script strip must run BEFORE image inlining, else the
	// script's file:// src gets data-URI'd and the honesty report silently lies.
	const withRuntime = docHtml.replace(
		'</body>',
		'<script src="file:///some/state-chart-runtime.js"></script></body>',
	);
	const { html, report } = await buildPlayerHtml({ docHtml: withRuntime, source, now: 0 });
	assert.equal(report.strippedScripts.length, 1, 'the runtime script is reported');
	assert.match(report.strippedScripts[0], /state-chart-runtime\.js/);
	assert.equal(report.images, 1, 'still exactly one real image — the script is not miscounted');
	assert.doesNotMatch(html, /state-chart-runtime/, 'the runtime script is gone from the output');
});

test('sanitizing at the section level also cleans the section element attributes', async () => {
	// Finding 2: an on* handler on the <section> itself must be stripped (outerHTML
	// sanitize), not survive because only innerHTML was cleaned.
	const evilSection = docHtml.replace(
		'<section data-lattice-slide="1" id="1" class="title">',
		'<section data-lattice-slide="1" id="1" class="title" onmouseover="steal()">',
	);
	const { html } = await buildPlayerHtml({ docHtml: evilSection, source, now: 0 });
	assert.doesNotMatch(html, /onmouseover/i, 'a handler on the section element is stripped');
});

test.after(() => {
	try {
		fs.unlinkSync(tmpSvg);
	} catch {}
});
