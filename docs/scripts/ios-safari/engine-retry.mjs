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

import http from 'node:http';

/** True for a request the proxy treats as an engine sub-file (the entry, `engine.js`, is never failed). */
export function isEngineSubFile(url) {
	return /\/esm\/chunk-[^/?#]+\.js(?:[?#]|$)/.test(String(url));
}

/**
 * The verdict, pure so the unit suite covers it (test/unit/tools/ios-engine-retry.test.js).
 * @param {{ card: boolean, afterRetry: 'loaded'|'reload'|'none', afterReload?: 'loaded'|'failed'|'none'|null, newTab?: 'loaded'|'failed'|'none'|'unsupported'|null }} r
 * @returns {{ ok: boolean, path: string, error?: string }}
 */
export function engineRetryVerdict(r) {
	if (!r.card) return { ok: false, path: 'no card', error: 'the failure card never appeared while the engine sub-files failed' };
	if (r.afterRetry === 'loaded') return { ok: true, path: 'Retry' };
	if (r.afterRetry !== 'reload') return { ok: false, path: 'stuck', error: 'after Retry the engine did not load and the card did not offer Reload' };
	if (r.afterReload === 'loaded') return { ok: true, path: 'Reload' };
	if (r.newTab === 'loaded') return { ok: true, path: 'new tab' };
	return { ok: false, path: 'none', error: `the engine loaded neither after Reload (${r.afterReload ?? 'not run'}) nor in a new tab (${r.newTab ?? 'not run'})` };
}

/** A proxy to `target` that cuts engine sub-file requests while `state.fail` is on. Resolves once it listens. */
export function startFaultProxy(target, mode = 'drop') {
	const up = new URL(target);
	const state = { fail: false, cut: 0, subFiles: 0 };
	const server = http.createServer((req, res) => {
		if (isEngineSubFile(req.url)) {
			state.subFiles++;
			if (state.fail) {
				state.cut++;
				if (mode === '503') {
					res.writeHead(503, { 'cache-control': 'no-store', 'content-type': 'text/plain' });
					res.end('unavailable');
				} else req.socket.destroy();
				return;
			}
		}
		const fwd = http.request({ hostname: up.hostname, port: up.port, path: req.url, method: req.method, headers: { ...req.headers, host: up.host } }, (r) => {
			res.writeHead(r.statusCode || 502, r.headers);
			r.pipe(res);
		});
		fwd.on('error', () => {
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
	const r = { card: false, afterRetry: 'none', afterReload: null, newTab: null };
	try {
		proxy.state.fail = true;
		await wd('POST', `/session/${id}/url`, { url: `${proxy.origin}/studio/` });
		const first = await waitFor(`last === 'card' || last === 'reload' || last === 'loaded'`, 150000);
		r.card = first === 'card' || first === 'reload';
		step('sub-files cut: the failure card appears', r.card, `${first}; ${proxy.state.cut} sub-file requests cut`);
		if (!r.card) return finish();

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
		await pressCardButton();
		// Only the NEW document counts: the one the press left still shows Reload until the navigation replaces it.
		const reloaded = await waitFor(`!window.__engineRetryOldDoc && (last === 'loaded' || last === 'card' || last === 'reload' || last === 'closetab')`, 150000);
		if (reloaded !== 'none' && (await wd('POST', `/session/${id}/execute/sync`, { script: 'return !!window.__engineRetryOldDoc;', args: [] }))) {
			step('Reload: the button reloaded the page', false, 'the page the press left is still loaded');
		}
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
