import { readFileSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// The font policy (lib/core/font-policy.js) on the REAL Studio: the Share → Webpage panel's "Fonts" choice decides how much
// of the emoji font the downloaded player carries. The oracle is the downloaded FILE: its emoji @font-face rules and size.
test.describe.configure({ timeout: 300_000 });

/** Open a Fonts dropdown and take the row titled for this tier (`exact`, `system`, ...). */
async function pickFont(page: Page, label: string, tier: string) {
	await page.getByRole('dialog').getByRole('combobox', { name: label }).click();
	await page.getByRole('option', { name: new RegExp(`^${tier}`, 'i') }).click();
}

const DECK = '# Launch \u{1F680} \u{2705}\n\nFlag \u{1F1EB}\u{1F1F7}\n';

async function webpage(page: Page, emoji?: string): Promise<string> {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: /Webpage/ }).click();
	if (emoji) await pickFont(page, 'Emoji font', emoji);
	const download = page.waitForEvent('download', { timeout: 240_000 });
	await dialog.getByRole('button', { name: /Download webpage/ }).click();
	return readFileSync((await (await download).path()) as string, 'utf8');
}

const emojiFaces = (html: string) => [...html.matchAll(/@font-face\{[^}]*Noto Color Emoji[^}]*\}/g)].map((m) => m[0]);

// `desktop` (Chromium) drops a title carrying `@webkit-*` unless it also carries `@crosswidth`, so each oracle is
// defined twice: the `@gecko` copy runs on Chromium desktop AND Firefox, the `@webkit-tablet` copy on real WebKit.
const onEveryEngine = (title: string, body: (fixtures: { page: Page; browser: Browser }) => Promise<void>) => {
	for (const tag of [' @gecko', ' @webkit-tablet']) test(`${title}${tag}`, body);
};

onEveryEngine('@smoke Share → Webpage cuts the emoji font to the deck by default, and System ships none', async ({ page }) => {
	const exact = await webpage(page);
	const faces = emojiFaces(exact);
	expect(faces.length).toBeGreaterThan(0);
	// Cut to the deck's three emoji: a few KB each, never a 60 to 700 KB slice.
	expect(Math.max(...faces.map((f) => f.length))).toBeLessThan(20_000);
	const none = await webpage(page, 'system');
	expect(emojiFaces(none).length).toBe(0);
});

// The same policy on the other Studio exports: the oracle is the downloaded file.
const WORDS = '# Fonts policy\n\nA slide with some real text to embed.\n\n---\n\n## Second\n\n- One\n- Two\n';

async function openShare(page: Page, row: RegExp) {
	await gotoStudio(page);
	await setEditorContent(page, WORDS);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: row }).click();
	return dialog;
}

async function editablePptxEntries(page: Page, text?: string): Promise<string[]> {
	const dialog = await openShare(page, /^PowerPoint/);
	const editable = dialog.getByRole('switch', { name: 'Editable text' });
	if ((await editable.getAttribute('aria-checked')) !== 'true') await editable.click();
	if (text) await pickFont(page, 'Text fonts', text);
	const download = page.waitForEvent('download', { timeout: 240_000 });
	await dialog.getByRole('button', { name: /^Download PowerPoint/ }).click();
	const { default: JSZip } = await import('jszip');
	const zip = await JSZip.loadAsync(readFileSync((await (await download).path()) as string));
	return Object.keys(zip.files).filter((n) => /^ppt\/fonts\//.test(n));
}

onEveryEngine('@smoke Share → editable PowerPoint embeds the deck faces by default, and System embeds none', async ({ page }) => {
	const embedded = await editablePptxEntries(page);
	expect(embedded.length, 'the default embeds the deck’s faces').toBeGreaterThan(0);
	const none = await editablePptxEntries(page, 'system');
	expect(none, 'System embeds nothing').toEqual([]);
});

async function pdfFontFiles(page: Page, text?: string): Promise<number> {
	const dialog = await openShare(page, /^PDF/);
	if (text) await pickFont(page, 'Text fonts', text);
	const download = page.waitForEvent('download', { timeout: 240_000 });
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();
	const { PDFDocument, PDFName, PDFDict } = await import('pdf-lib');
	const pdf = await PDFDocument.load(new Uint8Array(readFileSync((await (await download).path()) as string)), { updateMetadata: false });
	let files = 0;
	for (const [, ref] of pdf.context.enumerateIndirectObjects()) {
		if (ref instanceof PDFDict && (ref.has(PDFName.of('FontFile2')) || ref.has(PDFName.of('FontFile3')) || ref.has(PDFName.of('FontFile')))) files++;
	}
	return files;
}

onEveryEngine('@smoke Share → PDF embeds the deck faces by default, and System embeds none', async ({ page }) => {
	const embedded = await pdfFontFiles(page);
	const none = await pdfFontFiles(page, 'system');
	expect(embedded, 'the default carries the deck’s faces').toBeGreaterThan(0);
	expect(none, 'System leaves the engine’s faces out of the PDF').toBeLessThan(embedded);
});
