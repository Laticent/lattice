// The engine-load recovery probe's pure parts (docs/scripts/ios-safari/engine-retry.mjs, PR #3385): which requests the
// fault proxy cuts, what it forwards, and the verdict. The probe itself runs in real Mobile Safari, in the iOS Simulator
// Studio suite; these pin what it measures with.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const load = () => import(path.join(__dirname, '..', '..', '..', 'docs', 'scripts', 'ios-safari', 'engine-retry.mjs'));

test('only the engine sub-files are failed, never the entry or anything else', async () => {
	const { isEngineSubFile } = await load();
	assert.equal(isEngineSubFile('/playground/v/abc/esm/chunk-D4ZX5MNS.js'), true);
	assert.equal(isEngineSubFile('/playground/v/abc/esm/chunk-D4ZX5MNS.js?x=1'), true);
	assert.equal(isEngineSubFile('/playground/v/abc/esm/engine.js'), false);
	assert.equal(isEngineSubFile('/playground/v/abc/esm/engine.js?retry=2'), false);
	assert.equal(isEngineSubFile('/_astro/chunk-ABC.js'), false);
	assert.equal(isEngineSubFile('/playground/v/abc/esm/chart-bar.js'), false);
});

test('the verdict passes only when the engine loaded by the path the card advises', async () => {
	const { engineRetryVerdict: v } = await load();
	assert.deepEqual(v({ card: true, afterRetry: 'loaded' }), { ok: true, path: 'Retry' });
	assert.deepEqual(v({ card: true, afterRetry: 'reload', afterReload: 'loaded' }), { ok: true, path: 'Reload' });
	assert.deepEqual(v({ card: true, afterRetry: 'reload', afterReload: 'failed', newTab: 'loaded' }), { ok: true, path: 'new tab' });
	assert.equal(v({ card: false, afterRetry: 'none' }).ok, false, 'no card while the engine failed is the original defect');
	assert.equal(v({ card: true, afterRetry: 'none' }).ok, false, 'Retry that neither loads nor offers Reload is stuck');
	assert.equal(v({ card: true, afterRetry: 'reload', afterReload: 'failed', newTab: 'failed' }).ok, false, 'no way back works');
	assert.equal(v({ card: true, afterRetry: 'reload', afterReload: 'failed', newTab: 'unsupported' }).ok, false, 'an unmeasured new tab is not a pass');
	assert.deepEqual(v({ card: true, cut: 0, afterRetry: 'loaded' }), { ok: false, path: 'no fault', error: 'no engine sub-file was cut, so the card that showed did not come from the fault' }, 'a card with nothing cut is not a recovery from the fault');
	assert.deepEqual(v({ card: true, cut: 3, afterRetry: 'loaded' }), { ok: true, path: 'Retry' }, 'a cut sub-file, then Retry, is');
});

test('the proxy cuts a sub-file while failing, and forwards it, and everything else, when not', async () => {
	const { startFaultProxy } = await load();
	const upstream = http.createServer((req, res) => {
		res.writeHead(200, { 'content-type': 'text/plain' });
		res.end(`ok ${req.url}`);
	});
	await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
	const proxy = await startFaultProxy(`http://127.0.0.1:${upstream.address().port}`);
	const get = (p) =>
		new Promise((resolve) => {
			http
				.get(`${proxy.origin}${p}`, (res) => {
					let body = '';
					res.on('data', (c) => (body += c));
					res.on('end', () => resolve({ status: res.statusCode, body }));
				})
				.on('error', (e) => resolve({ error: e.code }));
		});
	try {
		proxy.state.fail = true;
		const cut = await get('/p/esm/chunk-AAA.js');
		assert.ok(cut.error, `a sub-file is cut while failing (got ${JSON.stringify(cut)})`);
		assert.deepEqual(await get('/p/esm/engine.js'), { status: 200, body: 'ok /p/esm/engine.js' }, 'the entry always passes');
		proxy.state.fail = false;
		assert.deepEqual(await get('/p/esm/chunk-AAA.js'), { status: 200, body: 'ok /p/esm/chunk-AAA.js' }, 'a sub-file passes when not failing');
		assert.equal(proxy.state.cut, 1);
		assert.equal(proxy.state.subFiles, 2);
	} finally {
		proxy.close();
		upstream.close();
	}
});

