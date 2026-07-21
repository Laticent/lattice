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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { extname, isAbsolute, join, normalize, relative } from 'node:path';
import puppeteer from 'puppeteer';
import { buildReport, renderJUnit, renderMarkdown } from './report.mjs';

function parseArgs(argv) {
	const o = { scenario: 'studio', mode: 'within', cycle: 'all', k: 40, cpu: 4, refreshes: 12, seed: 'none', json: false, snapshot: false, tts: false, retainers: false, listeners: false, out: null, junit: false };
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
		else if (a === '--listeners') o.listeners = true;
		else if (a === '--out') o.out = argv[++i];
		else if (a === '--junit') o.junit = true;
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
	// `|| p.heapUsed` (not `??`): a peakDuring that never got a successful poll returns 0, which is
	// not a valid peak — fall back to the post-GC retained rather than recording a spurious 0.
	return { label, retainedHeap: p.heapUsed, peakHeap: peakHeap || p.heapUsed, heapTotal: p.heapTotal, nodes: p.nodes, listeners: p.listeners, documents: p.documents, frames: p.frames, ...pr };
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

// ── autonomous-driving primitives (for the `explore` crawl driver — 2026-07-20-autonomous-torture-profiler.md) ──
// A greedy crawler can't use author-written selectors — it must DISCOVER controls. These two primitives
// let it do that WITHOUT breaking the observer-pollution invariant (they run entirely in-page and return
// PRIMITIVES — descriptors / result objects — never an ElementHandle). resolveAndClick re-resolves the
// selector and re-checks role+label before clicking as a STALENESS GUARD — but this is a HEURISTIC, not
// node identity: role+label equality can (a) falsely MATCH a recycled / duplicate-labeled control (two
// gallery buttons both "Insert Blank") and mis-click, or (b) falsely MISMATCH a volatile label ("Slide 3
// of 12" → "Slide 4 of 12", §4.1) and abort. Reconciling that with a structural corroborator is a Slice-3
// watch (see the design doc §8); for now the guard catches the common case, not every case.
// SCOPE: both primitives query the TOP document only — they do NOT descend into (same-origin srcdoc)
// iframes, so controls inside Studio/Playground preview realms are invisible to discovery (a coverage
// hole exactly where realm leaks live; per-frame enumeration is Slice-3 work).
// The `INTERACTABLE_SEL` set is the clickable surface a leak hunter cares about; extend per scenario.
const INTERACTABLE_SEL = 'button, a[href], [role="button"], [role="tab"], [role="link"], [role="menuitem"], [role="switch"], [role="checkbox"], summary, [contenteditable="true"]';
// The in-page a11y probe (accessible-name + role) is defined INLINE in each evaluate below. It can't be
// shared via a closure (page.evaluate serializes the function and runs it in the page — outer bindings
// don't cross) nor via injected `eval` (an eval'd `const` doesn't leak to the enclosing scope). So the
// `norm`/`roleOf`/`labelOf` trio is duplicated in both primitives BY NECESSITY — KEEP THE TWO COPIES
// IDENTICAL, or enumeration and verification would disagree and resolveAndClick would falsely abort.
// enumerateInteractables — the visible clickable controls as plain DESCRIPTORS
// ({ selector, stable, role, label, rect }). Every returned `selector` is VERIFIED to resolve to exactly
// one node: a semantic key (id / unique aria-label / unique data-*) when one is unique, else a structural
// nth-of-type path that is itself uniq()-checked (a control whose only selector is non-unique is dropped,
// not emitted). `stable:false` marks the structural fallback (fragile across mutation — which is exactly
// why resolveAndClick re-verifies). Returns primitives only → nothing is pinned.
function enumerateInteractables(page, opts = {}) {
	return page.evaluate((sel, max) => {
		// a11y probe — KEEP IDENTICAL to the copy in resolveAndClick (see note above).
		const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 80);
		const roleOf = (el) => {
			const r = el.getAttribute('role'); if (r) return r;
			const t = el.tagName.toLowerCase();
			if (t === 'a') return 'link';
			if (t === 'button' || t === 'summary') return 'button';
			if (t === 'input') return `input:${el.getAttribute('type') || 'text'}`;
			if (el.isContentEditable) return 'textbox';
			return t;
		};
		const labelOf = (el) => norm(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.getAttribute('alt') || '');
		const isVisible = (el) => {
			const r = el.getBoundingClientRect();
			if (r.width < 1 || r.height < 1) return false;
			const st = getComputedStyle(el);
			return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
		};
		const attrEsc = (v) => v.replace(/["\\]/g, '\\$&');
		const uniq = (s) => { try { return document.querySelectorAll(s).length === 1; } catch { return false; } };
		const cssPath = (el) => {
			const parts = []; let node = el;
			while (node && node.nodeType === 1 && node !== document.body && parts.length < 8) {
				if (node.id && uniq(`#${CSS.escape(node.id)}`)) { parts.unshift(`#${CSS.escape(node.id)}`); return parts.join(' > '); }
				const tag = node.tagName.toLowerCase();
				const sibs = node.parentNode ? [...node.parentNode.children].filter((c) => c.tagName === node.tagName) : [node];
				parts.unshift(sibs.length > 1 ? `${tag}:nth-of-type(${sibs.indexOf(node) + 1})` : tag);
				node = node.parentElement;
			}
			return parts.join(' > ');
		};
		const selectorFor = (el) => {
			if (el.id && uniq(`#${CSS.escape(el.id)}`)) return { selector: `#${CSS.escape(el.id)}`, stable: true };
			const al = el.getAttribute('aria-label');
			if (al) { const s = `[aria-label="${attrEsc(al)}"]`; if (uniq(s)) return { selector: s, stable: true }; }
			for (const a of ['data-demo', 'data-testid', 'data-test', 'name']) {
				const v = el.getAttribute(a); if (v) { const s = `[${a}="${attrEsc(v)}"]`; if (uniq(s)) return { selector: s, stable: true }; }
			}
			// Structural fallback: a descendant-relative nth-of-type path can be NON-unique (it caps at 8
			// hops and isn't anchored to :scope/body — two deep attribute-poor subtrees can share a path).
			// So verify it too; a non-unique fallback returns null and enumerate skips it (below). This is
			// what makes the "verified-unique selector" contract actually true, not just for semantic keys.
			const p = cssPath(el);
			return p && uniq(p) ? { selector: p, stable: false } : { selector: null, stable: false };
		};
		const out = [], seen = new Set();
		for (const el of document.querySelectorAll(sel)) {
			if (out.length >= max) break;
			if (!isVisible(el)) continue;
			const { selector, stable } = selectorFor(el);
			if (!selector || seen.has(selector)) continue;
			seen.add(selector);
			const r = el.getBoundingClientRect();
			out.push({ selector, stable, role: roleOf(el), label: labelOf(el), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } });
		}
		return out;
	}, opts.selector || INTERACTABLE_SEL, opts.max ?? 200);
}
// resolveAndClick — resolve a descriptor's selector, re-check the resolved node's role+label against the
// descriptor (a staleness HEURISTIC — not identity; see the block comment above on its two failure modes),
// then click — all in ONE in-page evaluate so there is no gap, and returning a plain result
// ({ ok, reason?, got?, count? }), never a handle. The driver MUST re-enumerate after each action (the
// state mutated) and act on FRESH descriptors; this primitive is the guard on the individual click.
function resolveAndClick(page, descriptor) {
	return page.evaluate((d) => {
		// a11y probe — KEEP IDENTICAL to the copy in enumerateInteractables (see note above).
		const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 80);
		const roleOf = (el) => {
			const r = el.getAttribute('role'); if (r) return r;
			const t = el.tagName.toLowerCase();
			if (t === 'a') return 'link';
			if (t === 'button' || t === 'summary') return 'button';
			if (t === 'input') return `input:${el.getAttribute('type') || 'text'}`;
			if (el.isContentEditable) return 'textbox';
			return t;
		};
		const labelOf = (el) => norm(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.getAttribute('alt') || '');
		let els; try { els = document.querySelectorAll(d.selector); } catch { return { ok: false, reason: 'bad-selector' }; }
		if (els.length === 0) return { ok: false, reason: 'not-found' };
		if (els.length > 1) return { ok: false, reason: 'ambiguous', count: els.length };
		const el = els[0];
		const role = roleOf(el), label = labelOf(el);
		if (role !== d.role || label !== d.label) return { ok: false, reason: 'mismatch', got: { role, label } };
		// Keep the "always returns a result object" contract: `el.click` can be non-callable on a matched
		// non-HTML element (an inline-SVG `a[href]` resolves to an SVGAElement, which has no click()), or
		// the click can synchronously throw for other reasons. (A throwing click *listener* is NOT caught
		// here — the DOM reports listener exceptions to window.onerror, not to this caller.)
		try { el.click(); } catch { return { ok: false, reason: 'click-threw' }; }
		return { ok: true };
	}, descriptor);
}

