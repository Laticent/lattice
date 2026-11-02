/**
 * THE PANES SWAP PROBE, run INSIDE the Studio page by WebDriver (run.mjs) on Mobile Safari in the iOS
 * Simulator, and by the Playwright self-test (probe.selftest.mjs) on WebKit. It checks what #2916 changed in
 * the Studio's single-slide frame, on the surface the owner saw it on (iPhone Safari):
 *
 *   1. a deck whose pane slides hold DIFFERENT components (list|table, table over bar, bar|list) after a plain
 *      title slide is put in the editor and the frame is taken back to slide 1;
 *   2. stepping into the FIRST pane slide, once the new slide is on screen no pane's content ever moves
 *      again. The frame used to paint the new body under the previous slide's sheet and re-place it when the
 *      new sheet parsed (a table at 260 px, then 306 px);
 *   3. stepping on to the other pane slides, the frame keeps ONE stylesheet (the same `#lattice-sheet` href)
 *      and the same document. It used to load a different ~1.3 MB sheet per slide;
 *   4. every move's click-to-paint time is recorded in the step detail (never asserted beyond "it did not
 *      hang"): wall time on a simulator is not a number to gate on, but it is the number to read.
 *
 * Steps 2 and 3 FAIL on the code before #2916 (measured on Playwright WebKit with six copies running at once: the
 * pane content moved from [177,177] to [177,337] after the slide painted, and every pane slide held its own sheet),
 * so a pass proves something. The file defines one global,
 * `latticePanesProbe()`, which resolves to a plain JSON result. Plain browser JS on purpose: WebDriver's
 * execute-script sends source text, not a module.
 */
// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function latticePanesProbe() {
	const DECK = [
		'<!-- _class: title silent -->',
		'',
		'# Panes probe',
		'',
		'`Plain title slide`',
		'',
		'---',
		'',
		'## Probe slide two',
		'',
		'<!-- _class: columns ratio-35-65 -->',
		'<!-- _pane: list -->',
		'',
		'- First point',
		'- Second point',
		'',
		'<!-- _pane: table -->',
		'',
		'| Region | Q2 | Q3 |',
		'|---|---|---|',
		'| EMEA | 4.1 | 5.3 |',
		'| APAC | 2.8 | 2.8 |',
		'',
		'---',
		'',
		'## Probe slide three',
		'',
		'<!-- _class: rows -->',
		'<!-- _pane: table -->',
		'',
		'| Quarter | Revenue |',
		'|---|---|',
		'| Q1 | $12M |',
		'| Q2 | $18M |',
		'',
		'<!-- _pane: bar -->',
		'',
		'- Q1 `12`',
		'- Q2 `18`',
		'',
		'---',
		'',
		'## Probe slide four',
		'',
		'<!-- _class: columns -->',
		'<!-- _pane: bar -->',
		'',
		'- Licenses `42`',
		'- Services `47`',
		'',
		'<!-- _pane: list -->',
		'',
		'- Services passed licenses',
		'- Training folds in',
		'',
	].join('\n');
	const result = { ua: navigator.userAgent, width: innerWidth, steps: [], ok: false };
	const step = (name, pass, detail) => {
		result.steps.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
		if (!pass) throw new Error(`${name}: ${detail}`);
	};
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const until = async (fn, ms, what) => {
		const t0 = Date.now();
		for (;;) {
			const v = fn();
			if (v) return v;
			if (Date.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
			await sleep(100);
		}
	};
	const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
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

	/** Replace the deck source the way a person pasting does: one insertText into the focused editor. */
	const setDeck = async (text) => {
		if (narrow) {
			const src = await until(() => button('Markdown source'), 15000, 'the Markdown source button');
			src.click();
		}
		const el = await until(() => {
			const e = document.querySelector('[aria-label="Deck source"]');
			return visible(e) ? e : null;
		}, 15000, 'a visible Deck source editor');
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

	/** What the frame shows right now: the slide's title, each pane's first content top, the sheet it holds. */
	const snapshot = () => {
		const doc = frameDoc();
		const sec = doc?.querySelector('.lattice section');
		if (!sec) return null;
		const sheet = doc.getElementById('lattice-sheet');
		return {
			title: (sec.querySelector('h2, h1')?.textContent || '').trim(),
			tops: [...sec.querySelectorAll('lat-pane')].map((p) => {
				const c = p.querySelector('.cell-stage > *');
				return c ? Math.round(c.getBoundingClientRect().top) : null;
			}),
			sheet: sheet ? sheet.getAttribute('href') || `inline:${sheet.textContent.length}` : 'none',
			sheets: doc.querySelectorAll('link[rel=stylesheet]').length,
		};
	};
	const sameTops = (a, b) => a.length === b.length && a.every((t, i) => t === b[i]);

	/** Click a control, then watch every animation frame until `title` is on screen and for `settle` ms more. */
	const move = async (click, title, settle) => {
		const frames = [];
		let stop = false;
		const loop = () => {
			if (stop) return;
			const s = snapshot();
			if (s) frames.push({ t: performance.now(), ...s });
			requestAnimationFrame(loop);
		};
		const t0 = performance.now();
		requestAnimationFrame(loop);
		click();
		const seen = await until(() => frames.find((f) => f.title === title), 20000, `the "${title}" slide in the frame`);
		await sleep(settle);
		stop = true;
		const mine = frames.filter((f) => f.title === title);
		return { ms: Math.round(seen.t - t0), frames: mine, first: mine[0], last: mine[mine.length - 1] };
	};

	try {
		await until(() => window.__latticeRenderMetrics && document.querySelector('[aria-label="Deck source"]'), 90000, 'the Studio editor and its render metrics');
		// On a cold page the first insert into a freshly hydrated editor can lose its opening characters (Playwright's
		// WebKit dropped the deck's leading `---`, which turned the front matter into a fifth slide). So check the deck
		// landed whole, by its slide count, and put it in again if it did not.
		const slideTotal = () => {
			for (const e of document.querySelectorAll('button, span, div')) {
				const m = /^\s*(?:Slide\s*)?(\d+)\s*\/\s*(\d+)\s*$/.exec(e.textContent || '');
				if (m && e.children.length <= 2 && visible(e)) return Number(m[2]);
			}
			return 0;
		};
		for (let attempt = 1; ; attempt++) {
			await setDeck(DECK);
			try {
				await until(() => slideTotal() === 4, 8000, 'four slides');
				break;
			} catch {
				if (attempt === 3) throw new Error(`the deck did not land whole after 3 tries (${slideTotal()} slides, wanted 4)`);
			}
		}
		await until(() => frameDoc()?.querySelector('.lattice section'), 60000, 'a slide in the preview frame');
		// Back to slide 1, the plain title slide: the plain stylesheet.
		for (let i = 0; i < 8; i++) {
			const prev = button('Previous slide');
			if (prev) prev.click();
			await sleep(150);
		}
		await until(() => snapshot()?.title === 'Panes probe', 30000, 'slide 1 (the plain title slide)');
		await sleep(800);
		const stamp = `p${Date.now()}`;
		frameDoc().defaultView.__latticePanesStamp = stamp;
		const plainSheet = snapshot().sheet;
		const paths = [];
		window.__latticeRenderMetrics.on((s) => paths.push(String(s.writePath)));

		const next = () => (button('Next slide') || { click() { throw new Error('no Next slide button'); } }).click();

		// 2. Into the first pane slide: no pane content moves once the slide is on screen.
		const m2 = await move(next, 'Probe slide two', 1500);
		const moved = m2.frames.filter((f) => !sameTops(f.tops, m2.first.tops));
		step(
			'entering the first pane slide: no pane content moves after it paints',
			m2.frames.length > 0 && moved.length === 0 && m2.first.tops.length === 2 && m2.first.tops.every((t) => t !== null),
			`first frame ${JSON.stringify(m2.first.tops)}, last ${JSON.stringify(m2.last.tops)}, ${m2.frames.length} frames, ${m2.ms} ms`,
		);
		// NOT asserted: that the plain slide's sheet differs from the pane slide's. The Studio renders a slide alone
		// or, in some states, the whole deck, and a whole-deck render of this deck carries the pane sheet for slide 1
		// too (an iPhone simulator read the same sheet on both, and that is the better outcome, not a failure).
		step('the sheet before and after entering the first pane slide (recorded, not asserted)', true, `${plainSheet} -> ${m2.last.sheet}`);
		const paneSheet = m2.last.sheet;

		// 3. Between pane slides: one sheet, one document.
		const m3 = await move(next, 'Probe slide three', 1200);
		step('pane slide to pane slide keeps the same stylesheet', m3.last.sheet === paneSheet && m3.frames.every((f) => f.sheet === paneSheet), `${paneSheet} / ${m3.last.sheet}, ${m3.ms} ms`);
		const m3Moved = m3.frames.filter((f) => !sameTops(f.tops, m3.first.tops));
		step('no pane content moves after the second pane slide paints', m3Moved.length === 0 && m3.first.tops.length === 2, `${JSON.stringify(m3.first.tops)}, ${m3.frames.length} frames`);
		const m4 = await move(next, 'Probe slide four', 1200);
		step('and again on the third', m4.last.sheet === paneSheet && m4.frames.every((f) => f.sheet === paneSheet), `${m4.last.sheet}, ${m4.ms} ms`);
		const m4Moved = m4.frames.filter((f) => !sameTops(f.tops, m4.first.tops));
		step('no pane content moves after the third pane slide paints', m4Moved.length === 0 && m4.first.tops.length === 2, `${JSON.stringify(m4.first.tops)}, ${m4.frames.length} frames`);
		step('the frame was patched in place, never rewritten', frameDoc()?.defaultView?.__latticePanesStamp === stamp, `render paths: ${paths.join(',') || 'none'}`);
		step('every move painted within 5 s', Math.max(m2.ms, m3.ms, m4.ms) < 5000, `click-to-paint ms: ${m2.ms}, ${m3.ms}, ${m4.ms}`);
		result.ok = true;
	} catch (e) {
		result.error = String(e?.message ?? e);
	}
	return result;
}
