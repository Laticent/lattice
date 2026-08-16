// FOUC bench — does a page PAINT BEFORE ITS STYLESHEET APPLIES?
//
// The measurement behind #1653 and behind `scripts/hoist-stylesheets.mjs`. Committed
// for the reason `first-paint-bench.mjs` gives about its own number: the claim in that
// PR is quantitative ("3.2s of unstyled paint became none"), and a number produced by a
// hand-rolled harness that vanished with the edit is a number nobody can re-derive.
//
// THE TEST. A page's external stylesheet is render-blocking, so a correct load paints
// only after it applies. If `first-contentful-paint` is EARLIER than that stylesheet's
// `responseEnd`, the browser painted content it had no author CSS for — which is the
// flash, by definition, not a proxy for it. The gap between the two is how long a human
// sees the raw DOM.
//
// WHY IT SERVES A REAL BROWSER AND A MODELED NETWORK. On localhost at full speed
// everything lands in the same few milliseconds and the ordering that matters is
// invisible; the bug reproduces the moment there is any latency, which is every real
// visitor. So this serves `docs/dist` through a latency + bandwidth + gzip modeling
// server rather than a plain static host. Firefox is the default engine because Gecko
// is where the reported flash was seen and where its warning names the condition; pass
// `--engine chromium` for the other side.
//
// It measures a RELOAD with a warm cache — the reporter's exact action — not a cold
// first visit, because a cold visit blocks on the network for everything and hides the
// ordering.
//
// Usage (from docs/):
//   npm run build && node scripts/fouc-bench.mjs [--url /studio/] [--runs 3]
//                    [--latency 200] [--kbps 1200] [--engine firefox|chromium] [--json]
//
// Exit code is 1 when any measured page painted before its stylesheet — so this can be
// run as a check, not only read as a report.
//
// See engineering/decisions/2026-08-16-studio-fouc-stylesheet-order.md.

import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
// `--dist` exists so a BEFORE and an AFTER can come from the same instrument: point it
// at a second build (e.g. one produced from `main`) and the two numbers are comparable
// by construction rather than by assertion.
const DEFAULT_DIST = join(DOCS, 'dist');

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

function parseArgs(argv) {
	const o = { url: '/studio/', runs: 3, latency: 200, kbps: 1200, engine: 'firefox', json: false, dist: DEFAULT_DIST };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--url') o.url = argv[++i];
		else if (a === '--runs') o.runs = Number(argv[++i]);
		else if (a === '--latency') o.latency = Number(argv[++i]);
		else if (a === '--kbps') o.kbps = Number(argv[++i]);
		else if (a === '--engine') o.engine = argv[++i];
		else if (a === '--dist') o.dist = argv[++i];
		else if (a === '--json') o.json = true;
	}
	return o;
}

/** A static host that models a network: per-response latency, a byte-rate cap, and gzip. */
function serve({ latency, kbps, dist }) {
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
		const headers = { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' };
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

/** One reload, warm cache → { fcp, sheet } in ms, or nulls when the page reported neither. */
async function sample(page, url) {
	await page.goto(url, { waitUntil: 'load', timeout: 240000 });
	await page.waitForTimeout(1500);
	await page.reload({ waitUntil: 'load', timeout: 240000 });
	await page.waitForTimeout(1500);
	return page.evaluate(() => {
		const fcp = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint');
		// The LAST stylesheet to apply is the one that gates a correct paint; a page with
		// several is only fully styled once all of them are in.
		const sheets = performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'link' && /\.css(?:$|\?)/.test(e.name));
		return {
			fcp: fcp ? Math.round(fcp.startTime) : null,
			sheet: sheets.length ? Math.round(Math.max(...sheets.map((s) => s.responseEnd))) : null,
			names: sheets.map((s) => s.name.split('/').pop()),
		};
	});
}

const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function main() {
	const o = parseArgs(process.argv.slice(2));
	const { server, port } = await serve(o);
	// Imported here, not at module scope: the bench is only runnable where Playwright's
	// browsers are installed, and a missing browser should fail with its own message
	// rather than at import time.
	const { firefox, chromium } = await import('@playwright/test');
	const engine = o.engine === 'chromium' ? chromium : firefox;
	const browser = await engine.launch();
	const samples = [];
	try {
		for (let i = 0; i < o.runs; i++) {
			const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
			const page = await ctx.newPage();
			try {
				samples.push(await sample(page, `http://127.0.0.1:${port}${o.url}`));
			} finally {
				await ctx.close();
			}
		}
	} finally {
		await browser.close();
		server.close();
	}
	const usable = samples.filter((s) => s.fcp != null && s.sheet != null);
	if (!usable.length) {
		process.stderr.write('fouc-bench: no run reported both a paint and a stylesheet — is dist built?\n');
		return 1;
	}
	const fcp = median(usable.map((s) => s.fcp));
	const sheet = median(usable.map((s) => s.sheet));
	const unstyled = Math.max(0, sheet - fcp);
	const report = { url: o.url, dist: o.dist, engine: o.engine, latency: o.latency, kbps: o.kbps, runs: usable.length, fcp, sheet, unstyledMs: unstyled, sheets: usable[0].names };
	if (o.json) {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	} else {
		process.stdout.write(
			`fouc-bench ${o.url} · ${o.engine} · ${o.kbps}kbps/${o.latency}ms · median of ${usable.length}\n` +
				`  first contentful paint   ${String(fcp).padStart(6)}ms\n` +
				`  stylesheet(s) applied    ${String(sheet).padStart(6)}ms  (${usable[0].names.join(', ') || 'none'})\n` +
				(unstyled > 0
					? `  ✗ UNSTYLED PAINT for ${unstyled}ms — the page painted before its CSS\n`
					: '  ✓ paint follows the stylesheet — no unstyled window\n'),
		);
	}
	return unstyled > 0 ? 1 : 0;
}

main().then(
	(code) => process.exit(code),
	(err) => {
		process.stderr.write(`fouc-bench: ${err?.stack || err}\n`);
		process.exit(1);
	},
);
