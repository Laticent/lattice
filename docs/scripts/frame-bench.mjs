// Browser-side FRAME / LCP bench — the measurement surface HARD RULE #19/#23 require
// for any Studio preview-perf claim, and the gap the Lighthouse-based `npm run perf`
// can't cover: it profiles page LOAD (LCP/FCP), never the edit→paint render pipeline.
//
// This drives the REAL built Studio (production `docs/dist`) under CPU throttle and
// reports the needles the live perf panel shows, by REGIME (the #917 split):
//   • LCP        — newcomer first paint of /studio (Studio-specific, vs Lighthouse's generic run)
//   • FRAME patch — a warm edit's body-swap (the #913 fast path) — should be single-digit ms
//   • FRAME write — a full rebuild (theme/mode/size change) — the stylesheet reparse cost
//   • RENDER / TOTAL — engine render + whole edit→paint, per regime
//
// It reads RAW per-render samples from `window.__latticeRenderMetrics` (the tooling hook
// in render-metrics.ts), not the EMA the overlay shows, so the numbers are per-render.
//
// Usage (from docs/):  node scripts/frame-bench.mjs [--cpu 4] [--runs 5] [--net slow4g|none] [--json]
// Requires a built `docs/dist` (run `npm run build` first) and CHROME_PATH.
// See engineering/decisions/2026-07-11-preview-performance-diagnosis.md §C2.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import { dirname, extname, isAbsolute, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(DOCS, 'dist');

function parseArgs(argv) {
	const o = { cpu: 4, runs: 5, net: 'none', json: false, url: '/studio', bless: false, check: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--cpu') o.cpu = Number(argv[++i]);
		else if (a === '--runs') o.runs = Number(argv[++i]);
		else if (a === '--net') o.net = argv[++i];
		else if (a === '--url') o.url = argv[++i];
		else if (a === '--json') o.json = true;
		else if (a === '--bless') o.bless = true;
		else if (a === '--check') o.check = true;
		else throw new Error(`unknown arg: ${a}`);
	}
	return o;
}

