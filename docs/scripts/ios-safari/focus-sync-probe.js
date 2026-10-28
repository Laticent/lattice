/**
 * THE PLAYGROUND FOCUS-SYNC PROBE: the in-page half of `a click on a line in the editor centers its slide in the
 * preview and leaves the editor alone` (docs/e2e/playground-focus-sync.spec.ts), for real Mobile Safari. Playwright
 * cannot drive iOS Safari, so run.mjs (WebDriver) taps the line and this file reads the page before and after:
 *
 *   lsPrepare(deck, burnMs)   seed the deck, wait for the live two-pane Playground, start the main-thread burner;
 *   lsFind(slide)             the `.cm-line` of "point <slide>.3", scrolled to nothing, as an element for the tap;
 *   lsBefore()                the editor's scrollTop just before the tap;
 *   lsAfter(slide, before)    wait for the preview to center `slide`, then for the late scroll events to land, and
 *                             return how far the editor moved.
 *
 * The flake (followup 2937-p2) was the sync judging its own preview scroll by time since the write: a busy page
 * delivered the event after 120 ms and the editor followed it by 136 px. The burner makes the page that busy on
 * purpose, so the probe can FAIL on the old code; a probe that cannot fail proves nothing (HARD RULE #23).
 * Plain browser JS: WebDriver's execute-script sends source text, not a module.
 */

const lsSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lsPreview = () => document.getElementById('preview');
const lsSections = () => lsPreview()?.contentDocument?.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]') ?? [];
const lsScroller = () => document.querySelector('.cm-scroller');

async function lsUntil(fn, ms, what) {
	const t0 = Date.now();
	for (;;) {
		const v = fn();
		if (v) return v;
		if (Date.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
		await lsSleep(50);
	}
}

/** Where slide `n` sits against the middle of the preview: 0 is centered. */
function lsOffCenter(n) {
	const win = lsPreview().contentWindow;
	const el = lsSections()[n - 1];
	if (!el) return 1e9;
	const r = el.getBoundingClientRect();
	return Math.abs((r.top + r.bottom) / 2 - win.innerHeight / 2);
}

// biome-ignore lint/correctness/noUnusedVariables: globals for WebDriver's execute-script and Playwright's addScriptTag
async function lsPrepare(slides, burnMs) {
	await lsUntil(() => document.querySelector('.cm-content'), 90000, 'the editor');
	await lsUntil(() => document.querySelector('.pg-preview-wrap.is-live'), 90000, 'the live preview');
	await lsUntil(() => lsSections().length >= slides, 90000, `${slides} slides in the preview`);
	if (innerWidth <= 820) throw new Error(`the panes are stacked at ${innerWidth}px: the probe needs the two-pane layout`);
	// Busy the main thread: `burnMs` of work in every 100 ms, so a frame (and the scroll event it delivers) can
	// come well past the sync's 120 ms echo window. Both frames share this thread.
	if (burnMs > 0) {
		window.__lsBurner = setInterval(() => {
			const t = performance.now();
			while (performance.now() - t < burnMs) {}
		}, 100);
	}
	return { width: innerWidth, burnMs };
}

// biome-ignore lint/correctness/noUnusedVariables: see above
function lsFind(slide) {
	const line = [...document.querySelectorAll('.cm-line')].find((l) => l.textContent === `- point ${slide}.3`);
	if (!line) throw new Error(`the line "- point ${slide}.3" is not in the editor's viewport`);
	return line;
}

// biome-ignore lint/correctness/noUnusedVariables: see above
const lsBefore = () => lsScroller().scrollTop;

// biome-ignore lint/correctness/noUnusedVariables: see above
async function lsAfter(slide, before) {
	// The first slide sits at the top of the preview rather than its middle, so it is only waited out.
	if (slide > 1) await lsUntil(() => lsOffCenter(slide) < 4, 15000, `slide ${slide} centered in the preview`);
	// The scroll events of the sync's own moves arrive on later frames; give the busiest page time to deliver them.
	await lsSleep(1200);
	return { slide, moved: Math.abs(lsScroller().scrollTop - before) };
}
