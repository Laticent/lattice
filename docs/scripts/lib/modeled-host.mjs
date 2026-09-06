// A static host that MODELS A NETWORK — per-response latency, a byte-rate cap, and gzip.
//
// Extracted from `fouc-bench.mjs`, which introduced it, when `handoff-bench.mjs` needed the
// same thing. Both benches exist because the ordering they measure is INVISIBLE on localhost
// at full speed: every asset lands in the same few milliseconds, so the shell hands off to the
// app before a human could see either. The bug reproduces the moment there is any latency,
// which is every real visitor — so the host, not the bench, is the part worth sharing.
//
// A second copy would have been the more dangerous option rather than merely the more verbose
// one: a BEFORE and an AFTER are only comparable when they came off the same instrument, and
// two hand-maintained servers drift in exactly the dimension (bytes-per-second pacing) that
// the numbers are made of.

import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';
import zlib from 'node:zlib';

const TYPES = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.webp': 'image/webp',
	'.woff2': 'font/woff2',
	'.webmanifest': 'application/manifest+json',
	'.ico': 'image/x-icon',
};
const COMPRESSIBLE = /\.(?:html|css|js|mjs|json|svg|webmanifest)$/;

/**
 * Serve `dist` on an ephemeral loopback port under a modeled network.
 *
 * `cache` picks the caching model, and it is NOT cosmetic — it decides whether a
 * `<link rel=preload>` can be reused:
 *
 *   'none' (default)  every response `no-store`. Nothing is reusable, so a preloaded font is
 *                     DOWNLOADED A SECOND TIME when the stylesheet asks for it. Preserved as
 *                     the default because `fouc-bench` was written against it and its
 *                     committed numbers are on that footing.
 *   'real'            what a static host actually sends: hashed immutable assets get a long
 *                     `max-age`, HTML gets `no-cache`. A preload is reusable, so this is the
 *                     only setting under which "is the preload working" is a question about
 *                     the SITE rather than about this file.
 *
 * Getting this wrong reads as a product defect: under 'none' the Studio's two preloaded faces
 * are fetched twice and resolve ~700ms later than the preload landed, which looks exactly like
 * an ineffective preload and is in fact the host refusing to let it work.
 *
 * @param {{ latency: number, kbps: number, dist: string, cache?: 'none'|'real' }} opts
 * @returns {Promise<{ server: import('node:http').Server, port: number }>}
 */
export function serveModeled({ latency, kbps, dist, cache = 'none' }) {
	const bps = (kbps * 1000) / 8;
	const server = http.createServer(async (req, res) => {
		// `normalize` before joining: a `..` in the request path must not escape DIST.
		const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
		let file = join(dist, rel);
		try {
			if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
		} catch {
			/* fall through to the read, which reports the 404 */
		}
		let body;
		try {
			body = await readFile(file);
		} catch {
			res.writeHead(404).end('not found');
			return;
		}
		const gzip = COMPRESSIBLE.test(file);
		const out = gzip ? zlib.gzipSync(body) : body;
		// Hashed build assets are content-addressed, so `immutable` is what a real host sends
		// for them; HTML must revalidate or a deploy never reaches anyone.
		const cc = cache === 'real' ? (/\.html$/.test(file) ? 'no-cache' : 'public, max-age=31536000, immutable') : 'no-store';
		const headers = { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': cc };
		if (gzip) headers['content-encoding'] = 'gzip';
		setTimeout(() => {
			res.writeHead(200, headers);
			const CHUNK = 16384;
			let i = 0;
			const tick = () => {
				if (i >= out.length) return res.end();
				const slice = out.subarray(i, i + CHUNK);
				i += CHUNK;
				res.write(slice);
				setTimeout(tick, (slice.length / bps) * 1000);
			};
			tick();
		}, latency);
	});
	return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}
