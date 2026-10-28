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

/** Busy the main thread: `ms` of work in every 100 ms, so a frame (and the scroll event it delivers) can come well past
 *  the sync's 120 ms echo window. Both frames share this thread. Replaces any burner already running. */
function lsBurn(ms) {
	clearInterval(window.__lsBurner);
	if (ms <= 0) return;
	window.__lsBurner = setInterval(() => {
		const t = performance.now();
		while (performance.now() - t < ms) {}
	}, 100);
}

/** Record every event a tap produces (and whether the browser or a script made it: a `*` marks an untrusted one). */
// biome-ignore lint/correctness/noUnusedVariables: see above
function lsWatch() {
	if (window.__lsEv) return;
	window.__lsEv = [];
	const t0 = performance.now();
	for (const t of [
		'touchstart',
		'touchmove',
		'touchend',
		'touchcancel',
		'pointerdown',
		'pointerup',
		'pointercancel',
		'mousedown',
		'mouseup',
		'click',
		'focusin',
		'selectionchange',
	]) {
		document.addEventListener(
			t,
			(e) => {
				if (window.__lsEv.length < 60) window.__lsEv.push(`${Math.round(performance.now() - t0)}ms ${t}${e.isTrusted ? '' : '*'}:${String(e.target?.className || e.target?.nodeName || '').slice(0, 24)}`);
			},
			true,
		);
	}
	// The preview's own scrolls, and the editor's: who moved what, and when.
	lsPreview().contentWindow.addEventListener('scroll', () => window.__lsEv.push(`${Math.round(performance.now() - t0)}ms preview-scroll->${Math.round(lsPreview().contentWindow.scrollY)}`));
	lsScroller().addEventListener('scroll', () => window.__lsEv.push(`${Math.round(performance.now() - t0)}ms editor-scroll->${Math.round(lsScroller().scrollTop)}`));
}

/** What the preview frame is like on this engine, and whether a script can scroll it at all. */
async function lsFrame(slide) {
	const f = lsPreview();
	const win = f.contentWindow;
	const doc = f.contentDocument;
	const sec = lsSections()[slide - 1]?.getBoundingClientRect();
	const info = {
		iframe: `${Math.round(f.getBoundingClientRect().width)}x${Math.round(f.getBoundingClientRect().height)}`,
		inner: `${win.innerWidth}x${win.innerHeight}`,
		scrollHeight: doc.documentElement.scrollHeight,
		scrollY: Math.round(win.scrollY),
		slide: sec ? `top ${Math.round(sec.top)} height ${Math.round(sec.height)}` : null,
		pageScrollY: Math.round(window.scrollY),
	};
	const before = win.scrollY;
	win.scrollTo({ top: Math.min(200, Math.max(0, doc.documentElement.scrollHeight - win.innerHeight)), behavior: 'auto' });
	await lsSleep(400);
	info.scrollToWorked = `${Math.round(before)} -> ${Math.round(win.scrollY)}`;
	win.scrollTo({ top: before, behavior: 'auto' });
	return JSON.stringify(info);
}

// biome-ignore lint/correctness/noUnusedVariables: see above
function lsEvents() {
	const e = window.__lsEv || [];
	window.__lsEv = [];
	return e;
}

// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function lsPrepare(slides, burnMs) {
	await lsUntil(() => document.querySelector('.cm-content'), 90000, 'the editor');
	await lsUntil(() => document.querySelector('.pg-preview-wrap.is-live'), 90000, 'the live preview');
	await lsUntil(() => lsSections().length >= slides, 90000, `${slides} slides in the preview`);
	if (innerWidth <= 820) throw new Error(`the panes are stacked at ${innerWidth}px: the probe needs the two-pane layout`);
	lsBurn(burnMs);
	return { width: innerWidth, burnMs };
}

function lsFind(slide) {
	const line = [...document.querySelectorAll('.cm-line')].find((l) => l.textContent === `- point ${slide}.3`);
	if (!line) throw new Error(`the line "- point ${slide}.3" is not in the editor's viewport`);
	return line;
}

/** What a failure message needs to say where the page was: the caret, the focus, both scrolls, the slide's place. */
function lsState(slide) {
	const sel = getSelection();
	return JSON.stringify({
		width: innerWidth,
		caretLine: document.querySelector('.cm-activeLine')?.textContent ?? null,
		selection: sel?.focusNode?.textContent?.slice(0, 30) ?? null,
		focus: document.activeElement?.className?.toString().slice(0, 40) ?? null,
		editorTop: Math.round(lsScroller().scrollTop),
		previewTop: Math.round(lsPreview().contentWindow.scrollY),
		offCenter: Math.round(lsOffCenter(slide)),
		hit: lsHit(slide),
		events: window.__lsEv || [],
	});
}

/** What sits under the middle of the slide's line: an overlay here would take the tap. */
function lsHit(slide) {
	const c = lsCenter(slide);
	const el = document.elementFromPoint(c.x, c.y);
	return `${String(el?.className || el?.nodeName || '').slice(0, 40)} @${c.x},${c.y}`;
}

/** Whether the tap on slide `n`'s line has put the caret there (the sync centers the preview only after it has). */
// biome-ignore lint/correctness/noUnusedVariables: see above
async function lsCaret(slide, ms) {
	const want = `- point ${slide}.3`;
	try {
		await lsUntil(() => document.querySelector('.cm-activeLine')?.textContent === want, ms, `the caret on "${want}"`);
		return true;
	} catch {
		return false;
	}
}

/** The middle of the slide's line in the page, for a touch tap by coordinates. */
function lsCenter(slide) {
	const r = lsFind(slide).getBoundingClientRect();
	return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) };
}

// biome-ignore lint/correctness/noUnusedVariables: see above
const lsBefore = () => lsScroller().scrollTop;

// biome-ignore lint/correctness/noUnusedVariables: see above
async function lsAfter(slide, before) {
	// The first slide sits at the top of the preview rather than its middle, so it is only waited out.
	if (slide > 1) {
		try {
			await lsUntil(() => lsOffCenter(slide) < 4, 15000, `slide ${slide} centered in the preview`);
		} catch (e) {
			throw new Error(`${e.message}; page: ${lsState(slide)}; frame: ${await lsFrame(slide)}`);
		}
	}
	// The scroll events of the sync's own moves arrive on later frames; give the busiest page time to deliver them.
	await lsSleep(1200);
	return { slide, moved: Math.abs(lsScroller().scrollTop - before) };
}
