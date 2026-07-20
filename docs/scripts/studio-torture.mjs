// Studio TORTURE harness — the empirical instrument for the "degrades the more it's
// USED and the more it's REFRESHED" audit (engineering/decisions/2026-07-20-studio-
// degradation-audit). Built on frame-bench's server/throttle scaffolding (HARD RULE #15),
// but corrected per the plan's adversarial trio:
//   • measures PEAK (un-GC'd) heap + retained + gross allocation + GC-garbage, not just
//     post-GC retained (retained-flat can hide the jank/discard the user feels);
//   • counts Documents/Frames/Nodes/JSEventListeners which DO aggregate across the
//     same-origin engine srcdoc iframes (verified) — a rising Documents count is a
//     detached-document smoking gun; JSHeapUsedSize does NOT count off-heap iframe/GPU
//     memory, so peak heap is a floor, not the whole footprint (device pass covers the rest);
//   • PWA-faithful: PROD dist over a PERSISTENT userDataDir + STABLE origin so the service
//     worker registers and IDB/Cache/localStorage survive reloads (across-refresh mode);
//   • monotonic-trend test = Mann-Kendall (catches a shallow-but-relentless climb below the
//     per-cycle noise floor), not just a linear slope-vs-band.
//
// Usage (from docs/, needs a PROD build — `npm run build` — and CHROME_PATH):
//   node scripts/studio-torture.mjs --mode within  [--cycle present|overview|deckswitch|palette|fullwrite|typing|fabricate|mixed|all] [--k 40] [--cpu 4]
//   node scripts/studio-torture.mjs --mode refresh  [--refreshes 12] [--seed heavy]     (across-refresh + 3-arm isolation)
// Within-session runs on a throwaway profile; refresh mode uses the persistent one.
// This is a DIAGNOSTIC harness (not a blocking gate) — it prints signals + a verdict.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { dirname, extname, isAbsolute, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(DOCS, 'dist');
const FIXED_PORT = 4319; // stable origin so the SW scope + storage persist across relaunches (refresh mode)

function parseArgs(argv) {
	const o = { mode: 'within', cycle: 'all', k: 40, cpu: 4, refreshes: 12, seed: 'none', json: false, snapshot: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--mode') o.mode = argv[++i];
		else if (a === '--cycle') o.cycle = argv[++i];
		else if (a === '--k') o.k = Number(argv[++i]);
		else if (a === '--cpu') o.cpu = Number(argv[++i]);
		else if (a === '--refreshes') o.refreshes = Number(argv[++i]);
		else if (a === '--seed') o.seed = argv[++i];
		else if (a === '--json') o.json = true;
		else if (a === '--snapshot') o.snapshot = true;
		else throw new Error(`unknown arg: ${a}`);
	}
	return o;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

function safePath(urlPath) {
	let p = decodeURIComponent(urlPath.split('?')[0]);
	if (p.endsWith('/')) p += 'index.html';
	const file = join(DIST, normalize(p));
	const rel = relative(DIST, file);
	return rel.startsWith('..') || isAbsolute(rel) ? null : file;
}

function serve() {
	return http.createServer(async (req, res) => {
		const fail = (code) => { res.writeHead(code, { 'content-type': 'text/plain' }); res.end(code === 404 ? 'not found' : 'error'); };
		try {
			const file = safePath(req.url);
			if (!file) return fail(404);
			let target = file, body;
			try { body = await readFile(target); }
			catch { target = join(file, 'index.html'); try { body = await readFile(target); } catch { return fail(404); } }
			// Service worker must be served with a JS content-type and be allowed a root scope.
			const headers = { 'content-type': TYPES[extname(target)] || 'application/octet-stream' };
			if (target.endsWith('sw.js')) headers['service-worker-allowed'] = '/';
			res.writeHead(200, headers);
			res.end(body);
		} catch { fail(500); }
	});
}

// ── stats ────────────────────────────────────────────────────────────────────
const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return NaN; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// Mann-Kendall S + tau + an approximate normal Z (ties-uncorrected; direction/significance
// ONLY — NOT magnitude). Z is UNRELIABLE alone on the strongly-autocorrelated memory series
// here (the idle control proves it: a trivial ~9KB/cyc drift scores z≈5.9). Always pair it
// with Sen's slope (robust magnitude) and judge RISING against the IDLE CONTROL's own slope.
function mannKendall(ys) {
	const n = ys.length; if (n < 4) return { S: NaN, tau: NaN, z: NaN };
	let S = 0;
	for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) S += Math.sign(ys[j] - ys[i]);
	const varS = (n * (n - 1) * (2 * n + 5)) / 18;
	const z = S > 0 ? (S - 1) / Math.sqrt(varS) : S < 0 ? (S + 1) / Math.sqrt(varS) : 0;
	const tau = S / ((n * (n - 1)) / 2);
	return { S, tau: +tau.toFixed(3), z: +z.toFixed(2) };
}
// Sen's slope — median of all pairwise slopes. Robust magnitude estimator, the number that
// actually says "how fast is it growing per cycle" (MK only says "is it monotonic").
function sensSlope(ys) {
	const s = [];
	for (let i = 0; i < ys.length - 1; i++) for (let j = i + 1; j < ys.length; j++) s.push((ys[j] - ys[i]) / (j - i));
	return median(s);
}

