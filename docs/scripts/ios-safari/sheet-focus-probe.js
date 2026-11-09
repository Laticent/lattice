/**
 * THE SHEET FOCUS PROBE, run INSIDE the Studio page by WebDriver (run.mjs) on Mobile Safari in the iOS
 * Simulator, and by the Playwright self-test (probe.selftest.mjs) on WebKit. It checks what PR #3108 changed
 * in `ui/sheet.tsx` on the engine the owner reads it on:
 *
 *   1. focus a plain button that opens a sheet (the phone's Menu; on an iPad width, Version history),
 *      then press it;
 *   2. the sheet opens as a dialog and holds focus;
 *   3. Escape closes it, and focus is back on that button. Before #3108 a modal Radix sheet returned focus
 *      only to a `SheetTrigger`, so it fell to <body>;
 *   4. a second open and close does the same: the latched (already mounted) path, not only the first mount.
 *
 * It measures DOM focus, which is what a keyboard and a screen reader's programmatic focus follow. It does not
 * drive VoiceOver, and the button is focused by script before the press: a finger tap on iOS does not focus a
 * button, so after a tap there is nothing to return to and the sheet keeps Radix's own behavior.
 * The file defines one global, `latticeSheetFocusProbe()`, which resolves to a plain JSON result. Plain browser
 * JS on purpose: WebDriver's execute-script sends source text, not a module.
 */
// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function latticeSheetFocusProbe() {
	const result = { ua: navigator.userAgent, width: innerWidth, steps: [], ok: false };
	const step = (name, pass, detail) => {
		result.steps.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
		if (!pass) throw new Error(`${name}: ${detail}`);
	};
	const until = async (what, test, ms = 20000) => {
		const t0 = performance.now();
		for (;;) {
			const v = test();
			if (v) return v;
			if (performance.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
			await new Promise((r) => requestAnimationFrame(r));
		}
	};
	// The pre-paint skeleton (#studio-ssr-shell) draws its own inert copy of every header button, Menu included;
	// only the live, focusable one counts.
	const visible = (el) => !!el && !el.closest('[inert], [aria-hidden="true"]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	const describe = (el) => (el ? `${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? `[aria-label="${el.getAttribute('aria-label')}"]` : ''}` : 'null');
	const dialogNamed = (name) =>
		[...document.querySelectorAll('[role="dialog"]')].find((d) => {
			const by = d.getAttribute('aria-labelledby');
			const label = d.getAttribute('aria-label') || (by && document.getElementById(by)?.textContent) || '';
			return label.trim() === name && d.getAttribute('data-state') === 'open';
		});
	try {
		// The Studio has hydrated once its first render has run (the signal panes-probe.js waits on); before that the
		// header is the pre-paint skeleton, whose buttons have no handlers.
		await until("the Studio's first render", () => window.__latticeRenderMetrics, 150000);
		const opener = await until('a plain button that opens a sheet', () => {
			const menu = [...document.querySelectorAll('button[aria-label="Menu"]')].find(visible);
			if (menu) return { el: menu, dialog: 'Menu' };
			const history = [...document.querySelectorAll('button[aria-label="Version history"]')].find(visible);
			return history ? { el: history, dialog: 'Version history' } : null;
		});
		step('opener found', true, `${describe(opener.el)} opens "${opener.dialog}"`);
		for (const round of ['first open (mounts)', 'second open (latched)']) {
			opener.el.focus();
			step(`${round}: opener focused before the press`, document.activeElement === opener.el, describe(document.activeElement));
			opener.el.click();
			const dialog = await until(`the "${opener.dialog}" sheet`, () => dialogNamed(opener.dialog));
			await until('focus inside the sheet', () => dialog.contains(document.activeElement));
			step(`${round}: sheet open and holding focus`, true, describe(document.activeElement));
			(document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
			await until('the sheet to close', () => !dialogNamed(opener.dialog) && ![...document.querySelectorAll('[role="dialog"]')].some(visible));
			// Radix returns focus in a task after the close; give it a beat, then read where focus landed.
			const landed = await until('focus to settle', () => (document.activeElement && document.activeElement !== document.body ? document.activeElement : null), 3000).catch(() => document.activeElement);
			step(`${round}: focus is back on the opener after Escape`, landed === opener.el, `focus on ${describe(landed)}`);
		}
		result.ok = true;
	} catch (e) {
		result.error = String(e && e.message ? e.message : e);
	}
	return result;
}
