import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, gotoStudio, railButtons, setEditorContent, test } from './studio-fixture';

// No tier ever changes an exported file (engineering/decisions/2026-11-12-device-capability-tiers.md §4). LITE runs the
// export with one picture encoder and one slide in flight, where FULL overlaps two: slower, never different. This exports
// the same deck from both tiers, pinned with `?tier=` so the runner's GPU never decides (HARD RULE #32), through the
// default PDF writer (the shared picture pool) and the photo lane (the in-flight window), and compares the files byte for
// byte once the two fields a PDF stamps with the clock are masked.
test.describe.configure({ timeout: 300_000 });

const DECK = Array.from({ length: 4 }, (_, i) => `<!-- _class: big-number -->\n\n\`Slide ${i + 1}\`\n\n- ${i + 1}\n  - of four, each different.`).join('\n\n---\n\n');

type P = Parameters<typeof gotoStudio>[0];

async function exportPdf(page: P): Promise<Uint8Array> {
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

/**
 * The PDF as text, every Flate stream inflated, with its clock-stamped fields blanked: the creation and modification
 * dates (pdf-lib writes the Info dictionary inside a compressed object stream, so the date is only readable inflated), a
 * file ID, and what the date's compressed size moves (stream lengths, cross-reference offsets). Everything else, page
 * streams and pictures included, compares byte for byte once inflated.
 */
function masked(bytes: Uint8Array): string {
	const buf = Buffer.from(bytes);
	const parts: string[] = [];
	let at = 0;
	let from = 0;
	for (;;) {
		// From past the last `endstream`: its own tail reads `stream\n` too.
		const start = buf.indexOf('stream\n', from);
		if (start < 0) break;
		const body = start + 'stream\n'.length;
		const end = buf.indexOf('\nendstream', body);
		if (end < 0) break;
		parts.push(buf.subarray(at, body).toString('latin1'));
		const raw = buf.subarray(body, end);
		let text: string;
		try {
			text = inflateSync(raw).toString('latin1');
		} catch {
			text = raw.toString('latin1');
		}
		// A cross-reference stream is byte offsets, which move when a compressed stream before them is a byte longer.
		parts.push(/\/Type\s*\/XRef\b/.test(parts[parts.length - 1].slice(-400)) ? '<xref offsets>' : text);
		at = end;
		from = end + '\nendstream'.length;
	}
	parts.push(buf.subarray(at).toString('latin1'));
	return parts
		.join('')
		.replace(/\/(CreationDate|ModDate)\s*\(D:[^)]*\)/g, '/$1 (D:masked)')
		.replace(/<(xmp|x):(CreateDate|ModifyDate|MetadataDate)>[^<]*</g, '<$1:$2>masked<')
		.replace(/\/ID\s*\[\s*<[0-9a-fA-F]*>\s*<[0-9a-fA-F]*>\s*\]/g, '/ID [<masked><masked>]')
		// Compressed sizes and the offsets that follow them: the date compresses to a different length now and then
		// (measured: 1 export in 12 was one byte shorter, FULL against FULL). The inflated contents above still compare.
		.replace(/\/Length\s+\d+/g, '/Length n')
		.replace(/\nxref\n[\s\S]*?\ntrailer/g, '\nxref <offsets>\ntrailer')
		.replace(/startxref\s+\d+/g, 'startxref n');
}

async function exportIn(page: P, tier: 'full' | 'lite', lane: 'default' | 'photo'): Promise<Uint8Array> {
	if (lane === 'photo') {
		await page.addInitScript(() => {
			const k = 'lattice-studio-settings';
			const cur = JSON.parse(localStorage.getItem(k) || '{}');
			localStorage.setItem(k, JSON.stringify({ ...cur, pdfWriter: 'photo' }));
		});
	}
	await gotoStudio(page, { query: `?tier=${tier}` });
	await expect(page.locator('html')).toHaveAttribute('data-device-tier', tier);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(4);
	return exportPdf(page);
}

for (const lane of ['default', 'photo'] as const) {
	test(`a ${lane}-lane PDF is the same file from a FULL and a LITE device`, async ({ browser }) => {
		const files: Record<string, Uint8Array> = {};
		for (const tier of ['full', 'lite'] as const) {
			const context = await browser.newContext({ acceptDownloads: true });
			try {
				files[tier] = await exportIn(await context.newPage(), tier, lane);
			} finally {
				await context.close();
			}
		}
		expect(files.full.length).toBeGreaterThan(1000);
		expect(masked(files.lite) === masked(files.full), 'the two files differ beyond their date stamps').toBe(true);
	});
}

// PowerPoint. The worker lane queues 2 slides on FULL and 1 on LITE (`exportInFlight`), and assembles them by index. A
// .pptx is a zip, so the oracle compares every entry by its uncompressed CRC and size, read from the central directory,
// except `docProps/core.xml`, which carries the export's created and modified dates. (The same reading as
// pptx-export-worker.spec.ts, applied to all entries rather than only the pictures.)
function zipEntries(zip: Uint8Array): string[] {
	const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
	const out: string[] = [];
	for (let i = 0; i + 46 <= zip.length; i++) {
		if (view.getUint32(i, true) !== 0x02014b50) continue;
		const crc = view.getUint32(i + 16, true);
		const size = view.getUint32(i + 24, true);
		const nameLen = view.getUint16(i + 28, true);
		const extraLen = view.getUint16(i + 30, true);
		const commentLen = view.getUint16(i + 32, true);
		const name = new TextDecoder('latin1').decode(zip.subarray(i + 46, i + 46 + nameLen));
		if (name !== 'docProps/core.xml') out.push(`${name}:${size}:${crc.toString(16)}`);
		i += 46 + nameLen + extraLen + commentLen - 1;
	}
	return out.sort();
}

async function exportPptx(page: P): Promise<Uint8Array> {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^PowerPoint/ }).click();
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await dialog.getByRole('button', { name: /^Download PowerPoint/ }).click();
	const path = await (await download).path();
	expect(path).toBeTruthy();
	return new Uint8Array(readFileSync(path as string));
}

test('a PowerPoint is the same file from a FULL and a LITE device', async ({ browser }) => {
	const files: Record<string, string[]> = {};
	for (const tier of ['full', 'lite'] as const) {
		const context = await browser.newContext({ acceptDownloads: true });
		try {
			const page = await context.newPage();
			await gotoStudio(page, { query: `?tier=${tier}` });
			await expect(page.locator('html')).toHaveAttribute('data-device-tier', tier);
			await setEditorContent(page, DECK);
			await expect(railButtons(page)).toHaveCount(4);
			files[tier] = zipEntries(await exportPptx(page));
		} finally {
			await context.close();
		}
	}
	expect(files.full.filter((e) => e.startsWith('ppt/media/')).length, 'no slide pictures in the PowerPoint').toBeGreaterThan(0);
	expect(files.lite).toEqual(files.full);
});

