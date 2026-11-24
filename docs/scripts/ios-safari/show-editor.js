/**
 * SHOW THE DECK EDITOR, shared by the Studio probes (studio-probe.js, panes-probe.js, undo-probe.js, photo-probe.js) and sent ahead of
 * each one by run.mjs and probe.selftest.mjs. Plain browser JS defining one global, for the reason the probes are:
 * WebDriver's execute-script sends source text, not a module.
 *
 * A phone shows one pane at a time and opens on the preview, so the editor mounts only once the "Markdown source" pane
 * is chosen. Two things made a single tap time out on the iOS Simulator (#2911):
 *
 *   1. a tap that lands before the Studio has hydrated does nothing, so the probe taps again every 2 s until the
 *      editor shows, for up to 90 s (undo-probe.js learned this first);
 *   2. the pre-paint skeleton (StudioChromeSkeleton) is `inert` and draws look-alike buttons with the same labels that
 *      do nothing, so a button inside an `[inert]` subtree is never the one tapped.
 *
 * On a timeout it says what the phone shows instead (the Deck source element, the editor mode, the visible buttons),
 * so a red device run names the pane it found.
 *
 * @param {number} [ms] how long to wait, default 150 000: as long as the probes' first-render waits, because a slow
 *   Simulator can still be on the inert skeleton 30 s after the preview's first render (an iPhone run at deca0cb). Raised
 *   from 90 000 on 2026-11-04 (owner call, D3 on #3034): an iPhone nightly timed out at 90 s on a cold Studio (41447813149).
 * @returns {Promise<HTMLElement>} the visible Deck source editor
 */
// A global on purpose, set rather than declared, so it is plainly one: the probes that run after this file call it.
globalThis.latticeShowDeckEditor = async function latticeShowDeckEditor(ms = 150000) {
	const visible = (el) => !!el && !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	const button = (label) => [...document.querySelectorAll(`button[aria-label="${label}"]`)].find(visible);
	const editor = () => {
		const e = document.querySelector('[aria-label="Deck source"]');
		return visible(e) ? e : null;
	};
	const t0 = Date.now();
	let tapped = 0;
	for (;;) {
		const e = editor();
		if (e) return e;
		if (innerWidth <= 699 && Date.now() - tapped > 2000) {
			const src = button('Markdown source');
			if (src) {
				tapped = Date.now();
				src.click();
			}
		}
		if (Date.now() - t0 > ms) {
			const shown = [...document.querySelectorAll('button[aria-label]')]
				.filter(visible)
				.map((b) => `${b.getAttribute('aria-label')}${b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-selected') === 'true' ? '*' : ''}`)
				.slice(0, 24);
			const src = document.querySelector('[aria-label="Deck source"]');
			throw new Error(
				`timed out after ${ms} ms waiting for a visible Deck source editor (Deck source ${src ? `${src.tagName.toLowerCase()}, ${src.getClientRects().length} rects` : 'absent'}, .cm-content ${!!document.querySelector('.cm-content')}, contenteditable ${document.querySelectorAll('[contenteditable="true"]').length}, taps ${tapped ? 'yes' : 'no'}, inert skeleton ${document.querySelector('[inert]') ? 'still up' : 'gone'}; buttons, * = pressed: ${shown.join(' | ')})`,
			);
		}
		await new Promise((r) => setTimeout(r, 100));
	}
};


/**
 * WHERE A STALLED PREVIEW STOPPED (#2988). A probe calls `latticeWatch()` as it starts, so the errors, unhandled
 * rejections and policy refusals the page meets from then on are kept, and adds `latticeStallReport()` to the message of
 * a wait for the preview that times out. The report holds counts and names only, no deck text: the measured split's
 * counters (measured-split.ts), the hidden measuring frames still on the page, which lazy chunks finished loading
 * (Resource Timing reads them after the fact), and what was kept.
 */
// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script
function latticeWatch() {
	if (window.__latticeWatched) return;
	const seen = (window.__latticeWatched = []);
	const keep = (s) => seen.length < 20 && seen.push(String(s).slice(0, 240));
	addEventListener('error', (e) => keep(`error: ${e.message || e.target?.src || e.target?.href || e.type}`), true);
	addEventListener('unhandledrejection', (e) => keep(`rejection: ${e.reason?.message ?? e.reason}`));
	document.addEventListener('securitypolicyviolation', (e) => keep(`csp: ${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`));
	for (const level of ['warn', 'error']) {
		const real = console[level].bind(console);
		console[level] = (...a) => {
			keep(`${level}: ${a.map((x) => (x?.message ?? String(x))).join(' ')}`);
			real(...a);
		};
	}
}

// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script
function latticeStallReport() {
	try {
		const names = performance.getEntriesByType('resource').map((r) => r.name);
		const loaded = ['split-lazy', 'measured-split', 'fit-probes', 'sanitize-slide-html', 'esm/engine.js', 'esm/lint.js'].map((f) => `${f} ${names.some((n) => n.includes(f)) ? 'yes' : 'no'}`).join(', ');
		const hidden = document.querySelectorAll('iframe[aria-hidden="true"][tabindex="-1"]').length;
		const last = window.__latticeLastMeasuredSplit;
		const plan = last ? `rounds ${last.rounds}, fellBack ${last.fellBack}, ${last.facts?.length ?? 0} slides` : 'none';
		const kept = (window.__latticeWatched || []).join(' | ') || 'none';
		return `stall: readyState ${document.readyState}; measures ${window.__latticeMeasureCount ?? 0}; hidden frames ${hidden}; last measured split ${plan}; loaded: ${loaded}; ${names.length} resources; seen: ${kept}`;
	} catch (e) {
		return `stall report failed: ${e}`;
	}
}
