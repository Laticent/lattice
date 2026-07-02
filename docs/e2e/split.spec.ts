import type { Page } from '@playwright/test';
import { expect, gotoStudio, test } from './studio-fixture';

// The resizable/collapsible editor|preview split (2026-07-02 decision doc,
// §Verification plan). One primitive (ui/split.tsx) serves both surfaces, so
// the drag/collapse mechanics are exercised on the Playground (the simpler
// host) and the Studio covers what only it has: the 4-track desktop grid.
//
// Storage hygiene follows the suite convention (studio-fixture.ts): every test
// gets a fresh browser context, so `lattice-docs-split-*` localStorage and its
// `-collapsed` sessionStorage twin start empty — no manual reset. Tests that
// need the OPPOSITE (state carried across a reload / a new tab) do it
// explicitly with page.reload() / context.newPage().

const SEPARATOR = { name: 'Resize editor and preview' };

function separator(page: Page) {
	return page.getByRole('separator', SEPARATOR);
}

function splitContainer(page: Page) {
	return page.locator('.pg-split');
}

/** The Playground status line. Not getByRole('status') — the chart-popover
 *  live region is a second role=status and trips strict mode. */
function statusLine(page: Page) {
	return page.locator('.pg-status');
}

async function valuenow(page: Page): Promise<number> {
	return Number(await separator(page).getAttribute('aria-valuenow'));
}

/** Two frames: one for the rAF-coalesced drag write to commit, one to settle. */
function settleFrames(page: Page): Promise<void> {
	return page.evaluate(
		() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
	);
}

/**
 * Navigate to the Playground and wait until the engine has actually painted.
 * The status line is the user's own "it worked" oracle ("Rendered N slide(s).")
 * — the engine bundle loads on idle, so this can take a while on first hit.
 */
async function gotoPlayground(page: Page): Promise<void> {
	await page.goto('/playground/', { waitUntil: 'domcontentloaded' });
	await expect(statusLine(page)).toHaveText(/Rendered \d+ slide/, { timeout: 45_000 });
}

// Stub the blocking externals the deck srcdoc pulls in (mermaid/KaTeX/webfonts),
// so the in-iframe FIT agent isn't gated on the network — the same stubs as
// playground-paint.spec.ts. Registered on the CONTEXT so a second page (the
// new-tab persistence check) inherits them.
test.beforeEach(async ({ context }) => {
	await context.route(/mermaid.*\.js($|\?)/, (route) =>
		route.fulfill({
			contentType: 'text/javascript',
			body: 'window.mermaid={initialize(){},run(){},render(){return{svg:""}}};',
		}),
	);
	await context.route(/katex.*\.css($|\?)/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
	await context.route(/fonts\.googleapis|fonts\.gstatic/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
});

test('a drag released over the preview iframe commits the new ratio', async ({ page }) => {
	await gotoPlayground(page);

	const before = await valuenow(page);
	const sep = await separator(page).boundingBox();
	const preview = await page.locator('#pg-pane-preview').boundingBox();
	if (!sep || !preview) throw new Error('separator/preview not laid out');
	const startX = sep.x + sep.width / 2;
	const startY = sep.y + sep.height / 2;

	// Pointer-captured drag: 150px toward the preview's interior…
	await page.mouse.move(startX, startY);
	await page.mouse.down();
	await page.mouse.move(startX + 60, startY, { steps: 4 });
	await expect(splitContainer(page)).toHaveAttribute('data-split-dragging', '');

	// …released INSIDE the preview area (well below the pane header, squarely
	// over the iframe) — pointer capture + the drag shield must still route the
	// pointerup to the handle, not lose it to the iframe document.
	await page.mouse.move(startX + 150, preview.y + preview.height * 0.6, { steps: 6 });
	await settleFrames(page); // let the last rAF-coalesced move commit before release
	await page.mouse.up();

	// The ratio committed (~ +150px of a ~1439px pair ≈ +10 points) and no drag
	// state leaked.
	await expect.poll(() => valuenow(page)).toBeGreaterThan(before + 5);
	await expect.poll(() => valuenow(page)).toBeLessThan(before + 16);
	await expect(splitContainer(page)).not.toHaveAttribute('data-split-dragging');
	await expect(splitContainer(page)).not.toHaveAttribute('data-split-arming');
});

test('a tab switch mid-drag leaves no stuck drag state', async ({ page }) => {
	await gotoPlayground(page);

	const sep = await separator(page).boundingBox();
	if (!sep) throw new Error('separator not laid out');
	const startX = sep.x + sep.width / 2;
	const startY = sep.y + sep.height / 2;

	await page.mouse.move(startX, startY);
	await page.mouse.down();
	await page.mouse.move(startX - 80, startY, { steps: 4 });
	await expect(splitContainer(page)).toHaveAttribute('data-split-dragging', '');

	// Simulate the document going hidden mid-drag (Cmd-Tab / tab switch): the
	// primitive's visibilitychange belt must tear the drag down. Overriding
	// document.hidden is the reliable headless route — bringToFront on another
	// page does not fire visibilitychange in headless Chromium.
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
		document.dispatchEvent(new Event('visibilitychange'));
	});

	// No stuck state: dragging/arming attrs gone, the pane user-select lock
	// lifted, and the iframe's pointer-events shield restored.
	await expect(splitContainer(page)).not.toHaveAttribute('data-split-dragging');
	await expect(splitContainer(page)).not.toHaveAttribute('data-split-arming');
	await expect
		.poll(() => page.locator('#pg-pane-editor').evaluate((el) => getComputedStyle(el).userSelect))
		.not.toBe('none');
	await expect
		.poll(() => page.locator('#preview').evaluate((el) => getComputedStyle(el).pointerEvents))
		.not.toBe('none');

	// Cleanup: un-hide the document and release the (already ended) pointer.
	await page.evaluate(() => Reflect.deleteProperty(document, 'hidden'));
	await page.mouse.up();
});

