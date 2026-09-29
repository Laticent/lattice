// lib/export/inline-url-media.mjs — the Studio player export embeds pictures referenced by URL
// (followup 2358-p2). Each arm is one way a picture reaches a slide, plus the refusals.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../../lib/export/inline-url-media.mjs');
const BASE = 'https://studio.test/lattice/studio/';
const ORIGINS = ['https://studio.test'];
const PNG = 'data:image/png;base64,AAAA';

function fakeFetch(table) {
	const calls = [];
	const fn = async (url) => {
		calls.push(url);
		return url in table ? table[url] : { reason: 'the server answered 404' };
	};
	fn.calls = calls;
	return fn;
}

test('an <img src> relative to the page is fetched from our origin and embedded', async () => {
	const { inlineUrlMedia } = await load();
	const fetchDataUri = fakeFetch({ 'https://studio.test/lattice/studio/a.png': { dataUri: PNG } });
	const r = await inlineUrlMedia('<p><img src="a.png" alt="A"></p>', { baseUrl: BASE, origins: ORIGINS, fetchDataUri });
	assert.equal(r.html, `<p><img src="${PNG}" alt="A"></p>`);
	assert.equal(r.count, 1);
	assert.deepEqual(r.missing, []);
});

test('a ![bg] panel and a video poster (inline background-image) are embedded', async () => {
	const { inlineUrlMedia } = await load();
	const fetchDataUri = fakeFetch({ 'https://studio.test/img/bg.jpg': { dataUri: PNG }, 'https://studio.test/img/poster.jpg': { dataUri: PNG } });
	const html =
		`<div class="lattice-bg lattice-bg-left" style="background-image:url('/img/bg.jpg')"></div>` +
		`<a class="video-poster" href="https://youtu.be/x" style="background-image:url(&quot;https://studio.test/img/poster.jpg&quot;)"></a>`;
	const r = await inlineUrlMedia(html, { baseUrl: BASE, origins: ORIGINS, fetchDataUri });
	assert.match(r.html, new RegExp(`url\\('${PNG}'\\)`));
	assert.match(r.html, new RegExp(`url\\(&quot;${PNG}&quot;\\)`));
	// The link the poster wraps is not a picture and is left alone.
	assert.match(r.html, /href="https:\/\/youtu\.be\/x"/);
	assert.equal(r.count, 2);
});

test('<video poster>, SVG <image href> and a <style> url() are embedded; @font-face is not touched', async () => {
	const { inlineUrlMedia } = await load();
	const fetchDataUri = fakeFetch({ 'https://studio.test/p.png': { dataUri: PNG } });
	const html =
		'<video poster="/p.png" src="/clip.mp4"></video><svg><image href="/p.png"/></svg>' +
		'<style>@font-face{src:url(/f.woff2)} .x{background:url(/p.png)}</style>';
	const r = await inlineUrlMedia(html, { baseUrl: BASE, origins: ORIGINS, fetchDataUri });
	assert.match(r.html, new RegExp(`poster="${PNG}"`));
	assert.match(r.html, /src="\/clip\.mp4"/, 'a video FILE is never embedded');
	assert.match(r.html, new RegExp(`<image href="${PNG}"`));
	assert.match(r.html, /@font-face\{src:url\(\/f\.woff2\)\}/);
	assert.match(r.html, new RegExp(`\\.x\\{background:url\\(${PNG}\\)\\}`));
	assert.deepEqual(fetchDataUri.calls, ['https://studio.test/p.png'], 'one fetch per distinct URL; never the font or the clip');
});

test('another site is NOT fetched: its address is left for the placeholder pass', async () => {
	const { inlineUrlMedia } = await load();
	const fetchDataUri = fakeFetch({});
	const html = '<img src="https://cdn.example/x.jpg"><div style="background-image:url(//cdn.example/y.jpg)"></div>';
	const r = await inlineUrlMedia(html, { baseUrl: BASE, origins: ORIGINS, fetchDataUri });
	assert.equal(r.html, html);
	assert.deepEqual(fetchDataUri.calls, []);
	assert.deepEqual(r.missing, []);
});