// ── CDP instrument ─────────────────────────────────────────────────────────────
async function makeInstrument(page) {
	const cdp = await page.target().createCDPSession();
	await cdp.send('Performance.enable');
	await cdp.send('HeapProfiler.enable');
	const perf = async () => {
		const { metrics } = await cdp.send('Performance.getMetrics');
		const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
		return { heapUsed: m.JSHeapUsedSize, heapTotal: m.JSHeapTotalSize, nodes: m.Nodes, listeners: m.JSEventListeners, documents: m.Documents, frames: m.Frames, layout: m.LayoutCount, recalc: m.RecalcStyleCount };
	};
	const gc = async () => { try { await cdp.send('HeapProfiler.collectGarbage'); } catch {} };
	// gross allocation over a scope: sampling allocation profiler
	const startAlloc = async () => { try { await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384 }); } catch {} };
	const stopAlloc = async () => {
		try {
			const { profile } = await cdp.send('HeapProfiler.stopSampling');
			// profile.head is a tree of nodes each with selfSize — sum the whole tree.
			let total = 0;
			const stack = [profile.head]; while (stack.length) { const n = stack.pop(); if (n.selfSize) total += n.selfSize; for (const c of n.children || []) stack.push(c); }
			return total;
		} catch { return NaN; }
	};
	// in-page probes: the observable proxies (module internals aren't exposed)
	const probes = async () => page.evaluate(() => {
		const q = (s, r = document) => { try { return r.querySelectorAll(s).length; } catch { return -1; } };
		let previewSheets = -1; let iframeDocEls = 0;
		try { for (const f of document.querySelectorAll('iframe.live')) { const d = f.contentDocument; if (d) { iframeDocEls += d.getElementsByTagName('*').length; if (previewSheets < 0) previewSheets = d.styleSheets.length; } } } catch {}
		// engine theme-registry size, if the playground global exposes it
		let themeCount = -1;
		try { const PG = window.LatticePlayground || window.PG; if (PG?.themes) themeCount = (PG.themes.size ?? PG.themes.length ?? Object.keys(PG.themes).length); } catch {}
		return {
			liveIframes: q('iframe.live'),
			allIframes: q('iframe'),
			cmEditors: q('.cm-editor'),
			cmContents: q('.cm-content'),
			toasts: q('[data-sonner-toast], [role="status"]'),
			iframeDocEls,
			previewSheets,
			themeCount,
		};
	});
	const storage = async () => page.evaluate(async () => {
		const out = { usage: -1, quota: -1, caches: -1, cacheEntries: -1, idb: {} };
		try { const e = await navigator.storage.estimate(); out.usage = e.usage; out.quota = e.quota; } catch {}
		try { const names = await caches.keys(); out.caches = names.length; let n = 0; for (const nm of names) { const c = await caches.open(nm); n += (await c.keys()).length; } out.cacheEntries = n; } catch {}
		try { const idbAny = indexedDB.databases ? await indexedDB.databases() : []; out.dbs = idbAny.map((d) => d.name); } catch {}
		return out;
	});
	return { cdp, perf, gc, startAlloc, stopAlloc, probes, storage };
}

