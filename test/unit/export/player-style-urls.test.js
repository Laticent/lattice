/**
 * A picture placed by a SECTION background reaches the player inlined and reported, wherever it
 * came from (followups.d/2728-p3-relative-bg-not-inlined-player.md, closed by
 * engineering/decisions/2026-10-16-player-as-library-audit.md §11.7).
 *
 * The engine writes a `![bg]` that is not lifted into the image layout as the section's own
 * `background-image:url(&quot;…&quot;)`, serialized with the quote escaped. The player's inliner
 * matched only `'` and `"`, and the CLI renders with no base URL, so a relative `a.jpg` shipped as a
 * path that points nowhere once the file is sent, with no warning; an absolute `file://` one
 * shipped un-inlined, and the engine's informational copy carried the author's folder path.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { buildPlayerHtml, inlineFileUrls, resolveStyleUrls } = require('../../../lib/export/html-player.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-style-urls-'));
// A 1x1 PNG.
fs.writeFileSync(path.join(dir, 'a.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const base = pathToFileURL(dir + path.sep).href;
const fileUrl = pathToFileURL(path.join(dir, 'a.png')).href;

test('the inliner reads the attribute-escaped quote, and drops the copy that names a local file', () => {
	const html = `<section style="--background-image:&quot;url(\\&quot;${fileUrl}\\&quot;)&quot;;background-image:url(&quot;${fileUrl}&quot;);background-size:cover"></section>`;
	const { html: out, missing, count } = inlineFileUrls(html);
	assert.equal(count, 1);
	assert.deepEqual(missing, []);
	assert.match(out, /background-image:url\(&quot;data:image\/png;base64,/);
	assert.doesNotMatch(out, /file:/, 'no local path survives, not even in the informational string');
	assert.match(out, /background-size:cover/, 'the declarations around it stay');
});

test('relative style URLs resolve against the deck folder; absolute, data: and fragments do not move', () => {
	const html = '<section style="background-image:url(&quot;a.png&quot;)"></section><div style="background:url(https://x.example/p.png),url(data:image/png;base64,AA),url(#g)"></div>';
	const out = resolveStyleUrls(html, base);
	assert.ok(out.includes(`url(&quot;${base}a.png&quot;)`));
	assert.ok(out.includes('url(https://x.example/p.png),url(data:image/png;base64,AA),url(#g)'));
});

test('a style attribute written as TEXT is never rewritten: no folder path in a code sample', () => {
	// Chromium writes `"` raw in text, so this inline code reads like a tag to a whole-document pattern.
	const html = '<p><code>&lt;div style="background:url(a.png)"&gt;</code></p><section style="background:url(a.png)"></section>';
	const out = resolveStyleUrls(html, base);
	assert.ok(out.includes('<code>&lt;div style="background:url(a.png)"&gt;</code>'), 'the sample reads as written');
	assert.ok(out.includes(`<section style="background:url(${base}a.png)">`), 'the real attribute still resolves');
});

test('a picture name that is a folder stays as written and is reported, so no path leaks', () => {
	fs.mkdirSync(path.join(dir, 'folder.png'), { recursive: true });
	const gone = [];
	const out = resolveStyleUrls('<section style="background:url(&quot;folder.png&quot;)"></section>', base, gone);
	assert.ok(out.includes('url(&quot;folder.png&quot;)'));
	assert.deepEqual(gone, ['folder.png']);
});

const deck = (inner) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Bg</title>
<style id="lattice-embedded-fonts">@font-face{font-family:X;src:url(data:font/woff2;base64,AA)}</style>
<style>section[data-lattice-slide]{color:red}</style></head><body>${inner}</body></html>`;

test('a relative section background is inlined in the shipped player', async () => {
	const doc = deck('<section data-lattice-slide="1" id="1" style="--background-image:&quot;url(\\&quot;a.png\\&quot;)&quot;;background-image:url(&quot;a.png&quot;)"><h1>Bg</h1></section>');
	const { html, report } = await buildPlayerHtml({ docHtml: doc, source: '# Bg\n', now: 0, assetBaseUrl: base });
	assert.equal(report.images, 1);
	assert.match(html, /background-image:url\(&quot;data:image\/png;base64,/);
	assert.doesNotMatch(html, /file:/);
});

test('a missing one is reported, not shipped silently', async () => {
	const doc = deck('<section data-lattice-slide="1" id="1" style="background-image:url(&quot;gone.png&quot;)"><h1>Bg</h1></section>');
	const { report } = await buildPlayerHtml({ docHtml: doc, source: '# Bg\n', now: 0, assetBaseUrl: base });
	assert.equal(report.missing.length, 1);
	assert.match(report.missing[0], /gone\.png$/);
});
