import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { expect, gotoStudio, railButtons, setEditorContent, test } from './studio-fixture';

// Share → PDF on the REAL Studio, through the shared writer (lib/core/pdf-compose — the CLI's
// writer too). What the owner asked for, pinned end to end: the words are real text in the
// deck's own fonts (not a picture with an invisible copy), the chart is vector, the file is
// tagged for screen readers, and each page carries exactly one photo — the background.
// engineering/decisions/2026-09-27-studio-export-one-engine.md.
test.describe.configure({ timeout: 240_000 });

const MARKERS = ['Zephyr', 'Quartzite', 'Halyard'];
const DECK = [
	...MARKERS.map((word, i) => `## ${word} update\n\n- ${word} contracts signed across ${i + 2} northern territories.`),
	'<!-- _class: bar -->\n\n## Coverage by region\n\n- EMEA `4.2`\n- Americas `3.1`\n- APAC `2.4`\n',
].join('\n\n---\n\n');

async function exportPdf(page: Parameters<typeof gotoStudio>[0]) {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();
	const path = await (await download).path();
	expect(path).toBeTruthy();
	return new Uint8Array(readFileSync(path as string));
}

test('Share → PDF writes real, tagged text and vector charts over one photo per page', async ({ page }) => {
	const warnings: string[] = [];
	page.on('console', (m) => { if (/shared PDF writer failed/.test(m.text())) warnings.push(m.text()); });
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(4);
	const bytes = await exportPdf(page);
	expect(warnings, 'the shared writer must run, not fall back to photos').toEqual([]);

	// updateMetadata: false, or pdf-lib stamps its own Producer over the one being checked.
	const doc = await PDFDocument.load(bytes, { updateMetadata: false });
	expect(doc.getPageCount()).toBe(4);
	// Made by the shared writer, not a photo lane that stepped in after a silent failure.
	expect(doc.getProducer()).toContain('pdf-compose');
	// Tagged, as Chrome's printed PDF is.
	expect(doc.catalog.lookup(PDFName.of('MarkInfo'), PDFDict).get(PDFName.of('Marked'))?.toString()).toBe('true');
	expect(doc.catalog.get(PDFName.of('StructTreeRoot'))).toBeTruthy();
	for (const pg of doc.getPages()) {
		// The slide's own size, 1280x720px: the reader must not measure the preview's FIT scale.
		expect(pg.getSize()).toEqual({ width: 960, height: 540 });
		const res = pg.node.Resources();
		const xobjects = res?.lookup(PDFName.of('XObject'), PDFDict);
		const fonts = res?.lookup(PDFName.of('Font'), PDFDict);
		expect(xobjects?.keys().length, 'one photo per page').toBe(1);
		expect(fonts?.keys().length ?? 0, 'the words are drawn in embedded fonts').toBeGreaterThan(0);
	}

	// The text reads back as the slide's own words, spaces and order intact.
	const file = join(tmpdir(), `shared-writer-${Date.now()}.pdf`);
	writeFileSync(file, bytes);
	const pages = MARKERS.map((_, i) => execFileSync('pdftotext', ['-f', String(i + 1), '-l', String(i + 1), file, '-'], { encoding: 'utf8' }));
	MARKERS.forEach((word, i) => {
		expect(pages[i]).toContain(`${word} update`);
		expect(pages[i]).toContain(`${word} contracts signed across ${i + 2} northern territories.`);
		for (const other of MARKERS.filter((m) => m !== word)) expect(pages[i]).not.toContain(other);
	});
	const chart = execFileSync('pdftotext', ['-f', '4', '-l', '4', file, '-'], { encoding: 'utf8' });
	for (const label of ['EMEA', 'Americas', 'APAC']) expect(chart).toContain(label);
	// The bars are vector paths, not pixels: pdftocairo's SVG of the chart page carries paths
	// filled in the chart's colors beyond the photo's single <image>.
	const svg = join(tmpdir(), `shared-writer-${Date.now()}.svg`);
	execFileSync('pdftocairo', ['-svg', '-f', '4', '-l', '4', file, svg]);
	expect((readFileSync(svg, 'utf8').match(/<path /g) || []).length).toBeGreaterThan(3);
});

test('Share → PDF keeps the deck’s own section box-shadow (the tone rail), as the CLI does', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '<!-- _class: tone-warn -->\n\n## Churn is the risk\n');
	await expect(railButtons(page)).toHaveCount(1);
	const file = join(tmpdir(), `shared-writer-rail-${Date.now()}.pdf`);
	writeFileSync(file, await exportPdf(page));
	// The rail is an inset box-shadow down the left edge. The capture once reset every
	// section's box-shadow to strip a preview shadow that no longer lives there, and erased it.
	const base = file.replace(/\.pdf$/, '');
	execFileSync('pdftoppm', ['-r', '36', '-singlefile', file, base]);
	const ppm = readFileSync(`${base}.ppm`);
	const [, w, h] = ppm.toString('latin1', 0, 20).match(/P6\s+(\d+)\s+(\d+)\s+255\s/)!.map(Number);
	const px = ppm.subarray(ppm.length - w * h * 3);
	// Mean color of one pixel column, and how far the left edge sits from the page's middle.
	const colAt = (x: number) => [0, 1, 2].map((c) => { let v = 0; for (let y = 0; y < h; y++) v += px[(y * w + x) * 3 + c]; return v / h; });
	const [edge, mid] = [colAt(1), colAt(Math.round(w / 2))];
	expect(edge.reduce((d, v, c) => d + Math.abs(v - mid[c]), 0), 'a colored rail down the left edge').toBeGreaterThan(90);
});
