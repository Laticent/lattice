import { countDocuments, documentsMade } from './preview-documents';
import { expect, gotoStudio, SHARE_EXPORTS, setEditorContent, test } from './studio-fixture';

// The Print drawer must not build a preview document per page. WebKit never frees a destroyed
// preview document (preview-pool.tsx has the measurements), so on an iPad every document the
// drawer built was memory the tab kept for the rest of the session.
//
// Measured on the real Studio before the drawer's cells moved onto the preview pool (documents
// created; `documentsMade` counts each iframe AND each srcdoc write, so one document reads 2):
//
//   first open        +2    5 sheet flips at 1-up  +10    switch to 4-up  +8
//   2 flips at 4-up  +16    reopen                 +2     print, then reprint unchanged  +2, +2
//
// After: flips +0, reprint +0, including on a deck that alternates Mermaid and plain slides. Opening still builds the pool's first frame (+2), and 4-up grows
// the pool to four frames once (+6); both are one-time, not per page.
//
// The drawer then stayed mounted only while the Share sheet was open, so each reopen built the
// pool's first frame again (+2) and a print after it a fresh print frame (+2). The sheet is now kept
// mounted (`PanelSheet persistent`), and the drawer with it, hidden and frozen between shows.

test.describe.configure({ timeout: 240_000 });

// Every other slide is a Mermaid diagram: whether a slide has one is part of a pooled frame's
// shape, so a per-slide flag made each flip between the two kinds a full document rewrite.
const slide = (i: number) => (i % 2 ? `## Slide ${i}\n\nBody ${i}.` : `## Slide ${i}\n\n\`\`\`mermaid\ngraph LR\n  A${i} --> B${i}\n\`\`\``);
const DECK = `---\ntitle: Probe\n---\n\n${Array.from({ length: 12 }, (_, i) => slide(i + 1)).join('\n\n---\n\n')}\n`;

test('paging the Print drawer and reprinting build no new preview documents', async ({ page }) => {
	// `print()` opens a modal Playwright cannot dismiss; everything up to it is the real path.
	await page.addInitScript(() => { window.print = () => {}; });
	await countDocuments(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, DECK);

	const dialog = page.getByRole('dialog');
	const next = dialog.getByRole('button', { name: 'Next sheet' });
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await dialog.getByRole('button', { name: SHARE_EXPORTS.print.row }).click();
	await expect(next).toBeEnabled({ timeout: 60_000 });
	await expect(dialog.getByRole('img', { name: 'Print preview slide 1' })).toBeVisible();
	// The pool assigns its frames on a short debounce, so count from once they exist.
	const frames = dialog.locator('[data-slide-frame] iframe');
	await expect(frames).toHaveCount(1, { timeout: 30_000 });

	let before = await documentsMade(page);
	for (let i = 2; i <= 6; i++) {
		await next.click();
		await expect(dialog.getByRole('img', { name: `Print preview slide ${i}` })).toBeVisible();
	}
	expect(await documentsMade(page), 'five sheet flips at 1-up re-point the pooled frame').toBe(before);

	await dialog.getByRole('radio', { name: '4-up', exact: true }).click();
	// Slide 6 was showing, so 4-up clamps to the last sheet (slides 9–12); two flips wrap to
	// sheet 1 and then sheet 2.
	await expect(dialog.getByRole('img', { name: 'Print preview slide 12' })).toBeVisible();
	await expect(frames).toHaveCount(4, { timeout: 30_000 });
	before = await documentsMade(page);
	await next.click();
	await expect(dialog.getByRole('img', { name: 'Print preview slide 1' })).toBeVisible();
	await next.click();
	await expect(dialog.getByRole('img', { name: 'Print preview slide 8' })).toBeVisible();
	expect(await documentsMade(page), 'two sheet flips at 4-up re-point the four pooled frames').toBe(before);

	// 1-up prints the vector deck through the offscreen frame; N-up prints its sheets through
	// the same frame (print-every-layout.spec.ts).
	await dialog.getByRole('radio', { name: '1-up', exact: true }).click();
	const print = dialog.getByRole('button', { name: 'Print', exact: true });
	await print.click();
	await expect(page.locator('iframe[style*="-10000px"]')).toBeAttached({ timeout: 60_000 });
	await expect(print).toBeEnabled({ timeout: 60_000 });
	before = await documentsMade(page);
	await print.click();
	await expect(print).toBeEnabled({ timeout: 60_000 });
	expect(await documentsMade(page), 'reprinting the same deck prints the frame it already has').toBe(before);
	await expect(page.locator('iframe[style*="-10000px"]')).toHaveCount(1);
});