// ── heap-snapshot capture + per-constructor diff (root-cause attribution) ────────
// `withRaw` also returns the raw JSON string (the exact V8/DevTools `.heapsnapshot` bytes) so the
// caller can write it to disk under --out — otherwise the raw chunks are parsed and discarded.
async function takeSnapshot(cdp, { withRaw = false } = {}) {
	const chunks = [];
	const onChunk = (c) => chunks.push(c.chunk);
	cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
	await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
	cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
	const raw = chunks.join('');
	const snap = JSON.parse(raw);
	return withRaw ? { snap, raw } : snap;
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
// A retainer chain rooted at (or threaded through) the attached DevTools inspector is an ARTIFACT, not
// an app holder: with a heap client attached, closures/objects the console evaluated or the protocol
// pinned are held by `<DevTools console>` / `blink::ScriptStateProtectingContext`, so the nearest-root
// BFS lands on the inspector instead of the real retainer. Naming it lets the report say "re-measure
// without a heap client" rather than misattributing the hold (2026-07-21-studio-compose-listener-leak-
// is-a-perf-overlay-artifact.md meta-follow-up; same contamination class as the realm over-count).
const INSPECTOR_RE = /DevTools|ScriptStateProtectingContext|InspectorConsole|V8DebuggerAgent|<inspector>/i;
function isInspectorChain(r) {
	if (!r) return false;
	if (INSPECTOR_RE.test(r.root || '')) return true;
	return (r.path || []).some((p) => INSPECTOR_RE.test(p.node || '') || INSPECTOR_RE.test(p.via || ''));
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
		const self = nodes[i * NS + iNSelf];
		// A scenario's `retainerTarget(name, self)` decides what a leaked object looks like — applied
		// to EVERY node type, so an app whose leak is a listener/closure/accumulating-object (the most
		// COMMON JS leak), not a big string, can name it too. With no predicate, default to "any big
		// retained STRING" (the ~560KB-class leak this tool was born on) — strings only, to keep the
		// default signal legible rather than dumping every large native object.
		if (opts.targetMatch) { if (opts.targetMatch(name, self)) targets.push(i); continue; }
		if (t !== 'string' && t !== 'concatenated string' && t !== 'sliced string') continue;
		if (self >= wantBig) targets.push(i);
	}
	const chains = new Map();
	let walked = 0, inspectorContaminated = 0;
	for (const t of targets) {
		if (walked >= (opts.sample ?? 12)) break;
		const r = retainerPath(g, t); walked++;
		if (!r) continue;
		if (isInspectorChain(r)) inspectorContaminated++;
		// signature = the via-edge names near the string (the immediate holders)
		const sig = r.path.slice(0, 6).map((p) => p.via).join(' ◂ ');
		chains.set(sig, (chains.get(sig) || 0) + 1);
	}
	const example = targets.length ? retainerPath(g, targets[0]) : null;
	return { targetsFound: targets.length, sampleWalked: walked, inspectorContaminated, chains: [...chains.entries()].sort((a, b) => b[1] - a[1]), example, exampleIsInspector: isInspectorChain(example) };
}