// Take a full labeled sample: GC, then retained; plus peak (pre-GC) captured by caller.
async function sample(inst, label, peakHeap) {
	await inst.gc(); await inst.gc(); // double-collect for a steadier retained baseline
	const p = await inst.perf();
	const pr = await inst.probes();
	return { label, retainedHeap: p.heapUsed, peakHeap: peakHeap ?? p.heapUsed, heapTotal: p.heapTotal, nodes: p.nodes, listeners: p.listeners, documents: p.documents, frames: p.frames, ...pr };
}

const wait = (page, ms) => page.evaluate((m) => new Promise((r) => setTimeout(r, m)), ms);
const clickIf = async (page, sel) => { const el = await page.$(sel); if (el) { await el.click(); return true; } return false; };
async function peakDuring(inst, fn) {
	// crude peak: sample heap a few times during the action, take max (pre-GC)
	let peak = 0; let stop = false;
	const poll = (async () => { while (!stop) { const p = await inst.perf(); peak = Math.max(peak, p.heapUsed); await new Promise((r) => setTimeout(r, 60)); } })();
	await fn(); stop = true; await poll;
	return peak;
}

// ── cycles: one "user does X once" each. Return after the app settles. ───────────
const CYCLES = {
	async present(page) { if (await clickIf(page, '[aria-label="Present"]')) { await wait(page, 500); await page.keyboard.press('ArrowRight').catch(() => {}); await wait(page, 200); await page.keyboard.press('Escape'); await wait(page, 400); } },
	async overview(page) { if (await clickIf(page, '[aria-label="Present"]')) { await wait(page, 500); await page.keyboard.press('g').catch(() => {}); await wait(page, 900); await page.keyboard.press('Escape'); await wait(page, 300); await page.keyboard.press('Escape'); await wait(page, 400); } },
	async deckswitch(page) { /* open deck switcher, pick next, come back — best-effort */ await page.evaluate(() => { const b = document.querySelector('[aria-label*="deck" i],[data-deck-switch]'); b?.click?.(); }); await wait(page, 400); await page.keyboard.press('Escape').catch(() => {}); await wait(page, 300); },
	async palette(page) { await page.evaluate(() => { const r = document.documentElement; r.setAttribute('data-mode', r.getAttribute('data-mode') === 'dark' ? 'light' : 'dark'); }); await wait(page, 500); await clickIf(page, '[data-demo="mode"]'); await wait(page, 400); },
	async fullwrite(page) { // force full srcdoc rewrites (mode+size flips) — the listener-rebind / theme-reregister stressor
		await page.evaluate(() => { const r = document.documentElement; r.setAttribute('data-mode', r.getAttribute('data-mode') === 'dark' ? 'light' : 'dark'); });
		await wait(page, 350); await clickIf(page, '[data-demo="mode"]'); await wait(page, 350); },
	async typing(page) { await page.evaluate(() => document.querySelector('.cm-content')?.focus()); for (let i = 0; i < 20; i++) await page.keyboard.type('x'); await wait(page, 500); for (let i = 0; i < 20; i++) await page.keyboard.press('Backspace'); await wait(page, 500); },
	async fabricate(page) { /* placeholder: open Fabricate + generate — surface-dependent, filled once selectors confirmed */ await wait(page, 100); },
	async mixed(page) { await CYCLES.typing(page); await CYCLES.present(page); await CYCLES.palette(page); },
	// CONTROL — do nothing but let the same time pass. MUST stay flat; if it rises, the
	// instrument (GC not settling / the perf HUD / rAF caches) drifts and every other
	// cycle's "RISING" is suspect until corrected.
	async idle(page) { await wait(page, 900); },
};

