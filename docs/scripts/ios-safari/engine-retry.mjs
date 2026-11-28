// The engine-load recovery probe (PR #3385), in real Mobile Safari: what Safari does when one of the slide engine's
// sub-files fails to load, and whether the way back the preview offers works there.
//
// Playwright's WebKit build keeps a failed engine sub-file failed across Retry, a reload and a navigation, and only a
// new tab recovers it; Chromium and Gecko recover on a reload (PR #3385, measured on the built Studio). So the preview,
// after a failed Retry, says "reload, or open the page in a new tab" and its button reloads. Whether real Safari behaves
// like Playwright's WebKit is what this probe measures.
//
// HOW THE FAILURE IS MADE. A proxy in run.mjs's own process stands between Safari and the served docs site, on its own
// 127.0.0.1 port. While `state.fail` is on, it fails every request for an engine sub-file (`esm/chunk-*.js`) in one of
// two shapes, and the probe runs once per shape: `drop` cuts the connection (a dropped network), `503` answers with a
// server error (an overloaded host or CDN). They differ: in Playwright's builds, a dropped sub-file came back on Retry
// in Chromium and Gecko and on Reload in WebKit, while a 503 (or Playwright's own `route.abort`) needed a reload in
// Chromium and Gecko and a new tab in WebKit. Each run's proxy has its own port, so its own origin: no service worker,
// storage or cache entry from the probes before it reaches it.
//
// THE STEPS, each waiting on a signal in the page (the card, the engine global, the button's word), never a duration:
//   1. Sub-files failing, open the Studio: the failure card must appear.
//   2. Sub-files reachable again, press Retry: the engine loads, or the card offers Reload.
//   3. If it offered Reload: press the card's Reload button (it marks the tab, then reloads). The engine loads, or the
//      card is back.
//   4. If the reload did not recover it, the card must say to close the tab and open the page again, with no button
//      (DeckPreview `reloaded`): a tab the PAGE opens (`window.open`) failed the same way in Safari (0 sub-file requests).
//      Then open a tab as the person would (WebDriver's new window, the equivalent of a user-opened tab), go to the
//      Studio there, and the engine must load.
// The verdict passes when the engine loaded by the path the card advises. Which path it took is the finding.

import dns from 'node:dns/promises';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LONG_PRESS_MS, tapClicked, tapHold } from './tap-guard.mjs';

// The shared page helpers (show-editor.js): the trace's boot line is its `latticeBootReport`, as studio-probe.js's is.
const SHOW_EDITOR = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'show-editor.js'), 'utf8');

