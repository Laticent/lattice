/**
 * THE PLAYGROUND SCROLL PROBE: the in-page half of `scrolling the preview moves the rail to the slide that fills it`
 * (docs/e2e/playground-map.spec.ts) for real Mobile Safari. Playwright cannot drive iOS Safari, so run.mjs (WebDriver)
 * drags a real finger over the preview, and this file reads the page before and after:
 *
 *   psPrepare(burnMs)  wait for the live Explore walk with the map open, hook the frame's `replaceChild` to see whether a
 *                      window move drops the scroll, start the main-thread burner, and return where to drag;
 *   psAfter()          wait for the frame to stop scrolling, then for the rail and the walk bar to agree, and return the
 *                      verdict.
 *
 * WHAT IT CHECKS. Under load Chromium put a wheel-scrolled preview back on its last programmatic offset inside the first
 * `replaceChild` of a window move, and `applyWindow` (docs/src/playground/deck-render.js) now writes the scroll back.
 * This probe asks the same question of WebKit with a real finger: after the drag, the frame is still scrolled off slide 1
 * and the rail and the bar name the slide in view. It also counts the swaps that moved the scroll inside the call
 * (`drops`), so the run says whether WebKit drops it too or the guard simply never fires there.
 * The burner makes the page busy on purpose, so the probe can see the race; a probe that cannot fail proves nothing
 * (HARD RULE #23). Plain browser JS: WebDriver's execute-script sends source text, not a module.
 */

const psSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const psFrame = () => document.getElementById('preview');
const psRail = () => document.querySelector('[data-map-rail]');
const psCurrent = () => Number(psRail()?.querySelector('button[aria-current="true"]')?.getAttribute('data-unit') ?? -1);
const psBar = () => Number((document.querySelector('#pg-walk .pg-walk-pos')?.textContent ?? '').split('/')[0]);

async function psUntil(fn, ms, what) {
	const t0 = Date.now();
	for (;;) {
		const v = fn();
		if (v) return v;
		if (Date.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
		await psSleep(50);
	}
}

/** The stamp of the slide with the most of itself in the preview: what a reader calls "the slide I am on". */
function psSlideInView() {
	const f = psFrame();
	const win = f.contentWindow;
	let best = '';
	let bestSeen = -1;
	for (const el of Array.from(f.contentDocument?.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]') ?? [])) {
		const r = el.getBoundingClientRect();
		const seen = Math.max(0, Math.min(win.innerHeight, r.bottom) - Math.max(0, r.top));
		if (seen > bestSeen) {
			bestSeen = seen;
			best = el.getAttribute('data-lattice-slide') ?? '';
		}
	}
	return best;
}

/** Busy the main thread: `ms` of work in every `ms + ms / 2`. Both frames share this thread, so a scroll event, and the
 *  window move it triggers, lands late, as it does on a loaded page. The rest lets a touch start and end (the focus-sync
 *  probe measured that a burner with no rest stalls iOS's touches). Replaces any burner already running. */
function psBurn(ms) {
	clearInterval(window.__psBurner);
	if (ms <= 0) return;
	window.__psBurner = setInterval(() => {
		const t = performance.now();
		while (performance.now() - t < ms) {}
	}, ms + ms / 2);
}

// biome-ignore lint/correctness/noUnusedVariables: called by run.mjs through WebDriver
async function psPrepare(burnMs) {
	await psUntil(() => (document.querySelector('#pg-walk .pg-walk-pos')?.textContent ?? '').includes('/'), 150000, 'the walk bar');
	await psUntil(() => document.querySelector('.pg-preview-wrap')?.classList.contains('is-live'), 150000, 'the live preview');
	if (!psRail()) {
		const button = Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Slide map' || b.textContent?.trim() === 'Map');
		if (!button) throw new Error('no Slide map button');
		button.click();
	}
	await psUntil(() => psRail()?.querySelector('button[data-unit]'), 60000, 'the map rail');
	// NO WAIT for the walk to settle: the reader drags as soon as the rail shows, as the e2e spec's wheel does. The window
	// that matters is right after the map opens, when the pane has resized and the walk has just re-landed with a
	// programmatic scroll. A probe that waited 800 ms past the land saw no dropped scroll in 80 loaded Chromium trials
	// against a build without the guard, so it could not fail.
	const f = psFrame();
	const win = f.contentWindow;
	// Count every swap that moved the scroll INSIDE the call. That is the browser's move, not ours: `applyWindow` writes the
	// scroll back only after its loop, so this hook still sees the drop when it happens.
	window.__psDrops = [];
	const lattice = f.contentDocument.querySelector('.lattice');
	const native = win.Node.prototype.replaceChild;
	lattice.replaceChild = function (fresh, old) {
		const y0 = win.scrollY;
		const out = native.call(this, fresh, old);
		const y1 = win.scrollY;
		if (Math.abs(y1 - y0) >= 1) window.__psDrops.push(`${Math.round(y0)}->${Math.round(y1)}`);
		return out;
	};
	const r = f.getBoundingClientRect();
	const start = { y: Math.round(win.scrollY), rail: psCurrent(), bar: psBar() };
	psBurn(burnMs);
	return { width: innerWidth, pane: win.innerHeight, start, drag: { x: Math.round(r.left + r.width / 2), top: Math.round(r.top + r.height * 0.2), bottom: Math.round(r.top + r.height * 0.8) } };
}

/** After the finger drag: wait for the walk's land, then scroll the frame by script to two and a half panes past where
 *  the drag left it, so the walk crosses a window move. A script scroll carries no reader input, so it waits for the land
 *  that a real drag would have outranked. Returns where the drag left the frame. */
// biome-ignore lint/correctness/noUnusedVariables: called by run.mjs through WebDriver
async function psScrollRest() {
	await psUntil(() => document.documentElement.dataset.pgLand === 'done', 30000, 'the walk to land');
	const win = psFrame().contentWindow;
	const dragged = Math.round(win.scrollY);
	win.scrollBy(0, 2.5 * win.innerHeight);
	return { dragged };
}

// biome-ignore lint/correctness/noUnusedVariables: called by run.mjs through WebDriver
async function psAfter() {
	const win = psFrame().contentWindow;
	// Still: the frame's scroll unchanged for a whole second (momentum included), read with the burner still running.
	let last = win.scrollY;
	let still = 0;
	const t0 = Date.now();
	while (still < 1000 && Date.now() - t0 < 20000) {
		await psSleep(100);
		still = Math.abs(win.scrollY - last) < 1 ? still + 100 : 0;
		last = win.scrollY;
	}
	psBurn(0);
	const pane = win.innerHeight;
	// Then the rail and the bar have time to catch up, read together so a pair that falls back to slide 1 does not pass.
	let agree = false;
	const t1 = Date.now();
	while (!agree && Date.now() - t1 < 10000) {
		const rail = psCurrent();
		agree = rail > 0 && rail + 1 === psBar() && String(psBar()) === psSlideInView().split('.')[0];
		if (!agree) await psSleep(100);
	}
	const y = Math.round(win.scrollY);
	const steps = [
		{ name: 'the drag moved the preview off slide 1 and it stayed there', pass: y >= pane * 0.8, detail: `scrollY ${y}, pane ${pane}` },
		{ name: 'the rail, the walk bar and the slide in view agree', pass: agree, detail: `rail ${psCurrent() + 1}, bar ${psBar()}, in view ${psSlideInView()}` },
	];
	return { y, pane, rail: psCurrent(), bar: psBar(), inView: psSlideInView(), drops: window.__psDrops ?? [], steps, ok: steps.every((s) => s.pass) };
}
