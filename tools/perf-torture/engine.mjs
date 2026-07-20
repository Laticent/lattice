// perf-torture ENGINE — a reusable memory/leak torture instrument for any built web app.
// App-AGNOSTIC: a caller supplies a SCENARIO (surfaces + cycles + probes; see
// scenarios/studio.mjs and the Scenario typedef below) and this engine owns the measurement:
//   • measures PEAK (un-GC'd) heap + post-GC retained (retained-flat can hide the jank/discard
//     the user feels), plus Nodes/JSEventListeners/Documents/Frames from Performance.getMetrics
//     (which aggregate across same-origin srcdoc iframes — a rising Documents/Frames count is a
//     detached-realm smoking gun; JSHeapUsedSize excludes off-heap iframe/GPU memory, so peak
//     heap is a floor, not the whole footprint — an on-device pass covers the rest);
//   • verdict = Mann-Kendall (monotonic trend, catches a shallow-but-relentless climb) AND Sen's
//     slope (robust magnitude) judged against an IDLE-CONTROL-calibrated noise floor — the memory
//     series is strongly autocorrelated, so MK alone false-positives (the idle control proves it);
//   • names the leak: an optional heap-snapshot RETAINER-PATH walk from a leaked node to its GC
//     root, so the edge names spell out the property/closure/Map chain pinning it;
//   • drives WITHOUT polluting its own measurement — every ElementHandle is disposed and clicks/
//     existence-checks on transient nodes go through in-page evaluate (returns primitives). An
//     undisposed handle PINS the node it points at and fabricates a per-cycle "leak" (proven:
//     2026-07-20-studio-audit-instrument-fix.md). Scenarios MUST use the exported helpers below.
//
// This is a DIAGNOSTIC harness (not a blocking gate) — it prints signals + a verdict.
// Run via the CLI: `node tools/perf-torture/cli.mjs --scenario studio [--mode within] [--cycle …]
// [--k 40] [--cpu 4] [--snapshot] [--retainers [--realm]]`. Needs the scenario's dist BUILT + CHROME_PATH.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { extname, isAbsolute, join, normalize, relative } from 'node:path';
import puppeteer from 'puppeteer';

const FIXED_PORT = 4319; // stable origin so the SW scope + storage persist across relaunches (refresh mode)