/** True for a request the proxy treats as an engine sub-file (the entry, `engine.js`, is never failed). */
export function isEngineSubFile(url) {
	return /\/esm\/chunk-[^/?#]+\.js(?:[?#]|$)/.test(String(url));
}

/**
 * The verdict, pure so the unit suite covers it (test/unit/tools/ios-engine-retry.test.js).
 * @param {{ card: boolean, cut?: number, afterRetry: 'loaded'|'reload'|'none', afterReload?: 'loaded'|'failed'|'none'|null, newTab?: 'loaded'|'failed'|'none'|'unsupported'|null }} r
 * @returns {{ ok: boolean, path: string, error?: string }}
 */
export function engineRetryVerdict(r) {
	if (!r.card) return { ok: false, path: 'no card', error: 'the failure card never appeared while the engine sub-files failed' };
	// A card with nothing cut did not come from the fault, so what follows says nothing about recovering from it (the checker
	// on #3385: the iPhone drop arm of run 45248011214 cut 0 sub-files and still reported "recovered by Retry").
	if (r.cut === 0) return { ok: false, path: 'no fault', error: 'no engine sub-file was cut, so the card that showed did not come from the fault' };
	if (r.afterRetry === 'loaded') return { ok: true, path: 'Retry' };
	if (r.afterRetry !== 'reload') return { ok: false, path: 'stuck', error: 'after Retry the engine did not load and the card did not offer Reload' };
	if (r.afterReload === 'loaded') return { ok: true, path: 'Reload' };
	if (r.newTab === 'loaded') return { ok: true, path: 'new tab' };
	return { ok: false, path: 'none', error: `the engine loaded neither after Reload (${r.afterReload ?? 'not run'}) nor in a new tab (${r.newTab ?? 'not run'})` };
}

/**
 * In-page: record the next touch and any click after it, as `window.__engineRetryTap = { events: [{ type, t }] }`, the log
 * shape tap-guard.mjs reads (`tapHold`, `tapClicked`). Installed just before the card's button is pressed, so a press
 * that never reloaded the page can say whether a click ever reached it.
 */
export const TAP_RECORDER = `(() => {
	const L = (window.__engineRetryTap = { events: [] });
	const t0 = performance.now();
	for (const type of ['touchstart', 'touchend', 'touchcancel', 'click'])
		window.addEventListener(
			type,
			(e) => {
				// The event's OWN time, never when its listener ran (tap-guard.mjs \`tapHold\`, as run.mjs records): a main thread
				// stalled mid-gesture must not turn a tap into a long press. A timeStamp the page's clock cannot place (0, or
				// ahead of it) falls back to now.
				const now = performance.now();
				const at = e.timeStamp > 0 && e.timeStamp <= now ? e.timeStamp : now;
				L.events.push({ type, t: Math.round(at - t0) });
			},
			{ capture: true, passive: true },
		);
})()`;

/**
 * Why a press of the card's button did not reload the page, from the recorder's log: a starved simulator stretches a tap
 * into a long press, and on iOS a long press on a button sends no click (iPhone, run 46108755390: taps held 1 to 2.3 s in
 * the same job). The step stays red either way (the owner's rule for these stalls: never loosen a probe); this only says
 * whether the run could judge Reload at all. Pure, so the unit suite covers it.
 * @param {{ events?: Array<{ type: string, t: number }> } | null | undefined} log
 */
export function reloadTapReading(log) {
	const hold = tapHold(log);
	if (hold === null) return 'no touch reached the page, so this run cannot judge Reload';
	if (tapClicked(log)) return `the tap was held ${hold} ms and a click reached the page, yet it did not reload`;
	if (hold >= LONG_PRESS_MS) return `the tap was held ${hold} ms and Safari treated it as a long press; no click reached the page, so this run cannot judge Reload`;
	return `the tap was held ${hold} ms and no click reached the page, so this run cannot judge Reload`;
}

/**
 * The address `hostname` answers on, found once. A fresh socket per request (below) means a fresh lookup per request, and
 * for `localhost` Node 22 races ::1 against 127.0.0.1 with 250 ms per attempt: on the starved iPad runner that budget ran
 * out and the proxy's own connects failed ETIMEDOUT on /_astro/react.js and jsx-runtime.js, so the Studio never hydrated
 * (run 45475994893). Resolving once, to the address that accepts a connection, takes the race out of every request.
 */
export async function reachableAddress(hostname, port, { lookup = dns.lookup, connect = net.connect, timeoutMs = 2000 } = {}) {
	if (net.isIP(hostname)) return hostname;
	// A lookup that fails falls back to the name, as before this resolved once: the proxy still starts and each request reports.
	const all = await lookup(hostname, { all: true }).catch(() => []);
	for (const { address } of all) {
		const ok = await new Promise((resolve) => {
			// A connect that neither connects nor errors gives up after `timeoutMs`, so the proxy still starts and the probe
			// reports, rather than holding the job until its cap.
			const timer = setTimeout(() => {
				s.destroy();
				resolve(false);
			}, timeoutMs);
			const s = connect({ host: address, port }, () => {
				clearTimeout(timer);
				s.destroy();
				resolve(true);
			});
			s.on('error', () => {
				clearTimeout(timer);
				resolve(false);
			});
		});
		if (ok) return address;
	}
	return hostname;
}

/** A proxy to `target` that cuts engine sub-file requests while `state.fail` is on. Resolves once it listens. */
export async function startFaultProxy(target, mode = 'drop') {
	const up = new URL(target);
	const address = await reachableAddress(up.hostname, Number(up.port) || 80);
	const state = { fail: false, cut: 0, subFiles: 0, seen: [] };
	const server = http.createServer((req, res) => {
		// Every engine-side request and what the proxy did with it, so a card that did not come from the fault can be traced
		// to the gate that failed (followups.d/3368-p1: which request never came, or came back bad).
		const note = (status) => {
			// The LAST 60, not the first: a stall after Reload or in a new tab comes after the first load's requests.
			// An /_astro/ chunk only when it did not come back 200: one failed island chunk leaves the Studio unhydrated with no
			// card (iPad, run 45460220846), and Safari keeps the failure in its module map, so astro's one retry cannot recover.
			const astroBad = /^\/_astro\//.test(String(req.url)) && status !== 200;
			if (!astroBad && !/\/playground\/v\/|\/sw\.js/.test(String(req.url))) return;
			state.seen.push(`${String(req.url).replace(/^\/playground\/v\/[^/]+\//, '…/')} ${status}`);
			if (state.seen.length > 60) state.seen.shift();
		};
		if (isEngineSubFile(req.url)) {
			state.subFiles++;
			if (state.fail) {
				state.cut++;
				note(mode === '503' ? 'cut-503' : 'cut-drop');
				if (mode === '503') {
					res.writeHead(503, { 'cache-control': 'no-store', 'content-type': 'text/plain' });
					res.end('unavailable');
				} else req.socket.destroy();
				return;
			}
		}
		// `agent: false`: a fresh upstream socket per request. Node 22's global agent pools keep-alive sockets, and on a starved
		// runner it reused one the docs server had already closed; the server reset engine.js and chunks.json together, before
		// anything was cut (iPad, run 45453722865). Pooling buys nothing on loopback, and a reset it causes is not the fault.
		const fwd = http.request({ hostname: address, port: up.port, path: req.url, method: req.method, headers: { ...req.headers, host: up.host }, agent: false }, (r) => {
			note(r.statusCode || 502);
			res.writeHead(r.statusCode || 502, r.headers);
			r.pipe(res);
		});
		fwd.on('error', (e) => {
			note(`upstream-error ${e.code || e.message}`);
			if (!res.headersSent) res.writeHead(502);
			res.end();
		});
		req.pipe(fwd);
	});
	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${server.address().port}`, state, close: () => server.close() }));
	});
}

const PREVIEW = '[aria-label="Live deck preview"]';
/** In-page: the engine global, else the card's button word, else nothing. Shows the preview pane on a phone. */
const STATE_EXPR = `(() => {
	if (window.LatticePlayground) return 'loaded';
	const card = document.querySelector('${PREVIEW} .nacre-failed');
	if (!card) {
		const tab = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Preview' && b.offsetParent);
		if (tab && !window.__engineRetryTab) { window.__engineRetryTab = true; tab.click(); }
		return '';
	}
	const word = card.querySelector('.nacre-failed__retry')?.textContent.trim();
	if (!word && /close this tab and open the page again/i.test(card.textContent)) return 'closetab';
	return word === 'Reload' ? 'reload' : 'card';
})()`;

/**
 * Run the probe in session `id` through `wd` (run.mjs's WebDriver call). `base` is the served docs site.
 * @returns {Promise<{ ok: boolean, error?: string, steps: Array<{ name: string, pass: boolean, detail?: string }> }>}
 */
export async function runEngineRetryProbe(wd, id, base, mode = 'drop') {
	const proxy = await startFaultProxy(base, mode);
	const steps = [];
	const step = (name, pass, detail) => steps.push({ name, pass, detail });
	/** Poll the page for STATE_EXPR until `want(value)`, up to `ms`; returns the last value. */
	// A navigation (the Reload press) can abort a waiting script, and WebDriver then throws: that is "not yet", so the wait
	// starts again in the new document until its own deadline.
	const waitFor = async (want, ms) => {
		const deadline = Date.now() + ms;
		let last = 'none';
		while (Date.now() < deadline) {
			const left = Math.max(1000, deadline - Date.now());
			try {
				const res = await wd('POST', `/session/${id}/execute/async`, {
					script: `const done = arguments[arguments.length - 1]; const t0 = Date.now(); let last = '';
						(function tick() { try { last = ${STATE_EXPR}; } catch (e) { last = 'error: ' + e; }
							if (${want}) return done({ hit: true, last }); if (Date.now() - t0 > ${left}) return done({ hit: false, last: last || 'none' }); setTimeout(tick, 250); })();`,
					args: [],
				});
				last = res?.last || 'none';
				if (res?.hit || Date.now() >= deadline) return last;
			} catch {
				// aborted by a navigation: wait in the new document
			}
		}
		return last;
	};
	/**
	 * Press the card's button with a real TOUCH at its center, as the suite's other taps are made (run.mjs `touchAt`). A
	 * WebDriver element click did not activate it on the iPhone simulator (run 44973877783: after the "press" the page never
	 * reloaded), and a script `click()` is no user gesture.
	 */
	const pressCardButton = async () => {
		const at = await wd('POST', `/session/${id}/execute/sync`, {
			script: `let b = document.querySelector('${PREVIEW} .nacre-failed__retry');
				if (b && !b.offsetParent) [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Preview' && x.offsetParent)?.click();
				b = document.querySelector('${PREVIEW} .nacre-failed__retry');
				if (!b) return null;
				b.scrollIntoView({ block: 'center' });
				const r = b.getBoundingClientRect();
				return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };`,
			args: [],
		});
		if (!at) throw new Error("the card's button is not on the page");
		await wd('DELETE', `/session/${id}/actions`).catch(() => {});
		await wd('POST', `/session/${id}/actions`, {
			actions: [{ type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' }, actions: [{ type: 'pointerMove', duration: 0, x: at.x, y: at.y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }],
		});
		await wd('DELETE', `/session/${id}/actions`).catch(() => {});
	};
	/** A mark on this document, so a wait can tell the reloaded page from the one the press left. */
	const markDocument = () => wd('POST', `/session/${id}/execute/sync`, { script: 'window.__engineRetryOldDoc = true;', args: [] });
	/** What reached the proxy, what Safari fetched for the engine, and how far the page got: the trace that names the gate of
	 *  a stalled page (followups.d/3368-p1). `where` names the step; `what` says what was seen there. */
	const trace = async (where, what) => {
		const page = await wd('POST', `/session/${id}/execute/sync`, { script: `return 'readyState ' + document.readyState + '; engine ' + (window.LatticePlayground ? 'loaded' : 'absent') + '; preview ' + (document.querySelector('${PREVIEW}') ? 'present' : 'absent') + '; frames ' + document.querySelectorAll('${PREVIEW} iframe').length + '; modulepreload ' + [...document.querySelectorAll('link[rel=modulepreload]')].filter((l) => /\\/playground\\/v\\//.test(l.href)).length;`, args: [] }).catch((e) => `page unreadable: ${String(e).slice(0, 80)}`);
		// The Studio's own boot: an island Astro has not hydrated still carries `ssr`; a script or modulepreload the page names
		// but Resource Timing never logged was never fetched (or is still pending); a slow one names a stalled worker fetch.
		// The browser keeps 250 resource entries by default and the Studio fetches more, so a full list drops later fetches:
		// on a healthy WebKit load it listed 12 chunks as "not fetched" and left out engine.js. A full list says so, and the
		// "not fetched" field reads unknown rather than naming files that did load.
		const islands = await wd('POST', `/session/${id}/execute/sync`, { script: `${SHOW_EDITOR}\nreturn latticeBootReport();`, args: [] }).catch((e) => `islands unreadable: ${String(e).slice(0, 80)}`);
		const timing = await wd('POST', `/session/${id}/execute/sync`, { script: `const all = performance.getEntriesByType('resource'); return (all.length >= 250 ? 'resource list FULL at ' + all.length + ' (later fetches, the engine included, are not listed; a missing file proves nothing) || ' : 'resource list ' + all.length + ' || ') + all.filter((e) => /\\/playground\\/v\\/|sw\\.js/.test(e.name)).slice(0, 40).map((e) => e.name.replace(/^.*\\/playground\\/v\\/[^/]+\\//, '…/') + ' ' + Math.round(e.duration) + 'ms ' + (e.responseStatus ?? '?') + ' ' + (e.transferSize ?? '?') + 'B').join(' | ') + ' || sw: ' + (navigator.serviceWorker && navigator.serviceWorker.controller ? 'controlled' : 'none');`, args: [] }).catch((e) => `timing unreadable: ${String(e).slice(0, 80)}`);
		console.log(`engine retry ${mode}, ${where}: ${what}. Page: ${page}. ${islands}. Proxy saw: ${proxy.state.seen.join(' | ') || 'nothing'}. Safari timing: ${timing}`);
	};
	const r = { card: false, cut: 0, afterRetry: 'none', afterReload: null, newTab: null };
	try {
		proxy.state.fail = true;
		await wd('POST', `/session/${id}/url`, { url: `${proxy.origin}/studio/` });
		const first = await waitFor(`last === 'card' || last === 'reload' || last === 'loaded'`, 150000);
		r.card = first === 'card' || first === 'reload';
		r.cut = proxy.state.cut;
		// What the card said, so a card that did not come from the fault names its own cause.
		const said = r.card ? await wd('POST', `/session/${id}/execute/sync`, { script: `return (document.querySelector('${PREVIEW} .nacre-failed__text')?.textContent || '').slice(0, 160);`, args: [] }).catch(() => '') : '';
		// Trace a card the fault did not cause, AND a page that showed neither a card nor the engine (`first` is 'none'): the
		// first-render stall, followups.d/3368-p1. Run 45404438471 on PR #2988 stalled there with 0 sub-file requests and
		// said nothing about why. What reached the proxy, what Safari's own resource timing says it fetched for the engine (a
		// request served by the service worker or a cache never reaches the proxy), and how far the page got name the gate.
		const stalled = first !== 'loaded' && !r.card;
		if ((r.card && !r.cut) || stalled) await trace('first load', stalled ? 'neither the card nor the engine came' : 'the card came without a cut');
		step('sub-files cut: the failure card appears', r.card && r.cut > 0, `${first}; ${r.cut} sub-file requests cut${r.card ? `; the card: "${said}"` : ''}${r.card && !r.cut ? ' (NOTHING was cut, so this card did not come from the fault)' : ''}`);
		if (!r.card || !r.cut) return finish();

		proxy.state.fail = false;
		const before = proxy.state.subFiles;
		await wd('POST', `/session/${id}/execute/sync`, { script: `document.querySelector('${PREVIEW} .nacre-failed__retry').click();`, args: [] });
		const retried = await waitFor(`last === 'loaded' || last === 'reload'`, 45000);
		r.afterRetry = retried === 'loaded' || retried === 'reload' ? retried : 'none';
		step('Retry: the engine loads, or the card offers Reload', r.afterRetry !== 'none', `${r.afterRetry}; ${proxy.state.subFiles - before} sub-file requests reached the server`);
		if (r.afterRetry !== 'reload') return finish();

		const beforeReload = proxy.state.subFiles;
		// The product's own Reload button, not WebDriver's refresh: the button marks the tab first, and the reloaded page
		// reads that mark to give its last advice. A plain refresh skipped it (run 44972018871).
		await markDocument();
		await wd('POST', `/session/${id}/execute/sync`, { script: TAP_RECORDER, args: [] });
		await pressCardButton();
		// Only the NEW document counts: the one the press left still shows Reload until the navigation replaces it.
		const reloaded = await waitFor(`!window.__engineRetryOldDoc && (last === 'loaded' || last === 'card' || last === 'reload' || last === 'closetab')`, 150000);
		if (reloaded !== 'none' && (await wd('POST', `/session/${id}/execute/sync`, { script: 'return !!window.__engineRetryOldDoc;', args: [] }))) {
			const tap = await wd('POST', `/session/${id}/execute/sync`, { script: 'return window.__engineRetryTap || null;', args: [] }).catch(() => null);
			step('Reload: the button reloaded the page', false, `the page the press left is still loaded: ${reloadTapReading(tap)}`);
		}
		if (reloaded === 'none') await trace('after Reload', 'neither the card nor the engine came on the reloaded page');
		r.afterReload = reloaded === 'loaded' ? 'loaded' : reloaded === 'card' || reloaded === 'reload' || reloaded === 'closetab' ? 'failed' : 'none';
		step('Reload: the engine loads (a finding either way)', true, `${r.afterReload}; ${proxy.state.subFiles - beforeReload} sub-file requests reached the server`);
		if (r.afterReload === 'loaded') return finish();

		// The reloaded page must now say to close the tab and open the page again, with no button that would fail the same way.
		const advised = reloaded === 'closetab' ? 'closetab' : await waitFor(`last === 'closetab' || last === 'loaded'`, 30000);
		step('after a failed reload, the card says to close the tab and open the page again (no button)', advised === 'closetab', advised);
		if (advised !== 'closetab') {
			r.newTab = 'none';
			return finish();
		}
		try {
			// A tab the person opens: WebDriver's new window is not opened by the page, as a tab from the tab bar is not.
			const beforeTab = proxy.state.subFiles;
			const win = await wd('POST', `/session/${id}/window/new`, { type: 'tab' });
			await wd('POST', `/session/${id}/window`, { handle: win.handle });
			await wd('POST', `/session/${id}/url`, { url: `${proxy.origin}/studio/` });
			const tab = await waitFor(`last === 'loaded' || last === 'card' || last === 'reload' || last === 'closetab'`, 150000);
			if (tab === 'none') await trace('new tab', 'neither the card nor the engine came in the new tab');
			r.newTab = tab === 'loaded' ? 'loaded' : tab === 'none' ? 'none' : 'failed';
			step('a tab the person opens: the engine loads there', r.newTab === 'loaded', `${r.newTab}; ${proxy.state.subFiles - beforeTab} sub-file requests reached the server`);
		} catch (e) {
			r.newTab = 'unsupported';
			step('a tab the person opens: the engine loads there', false, String(e).slice(0, 200));
		}
		return finish();
	} finally {
		proxy.close();
	}
	function finish() {
		const v = engineRetryVerdict(r);
		step(`${mode}: recovered by ${v.path}`, v.ok);
		return { ok: v.ok, error: v.error, steps };
	}
}
