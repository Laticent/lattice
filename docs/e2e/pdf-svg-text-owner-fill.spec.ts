import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, gotoStudio, railButtons, setEditorContent, test } from './studio-fixture';

// Share → PDF on the REAL Studio: a sequence diagram's participant names are INK in the PDF, not
// text painted in its box's own color.
//
// The shared writer (lib/core/pdf-compose, the CLI's too) used to read an SVG `<text>`'s fill off
// the `<text>`. Mermaid paints a participant's name on the `<tspan>` and gives the `<text>` the
// box's fill, so every name was drawn in its box's color: in the text layer, invisible on the page.
// The CLI half is test/integration/export/pdf-svg-text-owner-fill.test.js; this is the Studio's,
// which runs the same reader in the browser (the reader's realm is `ownerDocument.defaultView`).
//
// The check is pixels, on the real PDF the Studio downloads: find each participant box by its fill
// and count the pixels inside it that are not that fill. A name has hundreds; an empty box has none.
// Light and dark, because the ink flips with the mode. The chart slide keeps its labels as text.
//
// FALSIFIABLE: with the reader taking the `<text>`'s own fill, every box counts 0 and both modes fail
// (shown on Chromium by rebuilding the Studio with the pre-fix reader, 2026-10-12).
//
// THREE ENGINES. The Studio runs the reader in the user's own browser, and an engine can answer a
// character's position or computed fill differently, so the spec carries `@gecko` and
// `@webkit-tablet` and runs on Chromium, Firefox and WebKit. All three passed on 2026-10-12.
test.describe.configure({ timeout: 300_000 });

const SEQUENCE = ['sequenceDiagram', '  participant App', '  participant SDK', '  participant Log', '  App->>SDK: score(signal)', '  SDK-->>App: score', '  App->>Log: record'].join('\n');
const DECK = [
	`<!-- _class: diagram -->\n\n## Light handshake\n\n\`\`\`mermaid\n${SEQUENCE}\n\`\`\``,
	`<!-- _class: diagram dark -->\n\n## Dark handshake\n\n\`\`\`mermaid\n${SEQUENCE}\n\`\`\``,
	'<!-- _class: bar -->\n\n## Coverage by region\n\n- EMEA `4.2`\n- Americas `3.1`\n- APAC `2.4`\n',
].join('\n\n---\n\n');

async function exportPdf(page: Parameters<typeof gotoStudio>[0]) {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	const download = page.waitForEvent('download', { timeout: 240_000 });
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();
	const path = await (await download).path();
	expect(path).toBeTruthy();
	return new Uint8Array(readFileSync(path as string));
}

type Raster = { w: number; h: number; px: Buffer };

/** One page of the PDF as RGB bytes (pdftoppm, 96 dpi). */
function raster(pdf: string, pageNo: number): Raster {
	const base = join(tmpdir(), `owner-fill-${Date.now()}-p${pageNo}`);
	execFileSync('pdftoppm', ['-r', '96', '-f', String(pageNo), '-l', String(pageNo), '-singlefile', pdf, base]);
	const buf = readFileSync(`${base}.ppm`);
	const head = buf.toString('latin1', 0, 64).match(/^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/);
	if (!head) throw new Error('not a PPM');
	return { w: Number(head[1]), h: Number(head[2]), px: buf.subarray(head[0].length) };
}

/** The participant boxes: connected runs of the diagram's box fill, wide and tall enough to hold a name. */
function boxes({ w, h, px }: Raster) {
	const key = (x: number, y: number) => `${px[(y * w + x) * 3]},${px[(y * w + x) * 3 + 1]},${px[(y * w + x) * 3 + 2]}`;
	const counts = new Map<string, number>();
	for (let y = Math.floor(h * 0.25); y < Math.floor(h * 0.9); y += 2) {
		for (let x = Math.floor(w * 0.15); x < Math.floor(w * 0.85); x += 2) counts.set(key(x, y), (counts.get(key(x, y)) ?? 0) + 1);
	}
	const ranked = [...counts].sort((a, b) => b[1] - a[1]);
	const fill = ranked[1][0]; // the most common colour is the slide's ground; the next is the box
	const seen = new Uint8Array(w * h);
	const found: { x0: number; x1: number; y0: number; y1: number }[] = [];
	for (let y0 = 0; y0 < h; y0++) {
		for (let x0 = 0; x0 < w; x0++) {
			if (seen[y0 * w + x0] || key(x0, y0) !== fill) continue;
			const b = { x0, x1: x0, y0, y1: y0 };
			const stack: [number, number][] = [[x0, y0]];
			seen[y0 * w + x0] = 1;
			while (stack.length) {
				const [x, y] = stack.pop() as [number, number];
				b.x0 = Math.min(b.x0, x);
				b.x1 = Math.max(b.x1, x);
				b.y1 = Math.max(b.y1, y);
				for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
					if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx] || key(nx, ny) !== fill) continue;
					seen[ny * w + nx] = 1;
					stack.push([nx, ny]);
				}
			}
			if (b.x1 - b.x0 > w * 0.06 && b.y1 - b.y0 > h * 0.04) found.push(b);
		}
	}
	return { fill, found };
}

function inkIn(r: Raster, b: { x0: number; x1: number; y0: number; y1: number }, fill: string) {
	let ink = 0;
	for (let y = b.y0 + 4; y < b.y1 - 4; y++) {
		for (let x = b.x0 + 4; x < b.x1 - 4; x++) {
			const o = (y * r.w + x) * 3;
			if (`${r.px[o]},${r.px[o + 1]},${r.px[o + 2]}` !== fill) ink++;
		}
	}
	return ink;
}

test('Share → PDF draws a sequence diagram’s participant names as ink, in light and dark @gecko @webkit-tablet', async ({ page }) => {
	const warnings: string[] = [];
	page.on('console', (m) => {
		if (/shared PDF writer failed/.test(m.text())) warnings.push(m.text());
	});
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(3);
	const bytes = await exportPdf(page);
	expect(warnings, 'the shared writer must run, not fall back to photos').toEqual([]);

	const file = join(tmpdir(), `owner-fill-${Date.now()}.pdf`);
	writeFileSync(file, bytes);
	for (const [pageNo, mode] of [[1, 'light'], [2, 'dark']] as const) {
		const text = execFileSync('pdftotext', ['-f', String(pageNo), '-l', String(pageNo), file, '-'], { encoding: 'utf8' });
		for (const name of ['App', 'SDK', 'Log']) expect(text, `${mode}: "${name}" is in the text layer`).toContain(name);
		const r = raster(file, pageNo);
		const { fill, found } = boxes(r);
		expect(found.length, `${mode}: 3 participants, top and bottom`).toBe(6);
		for (const b of found) {
			const ink = inkIn(r, b, fill);
			expect(ink, `${mode}: the participant box at (${b.x0},${b.y0}) holds ${ink} pixels of ink; its name is painted in the box's own colour`).toBeGreaterThan(40);
		}
	}
	const chart = execFileSync('pdftotext', ['-f', '3', '-l', '3', file, '-'], { encoding: 'utf8' });
	for (const label of ['EMEA', 'Americas', 'APAC']) expect(chart).toContain(label);
});
