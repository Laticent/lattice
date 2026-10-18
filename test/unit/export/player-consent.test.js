/**
 * Viewer consent for remote pictures in the exported player
 * (engineering/decisions/2026-10-16-player-as-library-audit.md §4.3, §11.4).
 *
 * Off unless the author declares origins. Then each web picture from a declared origin ships as
 * the inert placeholder (`data-lattice-web-src` keeps the address), the policy grants `connect-src`
 * (never `img-src`) for exactly those origins, and a banner's script fetches them only on "Load
 * pictures" and swaps them in as blob URLs. The real-browser
 * behavior (nothing fetched before Allow or with JavaScript off, the pictures after Allow, the
 * banner's links when the host refuses a cross-origin read, Space on its buttons) was driven in
 * Chromium, WebKit and Firefox for the PR (§11.4 of the note records the runs); these pin the
 * assembly.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlayerHtml } = require('../../../lib/export/html-player.js');

const PH = 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E';
const docWith = (imgs) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Consent</title>
<style id="lattice-embedded-fonts">@font-face{font-family:X;src:url(data:font/woff2;base64,AA)}</style>
<style>section[data-lattice-slide]{color:red}</style>
</head><body>
<section data-lattice-slide="1" id="1"><h1>Pictures</h1>${imgs}</section>
</body></html>`;
const placeholder = (url, alt = 'A picture') => `<img src="${PH}" alt="${alt}" data-lattice-web-src="${url}">`;
const policy = (html) => html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)[1];

test('normalizeConsentOrigins keeps web origins only, normalized and deduplicated', async () => {
	const { normalizeConsentOrigins } = await import('../../../lib/export/player-core.mjs');
	assert.deepEqual(
		normalizeConsentOrigins(['https://Images.Example.com/', 'https://images.example.com', 'http://127.0.0.1:8765', 'javascript:alert(1)', 'data:image/png,x', 'not a url', 'ftp://x.example']),
		['http://127.0.0.1:8765', 'https://images.example.com'],
	);
	assert.deepEqual(normalizeConsentOrigins(undefined), []);
});

test('the policy grants connect-src for real origins only, and never puts an origin in img-src', async () => {
	const { playerCsp } = await import('../../../lib/export/player-seal.mjs');
	const csp = playerCsp({ scriptHashes: ['h'], media: { consentOrigins: ['https://a.example', "https://b.example; script-src 'unsafe-inline'", '*', 'https://c.example/path'] } });
	assert.equal(csp.match(/img-src [^;]*;/)[0], 'img-src data: blob:;', 'img-src never names an origin: deck CSS could fetch from it before consent');
	assert.equal(csp.match(/connect-src [^;]*;/)[0], 'connect-src https://a.example;', 'only the well-formed origin is granted, and only to the script');
	assert.equal((csp.match(/script-src/g) || []).length, 1, 'no second script-src was smuggled in');
	assert.equal(playerCsp({ scriptHashes: ['h'] }).includes('img-src data:; '), true, 'no origins: the policy is exactly what it was');
	assert.doesNotMatch(playerCsp({ scriptHashes: ['h'] }), /connect-src|blob:/);
});

test('a declared origin the deck uses: banner, links, runtime, and connect-src for that origin only', async () => {
	const doc = docWith(placeholder('https://images.example.com/a.png?x=1&amp;y=2') + placeholder('https://other.example/b.png'));
	const { html } = await buildPlayerHtml({ docHtml: doc, source: '# Pictures\n', now: 0, consentOrigins: ['https://images.example.com'] });
	assert.match(policy(html), /img-src data: blob:; connect-src https:\/\/images\.example\.com; /);
	assert.doesNotMatch(policy(html), /other\.example/, 'an undeclared origin is not granted');
	assert.match(html, /<aside id="lp-consent"/);
	assert.match(html, /This deck shows 1 picture from <b>images\.example\.com<\/b>\. It is not loaded: loading it sends that site your IP address and the time you opened this file\./);
	assert.match(html, /<input class="lp-nj" type="checkbox" id="lp-consent-x"/, 'a no-script reader can close it');
	assert.match(html, /<a href="https:\/\/images\.example\.com\/a\.png\?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">/);
	assert.match(html, /id="lp-consent-allow"/);
	assert.match(html, /var allowed=\["https:\/\/images\.example\.com"\]/);
	// Still inert in the shipped markup: the address waits in the data attribute.
	assert.match(html, /data-lattice-web-src="https:\/\/images\.example\.com\/a\.png/);
	assert.doesNotMatch(html, /<img[^>]*\ssrc="https:/, 'nothing ships with a live remote src');
});

test('no declared origin, or one the deck never uses, ships exactly the file it shipped before', async () => {
	const doc = docWith(placeholder('https://other.example/b.png'));
	const plain = (await buildPlayerHtml({ docHtml: doc, source: '# P\n', now: 0 })).html;
	const unused = (await buildPlayerHtml({ docHtml: doc, source: '# P\n', now: 0, consentOrigins: ['https://images.example.com'] })).html;
	assert.equal(unused, plain);
	assert.doesNotMatch(plain, /lp-consent/);
});

test('author text in a picture address cannot break out of the banner', async () => {
	const doc = docWith(placeholder('https://images.example.com/&quot;&gt;&lt;img src=x onerror=alert(1)&gt;.png'));
	const { html } = await buildPlayerHtml({ docHtml: doc, source: '# P\n', now: 0, consentOrigins: ['https://images.example.com'] });
	const banner = html.match(/<aside id="lp-consent"[\s\S]*?<\/aside>/)[0];
	assert.doesNotMatch(banner, /<img/, 'the address stayed text');
	assert.match(banner, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