// ── --listeners: net-live event-listener tally (opt-in) ────────────────────────
// WHY a bespoke tally when Performance already reports JSEventListeners: the raw counter says a number
// MOVED, never WHERE or WHETHER-IT-STAYS. A listener churned onto a button that then GCs is not a leak;
// one added to `document`/`window` (which never GC) is. This patch, installed via evaluateOnNewDocument
// BEFORE any app code, holds a WeakRef to each target and matches removes, so after a forced GC the
// survivors are the genuinely-live listeners — and it records the ADD-SITE stack, so the growth is
// NAMED. This is the method that caught the #1139 web-vitals artifact (2026-07-21-studio-compose-
// listener-leak-is-a-perf-overlay-artifact.md): an add-CALL tally over-counted Radix/ProseMirror churn
// and buried the real source. Deliberately conservative — it can over-count churn, but a real
// document/window leak always derefs live, so it can NOT be under-counted. Trustworthy magnitude stays
// the JSEventListeners metric; this mode's job is WHERE + WHETHER-PERSISTENT, not sizing.
const LISTENER_PATCH = () => {
	const idOf = new WeakMap(); let nextId = 1;
	const lid = (l) => { if (!l || (typeof l !== 'function' && typeof l !== 'object')) return 'x'; let id = idOf.get(l); if (!id) { id = nextId++; idOf.set(l, id); } return id; };
	const perTarget = new WeakMap();
	const entries = [];
	const cap = (o) => (typeof o === 'boolean' ? o : !!o?.capture);
	const key = (type, l, c) => `${type}|${c ? 1 : 0}|${lid(l)}`;
	const oAdd = EventTarget.prototype.addEventListener;
	const oRem = EventTarget.prototype.removeEventListener;
	EventTarget.prototype.addEventListener = function (type, listener, opts) {
		try {
			// A {once:true} listener removes ITSELF after it fires — WITHOUT a removeEventListener call this
			// patch can observe — so counting it would fabricate a persistent "leak" the browser already
			// reclaimed (and the JSEventListeners metric never showed). It is self-cleaning by contract, not
			// a leak vector, so it is deliberately not tracked.
			const once = typeof opts === 'object' && !!opts?.once;
			if (!once) {
				const c = cap(opts);
				let m = perTarget.get(this); if (!m) { m = new Map(); perTarget.set(this, m); }
				const k = key(type, listener, c);
				// Dedup identical (target,type,listener,capture) the way the browser does, so re-adds of a
				// stable handler don't inflate the count; a fresh closure per add (the leak shape) is distinct.
				if (!m.has(k)) { const e = { ref: new WeakRef(this), type, removed: false, stack: (new Error().stack || '').split('\n').slice(2, 7).map((s) => s.trim()).join(' <- ') }; m.set(k, e); entries.push(e); }
			}
		} catch {}
		return oAdd.call(this, type, listener, opts);
	};
	EventTarget.prototype.removeEventListener = function (type, listener, opts) {
		try { const m = perTarget.get(this); if (m) { const k = key(type, listener, cap(opts)); const e = m.get(k); if (e) { e.removed = true; m.delete(k); } } } catch {}
		return oRem.call(this, type, listener, opts);
	};
	// A target is PERSISTENT if it won't be reclaimed by GC — so a listener added there and never
	// removed is a genuine permanent leak. That's not just document/window: `document.head`, a
	// `MediaQueryList` from matchMedia (never-removed `change` listeners are one of the MOST common real
	// leaks), `visualViewport`/`screen`, and any element STILL CONNECTED to the live DOM (a persistent
	// app-root / portal / toast container) all outlive GC too. Everything else — detached nodes, buttons
	// recreated each cycle — is churn a real GC frees. (Narrowing this to document/window was the review's
	// #1 finding: it mislabeled head/MQL/app-root leaks as "transient, not a leak" — the exact false
	// negative this instrument exists to prevent.)
	const persistent = (t) => {
		if (t === document || t === window || t === document.documentElement || t === document.body || t === document.head) return true;
		if (typeof MediaQueryList !== 'undefined' && t instanceof MediaQueryList) return true;
		if (t === window.visualViewport || t === window.screen) return true;
		if (t && t.nodeType === 1 && t.isConnected) return true; // still in the live DOM tree → won't GC while connected
		return false;
	};
	const describe = (t) => {
		if (t === document) return 'document'; if (t === window) return 'window';
		if (t === document.documentElement) return 'html'; if (t === document.body) return 'body';
		if (t && t.nodeType === 1) { const el = t; const slot = el.getAttribute?.('data-slot'); const cls = typeof el.className === 'string' && el.className ? '.' + el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : ''; return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls}${slot ? `[slot=${slot}]` : ''}${el.isConnected ? '' : ' (detached)'}`; }
		return Object.prototype.toString.call(t);
	};
	// Live snapshot, bucketed by `type @ target-description`. `persistent` = on a target that never GCs
	// (document/window/html/body) → growth here is a genuine permanent leak; everything else is churn.
	window.__perfTortureListeners = () => {
		const buckets = new Map();
		for (const e of entries) {
			if (e.removed) continue; const t = e.ref.deref(); if (!t) continue;
			const k = `${e.type} @ ${describe(t)}`;
			const b = buckets.get(k) || { live: 0, persistent: persistent(t), stack: e.stack };
			b.live++; buckets.set(k, b);
		}
		return [...buckets.entries()].map(([k, v]) => ({ key: k, live: v.live, persistent: v.persistent, stack: v.stack }));
	};
};
// Diff two `__perfTortureListeners()` snapshots (baseline → final) into the buckets that GREW, and rate
// the PERSISTENT growth (targets that never GC → a real leak) against the per-cycle floor. Transient
// growth is churn a real GC frees. `k` is the number of cycles BETWEEN the two snapshots. The `leak`
// verdict is computed HERE (pure) rather than inline at the call site, so it is unit-testable.
function diffListeners(base, final, k, floor = 0.4) {
	if (!base || !final) return null;
	const baseMap = new Map(base.map((b) => [b.key, b.live]));
	const grown = final.map((f) => ({ key: f.key, live: f.live, delta: f.live - (baseMap.get(f.key) || 0), persistent: f.persistent, stack: f.stack }))
		.filter((f) => f.delta > 0)
		.sort((a, b) => (Number(b.persistent) - Number(a.persistent)) || (b.delta - a.delta));
	const persistentGrowth = grown.filter((f) => f.persistent);
	const totalPersistentDelta = persistentGrowth.reduce((s, f) => s + f.delta, 0);
	const persistentPerCyc = k ? +(totalPersistentDelta / k).toFixed(2) : 0;
	return { grown, persistentGrowth, totalPersistentDelta, persistentPerCyc, floor, leak: persistentPerCyc >= floor };
}

async function withinSession(browser, base, opts, scenario, cycleName) {
	const page = await browser.newPage();
	await page.setViewport({ width: 1440, height: 900 }); // deterministic DESKTOP regime
	const cdpThrottle = await page.target().createCDPSession();
	if (opts.cpu > 1) await cdpThrottle.send('Emulation.setCPUThrottlingRate', { rate: opts.cpu });
	const surfKey = scenario.cycleSurface?.[cycleName] || Object.keys(scenario.surfaces)[0];
	const surf = scenario.surfaces[surfKey];
	if (!surf) throw new Error(`cycle ${cycleName}: unknown surface ${surfKey}`);
	// --listeners: install the add/removeEventListener tally BEFORE any app script runs, so no
	// registration escapes it (evaluateOnNewDocument fires on every fresh document, before scripts).
	if (opts.listeners) await page.evaluateOnNewDocument(LISTENER_PATCH);
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
	let snapDiff = null, retReport = null, heapSnapshotFile = null, listenerReport = null;
	const outDir = opts._outDir; // resolved absolute dir (or undefined) — see runTorture
	try {
		series.push(await sample(inst, 'baseline', undefined, extraProbes));
		const snapBase = opts.snapshot ? await takeSnapshot(inst.cdp) : null;
		// --listeners: the baseline listener snapshot is taken AFTER the FIRST measured cycle, not before
		// the loop. That first cycle is the warm-up: a one-time lazy attach (a handler a component installs
		// on its FIRST interaction, then leaves) lands during it and folds into the baseline, so only
		// SUSTAINED growth over the remaining k−1 cycles survives — matching JSEventListeners. Doing it
		// in-loop (vs an extra pre-loop cycle) means the heap/node baseline (`series[0]`) is UNPERTURBED,
		// so `--listeners` doesn't shift the RISING verdict for the other metrics (review finding #3). No
		// GC before this read: persistent targets (document/window/MQL/…) never GC, so the persistent diff
		// is GC-invariant; only the final read GCs, to drop transient churn from the display.
		let listenerBase = null, listenerCycles = 0;
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
			if (opts.listeners && i === 0) listenerBase = await page.evaluate(() => window.__perfTortureListeners());
			else if (opts.listeners) listenerCycles++; // cycles measured AFTER the warm-up baseline
			if (!opts.json && (i + 1) % 5 === 0) process.stderr.write(`    ${cycleName}: ${i + 1}/${opts.k}\r`);
		}
		// Snapshot + retainer are OPTIONAL attribution on top of the series — and the likeliest to
		// blow (takeSnapshot buffers the whole heap → JSON.parse hits V8's ~512MB string cap or OOMs
		// exactly when the app is leaking, the case you most want the run for). Each is guarded so a
		// heap-dump failure logs and is dropped WITHOUT discarding the K-loop series already collected.
		if (opts.snapshot && snapBase) {
			try {
				await inst.gc(); await inst.gc();
				// Under --out, capture the raw V8 bytes of the FINAL snapshot and write a loadable
				// `.heapsnapshot` alongside the report (DevTools ▸ Memory ▸ Load).
				const taken = await takeSnapshot(inst.cdp, { withRaw: !!outDir });
				const snapFinal = outDir ? taken.snap : taken;
				snapDiff = diffSnapshots(snapBase, snapFinal);
				if (outDir) { heapSnapshotFile = `${cycleName}.heapsnapshot`; await writeFile(join(outDir, heapSnapshotFile), taken.raw); }
			} catch (e) { console.error(`    ${cycleName}: snapshot diff unavailable — ${String(e.message).slice(0, 120)} (series kept)`); }
		}
		if (opts.retainers) {
			try {
				await inst.gc(); await inst.gc();
				process.stderr.write(`    ${cycleName}: taking retainer snapshot…\n`);
				// Only capture raw here if the snapshot path above didn't already write the file.
				const needRaw = !!outDir && !heapSnapshotFile;
				const taken = await takeSnapshot(inst.cdp, { withRaw: needRaw });
				const snapR = needRaw ? taken.snap : taken;
				retReport = retainerReport(snapR, { sample: 16, realm: opts.realm, targetMatch: scenario.retainerTarget });
				if (needRaw) { heapSnapshotFile = `${cycleName}.heapsnapshot`; await writeFile(join(outDir, heapSnapshotFile), taken.raw); }
			} catch (e) { console.error(`    ${cycleName}: retainer report unavailable — ${String(e.message).slice(0, 120)} (series kept)`); }
		}
		if (opts.listeners && listenerBase) {
			try {
				// Force GC first so churned (reachable-but-detached) listeners drop out and only the
				// genuinely-live survivors remain — the whole point of a NET-LIVE (not add-call) tally.
				await inst.gc(); await inst.gc();
				const listenerFinal = await page.evaluate(() => window.__perfTortureListeners());
				// Rate over the cycles measured AFTER the warm-up baseline, against the scenario's listener
				// floor (same basis as the JSEventListeners metric verdict).
				const lFloor = scenario.universalFloors?.listeners ?? UNIVERSAL_FLOOR.listeners ?? 0.4;
				listenerReport = diffListeners(listenerBase, listenerFinal, listenerCycles, lFloor);
			} catch (e) { console.error(`    ${cycleName}: listener tally unavailable — ${String(e.message).slice(0, 120)} (series kept)`); }
		}
	} finally {
		await page.close().catch(() => {});
	}
	return { series, snapDiff, retReport, heapSnapshotFile, listenerReport };
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
		const raw = series.map((s) => s[k]);
		const ys = raw.filter((v) => Number.isFinite(v) && v >= 0);
		if (ys.length < 4) {
			// Distinguish "never measured" from "flat": a probe that returned its unavailable
			// sentinel (a negative, e.g. themeCount=-1 when the global is absent) every sample would
			// otherwise silently vanish — you'd read no row as "fine" when it was never observed.
			if (raw.some((v) => Number.isFinite(v) && v < 0)) rows.push({ metric: k, first: '—', last: '—', delta: '—', sen: '—', floor: '—', z: '—', trend: 'unavailable' });
			continue;
		}
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

// ── realm-class growth guard (2026-07-20-playground-theme-toggle-not-a-leak.md) ──────────────
// The retained-heap number this tool trends is `JSHeapUsedSize` after `HeapProfiler.collectGarbage` — a
// V8 GC that does NOT force Blink's detached-context disposal. So a detached iframe REALM stays counted
// across the CDP GC even when a real idle GC would reclaim it — which once read as a 361 KB/lap
// "leak" that a no-CDP measure showed was ~16 KB/toggle, reclaimed on idle. BUT the reverse is also
// possible: a JS reference that PINS a detached realm forever presents IDENTICALLY in the snapshot. The
// tool CANNOT tell the two apart from a heap dump — so it must not assert either; it flags realm-class
// growth as needing a no-CDP re-measure to decide.
//
// ANCHOR precisely (grounded in a real Playground-toggle snapshot): trigger only on classes ORDINARY app
// JS cannot mint — `FunctionTemplateInfo`/`ObjectTemplateInfo` (V8 C++ native-binding templates, created
// per realm/context, not by any JS), `NativeContext`/`ScriptContext` (the realm roots). Deliberately NOT
// the LOUD-but-AMBIGUOUS growers that realm churn *also* produces yet ordinary leaks produce too:
// `system / Context` (a CLOSURE context — accumulating closures is the commonest JS leak),
// `AccessorPair`/`AccessorInfo`/`PrototypeInfo` (any getter/setter/prototype), `PropertyCell`. Anchoring
// on the JS-unmintable classes means a real closure/accessor/object leak is NOT mislabeled "realm" and
// dismissed — the dangerous false-negative the adversarial trio flagged.
const REALM_ANCHORS = /NativeContext|FunctionTemplateInfo|ObjectTemplateInfo|ScriptContext/;
function realmClassGrowth(snapDiff) {
	if (!snapDiff?.top) return null;
	const hits = snapDiff.top.filter((r) => r.dCount > 20 && REALM_ANCHORS.test(r.k));
	return hits.length ? hits.map((r) => `${r.k} (Δ${r.dCount})`) : null;
}
// Possibility, NOT fact — the tool has no signal to distinguish a reclaimable detached realm from a
// forever-pinned one; it must not assert either.
const REALM_UNCONFIRMED = 'realm-class growth — the retained-heap metric is a KNOWN blind spot here: this MAY be a reclaimable HeapProfiler over-count (detached contexts a real GC frees) OR a genuinely pinned realm leak (a JS ref holding a detached realm forever) — they are INDISTINGUISHABLE from a heap dump. Re-measure WITHOUT a heap client to decide: performance.measureUserAgentSpecificMemory() (its own GC) or a real device. See tools/perf-torture/README.md §Limits + 2026-07-20-playground-theme-toggle-not-a-leak.md.';

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
 * @property {(page)=>Promise<Record<string,number>>} [probes] app-specific counters to trend (numbers; a NEGATIVE is treated as an "unavailable" sentinel, reported as such — not flat).
 * @property {Record<string,number>} [probeFloors] noise floors for the probe keys — a probe key MUST appear here to be trended.
 * @property {Record<string,number>} [universalFloors] override the built-in (Studio-derived) absolute floors for the universal heap/DOM metrics; set these for a lighter app or a real slow leak may read as "flat".
 * @property {(name:string,self:number)=>boolean} [retainerTarget] what a leaked object looks like (--retainers); applied to EVERY node type, so a listener/closure/object leak (not just a big string) can be named.
 */

/**
 * Run the torture matrix for a scenario. Owns the server, browser, cycle loop, verdict + report.
 * @param {{ scenario: Scenario, argv?: string[] }} args
 */
export async function runTorture({ scenario, argv = process.argv.slice(2) }) {
	const opts = parseArgs(argv);
	// Fail loud + actionable BEFORE spinning up a server/browser — a silent empty run reads as "clean".
	if (opts.mode !== 'within') { console.error(`perf-torture: mode=${opts.mode} not yet implemented (only --mode within).`); process.exit(2); }
	if (!Number.isInteger(opts.k) || opts.k < 3) { console.error(`perf-torture: --k must be an integer ≥ 3 (the trend test needs ≥4 samples); got ${opts.k}.`); process.exit(2); }
	if (!Number.isFinite(opts.cpu) || opts.cpu < 1) { console.error(`perf-torture: --cpu must be a number ≥ 1; got ${opts.cpu}.`); process.exit(2); }
	// Unset CHROME_PATH → puppeteer silently launches its OWN bundled Chromium (a DIFFERENT browser,
	// different GC), or throws a raw stack. Demand it, mirroring the dist pre-check.
	if (!process.env.CHROME_PATH) { console.error('perf-torture: CHROME_PATH is not set — export it to a Chromium (see engineering/development.md).'); process.exit(2); }
	const dist = scenario.distDir;
	if (!existsSync(dist)) { console.error(`perf-torture[${scenario.name}]: no build at ${dist} — build the site first.`); process.exit(2); }
	// Universal metrics + the scenario's extra probe keys trend together; floors merge the same way.
	// UNIVERSAL_FLOOR is a Studio-DERIVED last resort (tuned to a heavy app: CodeMirror + srcdoc
	// iframes + ~560KB theme strings). A lighter app should override it via `scenario.universalFloors`,
	// or a small-but-real slow leak sits below the floor and reads as "flat" (a false negative — the
	// scariest verdict for a leak-hunter). Warn when a scenario relies on the built-in defaults.
	if (!scenario.universalFloors) console.error(`  ⚠ [${scenario.name}] no scenario.universalFloors — heap/node floors use the built-in Studio-derived defaults; on a lighter app a real slow leak can read as "flat". See tools/perf-torture/README.md.`);
	const keys = [...UNIVERSAL_KEYS, ...Object.keys(scenario.probeFloors || {})];
	const absFloor = { ...UNIVERSAL_FLOOR, ...(scenario.universalFloors || {}), ...(scenario.probeFloors || {}) };
	// --out <dir>: write the report artifacts (report.json + report.md, + .heapsnapshot under
	// --snapshot/--retainers, + report.junit.xml under --junit). Resolve + create it up front so a
	// bad path fails before the long run, not after. --junit without --out is a no-op → warn.
	let outDir;
	if (opts.out) { outDir = isAbsolute(opts.out) ? opts.out : join(process.cwd(), opts.out); await mkdir(outDir, { recursive: true }); opts._outDir = outDir; }
	else if (opts.junit) console.error('  ⚠ --junit has no effect without --out <dir> (nothing is written).');
	const startedAt = Date.now();
	const server = serve(dist);
	await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, resolve); });
	const base = `http://localhost:${server.address().port}`;

	{
		const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
		// idle is the CONTROL — it calibrates the noise floor + defeats the autocorrelation false-
		// positive. ALWAYS run it first when the scenario defines one, even for a single-cycle run
		// (`--cycle compose`), so the verdict is never silently uncalibrated. Warn if there is none.
		const ALL = scenario.defaultCycles || Object.keys(scenario.cycles);
		const requested = opts.cycle === 'all' ? ALL : opts.cycle.split(',');
		const hasIdle = typeof scenario.cycles.idle === 'function';
		const cycles = hasIdle ? ['idle', ...requested.filter((c) => c !== 'idle')] : requested;
		if (!hasIdle) console.error('  ⚠ scenario has no `idle` control cycle — verdict is UNCALIBRATED (floors are absolute-only; RISING may false-positive).');
		const report = {}; const diffs = {}; const rets = {}; const seriesByCycle = {}; const snapFiles = {}; const lsts = {}; let controlSlopes = null;
		for (const c of cycles) {
			process.stderr.write(`\n  cycle=${c} (k=${opts.k}, cpu=${opts.cpu})\n`);
			try {
				const { series, snapDiff, retReport, heapSnapshotFile, listenerReport } = await withinSession(browser, base, opts, scenario, c);
				if (c === 'idle') controlSlopes = controlSlopesFrom(series, keys);
				report[c] = analyze(series, controlSlopes, keys, absFloor); diffs[c] = snapDiff; rets[c] = retReport; seriesByCycle[c] = series; snapFiles[c] = heapSnapshotFile; lsts[c] = listenerReport;
			} catch (e) { console.error(`  cycle ${c} FAILED: ${e.message}`); }
		}
		await browser.close(); server.close();
		// The verdict's stated basis must match what actually ran: only claim the idle-control term
		// when a control was measured (controlSlopes !== null), else say the floors are absolute-only.
		const calibrated = controlSlopes !== null;
		const floorBasis = calibrated ? 'max(abs floor, 4× idle-control drift)' : 'the absolute floor ONLY — UNCALIBRATED, no idle control ran; RISING may false-positive';
		console.log(`\n=== WITHIN-SESSION TORTURE [${scenario.name}] — RISING = MK z≥1.96 AND Sen-slope > ${floorBasis} ===`);
		for (const [c, rows] of Object.entries(report)) {
			console.log(`\n  [${c}]${c === 'idle' ? ' (control — floors calibrated from this)' : ''}`);
			for (const r of rows) console.log(`    ${r.metric.padEnd(13)} ${String(r.first).padStart(10)} → ${String(r.last).padStart(10)}  Δ${String(r.delta).padStart(9)}  sen/cyc ${String(r.sen).padStart(9)} (floor ${String(r.floor).padStart(8)})  z=${String(r.z).padStart(5)}  ${r.trend}`);
			const d = diffs[c];
			if (d) {
				console.log(`    heap-diff over run: total Δ${(d.totalDelta / 1e6).toFixed(1)}MB · detached-DOM Δ${(d.detachedDelta / 1e3).toFixed(0)}KB (${d.detachedCountDelta} nodes). Top retained-size growers:`);
				for (const r of d.top) if (r.dSelf > 50000) console.log(`      ${(r.dSelf / 1e6).toFixed(2)}MB  Δcount ${String(r.dCount).padStart(7)}  ${r.k}`);
				const realm = realmClassGrowth(d);
				if (realm) console.log(`    ⚠ REALM-CLASS GROWTH (${realm.slice(0, 3).join(', ')}${realm.length > 3 ? ', …' : ''}) — ${REALM_UNCONFIRMED}`);
			}
		}
		for (const [c, rr] of Object.entries(rets)) {
			if (!rr) continue;
			// Honest label: this walks ONE final snapshot — it names who HOLDS the big/targeted objects,
			// it does NOT prove they grew. Pair with --snapshot (a baseline→final diff) to establish a
			// leak first. Under --realm the count includes the live top-level Window/Document (~1–2).
			const note = opts.realm ? ' (incl. the live top-level realm — ~1–2 are not leaks)' : '';
			console.log(`\n  [${c}] RETAINER paths — ${rr.targetsFound} large retained target(s)${note}; static snapshot, NOT a growth diff (walked ${rr.sampleWalked}). Common pinning chain (target ◂ held-by ◂ …):`);
			for (const [sig, n] of rr.chains) console.log(`      ×${n}  ${sig}`);
			if (rr.example) { console.log(`    → nearest GC root: ${rr.example.root}. Full path (root → target):`); for (const p of rr.example.path) console.log(`         ${p.node}  --${p.via}-->`); }
			if (rr.inspectorContaminated) console.log(`    \u26a0 ${rr.inspectorContaminated}/${rr.sampleWalked} walked chain(s) root at the DEVTOOLS INSPECTOR (DevTools console / ScriptStateProtectingContext) \u2014 an ARTIFACT of the attached heap client, NOT an app holder${rr.exampleIsInspector ? ' (incl. the example above)' : ''}. Re-measure WITHOUT a heap client to name the real holder (README \u00a7Limits).`);
			// A method caveat (NOT an assertion this run leaked): --realm names retained realms but this is a
			// static snapshot, and the count includes the live top-level realm — so it can't establish GROWTH.
			// Only the --snapshot realm-class banner (gated on measured growth) flags a verdict.
			if (opts.realm) console.log('    ℹ realm targets are a STATIC snapshot, not a growth diff — run with --snapshot to establish realm-class GROWTH, and re-measure any growth without a heap client (see README §Limits) to tell a pinned leak from a reclaimable over-count.');
		}
			// --listeners: NET-LIVE growth per cycle (post-GC), split persistent (document/window/html/body →
			// never GC → a real leak) vs transient (churn a real GC frees). The add-SITE is printed so growth
			// is NAMED, not just counted — the discriminator that caught the #1139 web-vitals artifact.
			for (const [c, lr] of Object.entries(lsts)) {
				if (!lr) continue;
				// `leak`/`floor` are computed in diffListeners (pure, tested); just render them.
				const tag = lr.leak ? '  \u26a0 PERSISTENT LISTENER LEAK' : lr.totalPersistentDelta ? '  (below floor \u2014 one-time/steady, not a per-cycle leak)' : '  \u2014 persistent listeners flat';
				console.log(`\n  [${c}] LISTENERS (net-live, post-GC) \u2014 persistent \u0394+${lr.totalPersistentDelta} on document/window/head/MQL/connected (${lr.persistentPerCyc}/cyc)${tag}`);
				for (const g of lr.persistentGrowth.slice(0, 8)) console.log(`      +${String(g.delta).padStart(4)}  ${g.key}\n            \u21b3 add-site: ${g.stack}`);
				const transient = lr.grown.filter((g) => !g.persistent).slice(0, 3);
				if (transient.length) console.log(`    (transient churn \u2014 reclaimed by GC, not a leak: ${transient.map((t) => `+${t.delta} ${t.key}`).join('; ')})`);
			}
		if (opts.json) console.log('\nJSON ' + JSON.stringify(report));
		// Report artifacts (--out): versioned JSON = source of truth; Markdown+Mermaid = human view;
		// JUnit = opt-in CI projection. .heapsnapshot files were already written by withinSession.
		if (outDir) {
			// realmUnconfirmed is gated ONLY on measured realm-CLASS growth in the snapshot diff — NOT on the
			// static --realm target count (which always includes the live top-level realm, so it would be
			// perpetually true and carry no signal). No snapshot diff → no realm verdict.
			const cycleResults = Object.keys(report).map((c) => ({ name: c, isControl: c === 'idle', rows: report[c], series: seriesByCycle[c] || [], snapDiff: diffs[c], retReport: rets[c], heapSnapshotFile: snapFiles[c], realmUnconfirmed: !!realmClassGrowth(diffs[c]), listenerReport: lsts[c] }));
			const obj = buildReport({ scenario, opts, cycles: cycleResults, calibrated, floorBasis, durationMs: Date.now() - startedAt, generatedAt: new Date().toISOString() });
			await writeFile(join(outDir, 'report.json'), JSON.stringify(obj, null, 2));
			await writeFile(join(outDir, 'report.md'), renderMarkdown(obj));
			if (opts.junit) await writeFile(join(outDir, 'report.junit.xml'), renderJUnit(obj));
			console.log(`\n  wrote report → ${relative(process.cwd(), join(outDir, 'report.json'))}, report.md${opts.junit ? ', report.junit.xml' : ''}${Object.values(snapFiles).some(Boolean) ? ', *.heapsnapshot' : ''}`);
		}
		return report;
	}
}

// Driving helpers — scenarios import THESE (never raw page.$ / waitForSelector; see the
// OBSERVER-POLLUTION GUARD above). Plus the internals, for advanced/one-off scenarios.
// Autonomous-driving primitives — the `explore` crawl driver (Slice 3) imports THESE to discover +
// safely click controls it didn't author (2026-07-20-autonomous-torture-profiler.md §6).
// Measurement seam — exported so a SECOND driver (`explore`/`replay`) reuses the engine's measurement
// rather than duplicating it (HARD RULE #1). These were private to runTorture/withinSession; the crawl
// verdict (Slice 4) drives its own lap loop through the same sample/peak/analyze/serve primitives.
export { analyze, buildGraph, clickIn, clickNth, clickSel, clickTabByText, controlSlopesFrom, countSel, diffListeners, diffSnapshots, enumerateInteractables, exists, INTERACTABLE_SEL, isInspectorChain, makeInstrument, mannKendall, median, peakDuring, realmClassGrowth, resolveAndClick, retainerPath, retainerReport, sample, sensSlope, serve, settle, takeSnapshot, UNIVERSAL_FLOOR, UNIVERSAL_KEYS, wait };
