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

	const doc = await PDFDocument.load(bytes);
	expect(doc.getPageCount()).toBe(4);
	// Tagged, as Chrome's printed PDF is.
	expect(doc.catalog.lookup(PDFName.of('MarkInfo'), PDFDict).get(PDFName.of('Marked'))?.toString()).toBe('true');
	expect(doc.catalog.get(PDFName.of('StructTreeRoot'))).toBeTruthy();
	for (const pg of doc.getPages()) {
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