// Slow-4G, matching the throttle the #913 measurements used.
const NET = {
	slow4g: { offline: false, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8, latency: 400 },
	none: null,
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

// Resolve a request path to a file INSIDE dist, or null if it escapes. Normalizing an
// absolute request path collapses any `..`, and the `relative` check rejects anything
// that still lands outside DIST — closing path traversal (CodeQL: uncontrolled data in
// a path expression) on this throwaway localhost server.
function safePath(urlPath) {
	let p = decodeURIComponent(urlPath.split('?')[0]);
	if (p.endsWith('/')) p += 'index.html';
	const file = join(DIST, normalize(p));
	const rel = relative(DIST, file);
	return rel.startsWith('..') || isAbsolute(rel) ? null : file;
}

function serve() {
	const server = http.createServer(async (req, res) => {
		// Never echo the error/URL back to the client (CodeQL: stack-trace exposure +
		// unescaped exception-as-HTML); a static string + text/plain is all a client needs.
		const fail = (code) => {
			res.writeHead(code, { 'content-type': 'text/plain' });
			res.end(code === 404 ? 'not found' : 'error');
		};
		try {
			const file = safePath(req.url);
			if (!file) return fail(404);
			let target = file;
			let body;
			try {
				body = await readFile(target);
			} catch {
				target = join(file, 'index.html'); // a constant suffix on an in-DIST path can't escape
				try {
					body = await readFile(target);
				} catch {
					return fail(404);
				}
			}
			res.writeHead(200, { 'content-type': TYPES[extname(target)] || 'application/octet-stream' });
			res.end(body);
		} catch (e) {
			console.error('frame-bench serve:', e);
			fail(500);
		}
	});
	return server;
}

const median = (xs) => {
	const s = xs.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
	if (!s.length) return NaN;
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function oneRun(browser, base, opts) {
	const ctx = await browser.createBrowserContext(); // clean storage → a true newcomer
	const page = await ctx.newPage();
	await page.setCacheEnabled(false);
	const client = await page.target().createCDPSession();
	if (opts.cpu > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: opts.cpu });
	if (NET[opts.net]) await client.send('Network.emulateNetworkConditions', NET[opts.net]);
	// Record LCP from document start.
	await page.evaluateOnNewDocument(() => {
		window.__lcp = 0;
		try {
			new PerformanceObserver((l) => {
				for (const e of l.getEntries()) window.__lcp = e.renderTime || e.startTime || window.__lcp;
			}).observe({ type: 'largest-contentful-paint', buffered: true });
		} catch {}
	});

	await page.goto(`${base}${opts.url}?perf`, { waitUntil: 'networkidle0', timeout: 90000 });
	await page.waitForSelector('.cm-content', { timeout: 30000 }); // editor ready → app hydrated
	const lcp = await page.evaluate(() => window.__lcp || 0);

	// Subscribe to the raw render-sample bus (the tooling hook). Wait for it to exist.
	await page.waitForFunction(() => !!window.__latticeRenderMetrics, { timeout: 20000 });
	await page.evaluate(() => {
		window.__bench = [];
		window.__latticeRenderMetrics.on((s) => {
			const r = s.raw || s; // prefer the unsmoothed sample
			window.__bench.push({ frameMs: r.frameMs, totalMs: r.totalMs, engineMs: r.engineMs, writePath: s.writePath });
		});
	});

	const settle = () => new Promise((r) => setTimeout(r, 700));
	// Warm PATCH renders: type into the editor (each debounced edit → a body-swap patch).
	await page.evaluate(() => document.querySelector('.cm-content')?.focus());
	for (let i = 0; i < 6; i++) {
		await page.keyboard.type('x', { delay: 20 });
		await settle();
	}
	// A COLD WRITE render: flip the color mode → the render sig changes → a full srcdoc write.
	await page.evaluate(() => {
		const r = document.documentElement;
		r.setAttribute('data-mode', r.getAttribute('data-mode') === 'dark' ? 'light' : 'dark');
	});
	await page.keyboard.type('y', { delay: 20 });
	await settle();
	await settle();

	const samples = await page.evaluate(() => window.__bench || []);
	await ctx.close();

	const patch = samples.filter((s) => s.writePath === 'patch');
	const write = samples.filter((s) => s.writePath === 'write');
	return {
		lcp,
		framePatch: median(patch.map((s) => s.frameMs)),
		frameWrite: median(write.map((s) => s.frameMs)),
		totalPatch: median(patch.map((s) => s.totalMs)),
		totalWrite: median(write.map((s) => s.totalMs)),
		engine: median(samples.map((s) => s.engineMs)),
		nPatch: patch.length,
		nWrite: write.length,
	};
}

const BASELINE = join(DOCS, 'scripts', 'frame-baseline.json');

/**
 * THE STUDIO'S EDIT→PAINT BUDGET IS A PRODUCT PROMISE, and until now nothing held it.
 * `npm run bench:check` ratchets the ENGINE (Node, Markdown→HTML); this ratchets what a
 * person actually feels — the warm keystroke. They are different numbers on different
 * surfaces: measured here, the engine render of ONE slide is ~3.6ms while the whole
 * edit→paint is ~11.4ms, so a change can leave the engine untouched and still make typing
 * feel worse.
 *
 * TWO GUARDS AGAINST FLAKE, both learned from the engine bench's design:
 *
 *   MACHINE MATCH — a browser number is not portable, so timing gates ONLY when the
 *   checking machine matches `blessedOn`. Anywhere else it prints and exits 0. Better a
 *   gate that is silent off-baseline than one that cries wolf on every laptop.
 *
 *   AN ABSOLUTE FLOOR BESIDE THE PERCENTAGE — this is the one the engine bench does not
 *   need and this one cannot live without. FRAME patch is ~1.1ms; 1.1 → 1.3ms is +18% and
 *   completely meaningless. A metric must break BOTH the percentage band AND its own
 *   absolute floor to fail, so sub-millisecond jitter can never redden the gate while a
 *   real regression (1.1 → 4ms) still does.
 *
 * A metric the run could not measure is stored as null and skipped rather than blessed as
 * a number — `frameWriteMs` comes back NaN in a headless sandbox that never triggers the
 * heavy regime, and recording that as 0 would silently pin the strictest possible budget.
 */
const FLOOR_MS = { lcpMs: 300, framePatchMs: 2, frameWriteMs: 8, totalPatchMs: 4, totalWriteMs: 12, engineMs: 2 };
const TOLERANCE_PCT = 25; // browser-noisy; the floor above is what actually keeps it honest
const METRICS = Object.keys(FLOOR_MS);

const num = (v) => (Number.isFinite(v) ? v : null);

function machine() {
	const cpus = os.cpus();
	return { node: `v${process.versions.node.split('.')[0]}`, platform: `${os.platform()}/${os.arch()}`, cpus: cpus.length, cpu: cpus[0]?.model ?? 'unknown' };
}

const sameMachine = (a, b) => a && b && a.node === b.node && a.platform === b.platform && a.cpus === b.cpus && a.cpu === b.cpu;

function bless(agg, opts) {
	const doc = {
		note: 'Committed baseline for the Studio edit→paint loop — the number a person feels. Refresh with `npm run perf:frame:bless`, compare with `npm run perf:frame:check`. Timing gates ONLY on a machine matching `blessedOn`; a metric must break BOTH tolerancePct AND its floorMs to fail, so sub-millisecond jitter cannot redden it. A null metric was not measurable on the blessing run and is skipped.',
		tolerancePct: TOLERANCE_PCT,
		floorMs: FLOOR_MS,
		config: { url: opts.url, cpu: opts.cpu, net: opts.net, runs: agg.runs },
		blessedOn: machine(),
		metrics: Object.fromEntries(METRICS.map((k) => [k, num(agg[k])])),
	};
	writeFileSync(BASELINE, `${JSON.stringify(doc, null, 2)}\n`);
	console.log(`frame-bench: blessed → ${relative(DOCS, BASELINE)}`);
	for (const k of METRICS) console.log(`  ${k.padEnd(14)} ${doc.metrics[k] === null ? 'not measurable (skipped)' : `${doc.metrics[k]}ms`}`);
}

function check(agg) {
	if (!existsSync(BASELINE)) {
		console.error('frame-bench: no baseline — run `npm run perf:frame:bless` first.');
		return 2;
	}
	const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
	const here = machine();
	const gates = sameMachine(base.blessedOn, here);
	console.log(`\nframe-bench --check  ·  ${gates ? 'TIMING GATES (machine matches the baseline)' : 'REPORT ONLY (different machine — timing does not gate)'}\n`);
	const regressions = [];
	for (const k of METRICS) {
		const was = base.metrics?.[k] ?? null;
		const now = num(agg[k]);
		if (was === null || now === null) { console.log(`  ${k.padEnd(14)} ${was === null ? 'no baseline' : 'not measured'} — skipped`); continue; }
		const deltaPct = ((now - was) / was) * 100;
		const overPct = deltaPct > (base.tolerancePct ?? TOLERANCE_PCT);
		const overAbs = now - was > (base.floorMs?.[k] ?? FLOOR_MS[k]);
		const bad = overPct && overAbs;
		if (bad) regressions.push(`${k}: ${was}ms → ${now}ms (+${deltaPct.toFixed(0)}%, +${(now - was).toFixed(1)}ms)`);
		console.log(`  ${k.padEnd(14)} ${String(`${was}ms`).padStart(8)} → ${String(`${now}ms`).padStart(8)}  ${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(0)}%  ${bad ? '✗ REGRESSION' : ''}`);
	}
	if (!regressions.length) { console.log('\nframe-bench: within band.\n'); return 0; }
	console.error(`\nframe-bench: ${regressions.length} regression(s) past BOTH the ${base.tolerancePct}% band and the absolute floor:`);
	for (const r of regressions) console.error(`  ✗ ${r}`);
	console.error('\nThe Studio edit→paint budget is the product promise. Fix it, or re-bless with a PR that justifies the new number.\n');
	return gates ? 1 : 0; // off-baseline machines report but never fail
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	if (!existsSync(DIST)) {
		console.error(`frame-bench: no build at ${DIST} — run \`npm run build\` in docs/ first.`);
		process.exit(2);
	}
	const server = serve();
	await new Promise((r) => server.listen(0, r));
	const base = `http://localhost:${server.address().port}`;
	const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });

	const runs = [];
	for (let i = 0; i < opts.runs; i++) {
		try {
			const r = await oneRun(browser, base, opts);
			runs.push(r);
			if (!opts.json) console.error(`  run ${i + 1}/${opts.runs}: patch ${Math.round(r.framePatch)}ms · write ${Math.round(r.frameWrite)}ms · LCP ${Math.round(r.lcp)}ms`);
		} catch (e) {
			console.error(`  run ${i + 1}/${opts.runs}: FAILED — ${e.message}`);
		}
	}
	await browser.close();
	server.close();

	if (!runs.length) {
		console.error('frame-bench: all runs failed');
		process.exit(1);
	}
	const agg = {
		cpu: opts.cpu,
		net: opts.net,
		runs: runs.length,
		lcpMs: Math.round(median(runs.map((r) => r.lcp))),
		framePatchMs: +median(runs.map((r) => r.framePatch)).toFixed(1),
		frameWriteMs: Math.round(median(runs.map((r) => r.frameWrite))),
		totalPatchMs: +median(runs.map((r) => r.totalPatch)).toFixed(1),
		totalWriteMs: Math.round(median(runs.map((r) => r.totalWrite))),
		engineMs: +median(runs.map((r) => r.engine)).toFixed(1),
	};

	if (opts.json) {
		console.log(JSON.stringify(agg, null, 2));
		return;
	}
	if (opts.bless) return bless(agg, opts);
	if (opts.check) process.exitCode = check(agg);
	console.log(`\nFRAME / LCP bench — ${opts.url} · CPU ${opts.cpu}× · net ${opts.net} · median of ${runs.length} run(s)\n`);
	const row = (k, v, note) => console.log(`  ${k.padEnd(16)} ${String(v).padStart(7)}  ${note}`);
	row('LCP', `${agg.lcpMs}ms`, 'newcomer first paint of /studio');
	row('FRAME patch', `${agg.framePatchMs}ms`, 'warm edit — body swap (#913 fast path)');
	row('FRAME write', `${agg.frameWriteMs}ms`, 'full rebuild — stylesheet reparse (theme/mode/size)');
	row('TOTAL patch', `${agg.totalPatchMs}ms`, 'whole edit→paint, warm');
	row('TOTAL write', `${agg.totalWriteMs}ms`, 'whole edit→paint, rebuild');
	row('RENDER', `${agg.engineMs}ms`, 'engine (Markdown→HTML), regime-independent');
	console.log('');
}

main();
