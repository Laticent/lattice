import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { expect, gotoStudio, railButtons, setEditorContent, test } from './studio-fixture';

// "One page per step" in the Studio's export sheet: the CLI's `--steps`, through the same kernel
// (lib/core/step-pages.mjs `expandStepPages`). Off, a stepping slide exports once; on, it exports once per step.
// This drives the REAL Share sheet and counts the pages of the file it hands over (HARD RULE #23).
test.describe.configure({ timeout: 240_000 });

const DECK = `---
theme: indaco
paginate: true
---

# Steps

---

<!-- _class: table -->
<!-- _focusSteps: row 1 | row 2 -->

## Two rows, walked

| Region | Q3 |
|---|---|
| North | 12 |
| South | 9 |

---

<!-- _build -->

## Built in place

- First
- Second
- Third

---

# End
`;

async function exportPdf(page: Parameters<typeof gotoStudio>[0], steps: boolean) {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	const toggle = dialog.getByRole('switch', { name: 'One page per step' });
	await expect(toggle).toBeVisible();
	if (steps) await toggle.click();
	await expect(toggle).toHaveAttribute('aria-checked', String(steps));
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();
	const path = await (await download).path();
	expect(path).toBeTruthy();
	await page.keyboard.press('Escape');
	return PDFDocument.load(readFileSync(path as string));
}

test('the PDF gives each step its own page only when asked', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(4);
	// Off (the default): four slides, four pages.
	expect((await exportPdf(page, false)).getPageCount()).toBe(4);
	// On: the title, two focus pages, three build pages, the end.
	expect((await exportPdf(page, true)).getPageCount()).toBe(7);
});

test('every step page of the Studio\'s PDF carries its slide\'s text marks', async ({ page }) => {
	// The divider's k/N marker on both of its step pages, and the topic eyebrow after it, read off the PDF's own text.
	// The runtime's recount of the copies (the numeral, which prints in the slide picture, not as text) is proved
	// where it can fail: test/integration/export/steps-export.test.js, "the runtime does not recount".
	await gotoStudio(page);
	await setEditorContent(page, readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test', 'integration', 'invariants', 'mark-agreement', 'fixtures', 'focus-divider.md'), 'utf8'));
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(6);
	const pdf = await exportPdf(page, true);
	expect(pdf.getPageCount()).toBe(7);
	const file = join(tmpdir(), `steps-marks-${process.pid}-${test.info().workerIndex}.pdf`);
	writeFileSync(file, await pdf.save());
	const text = (p: number) => execFileSync('pdftotext', ['-f', String(p), '-l', String(p), file, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
	expect(text(2)).toMatch(/1\s*\/\s*2/);
	expect(text(3)).toMatch(/1\s*\/\s*2/);
	expect(text(5)).toMatch(/2\s*\/\s*2/);
	expect(text(6)).toContain('02 · BETA');
});

test('the image set gives each step its own image only when asked', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(4);
	const slideImages = async (steps: boolean) => {
		await page.getByRole('button', { name: 'Share', exact: true }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('button', { name: /^Images \(\.zip\)/ }).click();
		const toggle = dialog.getByRole('switch', { name: 'One image per step' });
		await expect(toggle).toBeVisible();
		if (steps) await toggle.click();
		const download = page.waitForEvent('download', { timeout: 180_000 });
		await dialog.getByRole('button', { name: /^Download images/ }).click();
		const path = await (await download).path();
		await page.keyboard.press('Escape');
		const zip = await JSZip.loadAsync(readFileSync(path as string));
		return Object.keys(zip.files).filter((f) => /\/slides\/[^/]+\.png$/.test(f)).length;
	};
	expect(await slideImages(false)).toBe(4);
	expect(await slideImages(true)).toBe(7);
});

test('with a separate SVG look, a chart after a stepping slide keeps its image\'s number', async ({ page }) => {
	// The SVG look renders the deck a second time; that render must expand its step pages too, or the chart is filed
	// under the page number it had before the expansion (3 here) instead of its image's (5).
	await gotoStudio(page);
	await setEditorContent(page, `---\ntheme: indaco\n---\n\n# One\n\n---\n\n<!-- _build -->\n\n## Built\n\n- First\n- Second\n- Third\n\n---\n\n<!-- _class: piechart -->\n\n## A pie\n\n- Alpha \`40%\`\n- Beta \`35%\`\n- Gamma \`25%\`\n`);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(3);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: /^Images \(\.zip\)/ }).click();
	await dialog.getByRole('switch', { name: 'One image per step' }).click();
	// Two "Print" segments: the set's color mode, then the SVG look below it. The SVG look is the second.
	await dialog.getByRole('button', { name: 'Print', exact: true }).nth(1).click();
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await dialog.getByRole('button', { name: /^Download images/ }).click();
	const zip = await JSZip.loadAsync(readFileSync((await (await download).path()) as string));
	const manifestPath = Object.keys(zip.files).find((f) => f.endsWith('manifest.json')) as string;
	const manifest = JSON.parse(await zip.files[manifestPath].async('string'));
	const images = Object.keys(zip.files).filter((f) => /\/slides\/[^/]+\.png$/.test(f));
	expect(images).toHaveLength(5);
	const charts = (manifest.assets ?? []).filter((a: { kind: string }) => a.kind === 'chart');
	expect(charts.map((a: { slide: number }) => a.slide)).toEqual([5]);
});

test('a deck that does not step is not offered the switch', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '# One\n\n---\n\n# Two\n');
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(2);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	await expect(dialog.getByRole('button', { name: /^Download PDF/ })).toBeVisible();
	await expect(dialog.getByRole('switch', { name: 'One page per step' })).toHaveCount(0);
});
