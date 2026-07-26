import { expect, gotoStudio, test } from './studio-fixture';

// iOS focus-zoom guard. iOS Safari zooms the whole page when a focused text
// control computes under 16 CSS px. The fix is two-layered: a global
// coarse-pointer net in landing.css (every text-entry control ≥ 16px) plus a
// per-CodeMirror-theme bump (studio/editor-theme.ts, playground/editor.js) for
// the contenteditable the net can't out-specify. These specs assert the
// COMPUTED SIZES under touch emulation — the CSS contract, not the zoom itself;
// real-device zoom behavior stays an on-device check (HARD RULE #23).
//
// `hasTouch` makes Chromium report `(pointer: coarse)`, which is what both
// fixes key on. @mobile-tagged so the suite runs these on the mobile project.
test.use({ hasTouch: true });

const MIN = 16;

/** Computed font sizes of every text-entry control mounted in the document. */
function sweepTextControls(page: import('@playwright/test').Page) {
	return page.evaluate(() => {
		const SKIP = new Set(['checkbox', 'radio', 'range', 'file', 'color', 'button', 'submit', 'reset', 'image', 'hidden']);
		return Array.from(document.querySelectorAll<HTMLElement>('input, textarea, select'))
			.filter((el) => !(el instanceof HTMLInputElement && SKIP.has(el.type)))
			.map((el) => ({
				label: el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.tagName.toLowerCase(),
				size: Number.parseFloat(getComputedStyle(el).fontSize),
			}));
	});
}

test('@mobile studio: no text control computes under 16px on a touch device', async ({ page }) => {
	await gotoStudio(page);

	// The emulation premise the whole spec rests on — fail loudly if it breaks.
	expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);

	// The deck editor (CodeMirror contenteditable) — themed by editor-theme.ts. "Markdown
	// source" is the Eight-Cell Bar's Source cell (2026-07-26-studio-mobile-eight-cell-
	// bar.md), replacing the old icon-only "Edit" toggle.
	await page.getByRole('button', { name: 'Markdown source', exact: true }).click();
	const cm = page.getByLabel('Deck source');
	await expect(cm).toBeVisible();
	expect(await cm.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(MIN);

	// Every text-entry control the shell has mounted (visible or sheeted away).
	const controls = await sweepTextControls(page);
	const offenders = controls.filter((c) => c.size < MIN);
	expect(offenders, `sub-16px text controls would trigger iOS focus-zoom: ${JSON.stringify(offenders)}`).toEqual([]);

	// The landing.css net also has to catch controls a FUTURE surface mounts —
	// probe with a fresh input inside a deliberately dense (13px) container.
	const probe = await page.evaluate(() => {
		const host = document.createElement('div');
		host.style.fontSize = '13px';
		const input = document.createElement('input');
		input.type = 'search';
		host.appendChild(input);
		document.body.appendChild(host);
		const size = Number.parseFloat(getComputedStyle(input).fontSize);
		host.remove();
		return size;
	});
	expect(probe).toBeGreaterThanOrEqual(MIN);
});

test('@mobile playground: the editor and its controls hold the 16px floor', async ({ page }) => {
	await page.goto('/playground/', { waitUntil: 'domcontentloaded' });
	expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);

	// The playground CodeMirror (editor.js carries its own coarse-pointer bump).
	const cm = page.locator('.cm-content').first();
	await expect(cm).toBeAttached();
	expect(await cm.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(MIN);

	const controls = await sweepTextControls(page);
	const offenders = controls.filter((c) => c.size < MIN);
	expect(offenders, `sub-16px text controls would trigger iOS focus-zoom: ${JSON.stringify(offenders)}`).toEqual([]);
});
