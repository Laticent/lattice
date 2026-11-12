/**
 * Print on a phone and in Firefox: a real PDF in two taps, never the print dialog (PR #3148).
 *
 * `download.js` `needsPdfToPrint` sends iOS, Android, any Firefox and touch-first devices down the PDF route: those
 * browsers print the TOP page when a hidden frame calls `print()`, so the old route printed one page, a picture of the
 * Studio (2026-06-14-deck-print-styling.md). The unit test pins the routing table against fixed user agents; this drives
 * the real Print button in real Gecko and real WebKit at iPhone size, the engines the routing is about.
 *
 *   tap 1  builds the PDF in the foreground; no frame calls `print()`; the button arms to "Open PDF to print"
 *   tap 2  hands the PDF over (Web Share where it takes files, else a tab); this records the URL instead of leaving
 *          the page, and reads it back: a PDF with one page per slide
 *
 * Desktop Chromium keeps the print dialog (print-waits-for-measuring.spec.ts drives that route); the tags keep this spec
 * off the desktop project. Run there untagged, it fails: the print frame calls print() and no "Open PDF to print" arms.
 */
import { expect, gotoStudio, SHARE_EXPORTS, test, typeDeck } from './studio-fixture';

test.describe.configure({ timeout: 240_000 });

const deck = `---
marp: true
theme: indaco
---

## One.

---

## Two.

---

## Three.
`;

test('Print builds a PDF and opens it in two taps, never calling print() @gecko @webkit-phone', async ({ page }) => {
	await page.addInitScript(() => {
		const top = window.top as unknown as { __printCalls?: number; __opened?: string[] };
		// Any frame's print() is the route this test rules out: count it rather than open a dialog.
		window.print = () => {
			top.__printCalls = (top.__printCalls ?? 0) + 1;
		};
		if (window.top !== window) return;
		// Tap 2's hand-off, recorded instead of leaving the page: no Web Share with files, so it opens a tab.
		Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
		window.open = ((url?: string | URL) => {
			top.__opened = [...(top.__opened ?? []), String(url)];
			return {} as Window;
		}) as typeof window.open;
	});
	await gotoStudio(page);
	await typeDeck(page, deck);
	const dialog = page.getByRole('dialog');
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await dialog.getByRole('button', { name: SHARE_EXPORTS.print.row }).click();
	await expect(dialog.getByRole('img', { name: 'Print preview slide 1' })).toBeVisible({ timeout: 60_000 });
	// The panel says which route it took: iPhone's share-sheet wording, or the PDF wording everywhere else it applies.
	await expect(dialog.getByText(/On iPhone: tap Print to prepare|Print prepares the PDF; then Open PDF to print it/)).toBeVisible();

	await dialog.getByRole('button', { name: 'Print', exact: true }).click();
	const open = dialog.getByRole('button', { name: 'Open PDF to print', exact: true });
	await expect(open).toBeVisible({ timeout: 180_000 });
	expect(await page.evaluate(() => (window as unknown as { __printCalls?: number }).__printCalls ?? 0), 'no frame called print()').toBe(0);

	await open.click();
	await expect.poll(() => page.evaluate(() => ((window as unknown as { __opened?: string[] }).__opened ?? []).length), { timeout: 30_000 }).toBe(1);
	const pdf = await page.evaluate(async () => {
		const url = (window as unknown as { __opened: string[] }).__opened[0];
		const text = new TextDecoder('latin1').decode(new Uint8Array(await (await fetch(url)).arrayBuffer()));
		return { url: url.split(':')[0], head: text.slice(0, 5), pages: (text.match(/\/Type\s*\/Page(?![s\w])/g) || []).length };
	});
	expect(pdf.head).toBe('%PDF-');
	expect(pdf.pages, 'one page per slide').toBe(3);
	expect(await page.evaluate(() => (window as unknown as { __printCalls?: number }).__printCalls ?? 0), 'still no print()').toBe(0);
});