test('the proxy never reuses an upstream socket, so a keep-alive close cannot reset a forwarded request', async () => {
	// Run 45453722865 (iPad, 503 arm): the docs server reset the proxy's forwarded engine.js and chunks.json at the same moment,
	// before anything was cut, and the card that followed failed the verdict as "no fault". A pooled keep-alive socket the
	// server had already closed does exactly that. This upstream resets any request that arrives on a socket it already
	// served, so a proxy that pools sockets fails here every time, not only on a loaded runner.
	const { startFaultProxy } = await load();
	const served = new WeakSet();
	const upstream = http.createServer((req, res) => {
		if (served.has(req.socket)) return req.socket.resetAndDestroy();
		served.add(req.socket);
		res.writeHead(200, { 'content-type': 'text/plain' });
		res.end(`ok ${req.url}`);
	});
	await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
	const proxy = await startFaultProxy(`http://127.0.0.1:${upstream.address().port}`);
	// Safari asks for keep-alive, so the proxy sees `connection: keep-alive` on every request it forwards.
	const browser = new http.Agent({ keepAlive: true, maxSockets: 1 });
	const get = (p) =>
		new Promise((resolve) => {
			http
				.get(`${proxy.origin}${p}`, { agent: browser }, (res) => {
					let body = '';
					res.on('data', (c) => (body += c));
					res.on('end', () => resolve({ status: res.statusCode, body }));
				})
				.on('error', (e) => resolve({ error: e.code }));
		});
	try {
		for (const p of ['/p/sw.js', '/p/esm/engine.js', '/p/esm/chunks.json', '/p/esm/engine.js']) {
			assert.deepEqual(await get(p), { status: 200, body: `ok ${p}` }, `${p} is forwarded on a fresh upstream socket`);
		}
	} finally {
		browser.destroy();
		proxy.close();
		upstream.close();
	}
});

test('the proxy records an island chunk only when it did not come back 200', async () => {
	// The iPad's Studio island stayed unhydrated with every chunk fetched (run 45460220846): the chunk that failed is the evidence.
	const { startFaultProxy } = await load();
	const upstream = http.createServer((req, res) => {
		res.writeHead(req.url.includes('bad') ? 500 : 200);
		res.end('x');
	});
	await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
	const proxy = await startFaultProxy(`http://127.0.0.1:${upstream.address().port}`);
	const get = (p) => new Promise((resolve) => http.get(`${proxy.origin}${p}`, { agent: false }, (res) => res.resume().on('end', resolve)));
	try {
		await get('/_astro/good.js');
		await get('/_astro/bad.js');
		assert.deepEqual(proxy.state.seen, ['/_astro/bad.js 500']);
	} finally {
		proxy.close();
		upstream.close();
	}
});

test('the proxy resolves its upstream once, to the address that accepts a connection', async () => {
	// Run 45475994893: per-request lookups of `localhost` raced ::1 against 127.0.0.1 and timed out on a starved runner.
	const { reachableAddress } = await load();
	const upstream = http.createServer((_req, res) => res.end('x'));
	await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
	try {
		// The lookup is fixed, so the test does not depend on how this machine resolves `localhost`: ::1 comes first, as on
		// the runner, and nothing listens there.
		const lookup = async () => [{ address: '::1', family: 6 }, { address: '127.0.0.1', family: 4 }];
		assert.equal(await reachableAddress('localhost', upstream.address().port, { lookup }), '127.0.0.1', 'only the IPv4 loopback listens');
		assert.equal(await reachableAddress('127.0.0.1', 1), '127.0.0.1', 'a literal address is kept');
	} finally {
		upstream.close();
	}
});

test('a connect that never answers gives up, so the proxy still starts', async () => {
	// A loopback connect that neither connects nor errors held startFaultProxy forever, and the probe's .catch never fired.
	const { reachableAddress } = await load();
	const lookup = async () => [{ address: '127.0.0.1', family: 4 }];
	const silent = () => ({ on() {}, destroy() {} });
	assert.equal(await reachableAddress('localhost', 9, { lookup, connect: silent, timeoutMs: 20 }), 'localhost', 'falls back to the name');
});