test('reopening the Print drawer builds no preview documents, and each open starts from the defaults', async ({ page }) => {
	await page.addInitScript(() => { window.print = () => {}; });
	await countDocuments(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, DECK);

	const dialog = page.getByRole('dialog');
	const share = page.getByRole('button', { name: 'Share', exact: true });
	const frames = dialog.locator('[data-slide-frame] iframe');
	const printFrame = page.locator('iframe[style*="-10000px"]');
	const print = dialog.getByRole('button', { name: 'Print', exact: true });
	const openPrint = async () => {
		await share.click();
		await dialog.getByRole('button', { name: SHARE_EXPORTS.print.row }).click();
		await expect(dialog.getByRole('img', { name: 'Print preview slide 1' })).toBeVisible({ timeout: 60_000 });
		await expect(print).toBeEnabled({ timeout: 60_000 });
	};
	// The close button, not Escape: a print hands focus to the print frame's own document.
	const close = async () => {
		await dialog.getByRole('button', { name: 'Close', exact: true }).click();
		await expect(dialog).toHaveCount(0);
	};
	// Paper and orientation each have an "Auto": index 0 is paper's, 1 is orientation's.
	const defaults = async () => {
		for (const [name, i] of [['1-up', 0], ['Color', 0], ['Auto', 0], ['Auto', 1]] as const) {
			await expect(dialog.getByRole('radio', { name, exact: true }).nth(i)).toHaveAttribute('aria-checked', 'true');
		}
	};

	await openPrint();
	await expect(frames).toHaveCount(1, { timeout: 30_000 });
	// Leave the drawer off its defaults, on a later sheet, with the print frame built.
	await print.click();
	await expect(printFrame).toBeAttached({ timeout: 60_000 });
	await expect(print).toBeEnabled({ timeout: 60_000 });
	await dialog.getByRole('radio', { name: '4-up', exact: true }).click();
	await dialog.getByRole('radio', { name: 'Black & white', exact: true }).click();
	await dialog.getByRole('radio', { name: 'A4', exact: true }).click();
	await expect(frames).toHaveCount(4, { timeout: 30_000 });
	await dialog.getByRole('button', { name: 'Next sheet' }).click();
	await expect(dialog.getByRole('img', { name: 'Print preview slide 5' })).toBeVisible();
	await expect(print).toBeEnabled({ timeout: 60_000 });

	// 1 — edit the deck while the sheet is closed. The kept drawer is frozen: nothing in it moves.
	await close();
	// The sheet drops back to its menu once it has slid out, which hides the drawer.
	await expect(page.locator('div[hidden] .pod-stage')).toHaveCount(1);
	await page.evaluate(() => {
		const w = window as unknown as { __printMutations: number };
		w.__printMutations = 0;
		const root = document.querySelector('div[hidden] .pod-stage')?.closest('[hidden]');
		if (!root) throw new Error('the closed Print drawer is not in the page');
		new MutationObserver((list) => { w.__printMutations += list.length; }).observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
	});
	const takeMutations = () => page.evaluate(() => {
		const w = window as unknown as { __printMutations: number };
		const n = w.__printMutations;
		w.__printMutations = 0;
		return n;
	});
	// Settled: the pool answers the hide on its own apply pass, which is not a keystroke.
	await expect.poll(takeMutations, { intervals: [300], timeout: 10_000 }).toBe(0);
	// A slide ADDED, not just text: the kept drawer must not read 13 markdown slides against the
	// 12 sections it rendered before the close, take the per-cell fallback, and drop its pool.
	await setEditorContent(page, `${DECK.replace('Body 1.', 'Body one, edited while the sheet was closed.')}\n---\n\n## Slide 13\n\nBody 13.\n`);
	// An absence: nothing signals a render that must not happen (SANCTIONED_E2E_SLEEPS).
	await page.waitForTimeout(1_500);
	expect(await takeMutations(), 'a hidden Print drawer does not re-render on keystrokes').toBe(0);
	// Counted from AFTER the edit: the Studio's own previews redraw the edited deck, and that is
	// not the drawer's to answer for.
	const before = await documentsMade(page);

	await openPrint();
	await defaults();
	await expect(dialog.getByText('Slide 1 / 13')).toBeVisible();
	await expect(frames).toHaveCount(4);
	await expect(dialog.locator('iframe.pod-frame'), 'the cells stay on the pool').toHaveCount(0);
	expect(await documentsMade(page), 'a reopen builds no preview document').toBe(before);

	// 2 — reopen and print the edited deck: written into the print frame the drawer kept.
	await close();
	await openPrint();
	await defaults();
	await print.click();
	await expect(print).toBeEnabled({ timeout: 60_000 });
	await expect(printFrame).toHaveCount(1);
	expect(await documentsMade(page), 'printing a changed deck after a reopen rewrites the kept print frame once').toBe(before + 1);

	// 3 — reopen and print the same deck again: the frame already holds it.
	await close();
	await openPrint();
	await print.click();
	await expect(print).toBeEnabled({ timeout: 60_000 });
	await expect(printFrame).toHaveCount(1);
	expect(await documentsMade(page), 'a reprint after a reopen prints the frame it already has').toBe(before + 1);
});

