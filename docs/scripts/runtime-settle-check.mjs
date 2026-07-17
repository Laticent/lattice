// Runtime settle check — guards the invariant that the preview runtime's
// post-mutation loop (dispatchPostMutation → rAF, lib/runtime/index.js) SETTLES at
// rest and does not oscillate. The runtime's own comments warn that an
// unconditional per-frame write (geometry `--_sec-1cqi`, the overflow class) would
// "re-trigger the observer every frame — a perpetual requestAnimationFrame loop";
// the change-gated writes are what make it settle. This check turns that guarantee
// into an enforceable one: it renders representative slides in the REAL built
// Playground preview, lets each settle, then watches the live iframe for 2s with NO
// input. A settled runtime produces ZERO mutations; any churn is an oscillation
// regression (the FPS-pinned-at-30 failure mode) and fails the run.
//
// Born from the 2026-07-17 FPS=30 investigation: measurement showed 0 at-rest
// mutations across every slide type (rAF a full 60/sec), i.e. the reported 30fps was
// environmental (display refresh / power-saver throttle), not a code oscillation.
// This guard keeps it that way. See engineering/decisions/2026-07-17-preview-accumulation-leaks.md.
//
// Usage (from docs/):  node scripts/runtime-settle-check.mjs [--json] [--window 2000]
// Requires a built docs/dist (npm run build) and CHROME_PATH. On-demand (browser +
// dist), not a unit-tier gate — same tier as scripts/frame-bench.mjs.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { dirname, extname, isAbsolute, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(DOCS, 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

function parseArgs(argv) {
	const o = { json: false, window: 2000 };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--json') o.json = true;
		else if (argv[i] === '--window') o.window = Number(argv[++i]);
		else throw new Error(`unknown arg: ${argv[i]}`);
	}
	return o;
}

function safePath(urlPath) {
	let p = decodeURIComponent(urlPath.split('?')[0]);
	if (p.endsWith('/')) p += 'index.html';
	const file = join(DIST, normalize(p));
	const rel = relative(DIST, file);
	return rel.startsWith('..') || isAbsolute(rel) ? null : file;
}
function serve() {
	return http.createServer(async (req, res) => {
		try {
			const file = safePath(req.url);
			if (!file) { res.writeHead(404); return res.end('not found'); }
			let target = file;
			let body;
			try { body = await readFile(target); }
			catch { target = join(file, 'index.html'); try { body = await readFile(target); } catch { res.writeHead(404); return res.end('not found'); } }
			res.writeHead(200, { 'content-type': TYPES[extname(target)] || 'application/octet-stream' });
			res.end(body);
		} catch { res.writeHead(500); res.end('error'); }
	});
}

// Representative slides, weighted toward the runtime comments' named risks:
// container-query geometry (--_sec-1cqi), the overflow watcher (TOL flip), charts and
// mermaid (async re-layout), and horizontal-overflow (offsetWidth) candidates.
const SLIDES = {
	minimal: '# A short slide\n\nJust a heading and a line.\n',
	denseOverflow: `## An overstuffed slide\n\n${Array.from({ length: 40 }, (_, i) => `- Point ${i + 1} with enough words to push the box past its bound and trip the overflow watcher.`).join('\n')}\n`,
	borderline: `## Borderline height\n\n${Array.from({ length: 13 }, (_, i) => `- Line ${i + 1} sized to sit right at the overflow tolerance edge.`).join('\n')}\n`,
	piechart: '<!-- _class: piechart -->\n\n## Revenue by segment.\n\n- Enterprise `45`\n- Mid-market `30`\n- SMB `25`\n',
	mermaid: '## A flow\n\n```mermaid\nflowchart LR\n  A[Start] --> B{Choice}\n  B -->|yes| C[Do]\n  B -->|no| D[Skip]\n  C --> E[End]\n  D --> E\n```\n',
	wideCode: '## Wide code\n\n```js\nconst aVeryLongLine = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";\n```\n',
};

async function measure(browser, base, deck, windowMs) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.evaluateOnNewDocument((src) => {
		try { localStorage.setItem('lattice-docs-pg-source', src); } catch {}
	}, deck);
	await page.goto(`${base}/playground`, { waitUntil: 'load', timeout: 60000 });
	await page
		.waitForFunction(() => {
			const fr = document.querySelector('#preview');
			return fr?.contentDocument?.querySelector('.lattice section');
		}, { timeout: 40000 })
		.catch(() => {});
	await new Promise((r) => setTimeout(r, 3000)); // settle: fonts, fit, async chart/mermaid draw
	const out = await page.evaluate(async (windowMs) => {
		const doc = document.querySelector('#preview')?.contentDocument;
		if (!doc) return { error: 'no preview document' };
		const kinds = {};
		let total = 0;
		const obs = new MutationObserver((ms) => {
			for (const m of ms) {
				total++;
				const k = m.type === 'attributes' ? `attr:${m.attributeName}@${m.target.nodeName?.toLowerCase()}` : m.type;
				kinds[k] = (kinds[k] || 0) + 1;
			}
		});
		obs.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true });
		await new Promise((r) => setTimeout(r, windowMs));
		obs.disconnect();
		return { total, top: Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 4) };
	}, windowMs);
	await ctx.close();
	return out;
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	if (!existsSync(DIST)) {
		console.error(`runtime-settle-check: no build at ${DIST} — run \`npm run build\` in docs/ first.`);
		process.exit(2);
	}
	const server = serve();
	await new Promise((r) => server.listen(0, r));
	const base = `http://localhost:${server.address().port}`;
	const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });

	const results = {};
	let failed = 0;
	for (const [name, deck] of Object.entries(SLIDES)) {
		try {
			const r = await measure(browser, base, deck, opts.window);
			results[name] = r;
			const bad = r.error || r.total > 0;
			if (bad) failed++;
			if (!opts.json) console.error(`  ${name.padEnd(15)} ${r.error ? `ERROR ${r.error}` : r.total === 0 ? 'settled (0)' : `CHURN ${r.total} — ${JSON.stringify(r.top)}`}`);
		} catch (e) {
			results[name] = { error: e.message };
			failed++;
			if (!opts.json) console.error(`  ${name.padEnd(15)} FAILED ${e.message}`);
		}
	}
	await browser.close();
	server.close();

	if (opts.json) console.log(JSON.stringify({ ok: failed === 0, results }, null, 2));
	else console.log(failed === 0 ? '\nruntime-settle-check OK — the preview runtime settles to zero at-rest mutations on every slide.' : `\nruntime-settle-check FAILED — ${failed} slide(s) show at-rest churn (an oscillation regression; see lib/runtime/index.js dispatchPostMutation).`);
	process.exit(failed === 0 ? 0 : 1);
}

main();
