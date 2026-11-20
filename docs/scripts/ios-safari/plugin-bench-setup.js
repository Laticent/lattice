/**
 * THE D1 BENCH SETUP, run INSIDE the Studio page by WebDriver (run.mjs, PROBE=plugin-bench) on Mobile Safari in the iOS
 * Simulator: import the `bench-bars` plugin (docs/scripts/bench/bench-bars) through the real Library, write the bench deck,
 * approve the plugin and wait for its drawing. run.mjs then reloads the Studio per arm and reads the per-frame record that
 * code-packages/wait.ts `benchRecorder` keeps (followups.d/3292-p1-plugin-reload-code-block.md). Throwaway: dispatch only.
 * Defines one global, `latticeBenchSetup(zipBase64)`. Plain browser JS, because WebDriver's execute-script sends source text.
 */
// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function latticeBenchSetup(zipBase64) {
	const NAME = 'bench-bars';
	const DECK = `---\nplugins: [${NAME}]\n---\n\n## Q3 revenue by region\n\n\`\`\`${NAME}\nEMEA: 4.1\nNA: 5.2\nAPAC: 2.9\nLATAM: 6.0\nANZ: 3.4\n\`\`\`\n\n> EMEA led the quarter; APAC recovered in September.\n`;
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
	const visible = (el) => !!el && !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	const byLabel = (label) => [...document.querySelectorAll(`button[aria-label="${label}"]`)].find(visible);
	const byText = (re) => [...document.querySelectorAll('button, [role="menuitem"]')].find((b) => visible(b) && re.test(b.textContent.trim()));
	const FRAME = '[aria-label="Live deck preview"] iframe.live';
	const badgeIn = (f) => {
		try {
			return f.contentDocument?.querySelector(`[data-lattice-plugin="${NAME}"] rect`) || null;
		} catch {
			return null;
		}
	};
	try {
		await latticeShowDeckEditor();
		step('the deck editor shows', true);

		// 1. IMPORT through the Library's own file input, as a person picking the zip does.
		const input = () => document.querySelector('[data-testid="library-import-input"]');
		for (let i = 0; i < 4 && !input(); i++) {
			const liveMenu = [...document.querySelectorAll('button[aria-label="More controls"], button[aria-label="Menu"]')].find((b) => visible(b) && b.hasAttribute('aria-expanded'));
			const lib = byLabel('Open Library') || byText(/^Library$/);
			// A phone: the Library is a row in the "Menu" drawer (StudioDrawer).
			const drawer = innerWidth <= 699 ? byLabel('Menu') : null;
			if (lib) lib.click();
			else if (drawer) {
				drawer.click();
				const row = await until(() => byText(/^Library/), 8000, 'the Library row in the Menu drawer').catch(() => null);
				if (row) row.click();
			} else if (liveMenu) {
				if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
				liveMenu.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerType: 'mouse', isPrimary: true }));
				const item = await until(() => byText(/^Library/), 5000, 'the Library item').catch(() => null);
				if (item) item.click();
			}
			const t0 = Date.now();
			while (!input() && Date.now() - t0 < 6000) await sleep(100);
		}
		const el = await until(input, 1000, 'the Library import input');
		const bytes = Uint8Array.from(atob(zipBase64), (c) => c.charCodeAt(0));
		const dt = new DataTransfer();
		dt.items.add(new File([bytes], `${NAME}.zip`, { type: 'application/zip' }));
		el.files = dt.files;
		el.dispatchEvent(new Event('change', { bubbles: true }));
		await until(() => [...document.querySelectorAll('[data-sonner-toast]')].some((t) => /1 plugin\(s\)/.test(t.textContent)), 30000, 'the import toast');
		step('the plugin imports through the Library', true);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await sleep(300);
		// A phone: Escape steps back to the Menu drawer; its "Back to Deck" closes it.
		for (let i = 0; i < 3 && byLabel('Back to Deck'); i++) {
			byLabel('Back to Deck').click();
			await sleep(500);
		}

		// 2. THE DECK, and the notice asking for the yes.
		const notice = () => document.querySelector('[data-slot="code-packages"]');
		for (let i = 0; i < 4 && notice()?.getAttribute('data-state') !== 'unapproved'; i++) {
			const ed = await latticeShowDeckEditor();
			ed.focus();
			document.execCommand('selectAll');
			document.execCommand('delete');
			await until(() => [...document.querySelectorAll('[aria-label="Deck source"] .cm-line')].every((l) => !l.textContent), 15000, 'an empty editor');
			document.execCommand('insertText', false, DECK);
			// WebKit lands one blank line above the deck, so the front matter does not parse: drop it.
			const first = document.querySelector('[aria-label="Deck source"] .cm-line');
			if (first && !first.textContent) {
				const r = document.createRange();
				r.setStart(first, 0);
				r.collapse(true);
				getSelection().removeAllRanges();
				getSelection().addRange(r);
				await sleep(100);
				document.execCommand('forwardDelete');
			}
			// A phone parks the preview, and the notice above it, while the source pane is up: show the Preview pane.
			if (innerWidth <= 699) {
				await sleep(500);
				byLabel('Preview')?.click();
			}
			const t0 = Date.now();
			while (notice()?.getAttribute('data-state') !== 'unapproved' && Date.now() - t0 < 15000) await sleep(200);
		}
		await until(() => notice()?.getAttribute('data-state') === 'unapproved', 1000, 'the notice to ask for approval');
		step('the notice asks to approve the plugin', true);

		// 3. APPROVE, and wait for the plugin's drawing in the live preview.
		const approve = await until(() => [...(notice()?.querySelectorAll(`button[aria-label="Approve the code of ${NAME}"]`) ?? [])].find(visible), 15000, 'the Approve button');
		approve.click();
		await until(() => [...document.querySelectorAll(FRAME)].some((f) => badgeIn(f)), 60000, 'the drawn chart');
		step('the chart draws after approval', true);
		// The deck is saved and, for the afterimage arm, the drawing's boxes kept, before the first reload.
		await until(() => Object.keys(localStorage).some((k) => (localStorage.getItem(k) || '').includes(`plugins: [${NAME}]`)), 30000, 'the deck to save');
		await until(() => Object.keys(JSON.parse(localStorage.getItem('lattice-plugin-afterimages') || '{}')).length > 0, 30000, 'the afterimage to be kept');
		step('the deck saves and the afterimage is kept', true);
		result.ok = true;
	} catch (e) {
		result.error = String(e?.message ? e.message : e);
		result.buttons = [...document.querySelectorAll('button')].filter(visible).map((b) => b.getAttribute('aria-label') || b.textContent.trim()).slice(0, 40);
	}
	return result;
}