test('collapse editor → labeled rail; restore → typing lands in CodeMirror', async ({ page }) => {
	await gotoPlayground(page);

	await page.getByRole('button', { name: 'Collapse editor' }).click();

	// The always-visible restore rail owns the edge: visible, announced
	// collapsed, and the collapsed pane is inert (mounted but inoperable).
	const rail = page.locator(".pg-split [data-slot='split-rail'][data-side='a']");
	await expect(rail).toBeVisible();
	await expect(rail).toHaveAttribute('aria-expanded', 'false');
	await expect(page.locator('#pg-pane-editor')).toHaveAttribute('inert', '');
	await expect(splitContainer(page)).toHaveAttribute('data-split-collapsed', 'a');

	// Restore via the rail…
	await page.getByRole('button', { name: 'Expand editor' }).click();
	await expect(page.locator('#pg-pane-editor')).not.toHaveAttribute('inert');
	await expect(rail).toBeHidden();

	// …and the editor is genuinely alive again: a keystroke lands in the
	// document (CodeMirror survived the 0-width interlude and re-measured).
	const cm = page.locator('#pg-pane-editor .cm-content');
	await cm.click();
	await page.keyboard.type('SPLITMARK');
	await expect(cm).toContainText('SPLITMARK');
});

test('the ratio survives a reload; collapse survives a reload but not a new tab', async ({ page, context }) => {
	await gotoPlayground(page);

	// Drag the separator to ~60% editor share.
	const container = await splitContainer(page).boundingBox();
	const sep = await separator(page).boundingBox();
	if (!container || !sep) throw new Error('split not laid out');
	const pairWidth = container.width - 1; // fr pair = container minus the 1px handle track
	const y = sep.y + sep.height / 2;
	await page.mouse.move(sep.x + sep.width / 2, y);
	await page.mouse.down();
	await page.mouse.move(container.x + pairWidth * 0.6, y, { steps: 8 });
	await settleFrames(page);
	await page.mouse.up();
	await expect.poll(() => valuenow(page)).toBeGreaterThanOrEqual(58);
	await expect.poll(() => valuenow(page)).toBeLessThanOrEqual(62);

	// The ratio survives a reload (localStorage).
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(statusLine(page)).toHaveText(/Rendered \d+ slide/, { timeout: 45_000 });
	expect(await valuenow(page)).toBeGreaterThanOrEqual(58);
	expect(await valuenow(page)).toBeLessThanOrEqual(62);

	// Collapse the preview, reload the SAME tab: sessionStorage carries it, and
	// the deferred-render status (not a phantom "Rendered") reports the state.
	await page.getByRole('button', { name: 'Collapse preview' }).click();
	await expect(splitContainer(page)).toHaveAttribute('data-split-collapsed', 'b');
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(splitContainer(page)).toHaveAttribute('data-split-collapsed', 'b');

	// A NEW tab (fresh sessionStorage, shared localStorage) must NOT inherit the
	// collapse — a stranded visitor never returns to a collapsed pane — while
	// the dragged ratio still applies.
	const page2 = await context.newPage();
	await gotoPlayground(page2);
	await expect(splitContainer(page2)).not.toHaveAttribute('data-split-collapsed');
	expect(await valuenow(page2)).toBeGreaterThanOrEqual(58);
	expect(await valuenow(page2)).toBeLessThanOrEqual(62);
});