test('a print the author walks away from opens no dialog, and the kept print frame stays out of reach', async ({ page }) => {
	await page.addInitScript(() => {
		// Every frame gets this, the print frame included; the count lives on the Studio's window.
		// It also records whether the frame was inert at the call: an inert frame cannot take the
		// focus `print()` is handed with, so the drawer lifts `inert` for exactly that moment.
		window.print = () => {
			const top = window.top as unknown as { __prints?: number; __inertAtPrint?: boolean[] };
			top.__prints = (top.__prints ?? 0) + 1;
			(top.__inertAtPrint ??= []).push(!!(window.frameElement as HTMLIFrameElement | null)?.inert);
		};
	});
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, DECK);

	const dialog = page.getByRole('dialog');
	const print = dialog.getByRole('button', { name: 'Print', exact: true });
	const printFrame = page.locator('iframe[style*="-10000px"]');
	const prints = () => page.evaluate(() => (window as unknown as { __prints?: number }).__prints ?? 0);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await dialog.getByRole('button', { name: SHARE_EXPORTS.print.row }).click();
	await expect(print).toBeEnabled({ timeout: 60_000 });

	// Print, then close while the print frame is still loading the deck. Its requests are held
	// until the sheet is closed: building the print document keeps the main thread busy for about
	// a second, so an unheld frame could load, and print, before the Close click landed.
	let release = () => {};
	const held = new Promise<void>((r) => { release = r; });
	await page.route('**/*', async (route) => { await held; await route.continue(); });
	await print.click();
	await dialog.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(dialog).toHaveCount(0);
	release();
	// The hidden drawer's button returns to "Print" when the hand-off ran; it must not have printed.
	await expect(page.locator('div[hidden] .pod-primary')).toHaveText('Print', { timeout: 60_000 });
	expect(await prints(), 'closing the sheet cancels the pending print').toBe(0);
	await expect(printFrame).toHaveJSProperty('inert', true);
	await expect(printFrame).toHaveJSProperty('tabIndex', -1);

	// The kept frame still prints, and is inert again once it has.
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await dialog.getByRole('button', { name: SHARE_EXPORTS.print.row }).click();
	await expect(print).toBeEnabled({ timeout: 60_000 });
	await print.click();
	await expect.poll(prints, { timeout: 60_000 }).toBe(1);
	expect(await page.evaluate(() => (window as unknown as { __inertAtPrint?: boolean[] }).__inertAtPrint), 'the frame is not inert while it prints').toEqual([false]);
	await expect(printFrame).toHaveCount(1);
	await expect(printFrame).toHaveJSProperty('inert', true);
});
