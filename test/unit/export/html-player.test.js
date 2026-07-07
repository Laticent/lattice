const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { buildPlayerHtml, fileToDataUri, subsetEmbeddedFonts, minifyCss } = require('../../../lib/export/html-player.js');
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
	// (Case-insensitive so an upper-case tag can't slip past — CodeQL js/bad-tag-filter.)
	const body = html.match(/<script>([\s\S]*?)<\/script>/i);
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

// ── size levers: CSS minify + font subset ────────────────────────────────────

test('minifyCss strips comments + whitespace but preserves strings, url(), calc, combinators', () => {
	assert.equal(minifyCss('/* c */ a { color : red ; }'), 'a{color:red}');
	assert.equal(minifyCss('b{width:calc(1px + 2px)}'), 'b{width:calc(1px + 2px)}', 'calc spaces kept');
	assert.equal(minifyCss('c::before{content:"a  b"}'), 'c::before{content:"a  b"}', 'string spaces kept');
	assert.equal(minifyCss('d > e ~ f + g{x:1}'), 'd > e ~ f + g{x:1}', 'combinator spaces kept');
	assert.equal(minifyCss('h{background:url(  x.svg  )}'), 'h{background:url(  x.svg  )}', 'url() untouched');
	assert.ok(!minifyCss('/* x */a{b:1}').includes(String.fromCodePoint(0xe000)), 'no sentinel leftover');
	// Regression: an apostrophe INSIDE a comment must not be read as a string delimiter
	// and swallow the following rule. (Protect-before-strip deleted half of lattice.css.)
	assert.equal(minifyCss("/* it's */ .a{x:1} /* don't */ .b{y:2}"), '.a{x:1}.b{y:2}', 'comment apostrophes do not eat rules');
	// And a `/*` inside a real string must NOT be stripped as a comment.
	assert.equal(minifyCss('a::before{content:"/* not a comment */"}'), 'a::before{content:"/* not a comment */"}', 'comment-like string literal survives');
});

test('minifyCss on the REAL lattice.css matches the build minifier (no rules dropped)', () => {
	// The blocker the checker caught: minifyCss must not silently delete rules from the
	// actual ~955 KB lattice.css the player inlines. Pin token/brace parity vs the build's
	// own dist/lattice.min.css so a protect-before-strip regression can never ship again.
	const cssPath = path.join(__dirname, '..', '..', '..', 'dist', 'lattice.css');
	const refPath = path.join(__dirname, '..', '..', '..', 'dist', 'lattice.min.css');
	if (!fs.existsSync(cssPath) || !fs.existsSync(refPath)) return; // dist not built in this env
	const min = minifyCss(fs.readFileSync(cssPath, 'utf8'));
	const ref = fs.readFileSync(refPath, 'utf8');
	const open = (min.match(/\{/g) || []).length;
	const close = (min.match(/\}/g) || []).length;
	assert.equal(open, close, 'braces stay balanced');
	assert.ok(!min.includes(String.fromCodePoint(0xe000)), 'no stray sentinel in the shipped CSS');
	const count = (s, tok) => s.split(tok).length - 1;
	for (const tok of ['--fs-', '@font-face', 'aspect-ratio']) {
		assert.equal(count(min, tok), count(ref, tok), `${tok} count matches the build minifier`);
	}
});

test('the player inlines MINIFIED css — no block comments survive (the biggest size lever)', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	// The engine inlines unminified lattice.css (1600+ comments); the player must strip them.
	assert.equal((html.match(/\/\*/g) || []).length, 0, 'no CSS block comments in the shipped player');
});

test('subsetEmbeddedFonts shrinks each embedded face to valid, smaller woff2 (optional dep)', async () => {
	// Build a tiny doc with one real embedded face (base64), then subset it.
	const face = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'dist', 'fonts', 'outfit-400.woff2'));
	const b64 = face.toString('base64');
	const doc = `<html><head><style id="lattice-embedded-fonts">@font-face{font-family:'Outfit';src:url(data:font/woff2;base64,${b64}) format('woff2')}</style></head><body><p>Hello 123 — the quick fox.</p></body></html>`;
	const { html, applied, saved } = await subsetEmbeddedFonts(doc);
	assert.equal(applied, true, 'subset-font is installed → subsetting applies');
	assert.ok(saved > 0, 'the face got smaller');
	const outB64 = (html.match(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/) || [])[1];
	assert.ok(outB64.length < b64.length, 'shipped face is smaller than the source face');
	assert.equal(Buffer.from(outB64, 'base64').slice(0, 4).toString('hex'), '774f4632', 'output is valid woff2 (wOF2 magic)');
});

test('subsetEmbeddedFonts is a graceful no-op when there are no embedded faces', async () => {
	const { html, applied, saved } = await subsetEmbeddedFonts('<html><body><p>no fonts here</p></body></html>');
	assert.equal(applied, false);
	assert.equal(saved, 0);
	assert.match(html, /no fonts here/);
});
