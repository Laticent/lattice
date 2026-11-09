#!/usr/bin/env node
// The server for the FONT CACHE probe (font-cache-probe.js, PROBE=font-cache in run.sh): the built docs site, served
// the way GitHub Pages serves it (`max-age=600` on every file, lib/modeled-host.mjs `cache: 'pages'`), with a log of
// every font request that reaches it. The probe asks whether Safari reads the Studio's warmed fonts from its cache,
// and only the server can say whether a request left the browser: a page cannot see a cache hit in every engine.
//
// TWO PORTS, ONE PER ARM, and the arms differ in ONE thing: the warm port sends GitHub Pages' `max-age=600` on the
// font files, the control port sends `no-store`. Each port is its own origin, so each starts with a cold cache in the
// same Safari. Both arms then run the same steps, so the control proves the probe can see a miss under exactly the
// conditions of the finding. (The first cut told the frame's font loads from the warm-up's fetches by `Sec-Fetch-Dest`
// and refused the warm-up on the control port. in Mobile Safari 26.5 neither arm saw a single request marked `font`, so the
// control could not see a miss and the warm arm's pass meant nothing. Cacheability needs no header to tell them apart.)
//   GET /__probe/fonts   this port's log: [{ t, at, path, dest }] for every request under `/themes/fonts/`
//                        (`at` is the epoch time, which a page compares with its own `performance.timeOrigin`). `dest` is the
//                        request's `Sec-Fetch-Dest` as the browser sent it (recorded, not relied on).
//
// Usage (after a docs build): node docs/scripts/ios-safari/font-cache-server.mjs [control-port=4321] [warm-port=4322]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveModeled } from '../lib/modeled-host.mjs';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
const ports = [Number(process.argv[2] || 4321), Number(process.argv[3] || 4322)];

for (const [i, port] of ports.entries()) {
	const control = i === 0;
	const log = [];
	const t0 = Date.now();
	await serveModeled({
		dist: DIST,
		latency: 0,
		kbps: 1e9,
		cache: 'pages',
		port,
		host: null,
		onRequest(req, res) {
			const url = req.url.split('?')[0];
			if (url === '/__probe/fonts') {
				res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(log));
				return true;
			}
			// NO SERVICE WORKER. The site's worker claims the page and re-fetches the frame's requests itself, as a fetch()
			// (`Sec-Fetch-Dest: empty`), and answers them from Cache Storage, which is a question about the worker, not about
			// Safari's HTTP cache. #3087 checked the other engines with the worker blocked too (the decision note's table).
			if (url === '/sw.js') {
				res.writeHead(404, { 'cache-control': 'no-store' }).end();
				return true;
			}
			if (!url.includes('/themes/fonts/')) return false;
			log.push({ t: Date.now() - t0, at: Date.now(), path: url, dest: req.headers['sec-fetch-dest'] ?? null });
			if (!control) return false;
			// The control port: the same bytes, never storable, so no fetch can satisfy a later request for them.
			let body;
			try {
				body = readFileSync(path.join(DIST, path.normalize(decodeURIComponent(url)).replace(/^(\.\.[/\\])+/, '')));
			} catch {
				res.writeHead(404, { 'cache-control': 'no-store' }).end();
				return true;
			}
			res.writeHead(200, { 'content-type': 'font/woff2', 'cache-control': 'no-store' }).end(body);
			return true;
		},
	});
	console.log(`font-cache-server: ${DIST} on :${port} (max-age=600)${control ? ', the control arm: font files no-store' : ''}`);
}
