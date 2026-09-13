import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { expect, gotoStudio, railButtons, setEditorContent, test } from './studio-fixture';

// One unreachable image used to cost the whole export. The capture fetches every
// embedded image itself; a failed fetch left the clone with an empty `src`, whose
// `onerror` rejected — so a deck whose `logo:` is a path relative to the deck FILE
// (correct for the CLI, unresolvable on the web) produced no PDF at all. That is the
// failure a real author hit on a real phone.
//
// The deck is the deliverable, so the export now degrades: the picture is left out,
// the file lands, and the toast NAMES what is missing. This drives the real Studio
// and asserts both halves — the pages exist, and the author was told.
test.describe.configure({ timeout: 240_000 });

const BROKEN = '/this-image-does-not-exist-4f2a.png';
const DECK = [
	`<!-- _class: big-number -->\n\n\`Intact\`\n\n- 1\n  - This slide has nothing to fetch.`,
	`<!-- _class: content -->\n\n# The slide with a broken path\n\n![A logo that cannot be fetched](${BROKEN})\n\nThe copy around it still renders.`,
].join('\n\n---\n\n');

test('a deck with an unreachable image still exports, and the toast says what is missing', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(2);

	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();

	// It exported at all — which is the whole fix.
	const file = await download;
	const path = await file.path();
	expect(path).toBeTruthy();
	const doc = await PDFDocument.load(new Uint8Array(readFileSync(path as string)), { updateMetadata: false });
	expect(doc.getPageCount()).toBe(2);

	// And the author was told, in the toast — which persists, unlike the progress line.
	const toast = page.locator('[data-sonner-toast]');
	await expect(toast).toContainText(/PDF ready — but/i);
	await expect(toast).toContainText(/could not be loaded/i);
	// Named, not merely counted. Before this, the only thing the export could say about
	// a failing image was "unexpected error".
	await expect(toast).toContainText(BROKEN);
});
