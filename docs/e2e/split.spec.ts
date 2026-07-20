import type { Page } from '@playwright/test';
import { expect, gotoStudio, openInspector, test } from './studio-fixture';

// The resizable/collapsible editor|preview split, now on react-resizable-panels
// (2026-07-19-shadcn-splitter-migration.md). One primitive (ui/resizable.tsx +
// use-resizable-split.ts) serves both surfaces, so the drag/collapse mechanics
// are exercised on the Playground (the simpler host); the Studio covers its
// workspace group (the one thing only it has).
//
// DRAG NOTE: react-resizable-panels ends a drag on any pointermove with
// `buttons === 0`. Playwright's (and puppeteer's) synthesized held mouse-move
// reports `buttons: 0`, so `page.mouse` can't drive the divider — a headless
// input limitation, not a product defect (a real mouse sends `buttons: 1`).
// So drag here is exercised two real ways: the keyboard (arrow keys on the
// separator — a first-class user path) and a dispatched PointerEvent sequence
// with `buttons: 1` (the real library pointer path, in the real browser).
//
// Storage hygiene follows the suite convention (studio-fixture.ts): every test
// gets a fresh browser context, so react-resizable-panels' `lattice-docs-split-*`
// localStorage starts empty. Tests that need state carried across a reload / new
// tab do it explicitly with page.reload() / context.newPage().

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

/** aria-valuenow on the separator = the editor pane's share of the pair (%). */
async function valuenow(page: Page): Promise<number> {
	return Number(await separator(page).getAttribute('aria-valuenow'));
}

/**
 * Drag the divider by `dx` px via dispatched PointerEvents (buttons:1), releasing
 * at `releaseOver` ('iframe' drops the pointerup squarely over the preview iframe,
 * proving the drag survives the srcdoc frame). Returns after a settle frame.
 */
async function dragDividerBy(page: Page, dx: number, releaseOver: 'handle' | 'iframe' = 'handle'): Promise<void> {
	await page.evaluate(
		async ({ dx, releaseOver }) => {
			const sep = document.querySelector('[data-slot="resizable-handle"]') as HTMLElement;
			const box = sep.getBoundingClientRect();
			const preview = document.querySelector('#pg-pane-preview') as HTMLElement;
			const pbox = preview.getBoundingClientRect();
			const y = box.y + box.height / 2;
			const startX = box.x + box.width / 2;
			const opt = (x: number, buttons: number) => ({
				bubbles: true,
				cancelable: true,
				composed: true,
				pointerId: 1,
				pointerType: 'mouse',
				isPrimary: true,
				button: buttons ? 0 : -1,
				buttons,
				clientX: x,
				clientY: y,
			});
			sep.dispatchEvent(new PointerEvent('pointerdown', opt(startX, 1)));
			const steps = 8;
			for (let i = 1; i <= steps; i++) document.dispatchEvent(new PointerEvent('pointermove', opt(startX + (dx * i) / steps, 1)));
			const endX = releaseOver === 'iframe' ? pbox.x + pbox.width * 0.6 : startX + dx;
			document.dispatchEvent(new PointerEvent('pointerup', opt(endX, 0)));
			await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
		},
		{ dx, releaseOver },
	);
}

/**
 * Navigate to the Playground and wait until the engine has actually painted.
 * The status line is the user's own "it worked" oracle ("Rendered N slide(s).")
 * — the engine bundle loads on idle, so this can take a while on first hit.
 */
async function gotoPlayground(page: Page): Promise<void> {
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' }); // the split is Edit-mode chrome; Explore is single-pane
	await expect(statusLine(page)).toHaveText(/Rendered \d+ slide/, { timeout: 45_000 });
}

// Stub the blocking externals the deck srcdoc pulls in (mermaid/KaTeX/webfonts),
// so the in-iframe FIT agent isn't gated on the network. Registered on the
// CONTEXT so a second page (the new-tab persistence check) inherits them.
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

test('keyboard resizes the split (arrow keys on the separator)', async ({ page }) => {
	await gotoPlayground(page);
	const before = await valuenow(page);
	await separator(page).focus();
	// Shift+Arrow is the large step; ArrowLeft shrinks the editor's share.
	await page.keyboard.press('Shift+ArrowLeft');
	await expect.poll(() => valuenow(page)).toBeLessThan(before - 3);
	const shrunk = await valuenow(page);
	await page.keyboard.press('Shift+ArrowRight');
	await expect.poll(() => valuenow(page)).toBeGreaterThan(shrunk + 3);
});

test('a divider drag released over the preview iframe commits the new ratio', async ({ page }) => {
	await gotoPlayground(page);
	const before = await valuenow(page);

	await dragDividerBy(page, 150, 'iframe');

	// The ratio committed (~ +150px of a ~1439px pair ≈ +10 points) and no drag
	// state leaked (the pointerup landed over the iframe, not the handle).
	await expect.poll(() => valuenow(page)).toBeGreaterThan(before + 4);
	await expect(splitContainer(page)).not.toHaveAttribute('data-split-dragging');
});