test('@mobile below the tab breakpoint the split is inert and tabs own the layout', async ({ page }) => {
	await page.goto('/playground/', { waitUntil: 'domcontentloaded' });
	// Hydration signal: the pane effect mirrors React state onto <body>.
	await expect(page.locator('body')).toHaveAttribute('data-pane', /edit|preview/);

	// No separator, no rails, no header collapse glyphs — the split renders
	// nothing interactive below 820px (CSS belt + the hook's `active` gate).
	await expect(separator(page)).toBeHidden();
	for (const side of ['a', 'b']) {
		await expect(page.locator(`.pg-split [data-slot='split-rail'][data-side='${side}']`)).toBeHidden();
	}
	await expect(page.getByRole('button', { name: 'Collapse editor' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Collapse preview' })).toHaveCount(0);

	// body[data-pane] tabs drive visibility, exactly as before the split landed.
	await page.getByRole('tab', { name: 'Preview' }).click();
	await expect(page.locator('body')).toHaveAttribute('data-pane', 'preview');
	await expect(page.locator('#pg-pane-editor')).toBeHidden();
	await page.getByRole('tab', { name: 'Edit' }).click();
	await expect(page.locator('body')).toHaveAttribute('data-pane', 'edit');
	await expect(page.locator('#pg-pane-editor')).toBeVisible();
	await expect(page.locator('#pg-pane-preview')).toBeHidden();
});

test('a component pick auto-expands a collapsed preview and really renders', async ({ page }) => {
	await gotoPlayground(page);

	await page.getByRole('button', { name: 'Collapse preview' }).click();
	await expect(splitContainer(page)).toHaveAttribute('data-split-collapsed', 'b');
	await expect(statusLine(page)).toHaveText(/Preview collapsed/);

	// Pick a component through the real picker UI (combobox → cmdk option).
	// `toPreview` is intent — "ensure the preview is visible" — so the pick must
	// expand the collapsed pane and run the one authoritative deferred render;
	// without it the status would claim success over a blank, hidden frame.
	await page.getByRole('combobox', { name: 'Pick a component' }).click();
	await page.getByRole('option').first().click();

	await expect(splitContainer(page)).not.toHaveAttribute('data-split-collapsed');
	await expect(page.locator('#pg-pane-preview')).not.toHaveAttribute('inert');
	await expect(statusLine(page)).toHaveText(/Rendered \d+ slide/, { timeout: 30_000 });
});

test('switching the collapsed side runs the deferred render — no stale preview', async ({ page }) => {
	await gotoPlayground(page);

	// The flagship flow the maker-checker flagged: collapse the preview to
	// write (renders defer), edit, then collapse the EDITOR to review — a swap.
	// The implicitly revealed preview must run the deferred render; presenting
	// the pre-edit deck as current (with the editor inert) was the bug.
	await page.getByRole('button', { name: 'Collapse preview' }).click();
	await expect(statusLine(page)).toHaveText(/Preview collapsed/);

	await page.locator('.cm-content').click();
	await page.keyboard.type(' EDITED-WHILE-COLLAPSED');
	await expect(statusLine(page)).toHaveText(/render deferred/);

	await page.getByRole('button', { name: 'Collapse editor' }).click();
	await expect(splitContainer(page)).toHaveAttribute('data-split-collapsed', 'a');
	// The swap-revealed preview re-renders the edited deck — the status flips
	// from the deferred notice to a fresh render report.
	await expect(statusLine(page)).toHaveText(/Rendered \d+ slide/, { timeout: 30_000 });
	await expect(page.locator('#pg-pane-preview')).not.toHaveAttribute('inert');
});

// The Studio's desktop grid is the one configuration the Playground can't
// cover: Architect (232px) + editor (min 240px) + handle (1px) + preview
// (min 280px) + Inspector (300px) = 1053px — the decision doc's worst-case
// arithmetic at the 1100px desktop threshold, asserted for real here.
test.describe('studio split at the 1100px desktop threshold', () => {
	test.use({ viewport: { width: 1100, height: 800 } });

	test('both panels open with the default split — no horizontal overflow', async ({ page }) => {
		await gotoStudio(page);

		// Open the two side panels (Architect starts closed for newcomers; the
		// Inspector defaults to its 46px rail).
		await page.getByRole('button', { name: 'Toggle Architect' }).click();
		await expect(page.getByRole('button', { name: 'Coach' })).toBeVisible();
		await page.getByRole('button', { name: 'Open Deck inspector' }).click();
		await expect(page.getByRole('button', { name: 'Open Deck inspector' })).toHaveCount(0);

		// The split is live in this configuration…
		await expect(separator(page)).toBeVisible();

		// …and neither the document nor the split grid overflows horizontally.
		const docOverflow = await page.evaluate(() => {
			const el = document.scrollingElement;
			return el ? el.scrollWidth - el.clientWidth : 0;
		});
		expect(docOverflow).toBeLessThanOrEqual(0);
		const gridOverflow = await page
			.locator('[data-studio-split]')
			.evaluate((el) => el.scrollWidth - el.clientWidth);
		expect(gridOverflow).toBeLessThanOrEqual(0);
	});
});
