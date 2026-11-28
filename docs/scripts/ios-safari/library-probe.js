/**
 * THE LIBRARY PROBE, run INSIDE the Studio page by WebDriver (run.mjs) on Mobile Safari in the iOS Simulator, and by
 * the Playwright self-test (probe.selftest.mjs) on WebKit. It checks storage slice 4 (PR #3588; design §7 of
 * engineering/decisions/2026-11-22-local-first-drive-storage.md) on the engine a phone reader has:
 *
 *   1. the Library opens the way this device opens it (the phone's Menu, the tablet's More controls, the desktop
 *      toolbar), and its section strip is live, not the pre-paint shell's inert copy;
 *   2. every section is a named tab: six of them, All · Decks · Design · Media · Files · Plugins, or fewer plus a More
 *      pill where a narrow dock folds the rest;
 *   3. on a phone the pills are icons (no visible word; the name is the aria-label), in the sheet they keep the word,
 *      and either way no pill is shorter than a labeled one (32px dense, 34px roomy);
 *   4. the row is ONE row, inside the screen, and it does not move under the tap that picks a section: the pills shown
 *      before each pick are the pills shown after it;
 *   5. Decks has its own section, with its empty state on a fresh Studio;
 *   6. Backup and restore opens from the Library header as a dialog holding both buttons, and closes on Escape.
 *
 * docs/e2e/library-sections.spec.ts checks the same on Chromium, Linux WebKit and Gecko. The picks are page-side
 * clicks: setup, not a test of touch delivery (the deck-band tap in run.mjs is the Library's touch test).
 * The file defines one global, `latticeLibraryProbe()`, which resolves to a plain JSON result. Plain browser JS on
 * purpose: WebDriver's execute-script sends source text, not a module.
 */
// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function latticeLibraryProbe() {
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
	// The pre-paint skeleton (#studio-ssr-shell, and the Library's own shell) draws inert copies; only live ones count.
	const live = (el) => !!el && !el.closest('[inert], [aria-hidden="true"]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	const button = (label) => [...document.querySelectorAll(`button[aria-label="${label}"]`)].find(live);
	const SECTIONS = ['All', 'Decks', 'Design', 'Media', 'Files', 'Plugins'];
	const strip = () => [...document.querySelectorAll('[role="tablist"][aria-label="Library sections"]')].find(live);
	// SETTLED, not just present: the sheet slides in over 500 ms (ui/sheet.tsx), and on a starved runner far longer, so a
	// strip read the moment it exists can sit a sheet's width off to the right (harness run 1 on #3588: 1049–1544px on a
	// 1032px screen). Wait until no animation runs on it or its dialog, and its box holds still for three frames (#32).
	const settled = async (what, el) => {
		const host = el.closest('[role="dialog"]') || el;
		let last = '';
		let still = 0;
		await until(what, () => {
			// Any finite animation not yet finished counts, paused or stalled at its first frame included: run 1 read the
			// strip a whole sheet-width (720px) to the right, the slide's starting frame. An endless one (a spinner) does not.
			// Animations on the strip, inside its dialog, or on any ANCESTOR (the slide can live on a wrapper above the dialog).
			const moving = document.getAnimations().some((a) => {
				const t = a.effect?.target;
				return !!t && (t.contains(el) || host.contains(t)) && a.playState !== 'finished' && a.effect.getComputedTiming().iterations !== Infinity;
			});
			const r = el.getBoundingClientRect();
			const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}`;
			still = !moving && key === last ? still + 1 : 0;
			last = key;
			return still >= 3;
		}, 30000);
	};
	const row = () => {
		const list = strip();
		const host = list.parentElement;
		const more = [...host.querySelectorAll(':scope > button[aria-haspopup]')].filter(live);
		return [...list.querySelectorAll('[role="tab"]'), ...more].filter(live).map((el) => {
			const r = el.getBoundingClientRect();
			return { el, name: el.getAttribute('aria-label') || el.textContent.trim(), text: el.textContent.trim(), tab: el.getAttribute('role') === 'tab', top: Math.round(r.top), left: r.left, right: r.right, height: r.height };
		});
	};
	try {
		await until("the Studio's first render", () => window.__latticeRenderMetrics, 150000);
		// 1. Open the Library the way this layout does.
		const how = await until('a way into the Library', () => {
			if (button('Open Library')) return 'toolbar';
			if (button('Menu')) return 'menu';
			if (button('More controls')) return 'more-controls';
			return null;
		});
		if (how === 'toolbar') button('Open Library').click();
		else if (how === 'menu') button('Menu').click();
		else {
			// "More controls" is a Radix dropdown trigger: it opens on pointerdown or the keyboard, never on a click().
			const trigger = button('More controls');
			trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse', isPrimary: true }));
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			if (trigger.getAttribute('aria-expanded') !== 'true') {
				trigger.focus();
				trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
			}
		}
		if (how !== 'toolbar') {
			const entry = await until('the Library entry', () => [...document.querySelectorAll('[role="dialog"][data-state="open"] button, [role="menuitem"]')].find((b) => live(b) && b.textContent.trim().startsWith('Library')));
			entry.click();
		}
		await until('the live Library section strip', () => strip(), 30000);
		await settled('the Library to finish opening', strip());
		step('the Library opens with a live section strip', true, `via ${how} at ${innerWidth}px`);

		// 2–4. The strip.
		const first = row();
		const tabs = first.filter((p) => p.tab);
		const folded = first.some((p) => !p.tab);
		const names = tabs.map((p) => p.name);
		step('every shown section is a named tab, in order', names.length > 0 && names.every((n, i) => n === SECTIONS[i]) && (folded || names.length === SECTIONS.length), names.join(' · ') + (folded ? ' + More' : ''));
		const phone = innerWidth < 640;
		if (phone) step('on a phone the pills are icons, named by aria-label', tabs.every((p) => p.text === '' && p.el.getAttribute('aria-label') === p.name && p.el.querySelector('svg')), tabs.map((p) => `${p.name}:"${p.text}"`).join(' '));
		else step('wider than a phone, each pill has a name', tabs.every((p) => p.name), tabs.map((p) => `${p.name}:"${p.text}"`).join(' '));
		step("no pill is shorter than a labeled one", first.every((p) => p.height >= 31.5), first.map((p) => `${p.name} ${p.height.toFixed(1)}`).join(', '));
		const oneRow = (r) => new Set(r.map((p) => p.top)).size === 1 && r.every((p) => p.left >= 0 && p.right <= innerWidth + 0.5);
		step('one row, inside the screen', oneRow(first), first.map((p) => `${p.name}@${p.top}:${Math.round(p.left)}-${Math.round(p.right)}`).join(' '));
		const shownNames = (r) => r.filter((p) => p.tab).map((p) => p.name).join('|');
		for (const name of names) {
			row().find((p) => p.name === name).el.click();
			await until(`${name} selected`, () => row().find((p) => p.name === name && p.el.getAttribute('aria-selected') === 'true'));
			// Let the section render and the strip refit (a ResizeObserver tick) before reading the row again.
			await settled(`the strip to settle after picking ${name}`, strip());
			const now = row();
			step(`picking ${name} leaves the row still`, oneRow(now) && shownNames(now) === shownNames(first), `${shownNames(now)}`);
			if (name === 'Decks') {
				const empty = await until('the Decks section body', () => [...document.querySelectorAll('*')].find((el) => live(el) && el.children.length === 0 && /^No decks (kept yet|match)$/.test(el.textContent.trim())), 10000).catch(() => null);
				step('Decks is its own section, with its empty state on a fresh Studio', !!empty, empty ? empty.textContent.trim() : 'no "No decks kept yet"');
			}
		}

		// 6. Backup and restore.
		const backup = await until('the Backup and restore button', () => button('Backup and restore'));
		backup.click();
		const dialog = await until('the Backup and restore dialog', () => [...document.querySelectorAll('[role="dialog"][data-state="open"]')].find((d) => /Backup and restore/.test(d.textContent) && d.querySelector('input[aria-label="Restore a workspace backup"]')), 30000);
		const labels = [...dialog.querySelectorAll('button')].map((b) => b.textContent.trim());
		step('Backup and restore opens as a dialog with both buttons', labels.includes('Download backup') && labels.includes('Restore backup'), labels.filter(Boolean).join(' · '));
		(document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
		await until('the dialog to close', () => ![...document.querySelectorAll('[role="dialog"][data-state="open"]')].some((d) => /Backup and restore/.test(d.textContent) && d.querySelector('input[aria-label="Restore a workspace backup"]')));
		step('Escape closes it', true, 'closed');
		result.ok = true;
	} catch (e) {
		result.error = String(e);
	}
	return result;
}