test('data:, blob:, fragment and non-web URLs are left alone and not fetched', async () => {
	const { inlineUrlMedia } = await load();
	const fetchDataUri = fakeFetch({});
	const html = `<img src="${PNG}"><img src="blob:https://studio.test/1"><svg><image href="#g"/></svg><img src="file:///etc/passwd">`;
	const r = await inlineUrlMedia(html, { baseUrl: BASE, origins: ORIGINS, fetchDataUri });
	assert.equal(r.html, html);
	assert.deepEqual(fetchDataUri.calls, []);
});

test('a failure is written back absolute and REPORTED with its reason, not silent', async () => {
	const { inlineUrlMedia } = await load();
	const fetchDataUri = async () => {
		throw new Error('offline');
	};
	const r = await inlineUrlMedia('<img src="/gone.png"><div style="background:url(/gone.png)"></div>', { baseUrl: BASE, origins: ORIGINS, fetchDataUri });
	// Written back ABSOLUTE, so the caller's placeholder pass (which sees only web URLs) draws it.
	assert.equal(r.html, `<img src="https://studio.test/gone.png"><div style="background:url('https://studio.test/gone.png')"></div>`);
	assert.equal(r.count, 0);
	assert.deepEqual(r.missing, [{ url: 'https://studio.test/gone.png', reason: 'offline' }]);
});

test('the shared cache fetches a URL once across two renders of the same deck', async () => {
	const { inlineUrlMedia } = await load();
	const fetchDataUri = fakeFetch({ 'https://studio.test/a.png': { dataUri: PNG } });
	const cache = new Map();
	await inlineUrlMedia('<img src="/a.png">', { baseUrl: BASE, origins: ORIGINS, fetchDataUri, cache });
	const r = await inlineUrlMedia('<img src="/a.png">', { baseUrl: BASE, origins: ORIGINS, fetchDataUri, cache });
	assert.equal(r.count, 1);
	assert.equal(fetchDataUri.calls.length, 1);
});

test('browserFetchDataUri refuses a non-image (a static host 404 page) and an oversized file', async () => {
	const { browserFetchDataUri } = await load();
	const res = (status, type, bytes) => ({
		ok: status < 400,
		status,
		headers: { get: () => type },
		arrayBuffer: async () => new Uint8Array(bytes).buffer,
	});
	const html404 = browserFetchDataUri(async () => res(200, 'text/html; charset=utf-8', 10));
	assert.match((await html404('https://studio.test/x')).reason, /not an image \(text\/html\)/);
	const notFound = browserFetchDataUri(async () => res(404, 'image/png', 10));
	assert.match((await notFound('https://studio.test/x')).reason, /404/);
	const big = browserFetchDataUri(async () => res(200, 'image/png', 20), { maxBytes: 10 });
	assert.match((await big('https://studio.test/x')).reason, /too large/);
	const ok = browserFetchDataUri(async () => res(200, 'image/png', 3));
	assert.equal((await ok('https://studio.test/x')).dataUri, 'data:image/png;base64,AAAA');
});

