/**
 * THE PLUGIN APPROVE PROBE (#3292), run INSIDE the Studio page by WebDriver (run.mjs, PROBE=plugin) on Mobile Safari in the
 * iOS Simulator. It checks, on the surface the owner tests on, what docs/e2e/plugin-slots.spec.ts `watchBadgeFrames` checks
 * in Chromium, WebKit and Gecko: after Approve, no painted frame shows the plugin badge's text without the plugin's fill.
 *
 *   1. import the demo plugin `status-card` (lib/packages/_demo-host-slots) through the real Library import input;
 *   2. write a deck that lists and uses it, and wait for the notice above the preview to ask for approval;
 *   3. start a requestAnimationFrame watcher on the live preview frame, tap Approve, and record every frame where the
 *      badge reads "at-risk" with a transparent background, until it has held its fill for 60 frames in a row.
 *
 * Defines one global, `latticePluginProbe(zipBase64)`, resolving to a plain JSON result. Plain browser JS, because
 * WebDriver's execute-script sends source text, not a module.
 */
// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function latticePluginProbe(zipBase64) {
	const NAME = 'status-card';
	const DECK = `---\nplugins: [${NAME}]\n---\n\n## Outside the plugin\n\n\`\`\`${NAME}\nstatus: at-risk\ntitle: Q3 launch readiness\n\n| Workstream | Owner |\n|:--|:--|\n| Legal review | Dana |\n\`\`\`\n`;
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
			return f.contentDocument?.querySelector(`[data-lattice-plugin="${NAME}"] .lp-status-card-badge`) || null;
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
			document.execCommand('insertText', false, DECK);
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

		// 3. WATCH EVERY FRAME, then approve.
		const watch = { bare: [], filled: 0, frames: 0, textFrames: 0, done: false };
		const tick = () => {
			watch.frames++;
			for (const f of document.querySelectorAll(FRAME)) {
				const badge = badgeIn(f);
				if (!badge || badge.textContent.trim() !== 'at-risk' || !badge.getClientRects().length) continue;
				watch.textFrames++;
				const fill = f.contentWindow.getComputedStyle(badge).backgroundColor;
				if (/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(fill)) {
					watch.bare.push(`frame ${watch.frames}: ${fill}`);
					watch.filled = 0;
				} else watch.filled++;
			}
			if (watch.filled >= 60) watch.done = true;
			else if (watch.frames < 20000) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
		const approve = await until(() => [...(notice()?.querySelectorAll(`button[aria-label="Approve the code of ${NAME}"]`) ?? [])].find(visible), 15000, 'the Approve button');
		approve.click();
		await until(() => watch.done, 60000, 'the badge to hold its fill for 60 frames');
		step('the badge draws, filled', watch.textFrames > 0, `${watch.textFrames} frames with the text, ${watch.frames} frames watched`);
		step('no frame painted the badge text without the plugin fill', watch.bare.length === 0, watch.bare.slice(0, 5).join('; ') || 'none');
		result.frames = watch.frames;
		result.textFrames = watch.textFrames;
		result.ok = true;
	} catch (e) {
		result.error = String(e?.message ? e.message : e);
		result.buttons = [...document.querySelectorAll('button')].filter(visible).map((b) => b.getAttribute('aria-label') || b.textContent.trim()).slice(0, 40);
	}
	return result;
}