// ── heap-snapshot capture + per-constructor diff (root-cause attribution) ────────
async function takeSnapshot(cdp) {
	const chunks = [];
	const onChunk = (c) => chunks.push(c.chunk);
	cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
	await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
	cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
	return JSON.parse(chunks.join(''));
}
// Aggregate retained self-size by "type:name" (constructor), + detached-DOM bytes.
function snapshotByClass(snap) {
	const nf = snap.snapshot.meta.node_fields;
	const nodeTypes = snap.snapshot.meta.node_types[0];
	const iType = nf.indexOf('type'), iName = nf.indexOf('name'), iSelf = nf.indexOf('self_size'), iDet = nf.indexOf('detachedness');
	const stride = nf.length, nodes = snap.nodes, strings = snap.strings;
	const by = new Map(); let detachedBytes = 0, detachedCount = 0;
	for (let o = 0; o < nodes.length; o += stride) {
		const t = nodeTypes[nodes[o + iType]] || '?';
		const name = strings[nodes[o + iName]] ?? '';
		const self = nodes[o + iSelf];
		const key = `${t}:${name}`.slice(0, 60);
		const e = by.get(key) || { count: 0, self: 0 }; e.count++; e.self += self; by.set(key, e);
		if (iDet >= 0 && nodes[o + iDet] === 2) { detachedBytes += self; detachedCount++; }
	}
	return { by, detachedBytes, detachedCount, total: [...by.values()].reduce((s, e) => s + e.self, 0) };
}
function diffSnapshots(a, b, topN = 18) {
	const A = snapshotByClass(a), B = snapshotByClass(b);
	const rows = [];
	for (const [k, be] of B.by) { const ae = A.by.get(k) || { count: 0, self: 0 }; rows.push({ k, dSelf: be.self - ae.self, dCount: be.count - ae.count, self: be.self }); }
	rows.sort((x, y) => y.dSelf - x.dSelf);
	return { top: rows.slice(0, topN), totalDelta: B.total - A.total, detachedDelta: B.detachedBytes - A.detachedBytes, detachedCountDelta: B.detachedCount - A.detachedCount };
}

async function withinSession(browser, base, opts, cycleName) {
	const page = await browser.newPage();
	const cdpThrottle = await page.target().createCDPSession();
	if (opts.cpu > 1) await cdpThrottle.send('Emulation.setCPUThrottlingRate', { rate: opts.cpu });
	await page.goto(`${base}/studio?perf`, { waitUntil: 'networkidle0', timeout: 90000 });
	await page.waitForSelector('.cm-content', { timeout: 30000 });
	await wait(page, 1500);
	const inst = await makeInstrument(page);
	const cyc = CYCLES[cycleName]; if (!cyc) throw new Error(`unknown cycle ${cycleName}`);
	const series = [];
	series.push(await sample(inst, 'baseline'));
	const snapBase = opts.snapshot ? await takeSnapshot(inst.cdp) : null;
	for (let i = 0; i < opts.k; i++) {
		const peak = await peakDuring(inst, () => cyc(page));
		series.push(await sample(inst, `c${i + 1}`, peak));
		if (!opts.json && (i + 1) % 5 === 0) process.stderr.write(`    ${cycleName}: ${i + 1}/${opts.k}\r`);
	}
	let snapDiff = null;
	if (opts.snapshot) { await inst.gc(); await inst.gc(); const snapFinal = await takeSnapshot(inst.cdp); snapDiff = diffSnapshots(snapBase, snapFinal); }
	await page.close();
	return { series, snapDiff };
}