test('collapse editor → labeled rail; restore → typing lands in CodeMirror', async ({ page }) => {
	await gotoPlayground(page);

	await page.getByRole('button', { name: 'Collapse editor' }).click();

	// The always-visible restore rail owns the edge: visible, announced collapsed,
	// and the collapsed pane is inert (mounted but inoperable).
	const rail = page.locator(".pg-split [data-slot='split-rail'][data-side='a']");
	await expect(rail).toBeVisible();
	await expect(rail).toHaveAttribute('aria-expanded', 'false');
	await expect(page.locator('#pg-pane-editor')).toHaveAttribute('inert', '');
	await expect(splitContainer(page)).toHaveAttribute('data-split-collapsed', 'a');

	// Restore via the rail…
	await page.getByRole('button', { name: 'Expand editor' }).click();
	await expect(page.locator('#pg-pane-editor')).not.toHaveAttribute('inert');
	await expect(rail).toBeHidden();

	// …and the editor is genuinely alive again: a keystroke lands in the document
	// (CodeMirror survived the 0-width interlude and re-measured).
	const cm = page.locator('#pg-pane-editor .cm-content');
	await cm.click();
	await page.keyboard.type('SPLITMARK');
	await expect(cm).toContainText('SPLITMARK');
});

test('the ratio survives a reload; collapse survives a reload but not a new tab', async ({ page, context }) => {
	await gotoPlayground(page);

	// Keyboard the separator to a distinctly editor-heavy share.
	await separator(page).focus();
	for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
	const wide = await valuenow(page);
	expect(wide).toBeGreaterThan(55);

	// The ratio survives a reload (hand-rolled localStorage persistence in the hook).
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(statusLine(page)).toHaveText(/Rendered \d+ slide/, { timeout: 45_000 });
	expect(await valuenow(page)).toBeGreaterThan(52);

	// Collapse the preview, reload the SAME tab: the collapse carries.
	await page.getByRole('button', { name: 'Collapse preview' }).click();
	await expect(splitContainer(page)).toHaveAttribute('data-split-collapsed', 'b');
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(splitContainer(page)).toHaveAttribute('data-split-collapsed', 'b');

	// A NEW tab (fresh session) must NOT inherit the collapse — a stranded visitor
	// never returns to a collapsed pane.
	const page2 = await context.newPage();
	await gotoPlayground(page2);
	await expect(splitContainer(page2)).not.toHaveAttribute('data-split-collapsed');
});

test('@mobile below the tab breakpoint the split is inert and tabs own the layout', async ({ page }) => {
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('body')).toHaveAttribute('data-pane', /edit|preview/);

	// No separator, no rails, no header collapse glyphs — the split renders nothing
	// interactive below 820px (CSS belt + the hook's `active` gate).
	await expect(separator(page)).toBeHidden();
	for (const side of ['a', 'b']) {
		await expect(page.locator(`.pg-split [data-slot='split-rail'][data-side='${side}']`)).toBeHidden();
	}
	await expect(page.getByRole('button', { name: 'Collapse editor' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Collapse preview' })).toHaveCount(0);

	// The Explore/Edit tabs drive visibility (body[data-pane]), exactly as before
	// the split landed — the split is inert here.
	await page.getByRole('tab', { name: 'Explore' }).click();
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
	// expand the collapsed pane and run the one authoritative deferred render.
	await page.getByRole('combobox', { name: 'Pick a component' }).click();
	await page.getByRole('option').first().click();

	await expect(splitContainer(page)).not.toHaveAttribute('data-split-collapsed');
	await expect(page.locator('#pg-pane-preview')).not.toHaveAttribute('inert');
	await expect(statusLine(page)).toHaveText(/Rendered \d+ slide/, { timeout: 30_000 });
});

// The Studio's workspace group is the one configuration the Playground can't
// cover. With the left activity bar + both docked panels open at the 1100px
// threshold, react-resizable-panels enforces each Panel's px minimum, so nothing
// overflows horizontally. Asserted for real here.
test.describe('studio workspace group at the 1100px threshold', () => {
	test.use({ viewport: { width: 1100, height: 800 } });

	test('@smoke both panels open with the default split — no horizontal overflow', async ({ page }) => {
		await gotoStudio(page);

		// Open the two side panels from the left activity bar (both start closed).
		await page.getByRole('button', { name: 'Toggle Coach' }).click();
		await expect(page.getByText('Board readiness')).toBeVisible();
		await openInspector(page);
		await expect(page.getByText('Editing the whole deck')).toBeVisible();

		// The split is live in this configuration…
		await expect(separator(page)).toBeVisible();

		// …and neither the document nor the split group overflows horizontally.
		const docOverflow = await page.evaluate(() => {
			const el = document.scrollingElement;
			return el ? el.scrollWidth - el.clientWidth : 0;
		});
		expect(docOverflow).toBeLessThanOrEqual(0);
		const groupOverflow = await page.locator('[data-studio-split]').evaluate((el) => el.scrollWidth - el.clientWidth);
		expect(groupOverflow).toBeLessThanOrEqual(0);
	});
});