function parseArgs(argv) {
	const o = { scenario: 'studio', mode: 'within', cycle: 'all', k: 40, cpu: 4, refreshes: 12, seed: 'none', json: false, snapshot: false, tts: false, retainers: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--scenario') o.scenario = argv[++i];
		else if (a === '--mode') o.mode = argv[++i];
		else if (a === '--cycle') o.cycle = argv[++i];
		else if (a === '--k') o.k = Number(argv[++i]);
		else if (a === '--cpu') o.cpu = Number(argv[++i]);
		else if (a === '--refreshes') o.refreshes = Number(argv[++i]);
		else if (a === '--seed') o.seed = argv[++i];
		else if (a === '--json') o.json = true;
		else if (a === '--snapshot') o.snapshot = true;
		else if (a === '--tts') o.tts = true;
		else if (a === "--retainers") o.retainers = true;
		else if (a === "--realm") o.realm = true;
		else throw new Error(`unknown arg: ${a}`);
	}
	return o;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

function safePath(distDir, urlPath) {
	let p = decodeURIComponent(urlPath.split('?')[0]);
	if (p.endsWith('/')) p += 'index.html';
	const file = join(distDir, normalize(p));
	const rel = relative(distDir, file);
	return rel.startsWith('..') || isAbsolute(rel) ? null : file;
}

function serve(distDir) {
	return http.createServer(async (req, res) => {
		const fail = (code) => { res.writeHead(code, { 'content-type': 'text/plain' }); res.end(code === 404 ? 'not found' : 'error'); };
		try {
			const file = safePath(distDir, req.url);
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
	const storage = async () => page.evaluate(async () => {
		const out = { usage: -1, quota: -1, caches: -1, cacheEntries: -1, idb: {} };
		try { const e = await navigator.storage.estimate(); out.usage = e.usage; out.quota = e.quota; } catch {}
		try { const names = await caches.keys(); out.caches = names.length; let n = 0; for (const nm of names) { const c = await caches.open(nm); n += (await c.keys()).length; } out.cacheEntries = n; } catch {}
		try { const idbAny = indexedDB.databases ? await indexedDB.databases() : []; out.dbs = idbAny.map((d) => d.name); } catch {}
		return out;
	});
	return { cdp, perf, gc, startAlloc, stopAlloc, storage };
}

// Take a full labeled sample: GC, then retained; plus peak (pre-GC) captured by caller. `extraProbes`
// (bound to the page by the caller) layers the scenario's app-specific observables onto the
// universal Performance.getMetrics counters.
async function sample(inst, label, peakHeap, extraProbes) {
	await inst.gc(); await inst.gc(); // double-collect for a steadier retained baseline
	const p = await inst.perf();
	const pr = extraProbes ? await extraProbes() : {};
	return { label, retainedHeap: p.heapUsed, peakHeap: peakHeap ?? p.heapUsed, heapTotal: p.heapTotal, nodes: p.nodes, listeners: p.listeners, documents: p.documents, frames: p.frames, ...pr };
}

const wait = (page, ms) => page.evaluate((m) => new Promise((r) => setTimeout(r, m)), ms);
async function peakDuring(inst, fn) {
	// crude peak: sample heap a few times during the action, take max (pre-GC). The poll's
	// perf() is guarded (a closing/navigating target rejects it) and a try/finally guarantees
	// the poll is stopped + awaited even if fn() throws — else its late rejection floats and
	// crashes the process (an unhandled TargetCloseError).
	let peak = 0; let stop = false;
	const poll = (async () => { while (!stop) { try { const p = await inst.perf(); peak = Math.max(peak, p.heapUsed); } catch { break; } await new Promise((r) => setTimeout(r, 60)); } })();
	try { await fn(); } finally { stop = true; await poll.catch(() => {}); }
	return peak;
}

// ── driving helpers (exported — scenarios MUST use these, never raw page.$/waitForSelector) ──────
// OBSERVER-POLLUTION GUARD (2026-07-20): every ElementHandle returned by waitForSelector / page.$ /
// page.$$ is a reference in the DevTools remote-object group. If it is NOT disposed and the DOM node
// it points at later DETACHES (an editor toggled off, a dialog closed, a menu item unmounted), that
// handle PINS the detached node — GC can't reclaim it, and it stays counted in Performance.getMetrics
// `Nodes`/`JSEventListeners`. Held once per cycle, this fabricates a per-cycle "leak" that is purely
// the instrument observing the app (proven: a held-handle A/B turned a flat compose toggle into
// +513 nodes/cyc + 3574 detached — the exact shape a prior run misread as an app leak). So: dispose
// every handle, and prefer in-page evaluate (returns primitives, never a DOM handle) for existence
// checks and clicks on transient targets. Readiness waits use waitForFunction (its handle is a
// boolean, not a node) or settle() which disposes.
async function clickSel(page, sel, timeout = 4000) { const h = await page.waitForSelector(sel, { timeout, visible: true }); await h.click(); await h.dispose(); }
// Wait for a selector to appear, then DISPOSE the handle (readiness without pinning the node).
async function settle(page, sel, timeout = 6000) { const h = await page.waitForSelector(sel, { timeout }); await h.dispose(); }
// In-page existence check / click — return primitives so no DOM handle escapes to the remote group.
const exists = (page, sel) => page.evaluate((s) => !!document.querySelector(s), sel);
const clickIn = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (el) { el.click(); return true; } return false; }, sel);
const clickNth = (page, sel, i) => page.evaluate(([s, n]) => { const els = document.querySelectorAll(s); if (els[n]) { els[n].click(); return true; } return false; }, [sel, i]);
const countSel = (page, sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
const clickTabByText = (page, text) => page.evaluate((t) => { for (const b of document.querySelectorAll('[role="tab"]')) if (b.textContent.trim() === t) { b.click(); return true; } return false; }, text);

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

// ── retainer-path walk (name the exact reference pinning a leaked node) ──────────
// Builds the reverse-edge graph and BFS-walks from a leaked node back to a GC root, so the
// edge NAMES on the path spell out the property/closure/Map-entry chain that holds it alive.
function buildGraph(snap) {
	const meta = snap.snapshot.meta, nf = meta.node_fields, ef = meta.edge_fields;
	const NT = meta.node_types[0], ET = meta.edge_types[0];
	const nodes = snap.nodes, edges = snap.edges, strings = snap.strings;
	const NS = nf.length, ES = ef.length;
	const iNType = nf.indexOf('type'), iNName = nf.indexOf('name'), iNSelf = nf.indexOf('self_size'), iNEdge = nf.indexOf('edge_count');
	const iEType = ef.indexOf('type'), iEName = ef.indexOf('name_or_index'), iETo = ef.indexOf('to_node');
	const nCount = nodes.length / NS;
	// edge run start (in edge-records) per node
	const firstEdge = new Uint32Array(nCount + 1);
	for (let i = 0; i < nCount; i++) firstEdge[i + 1] = firstEdge[i] + nodes[i * NS + iNEdge];
	const nodeName = (i) => strings[nodes[i * NS + iNName]] ?? '';
	const nodeType = (i) => NT[nodes[i * NS + iNType]] || '?';
	const nodeSelf = (i) => nodes[i * NS + iNSelf];
	const edgeName = (e) => { const t = ET[edges[e * ES + iEType]]; const v = edges[e * ES + iEName]; return (t === 'element' || t === 'hidden') ? `[${v}]` : (t === 'internal' ? `<${strings[v] ?? v}>` : (strings[v] ?? String(v))); };
	const edgeType = (e) => ET[edges[e * ES + iEType]];
	// reverse edges: retainers[toNode] = [{from, e}] (skip weak edges — they don't retain)
	const retainers = Array.from({ length: nCount }, () => []);
	for (let i = 0; i < nCount; i++) {
		for (let e = firstEdge[i]; e < firstEdge[i + 1]; e++) {
			if (edgeType(e) === 'weak') continue;
			const to = edges[e * ES + iETo] / NS;
			retainers[to].push({ from: i, e });
		}
	}
	return { nCount, nodeName, nodeType, nodeSelf, edgeName, retainers };
}
// BFS from `start` back to a GC root; return the retainer path (nearest root). Roots = synthetic
// nodes (the "(GC roots)"/"(Global handles)"/… subtree) — recognizable by type 'synthetic'.
function retainerPath(g, start, maxDepth = 25) {
	const seen = new Uint8Array(g.nCount); const q = [[start, []]]; seen[start] = 1;
	while (q.length) {
		const [n, path] = q.shift();
		if (path.length > maxDepth) continue;
		// A real GC root is a 'synthetic' node (the "(GC roots)" subtree). Do NOT stop at
		// intermediate rope nodes ('concatenated string'/'sliced string'), whose NAME is also
		// parenthesized — that was cutting the chain short before the true holder.
		if (g.nodeType(n) === 'synthetic') return { root: g.nodeName(n) || g.nodeType(n), path };
		for (const { from, e } of g.retainers[n]) {
			if (seen[from]) continue; seen[from] = 1;
			q.push([from, [{ node: `${g.nodeType(from)}:${(g.nodeName(from) || '').slice(0, 32)}`, via: g.edgeName(e).slice(0, 40) }, ...path]]);
		}
	}
	return null;
}
// Find leaked target nodes (the retained theme-CSS / scaffold strings) and report the retainer
// chain that holds them — aggregated so the COMMON pinning reference stands out.
function retainerReport(snap, opts = {}) {
	const g = buildGraph(snap);
	const meta = snap.snapshot.meta, nf = meta.node_fields;
	const NT = meta.node_types[0]; const strings = snap.strings, nodes = snap.nodes; const NS = nf.length;
	const iNType = nf.indexOf('type'), iNName = nf.indexOf('name'), iNSelf = nf.indexOf('self_size');
	const wantBig = opts.minSelf ?? 200000; // only the big retained strings (the ~560KB theme etc.)
	const targets = [];
	for (let i = 0; i < g.nCount; i++) {
		const t = NT[nodes[i * NS + iNType]];
		const name = strings[nodes[i * NS + iNName]] ?? '';
		if (opts.realm) {
			// realm targets: the JS global environments of (detached) iframes — the true holder
			// of the FunctionTemplateInfo/AccessorInfo/PrototypeInfo bulk. A retained Window /
			// Document / native Context that is NOT the top-level page is a leaked realm.
			if (t === 'object' && (name === 'Window' || name === 'Document' || name === 'global' || /Context/.test(name))) targets.push(i);
			continue;
		}
		if (t !== 'string' && t !== 'concatenated string' && t !== 'sliced string') continue;
		const self = nodes[i * NS + iNSelf];
		// The scenario decides what a leaked object looks like (e.g. its big theme-CSS strings);
		// with no predicate, default to "any big retained string" (the ~560KB-class leak).
		if (opts.targetMatch ? opts.targetMatch(name, self) : self >= wantBig) targets.push(i);
	}
	const chains = new Map();
	let walked = 0;
	for (const t of targets) {
		if (walked >= (opts.sample ?? 12)) break;
		const r = retainerPath(g, t); walked++;
		if (!r) continue;
		// signature = the via-edge names near the string (the immediate holders)
		const sig = r.path.slice(0, 6).map((p) => p.via).join(' ◂ ');
		chains.set(sig, (chains.get(sig) || 0) + 1);
	}
	return { targetsFound: targets.length, sampleWalked: walked, chains: [...chains.entries()].sort((a, b) => b[1] - a[1]), example: targets.length ? retainerPath(g, targets[0]) : null };
}

async function withinSession(browser, base, opts, scenario, cycleName) {
	const page = await browser.newPage();
	await page.setViewport({ width: 1440, height: 900 }); // deterministic DESKTOP regime
	const cdpThrottle = await page.target().createCDPSession();
	if (opts.cpu > 1) await cdpThrottle.send('Emulation.setCPUThrottlingRate', { rate: opts.cpu });
	const surfKey = scenario.cycleSurface?.[cycleName] || Object.keys(scenario.surfaces)[0];
	const surf = scenario.surfaces[surfKey];
	if (!surf) throw new Error(`cycle ${cycleName}: unknown surface ${surfKey}`);
	await page.goto(`${base}${surf.url}`, { waitUntil: 'networkidle0', timeout: 90000 });
	await settle(page, surf.ready, 30000); // dispose the readiness handle (surf.ready can be replaced later — don't pin it)
	await wait(page, surf.settle ?? 1500);
	// Per-surface one-time setup (e.g. dial the Studio to its Build posture so every cycle shares
	// one layout → matched noise floors). App-specific → lives in the scenario's surface.setup.
	if (surf.setup) { try { await surf.setup(page, opts); } catch (e) { console.error(`    setup(${surfKey}) failed: ${e.message}`); } }
	const inst = await makeInstrument(page);
	const cyc = scenario.cycles[cycleName]; if (!cyc) throw new Error(`unknown cycle ${cycleName}`);
	const extraProbes = scenario.probes ? () => scenario.probes(page) : undefined;
	if (scenario.prep?.[cycleName]) { try { await scenario.prep[cycleName](page, opts); } catch (e) { console.error(`    prep(${cycleName}) failed: ${e.message}`); } }
	const series = [];
	let snapDiff = null, retReport = null;
	try {
		series.push(await sample(inst, 'baseline', undefined, extraProbes));
		const snapBase = opts.snapshot ? await takeSnapshot(inst.cdp) : null;
		for (let i = 0; i < opts.k; i++) {
			try {
				const peak = await peakDuring(inst, () => cyc(page));
				series.push(await sample(inst, `c${i + 1}`, peak, extraProbes));
			} catch (e) {
				// A driving failure (selector gone, target hiccup) ends THIS cycle but keeps the
				// partial series (still analyzable) and never crashes the matrix. Loud, not silent.
				console.error(`    ${cycleName}: driving failed at cycle ${i + 1} — ${String(e.message).slice(0, 120)} (partial series kept)`);
				break;
			}
			if (!opts.json && (i + 1) % 5 === 0) process.stderr.write(`    ${cycleName}: ${i + 1}/${opts.k}\r`);
		}
		if (opts.snapshot && snapBase) { await inst.gc(); await inst.gc(); const snapFinal = await takeSnapshot(inst.cdp); snapDiff = diffSnapshots(snapBase, snapFinal); }
		if (opts.retainers) {
			await inst.gc(); await inst.gc();
			process.stderr.write(`    ${cycleName}: taking retainer snapshot…\n`);
			const snapR = await takeSnapshot(inst.cdp);
			retReport = retainerReport(snapR, { sample: 16, realm: opts.realm, targetMatch: scenario.retainerTarget });
		}
	} finally {
		await page.close().catch(() => {});
	}
	return { series, snapDiff, retReport };
}

// Universal metrics every scenario gets from Performance.getMetrics, and their absolute per-cycle
// noise floors (below which a rising trend is judged NOISE even if MK is "significant" — calibrated
// from an idle control, where heap drifts ~9KB/cyc doing nothing). A scenario layers its own probe
// keys + floors on top (studio: liveIframes/cmEditors/themeCount).
const UNIVERSAL_KEYS = ['retainedHeap', 'peakHeap', 'heapTotal', 'nodes', 'listeners', 'documents', 'frames'];
const UNIVERSAL_FLOOR = { retainedHeap: 40000, peakHeap: 60000, heapTotal: 60000, nodes: 0.4, listeners: 0.4, documents: 0.1, frames: 0.1 };
// controlSlopes: metric→Sen's slope from the idle run (or null). A cycle is RISING only if its Sen's
// slope clears BOTH the absolute floor AND 4× the idle control's slope, AND MK is significant — this
// defeats the autocorrelation false-positive the idle control exposed.
function analyze(series, controlSlopes, keys, absFloor) {
	const rows = [];
	for (const k of keys) {
		const ys = series.map((s) => s[k]).filter((v) => Number.isFinite(v) && v >= 0);
		if (ys.length < 4) continue;
		const first = ys[0], last = ys[ys.length - 1];
		const mk = mannKendall(ys);
		const sen = sensSlope(ys);
		const ctrl = controlSlopes && Number.isFinite(controlSlopes[k]) ? controlSlopes[k] : 0;
		const floor = Math.max(absFloor[k] ?? 0, 4 * Math.abs(ctrl));
		const grew = mk.z >= 1.96 && sen > floor && last > first;
		rows.push({ metric: k, first, last, delta: last - first, sen: +sen.toFixed(1), floor: +floor.toFixed(1), z: mk.z, trend: grew ? 'RISING' : 'flat' });
	}
	return rows;
}
function controlSlopesFrom(series, keys) {
	const out = {};
	for (const k of keys) { const ys = series.map((s) => s[k]).filter((v) => Number.isFinite(v) && v >= 0); if (ys.length >= 4) out[k] = sensSlope(ys); }
	return out;
}

/**
 * A Scenario is pure app-knowledge (see scenarios/studio.mjs):
 * @typedef {Object} Scenario
 * @property {string}   name          Scenario id (matches the --scenario flag / filename).
 * @property {string}   distDir       Absolute path to the built site this drives (must exist).
 * @property {string[]} [defaultCycles] Cycle order for `--cycle all` (idle first = the control).
 * @property {Record<string,{url:string,ready:string,settle?:number,setup?:(page,opts)=>Promise<void>}>} surfaces
 * @property {Record<string,string>} [cycleSurface] cycle → surface key (default: first surface).
 * @property {Record<string,(page)=>Promise<void>>} cycles  "user does X once", using the exported helpers.
 * @property {Record<string,(page,opts)=>Promise<void>>} [prep] optional one-time per-cycle setup.
 * @property {(page)=>Promise<Record<string,number>>} [probes] app-specific counters to trend.
 * @property {Record<string,number>} [probeFloors] noise floors for the probe keys.
 * @property {(name:string,self:number)=>boolean} [retainerTarget] what a leaked object looks like (--retainers).
 */

/**
 * Run the torture matrix for a scenario. Owns the server, browser, cycle loop, verdict + report.
 * @param {{ scenario: Scenario, argv?: string[] }} args
 */
export async function runTorture({ scenario, argv = process.argv.slice(2) }) {
	const opts = parseArgs(argv);
	const dist = scenario.distDir;
	if (!existsSync(dist)) { console.error(`perf-torture[${scenario.name}]: no build at ${dist} — build the site first.`); process.exit(2); }
	// Universal metrics + the scenario's extra probe keys are trended together; floors merge the same way.
	const keys = [...UNIVERSAL_KEYS, ...Object.keys(scenario.probeFloors || {})];
	const absFloor = { ...UNIVERSAL_FLOOR, ...(scenario.probeFloors || {}) };
	const server = serve(dist);
	await new Promise((r) => server.listen(opts.mode === 'refresh' ? FIXED_PORT : 0, r));
	const base = `http://localhost:${server.address().port}`;

	if (opts.mode === 'within') {
		const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
		// idle is the CONTROL and runs first, so its per-metric drift becomes the noise floor.
		const ALL = scenario.defaultCycles || Object.keys(scenario.cycles);
		const requested = opts.cycle === 'all' ? ALL : opts.cycle.split(',');
		const cycles = requested.includes('idle') ? ['idle', ...requested.filter((c) => c !== 'idle')] : requested;
		const report = {}; const diffs = {}; const rets = {}; let controlSlopes = null;
		for (const c of cycles) {
			process.stderr.write(`\n  cycle=${c} (k=${opts.k}, cpu=${opts.cpu})\n`);
			try {
				const { series, snapDiff, retReport } = await withinSession(browser, base, opts, scenario, c);
				if (c === 'idle') controlSlopes = controlSlopesFrom(series, keys);
				report[c] = analyze(series, controlSlopes, keys, absFloor); diffs[c] = snapDiff; rets[c] = retReport;
			} catch (e) { console.error(`  cycle ${c} FAILED: ${e.message}`); }
		}
		await browser.close(); server.close();
		console.log(`\n=== WITHIN-SESSION TORTURE [${scenario.name}] — RISING = MK z≥1.96 AND Sen-slope > max(abs floor, 4× idle-control drift) ===`);
		for (const [c, rows] of Object.entries(report)) {
			console.log(`\n  [${c}]${c === 'idle' ? ' (control — floors calibrated from this)' : ''}`);
			for (const r of rows) console.log(`    ${r.metric.padEnd(13)} ${String(r.first).padStart(10)} → ${String(r.last).padStart(10)}  Δ${String(r.delta).padStart(9)}  sen/cyc ${String(r.sen).padStart(9)} (floor ${String(r.floor).padStart(8)})  z=${String(r.z).padStart(5)}  ${r.trend}`);
			const d = diffs[c];
			if (d) {
				console.log(`    heap-diff over run: total Δ${(d.totalDelta / 1e6).toFixed(1)}MB · detached-DOM Δ${(d.detachedDelta / 1e3).toFixed(0)}KB (${d.detachedCountDelta} nodes). Top retained-size growers:`);
				for (const r of d.top) if (r.dSelf > 50000) console.log(`      ${(r.dSelf / 1e6).toFixed(2)}MB  Δcount ${String(r.dCount).padStart(7)}  ${r.k}`);
			}
		}
		for (const [c, rr] of Object.entries(rets)) {
			if (!rr) continue;
			console.log(`\n  [${c}] RETAINER paths — ${rr.targetsFound} leaked target(s) (walked ${rr.sampleWalked}). Common pinning chain (target ◂ held-by ◂ …):`);
			for (const [sig, n] of rr.chains) console.log(`      ×${n}  ${sig}`);
			if (rr.example) { console.log(`    → nearest GC root: ${rr.example.root}. Full path (root → leaked target):`); for (const p of rr.example.path) console.log(`         ${p.node}  --${p.via}-->`); }
		}
		if (opts.json) console.log('\nJSON ' + JSON.stringify(report));
		return report;
	}

	console.error(`perf-torture: mode=${opts.mode} not yet implemented.`);
	server.close();
	process.exit(2);
}

// Driving helpers — scenarios import THESE (never raw page.$ / waitForSelector; see the
// OBSERVER-POLLUTION GUARD above). Plus the internals, for advanced/one-off scenarios.
export { buildGraph, clickIn, clickNth, clickSel, clickTabByText, countSel, diffSnapshots, exists, makeInstrument, mannKendall, median, retainerPath, retainerReport, sensSlope, settle, takeSnapshot, wait };