// Absolute per-cycle floors below which a rising trend is judged NOISE even if MK is
// "significant" — calibrated from the idle control (heap drifts ~9KB/cyc doing nothing).
const ABS_FLOOR = { retainedHeap: 40000, peakHeap: 60000, heapTotal: 60000, nodes: 0.4, listeners: 0.4, documents: 0.1, liveIframes: 0.1, cmEditors: 0.1, themeCount: 0.4 };
// controlSlopes: metric→Sen's slope from the idle run (or null). A cycle is RISING only if
// its Sen's slope clears BOTH the absolute floor AND 4× the idle control's slope, AND MK is
// significant. This defeats the autocorrelation false-positive the idle control exposed.
function analyze(series, controlSlopes) {
	const keys = ['retainedHeap', 'peakHeap', 'heapTotal', 'nodes', 'listeners', 'documents', 'liveIframes', 'cmEditors', 'themeCount'];
	const rows = [];
	for (const k of keys) {
		const ys = series.map((s) => s[k]).filter((v) => Number.isFinite(v) && v >= 0);
		if (ys.length < 4) continue;
		const first = ys[0], last = ys[ys.length - 1];
		const mk = mannKendall(ys);
		const sen = sensSlope(ys);
		const ctrl = controlSlopes && Number.isFinite(controlSlopes[k]) ? controlSlopes[k] : 0;
		const floor = Math.max(ABS_FLOOR[k] ?? 0, 4 * Math.abs(ctrl));
		const grew = mk.z >= 1.96 && sen > floor && last > first;
		rows.push({ metric: k, first, last, delta: last - first, sen: +sen.toFixed(1), floor: +floor.toFixed(1), z: mk.z, trend: grew ? 'RISING' : 'flat' });
	}
	return rows;
}
function controlSlopesFrom(series) {
	const keys = ['retainedHeap', 'peakHeap', 'heapTotal', 'nodes', 'listeners', 'documents', 'liveIframes', 'cmEditors', 'themeCount'];
	const out = {};
	for (const k of keys) { const ys = series.map((s) => s[k]).filter((v) => Number.isFinite(v) && v >= 0); if (ys.length >= 4) out[k] = sensSlope(ys); }
	return out;
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	if (!existsSync(DIST)) { console.error(`studio-torture: no build at ${DIST} — run \`npm run build\` in docs/ first.`); process.exit(2); }
	const server = serve();
	await new Promise((r) => server.listen(opts.mode === 'refresh' ? FIXED_PORT : 0, r));
	const base = `http://localhost:${server.address().port}`;

	if (opts.mode === 'within') {
		const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
		// idle is always the CONTROL and runs first, so its per-metric drift becomes the
		// noise floor every other cycle is judged against.
		const requested = opts.cycle === 'all' ? ['idle', 'present', 'overview', 'palette', 'fullwrite', 'typing', 'mixed'] : [opts.cycle];
		const cycles = requested.includes('idle') ? ['idle', ...requested.filter((c) => c !== 'idle')] : requested;
		const report = {}; const diffs = {}; let controlSlopes = null;
		for (const c of cycles) {
			process.stderr.write(`\n  cycle=${c} (k=${opts.k}, cpu=${opts.cpu})\n`);
			try {
				const { series, snapDiff } = await withinSession(browser, base, opts, c);
				if (c === 'idle') controlSlopes = controlSlopesFrom(series);
				report[c] = analyze(series, controlSlopes); diffs[c] = snapDiff;
			} catch (e) { console.error(`  cycle ${c} FAILED: ${e.message}`); }
		}
		await browser.close(); server.close();
		console.log('\n=== WITHIN-SESSION TORTURE — RISING = MK z≥1.96 AND Sen-slope > max(abs floor, 4× idle-control drift) ===');
		for (const [c, rows] of Object.entries(report)) {
			console.log(`\n  [${c}]${c === 'idle' ? ' (control — floors calibrated from this)' : ''}`);
			for (const r of rows) console.log(`    ${r.metric.padEnd(13)} ${String(r.first).padStart(10)} → ${String(r.last).padStart(10)}  Δ${String(r.delta).padStart(9)}  sen/cyc ${String(r.sen).padStart(9)} (floor ${String(r.floor).padStart(8)})  z=${String(r.z).padStart(5)}  ${r.trend}`);
			const d = diffs[c];
			if (d) {
				console.log(`    heap-diff over run: total Δ${(d.totalDelta / 1e6).toFixed(1)}MB · detached-DOM Δ${(d.detachedDelta / 1e3).toFixed(0)}KB (${d.detachedCountDelta} nodes). Top retained-size growers:`);
				for (const r of d.top) if (r.dSelf > 50000) console.log(`      ${(r.dSelf / 1e6).toFixed(2)}MB  Δcount ${String(r.dCount).padStart(7)}  ${r.k}`);
			}
		}
		if (opts.json) console.log('\nJSON ' + JSON.stringify(report));
		return;
	}

	console.error(`studio-torture: mode=${opts.mode} not yet implemented in this build.`);
	server.close();
	process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
