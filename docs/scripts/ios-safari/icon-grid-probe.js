/**
 * THE ICON GRID PROBE, run INSIDE the Studio page by WebDriver (run.mjs) on Mobile Safari in the iPhone iOS Simulator, and
 * by the Playwright self-test (probe.selftest.mjs) on WebKit. Issue #2578 P2: #2572 built the Studio's icon grid
 * (IconGrid.tsx, "Insert an icon…") and could only emulate the phone. The path a person takes on an iPhone:
 *
 *   1. Menu → Search / commands → Insert an icon…: the grid opens as a sheet and its icons load;
 *   2. with the Markdown source pane showing, a pick inserts the icon span (`^{name}`) at the editor's caret and closes the grid;
 *   3. from the Preview pane, where no editor is on screen, a pick copies the span and says so in a toast.
 *
 * The pick itself is a real touch tap, sent by run.mjs through WebDriver (a finger, not a script `click()`), because the
 * clipboard write in step 3 needs a user gesture. This file opens the grid and reads the result; run.mjs taps between them.
 * Plain browser JS on purpose: WebDriver's execute-script sends source text, not a module.
 */

/** Shared by the two globals below: waits, visibility and the open dialog by name. */
const latticeIconGridKit = () => {
	const until = async (what, test, ms = 20000) => {
		const t0 = performance.now();
		for (;;) {
			const v = test();
			if (v) return v;
			if (performance.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
			await new Promise((r) => requestAnimationFrame(r));
		}
	};
	// The pre-paint skeleton draws inert look-alikes of the header buttons; only a live, visible control counts.
	const visible = (el) => !!el && !el.closest('[inert], [aria-hidden="true"]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	const dialogNamed = (name) =>
		[...document.querySelectorAll('[role="dialog"]')].find((d) => {
			const by = d.getAttribute('aria-labelledby');
			const label = d.getAttribute('aria-label') || (by && document.getElementById(by)?.textContent) || '';
			return label.trim() === name && d.getAttribute('data-state') === 'open';
		});
	// The Deck source label sits on CodeMirror's content element itself, or on a wrapper around it.
	const editorText = () => {
		const el = document.querySelector('[aria-label="Deck source"]');
		return (el?.matches('.cm-content') ? el : el?.querySelector('.cm-content'))?.textContent ?? '';
	};
	return { until, visible, dialogNamed, editorText };
};

/**
 * Show the pane `where` names (`source` or `preview`), open the icon grid through Menu → Search / commands, and return the
 * first icon's name and the point to tap it at, once its box has held still for five frames.
 * @param {'source' | 'preview'} where
 */
// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function latticeIconGridOpen(where) {
	const result = { ua: navigator.userAgent, width: innerWidth, steps: [], ok: false };
	const step = (name, pass, detail) => {
		result.steps.push({ name: `${where} · ${name}`, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
		if (!pass) throw new Error(`${name}: ${detail}`);
	};
	const { until, visible, dialogNamed, editorText } = latticeIconGridKit();
	try {
		await until("the Studio's first render", () => window.__latticeRenderMetrics, 150000);
		if (where === 'source') {
			await latticeShowDeckEditor();
			step('the Markdown source pane shows', true);
		} else {
			const preview = await until('the Preview tab', () => [...document.querySelectorAll('button[aria-label="Preview"]')].find(visible));
			preview.click();
			await until('the source pane to leave', () => !visible(document.querySelector('[aria-label="Deck source"]')));
			step('the Preview pane shows, and no editor is on screen', true);
		}
		result.before = (editorText().match(/\^\{/g) || []).length;
		const menu = await until('the Menu button', () => [...document.querySelectorAll('button[aria-label="Menu"]')].find(visible));
		menu.click();
		const sheet = await until('the Menu sheet', () => dialogNamed('Menu'));
		const search = await until('its Search / commands row', () => [...sheet.querySelectorAll('button')].find((b) => visible(b) && (b.getAttribute('aria-label') || b.textContent).trim() === 'Search / commands'));
		search.click();
		const palette = await until('the Search / commands panel', () => dialogNamed('Search / commands'));
		step('Menu → Search / commands opens the command panel', true);
		const row = await until('the "Insert an icon…" command', () => [...palette.querySelectorAll('[cmdk-item]')].find((i) => i.textContent.trim().endsWith('Insert an icon…')));
		row.click();
		const grid = await until('the icon grid', () => dialogNamed('Insert an icon'));
		step('Insert an icon… opens the grid as a sheet', true);
		const first = await until('the icons to load', () => [...grid.querySelectorAll('section ul button')].find(visible), 60000);
		const count = grid.querySelectorAll('section ul button').length;
		step('the icons load', count > 50, `${count} icons`);
		first.scrollIntoView({ block: 'center', behavior: 'instant' });
		let last = '';
		let still = 0;
		const at = await until('the first icon to hold still under its tap point', () => {
			const r = first.getBoundingClientRect();
			const x = Math.round(r.left + r.width / 2);
			const y = Math.round(r.top + r.height / 2);
			const key = `${x},${y}`;
			still = key === last ? still + 1 : 0;
			last = key;
			const under = document.elementFromPoint(x, y);
			return still >= 5 && under && first.contains(under) ? { x, y } : null;
		});
		result.name = [...first.querySelectorAll('span')].at(-1)?.textContent.trim();
		result.x = at.x;
		result.y = at.y;
		step('an icon to pick', !!result.name, `${result.name} at ${at.x},${at.y}`);
		result.ok = true;
	} catch (e) {
		result.error = String(e?.message ? e.message : e);
	}
	return result;
}

/**
 * After the tap: the grid closed, and either the span is in the editor (`source`) or a toast says it was copied (`preview`).
 * @param {'source' | 'preview'} where
 * @param {string} name the icon tapped
 * @param {number} before how many icon spans the editor held before the tap
 */
// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function latticeIconGridCheck(where, name, before) {
	const result = { steps: [], ok: false };
	const step = (label, pass, detail) => {
		result.steps.push({ name: `${where} · ${label}`, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
		if (!pass) throw new Error(`${label}: ${detail}`);
	};
	const { until, dialogNamed, editorText } = latticeIconGridKit();
	try {
		await until('the grid to close', () => !dialogNamed('Insert an icon'), 10000);
		step('the tap picks the icon and closes the grid', true);
		const span = `^{${name}}`;
		if (where === 'source') {
			await until(`${span} in the editor`, () => (editorText().match(/\^\{/g) || []).length > before && editorText().includes(span), 10000);
			step('the span is inserted at the caret', true, span);
		} else {
			const toast = await until('the copied toast', () => [...document.querySelectorAll('[data-sonner-toast]')].find((t) => t.textContent.includes(`Copied`) && t.textContent.includes(span)), 10000);
			step('a toast says the span was copied', true, toast.textContent.trim().slice(0, 80));
			step('no editor took the span', (editorText().match(/\^\{/g) || []).length === before, `${before} spans before the pick`);
		}
		result.ok = true;
	} catch (e) {
		result.error = String(e?.message ? e.message : e);
	}
	return result;
}