// REAL engine output, not hand-written markup: the engine writes each background twice, once as
// the declaration and once as a `--background-image:"url(\"…\")"` STRING. Reading the string as a
// url() fetched `/%22/x/%22` and reported a missing picture on every `![bg]` slide.
test('engine output: ![bg], ![bg left] and a video poster each fetch ONCE, the real address only', async () => {
	const { inlineUrlMedia } = await load();
	const engine = require('../../../lib/engine');
	const md = [
		'---', 'theme: indaco', '---', '',
		'![bg](/img/full.webp)', '', '# Full', '', '---', '',
		'![bg left](/img/half.webp)', '', '# Half', '', '---', '',
		'<!-- _class: video -->', '', '## Watch.', '', '- https://www.youtube.com/watch?v=aqz-KE-bpKQ', '- /img/poster.webp `poster`', '',
	].join('\n');
	const { html } = await engine.render(md);
	const table = Object.fromEntries(['full', 'half', 'poster'].map((n) => [`https://studio.test/img/${n}.webp`, { dataUri: 'data:image/webp;base64,UklG' }]));
	const fetchDataUri = fakeFetch(table);
	const r = await inlineUrlMedia(html, { baseUrl: BASE, origins: ORIGINS, fetchDataUri });
	assert.deepEqual([...fetchDataUri.calls].sort(), Object.keys(table).sort());
	assert.deepEqual(r.missing, []);
	assert.equal(r.count, 3);
	// Every REAL declaration now carries the picture; only the informational string names the path.
	const decls = [...r.html.matchAll(/[\s;"]background-image:url\((?:&quot;|["'])?([^"'&)]{0,12})/g)].map((m) => m[1]);
	assert.ok(decls.length >= 3, `found ${decls.length} background declarations`);
	assert.ok(decls.every((d) => d.startsWith('data:image/')), decls.join(' | '));
});

test('attribute text that reads like src= is an alt, not a picture', async () => {
	const { inlineUrlMedia } = await load();
	const fetchDataUri = fakeFetch({ 'https://studio.test/y.png': { dataUri: PNG } });
	const r = await inlineUrlMedia('<img alt="a src=/x.png style=background:url(/z.png)" src="/y.png">', { baseUrl: BASE, origins: ORIGINS, fetchDataUri });
	assert.equal(r.html, `<img alt="a src=/x.png style=background:url(/z.png)" src="${PNG}">`);
	assert.deepEqual(fetchDataUri.calls, ['https://studio.test/y.png']);
});

test('an unquoted style attribute is read too', async () => {
	const { inlineUrlMedia } = await load();
	const fetchDataUri = fakeFetch({ 'https://studio.test/y.png': { dataUri: PNG } });
	const r = await inlineUrlMedia('<div style=background:url(/y.png)></div>', { baseUrl: BASE, origins: ORIGINS, fetchDataUri });
	assert.equal(r.html, `<div style="background:url(${PNG})"></div>`);
});

test('an <img srcset> naming our pictures is dropped once its src is embedded', async () => {
	const { inlineUrlMedia } = await load();
	const fetchDataUri = fakeFetch({ 'https://studio.test/a.png': { dataUri: PNG } });
	const r = await inlineUrlMedia('<img srcset="/a.png 1x, /a@2x.png 2x" src="/a.png" alt="A">', { baseUrl: BASE, origins: ORIGINS, fetchDataUri });
	assert.equal(r.html, `<img src="${PNG}" alt="A">`);
	assert.deepEqual(fetchDataUri.calls, ['https://studio.test/a.png'], 'the srcset candidates are not fetched');
});

test('past the total budget, the rest is reported rather than embedded', async () => {
	const { inlineUrlMedia } = await load();
	const big = `data:image/png;base64,${'A'.repeat(100)}`;
	const fetchDataUri = fakeFetch({ 'https://studio.test/1.png': { dataUri: big }, 'https://studio.test/2.png': { dataUri: big } });
	const r = await inlineUrlMedia('<img src="/1.png"><img src="/2.png">', { baseUrl: BASE, origins: ORIGINS, fetchDataUri, maxTotalBytes: 150, concurrency: 1 });
	assert.equal(r.count, 1);
	assert.equal(r.missing.length, 1);
	assert.match(r.missing[0].reason, /picture budget/);
});

test('browserFetchDataUri refuses a content type that is more than a bare image type', async () => {
	const { browserFetchDataUri } = await load();
	const f = browserFetchDataUri(async () => ({ ok: true, status: 200, headers: { get: (h) => (h === 'content-type' ? 'image/png"onerror="x' : null) }, arrayBuffer: async () => new ArrayBuffer(1) }));
	assert.match((await f('https://studio.test/x')).reason, /not an image/);
});

