/**
 * THE LOGO WALL FIRST-PAINT PROBE, run INSIDE the Studio page by WebDriver (run.mjs) on Mobile Safari in the iOS Simulator,
 * and by the Playwright self-test (probe.selftest.mjs) on WebKit. It checks #3492 on real Mobile Safari: the first time a
 * logo wall comes on screen in the editing preview, the wall is never painted as the unpacked grid and then re-laid out.
 *
 * The runtime (lib/transformers/logo-marks.js, on lib/core/measure-kit.js) stamps the wall's list `measuring` and then
 * `packed`; the component's CSS hides a `measuring` list. Before the runtime gets to the list it carries no stamp, and the
 * preview's frame stylesheet (docs/src/playground/single-slide-render.ts `frameStyleContent`) holds that unstamped list back
 * too, releasing it on its own after 4.5 s if the runtime never comes. So every state the wall shows before `packed` must be
 * hidden.
 *
 *   1. a deck of a plain slide, a four-mark logo wall and a plain slide goes in the editor, and the preview goes to slide 1;
 *   2. a recorder in THIS page reads the preview's current frame on every animation frame and logs each change of the wall's
 *      (stamp, visibility), so a state painted for one frame is in the log;
 *   3. Next brings the wall on screen for the first time. Pass: the log ends `packed/visible`, and every wall state before
 *      it is hidden.
 *
 * Step 3 FAILS without #3492's frame rule when the runtime stamps the wall a beat after the slide paints. On a slide change
 * the runtime is already loaded and normally stamps before the first paint, so the flash is a race a loaded device loses
 * now and then (1 run in 96 at 8 workers in the e2e spec). The failing arm makes it certain: defer the stamp 120 ms in
 * lib/transformers/logo-marks.js (`setTimeout(() => stampLive(section, list), 120)`), rebuild, and run the self-test
 * (`PROBE=logo-wall node scripts/ios-safari/probe.selftest.mjs`). With the rule the log reads `unstamped/hidden > packed/visible`
 * and the probe passes; without it, `unstamped/visible > packed/visible` and it fails, on all three self-test shapes.
 * Delaying the runtime SCRIPT does not do it: the runtime is loaded before the wall's slide. The e2e spec
 * (docs/e2e/logo-wall-first-visit.spec.ts) is the gate; this probe is the real-device
 * reading. The file defines one global, `latticeLogoWallProbe()`, which resolves to a plain JSON result. Plain browser JS on
 * purpose: WebDriver's execute-script sends source text, not a module.
 */
// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function latticeLogoWallProbe() {
	const DECK = [
		'<!-- _class: title silent -->',
		'',
		'# Logo wall probe',
		'',
		'---',
		'',
		'<!-- _class: logo-wall -->',
		'',
		'## Four shapes, one weight.',
		'',
		'- ![Pinnacle](sample:logo-pinnacle.svg)',
		'- ![Keystone](sample:logo-keystone.svg)',
		'- ![Spire](sample:logo-spire.svg)',
		'- ![Acme](sample:logo-acme.svg)',
		'',
		'---',
		'',
		'## After the wall.',
		'',
	].join('\n');
	const result = { ua: navigator.userAgent, width: innerWidth, steps: [], ok: false };
	const step = (name, pass, detail) => {
		result.steps.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
		if (!pass) throw new Error(`${name}: ${detail}`);
	};
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	// One budget for the whole probe, for panes-probe.js's reason: run.mjs gives execute-script 360 s, and a wait cut short
	// by Safari loses its own message. Every wait is cut to what is left of 330 s and says so when it was cut.
	const BUDGET_MS = 330000;
	const probeT0 = Date.now();
	const left = () => BUDGET_MS - (Date.now() - probeT0);
	const until = async (fn, ms, what) => {
		const t0 = Date.now();
		const bound = Math.max(0, Math.min(ms, left()));
		const cut = bound < ms ? ` (cut from ${ms} ms: the probe's ${BUDGET_MS / 1000} s budget is spent)` : '';
		for (;;) {
			const v = fn();
			if (v) return v;
			if (Date.now() - t0 > bound) throw new Error(`timed out after ${bound} ms waiting for ${what}${cut}`);
			await sleep(100);
		}
	};
	// Not inside an `inert` subtree: the pre-paint skeleton draws look-alike buttons with the same labels that do nothing.
	const visible = (el) => !!el && !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	const button = (label) => [...document.querySelectorAll(`button[aria-label="${label}"]`)].find(visible);
	const frame = () => document.querySelector('[aria-label="Live deck preview"] iframe.live');
	const frameDoc = () => {
		try {
			return frame()?.contentDocument || null;
		} catch {
			return null;
		}
	};
	const narrow = innerWidth <= 699;
	const title = () => (frameDoc()?.querySelector('.lattice section h1, .lattice section h2')?.textContent || '').trim();

	/** Replace the deck source the way a person pasting does (panes-probe.js `setDeck`). */
	const setDeck = async (text) => {
		const el = await latticeShowDeckEditor(Math.max(1000, Math.min(150000, left())));
		el.focus();
		if (el instanceof HTMLTextAreaElement) {
			el.select();
			if (!document.execCommand('insertText', false, text)) {
				el.value = text;
				el.dispatchEvent(new Event('input', { bubbles: true }));
			}
		} else {
			document.execCommand('selectAll');
			document.execCommand('insertText', false, text);
		}
		if (narrow) {
			const prev = await until(() => button('Preview'), 15000, 'the Preview button');
			prev.click();
		}
	};
	const slideTotal = () => {
		for (const e of document.querySelectorAll('button, span, div')) {
			const m = /^\s*(?:Slide\s*)?(\d+)\s*\/\s*(\d+)\s*$/.exec(e.textContent || '');
			if (m && e.children.length <= 2 && visible(e)) return Number(m[2]);
		}
		return 0;
	};

	/** The wall's state in the CURRENT preview frame: `<stamp>/<visibility>`, `unstamped` before the runtime stamps it. */
	const wallState = () => {
		const doc = frameDoc();
		const ul = doc?.querySelector('section.logo-wall .cell-stage > ul');
		const view = doc?.defaultView;
		return ul && view ? `${ul.getAttribute('data-logo-wall') ?? 'unstamped'}/${view.getComputedStyle(ul).visibility}` : 'none';
	};

	let stop = false;
	try {
		// The Studio has painted a slide before the probe edits it (panes-probe.js, #2911).
		await until(() => window.__latticeRenderMetrics?.latest?.() && frameDoc()?.querySelector('.lattice section'), 150000, "the Studio's first render");
		for (let attempt = 1; ; attempt++) {
			await setDeck(DECK);
			try {
				await until(() => slideTotal() === 3, 8000, 'three slides');
				break;
			} catch {
				if (attempt === 3) throw new Error(`the deck did not land whole after 3 tries (${slideTotal()} slides, wanted 3)`);
			}
		}
		for (let i = 0; i < 6; i++) {
			const prev = button('Previous slide');
			if (prev) prev.click();
			await sleep(150);
		}
		await until(() => title() === 'Logo wall probe', 30000, 'slide 1 (the plain title slide)');
		await sleep(500);
		step('the wall is not on screen before Next', wallState() === 'none', wallState());

		const log = [];
		const t0 = performance.now();
		const tick = () => {
			if (stop) return;
			const s = wallState();
			if (log[log.length - 1]?.s !== s) log.push({ s, t: Math.round(performance.now() - t0) });
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
		(button('Next slide') || { click() { throw new Error('no Next slide button'); } }).click();
		// The wall ends packed, or at the measure kit's cap as `fallback`. 20 s covers the 4 s cap on a slow simulator.
		await until(() => /^(packed|fallback)\/visible$/.test(log[log.length - 1]?.s ?? ''), 20000, `the wall to finish (log so far: ${log.map((e) => e.s).join(' > ') || 'empty'})`);
		await sleep(500);
		stop = true;
		const walls = log.filter((e) => e.s !== 'none');
		const shown = walls.map((e) => `${e.s}@${e.t}`).join(' > ');
		const end = walls[walls.length - 1]?.s;
		step('the wall ends packed and on screen', end === 'packed/visible', shown);
		const before = walls.slice(0, -1);
		step('every wall state before packed was hidden (never the unpacked grid)', before.every((e) => e.s.endsWith('/hidden')), shown);
		result.ok = true;
	} catch (e) {
		result.error = String(e?.message ?? e);
	} finally {
		stop = true;
	}
	return result;
}
