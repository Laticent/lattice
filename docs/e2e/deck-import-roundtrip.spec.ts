import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, gotoStudio, railButtons, setEditorContent, test, toastText } from './studio-fixture';

// Export → Import, on the REAL Studio, for every format that can carry a deck
// (engineering/decisions/2026-10-05-reopenable-exports.md). The oracle is the source
// the imported deck holds, compared byte-for-byte with what was exported — a
// re-import that only "looks right" in the preview would pass a weaker test while
// losing a speaker note.
//
// It also pins the two halves of the opt-in: with "Re-openable in Lattice" off, a PDF
// is refused on import with the way forward, never scraped into a lossy draft.

test.describe.configure({ timeout: 300_000 });

// A speaker note and a non-ASCII heading: the parts a lossy path drops first.
const DECK = [
	'# Halcyon quarterly — revue',
	'<!-- notes: open with the retention number -->\n\n## Retention held\n\n- 94% of accounts renewed.',
	'## Next quarter\n\n- Two launches, one migration.',
].join('\n\n---\n\n');

/** The ACTIVE deck's stored source (studio-store writes every value as JSON). Saving is
 *  debounced, so callers poll. */
async function activeSource(page: Page): Promise<string> {
	return page.evaluate(() => {
		try {
			const active = JSON.parse(localStorage.getItem('lattice-studio-active') || '{}');
			return JSON.parse(localStorage.getItem(`lattice-studio-src-${active.deckId}`) || '""');
		} catch {
			return '';
		}
	});
}

/** Share → <format> → (re-openable on/off) → Download, returning the file's bytes. */
async function exportFile(page: Page, row: RegExp, confirm: RegExp | null, reopenable: boolean | null): Promise<Buffer> {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	if (!confirm) {
		// A one-click row: the row itself downloads.
		const download = page.waitForEvent('download', { timeout: 240_000 });
		await dialog.getByRole('button', { name: row }).click();
		const path = await (await download).path();
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		return readFileSync(path as string);
	}
	await dialog.getByRole('button', { name: row }).click();
	if (reopenable !== null) {
		const sw = dialog.getByRole('switch', { name: 'Re-openable in Lattice' });
		if ((await sw.getAttribute('aria-checked')) !== String(reopenable)) await sw.click();
		await expect(sw).toHaveAttribute('aria-checked', String(reopenable));
	}
	const download = page.waitForEvent('download', { timeout: 240_000 });
	await dialog.getByRole('button', { name: confirm }).click();
	const path = await (await download).path();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	return readFileSync(path as string);
}

/** Deck switcher → Import deck… → the real file chooser. */
async function importFile(page: Page, name: string, buffer: Buffer) {
	await page.getByRole('button', { name: /Halcyon quarterly/ }).first().click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('menuitem', { name: /Import deck/ }).click();
	await (await chooser).setFiles({ name, mimeType: 'application/octet-stream', buffer });
}

test('every re-openable export comes back into the Studio as the exact deck', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(3);
	await expect.poll(() => activeSource(page)).toBe(DECK);

	const pdf = await exportFile(page, /^PDF/, /^Download PDF/, true);
	const pptx = await exportFile(page, /^PowerPoint/, /^Download PowerPoint/, true);
	const lattice = await exportFile(page, /^Lattice project/, null, null);
	const plainPdf = await exportFile(page, /^PDF/, /^Download PDF/, false);

	// The carriers are what they claim to be before anything reads them back.
	expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
	expect(pptx.subarray(0, 2).toString()).toBe('PK');

	for (const [name, bytes] of [['Halcyon.pdf', pdf], ['Halcyon.pptx', pptx]] as const) {
		await importFile(page, name, bytes);
		await expect(toastText(page)).toContainText('Imported');
		await expect.poll(() => activeSource(page)).toBe(DECK);
	}
	await importFile(page, 'Halcyon.lattice', lattice);
	await expect.poll(() => activeSource(page)).toBe(DECK);

	// Off means off: the plain PDF has nothing to open, and says how to get something that does.
	await importFile(page, 'board.pdf', plainPdf);
	await expect(toastText(page)).toContainText('no editable deck inside');
});

// The CLI half (`lattice deck.md out.pdf --reopenable`): one kernel builds and places the
// payload for both tools (lib/core/reopenable.js), so a CLI export opens through the same
// Import deck, byte for byte. Rendered here, by the real CLI, so a drift between the two
// writers fails this file and not only a unit test of one of them.
test('a CLI --reopenable PDF and PowerPoint come back into the Studio as the exact deck', async ({ page }) => {
	const dir = mkdtempSync(join(tmpdir(), 'lattice-cli-reopenable-'));
	writeFileSync(join(dir, 'deck.md'), DECK);
	const cli = resolve(import.meta.dirname, '..', '..', 'lattice.js');
	const files: [string, Buffer][] = [];
	for (const ext of ['pdf', 'pptx']) {
		const out = join(dir, `Halcyon.${ext}`);
		const r = spawnSync(process.execPath, [cli, join(dir, 'deck.md'), out, '--reopenable', '-q'], { encoding: 'utf8', timeout: 240_000 });
		expect(r.status, r.stderr).toBe(0);
		files.push([`Halcyon.${ext}`, readFileSync(out)]);
	}

	// The active deck starts as something else, so each import has to MOVE the stored source.
	await gotoStudio(page);
	await setEditorContent(page, '# Halcyon quarterly — scratch');
	await expect.poll(() => activeSource(page)).toBe('# Halcyon quarterly — scratch');
	for (const [name, bytes] of files) {
		await importFile(page, name, bytes);
		await expect(toastText(page)).toContainText('Imported');
		await expect.poll(() => activeSource(page)).toBe(DECK);
	}
});