test('browserFetchDataUri refuses a declared oversize without reading the body', async () => {
	const { browserFetchDataUri } = await load();
	let read = false;
	const f = browserFetchDataUri(async () => ({ ok: true, status: 200, headers: { get: (h) => (h === 'content-type' ? 'image/png' : '999999') }, arrayBuffer: async () => { read = true; return new ArrayBuffer(1); } }), { maxBytes: 10 });
	assert.match((await f('https://studio.test/x')).reason, /too large/);
	assert.equal(read, false);
});

test('describeMissingMedia names the first failure, counts the rest, and leaves our own origin out', async () => {
	const { describeMissingMedia } = await load();
	assert.equal(describeMissingMedia([], [], 'https://studio.test'), undefined);
	assert.equal(
		describeMissingMedia([{ url: 'https://studio.test/a.png', reason: 'the server answered 404' }, { url: 'https://studio.test/b.png', reason: 'x' }], ['https://studio.test', 'https://cdn.example'], 'https://studio.test'),
		'2 images could not be embedded (/a.png: the server answered 404, and 1 more); images from cdn.example ship as placeholders (turn on “Embed pictures from other sites” to include them)',
	);
	assert.equal(describeMissingMedia([{ url: 'https://studio.test/a.png', reason: 'r' }], ['https://studio.test'], 'https://studio.test'), '1 image could not be embedded (/a.png: r)');
});

test('anyWebOrigin (the author opted in): another site IS fetched and embedded', async () => {
	const { inlineUrlMedia } = await load();
	const fetchDataUri = fakeFetch({ 'https://cdn.example/x.jpg': { dataUri: PNG } });
	const r = await inlineUrlMedia('<img src="https://cdn.example/x.jpg"><img src="file:///etc/passwd">', { baseUrl: BASE, origins: ORIGINS, anyWebOrigin: true, fetchDataUri });
	assert.equal(r.html, `<img src="${PNG}"><img src="file:///etc/passwd">`, 'web only: file: is never fetched');
	assert.deepEqual(fetchDataUri.calls, ['https://cdn.example/x.jpg']);
});

test('browserFetchDataUri names a refusal from another site, not a bare network error', async () => {
	const { browserFetchDataUri } = await load();
	const f = browserFetchDataUri(async () => { throw new TypeError('Failed to fetch'); }, { ownOrigin: 'https://studio.test' });
	assert.match((await f('https://cdn.example/x.jpg')).reason, /refused the download or could not be reached/);
	assert.match((await f('https://studio.test/x.jpg')).reason, /could not be fetched \(Failed to fetch\)/);
});

test('sourceHasWebPictures: a web picture in each place one is written; links, video URLs and this site do not count', async () => {
	const { sourceHasWebPictures } = await load();
	const own = 'https://studio.test';
	for (const md of ['![x](https://a.example/x.jpg)', '![bg left](//a.example/x.jpg)', '- https://a.example/p.jpg `poster`', '<img src="https://a.example/y.png">', '<div style="background:url(https://a.example/z.png)"></div>']) {
		assert.equal(sourceHasWebPictures(md, own), true, md);
	}
	for (const md of ['![x](/local.png)', '![x](https://studio.test/x.png)', '- https://www.youtube.com/watch?v=1', '[a link](https://a.example)']) {
		assert.equal(sourceHasWebPictures(md, own), false, md);
	}
});

test('browserFetchDataUri refuses bytes labelled image/* that do not open as a picture', async () => {
	const { browserFetchDataUri } = await load();
	const res = { ok: true, status: 200, headers: { get: (h) => (h === 'content-type' ? 'image/jpeg' : null) }, arrayBuffer: async () => new Uint8Array([120]).buffer };
	const bad = browserFetchDataUri(async () => res, { decode: async () => false });
	assert.match((await bad('https://cdn.example/x.jpg')).reason, /not a picture the browser can open/);
	const good = browserFetchDataUri(async () => res, { decode: async () => true });
	assert.ok((await good('https://cdn.example/x.jpg')).dataUri);
});

