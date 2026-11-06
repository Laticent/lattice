import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import JSZip from 'jszip';
import { expect, gotoStudio, shareExport, test, typeDeck } from './studio-fixture';

// HIDDEN SLIDES ON THE REAL STUDIO (engineering/decisions/2026-11-06-hidden-slides.md §4). Present and every Studio
// export leave a `<!-- hide -->` slide out: Present's count and slides, the PDF's pages and their numbers, the
// Webpage's slides, and the Captions' tracks and words. The deck hides slide 2 of 4, so each surface shows 3.

test.describe.configure({ timeout: 300_000 });

const DECK = `---
theme: indaco
paginate: true
say:
  1: Alpha is spoken.
  2: Bravo must never be spoken.
  3: Charlie is spoken.
---

## Alpha

First shown slide.

<!-- Alpha note -->

---

<!-- hide -->

## Bravo secret

This slide is hidden.

<!-- BRAVO SECRET NOTE -->

---

## Charlie

Second shown slide.

---

## Delta

Third shown slide.
`;

async function download(page: Page, format: 'pdf' | 'webpage' | 'captions', ext: string): Promise<string> {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dl = page.waitForEvent('download', { timeout: 240_000 });
	await shareExport(page, format);
	const file = join(mkdtempSync(join(tmpdir(), 'hidden-')), `deck.${ext}`);
	writeFileSync(file, readFileSync((await (await dl).path()) as string));
	await page.keyboard.press('Escape');
	return file;
}

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, DECK);
});

test('Present skips the hidden slide: 3 slides, Bravo never shown @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const present = page.getByRole('dialog', { name: 'Present' });
	await expect(present).toBeVisible();
	// The editor's caret sits on the last slide, so Present opens there; Home goes to the first presented slide.
	await page.keyboard.press('Home');
	const heading = present.frameLocator('iframe').first().locator('.lattice h2').first();
	const counter = async () => ((await present.textContent()) ?? '').replace(/\s+/g, ' ');
	// The counter moves before the slide's frame repaints, so WAIT for each heading rather than read it: were Bravo
	// ever presented, the wait for Charlie would fail on it.
	for (const [i, name] of ['Alpha', 'Charlie', 'Delta'].entries()) {
		await expect.poll(counter).toContain(`${i + 1} / 3`);
		await expect(heading).toHaveText(name);
		await page.keyboard.press('ArrowRight');
	}
	// Past the end: still the third of three, never a fourth slide, never Bravo.
	await expect.poll(counter).toContain('3 / 3');
	await expect(heading).toHaveText('Delta');
	await page.screenshot({ path: test.info().outputPath('present.png') });
});

test('the PDF export has 3 pages, numbered 1 to 3, and no hidden slide', async ({ page }) => {
	const pdf = await download(page, 'pdf', 'pdf');
	const info = execFileSync('pdfinfo', [pdf]).toString();
	expect(info).toMatch(/^Pages:\s+3$/m);
	execFileSync('pdftoppm', ['-r', '40', '-png', pdf, pdf.replace(/\.pdf$/, '')]);
	test.info().attach('pdf', { path: pdf, contentType: 'application/pdf' });
});

test('the Webpage export carries 3 slides and no hidden slide or its note', async ({ page }) => {
	const html = readFileSync(await download(page, 'webpage', 'html'), 'utf8');
	const slides = [...html.matchAll(/<section\b[^>]*\bdata-lattice-slide="[^"]*"/g)];
	expect(slides).toHaveLength(3);
	expect(html).not.toContain('This slide is hidden.');
});

test('the Captions export narrates the 3 shown slides, each with its own say: line', async ({ page }) => {
	const zip = await JSZip.loadAsync(readFileSync(await download(page, 'captions', 'zip')));
	const tracks = Object.keys(zip.files).filter((n) => /\.vtt$/.test(n));
	// WebVTT word-timing tags (`<00:00:00.410>`) sit between the words; read the spoken text without them. Only that
	// exact timestamp shape is removed: this reads caption text, it builds no HTML.
	const all = (await Promise.all(tracks.map((n) => zip.file(n)?.async('string')))).join('\n').replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '');
	expect(all).toContain('Alpha is spoken');
	expect(all).toContain('Charlie is spoken');
	expect(all).not.toContain('Bravo');
});