test('describeMissingMedia: a site whose picture failed is not listed twice, and the switch is not suggested once on', async () => {
	const { describeMissingMedia } = await load();
	const missing = [{ url: 'https://cdn.example/x.jpg', reason: 'not a picture the browser can open' }];
	assert.equal(describeMissingMedia(missing, ['https://cdn.example'], 'https://studio.test', true), '1 image could not be embedded (cdn.example/x.jpg: not a picture the browser can open)');
	assert.equal(describeMissingMedia([], ['https://other.example'], 'https://studio.test', true), 'images from other.example ship as placeholders');
});

// Maker-checker findings on the opt-in (PR #2495): each arm is one finding.
test('sourceHasWebPictures: reference-style images and bracketed alts count; a video FILE does not', async () => {
	const { sourceHasWebPictures } = await load();
	const own = 'https://studio.test';
	assert.equal(sourceHasWebPictures('![a][r]\n\n[r]: https://w.example/a.png', own), true, 'reference-style');
	assert.equal(sourceHasWebPictures('![a [b] c](https://x.example/a.jpg)', own), true, 'bracketed alt');
	assert.equal(sourceHasWebPictures('<video poster="https://x.example/p.jpg"></video>', own), true, 'video poster');
	assert.equal(sourceHasWebPictures('<video src="https://x.example/a.mp4"></video>', own), false, 'a video file is never embedded');
});

test('describeMissingMedia: another site is named with its host, and the switch is suggested only when offered', async () => {
	const { describeMissingMedia } = await load();
	const own = 'https://studio.test';
	assert.equal(describeMissingMedia([{ url: 'https://x.example/a.jpg', reason: 'r' }], ['https://x.example'], own, true), '1 image could not be embedded (x.example/a.jpg: r)');
	assert.equal(describeMissingMedia([], ['https://x.example'], own, false, false), 'images from x.example ship as placeholders', 'no hint when the panel hid the switch');
});

test('browserFetchDataUri refuses redirects unless the author opted into other sites', async () => {
	const { browserFetchDataUri } = await load();
	const seen = [];
	const ok = { ok: true, status: 200, headers: { get: (h) => (h === 'content-type' ? 'image/png' : null) }, arrayBuffer: async () => new Uint8Array([1]).buffer };
	const fetchImpl = async (_u, init) => {
		seen.push(init.redirect);
		return ok;
	};
	await browserFetchDataUri(fetchImpl, { decode: async () => true })('https://studio.test/a.png');
	await browserFetchDataUri(fetchImpl, { decode: async () => true, followRedirects: true })('https://studio.test/a.png');
	assert.deepEqual(seen, ['error', 'follow']);
});

test('browserFetchDataUri stops reading a length-less body at the cap', async () => {
	const { browserFetchDataUri } = await load();
	let reads = 0;
	let cancelled = false;
	const body = { getReader: () => ({ read: async () => (reads++ < 1000 ? { done: false, value: new Uint8Array(4) } : { done: true }), cancel: async () => { cancelled = true; } }) };
	const f = browserFetchDataUri(async () => ({ ok: true, status: 200, headers: { get: (h) => (h === 'content-type' ? 'image/png' : null) }, body }), { maxBytes: 10, decode: async () => true });
	assert.match((await f('https://studio.test/x')).reason, /too large/);
	assert.ok(reads <= 4, `read ${reads} chunks before stopping`);
	assert.equal(cancelled, true);
});

test('inlineUrlMedia fetches at most maxPictures distinct pictures and reports the rest', async () => {
	const { inlineUrlMedia } = await load();
	const fetchDataUri = fakeFetch({ 'https://studio.test/1.png': { dataUri: PNG }, 'https://studio.test/2.png': { dataUri: PNG } });
	const r = await inlineUrlMedia('<img src="/1.png"><img src="/2.png">', { baseUrl: BASE, origins: ORIGINS, fetchDataUri, maxPictures: 1 });
	assert.equal(fetchDataUri.calls.length, 1);
	assert.equal(r.count, 1);
	assert.match(r.missing[0].reason, /1-picture limit/);
});
