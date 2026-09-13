import { readFileSync } from 'node:fs';
import { expect, gotoStudio, railButtons, setEditorContent, test } from './studio-fixture';

// The PowerPoint export has two lanes that must produce the SAME deck: the worker
// (which base64s each slide and builds the whole pptxgenjs document off the main
// thread) and the main-thread fallback, kept for a browser with no `Worker` and as
// the safety net when the worker dies. They run the same library over the same
// pixels, so the slide images must come out byte-for-byte identical — anything else
// means the fast lane is quietly shipping a different artifact.
//
// The oracle reads the .pptx as what it is — a zip — and compares the `ppt/media`
// entries by CRC and size, straight out of the central directory. No unzip library:
// the fields it needs are fixed offsets in a format that has not moved since 1989,
// and this way the spec carries no dependency the app does not already have.
test.describe.configure({ timeout: 240_000 });

const DECK = Array.from(
	{ length: 4 },
	(_, i) => `<!-- _class: big-number -->\n\n\`Slide ${i + 1}\`\n\n- ${(i + 1) * 7}\n  - of four, each visually distinct so a transposed slide is visible.`,
).join('\n\n---\n\n');

/** Every `ppt/media/*` entry of a zip, as `name:size:crc`, read from the central directory. */
function mediaEntries(zip: Uint8Array) {
	const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
	const out: string[] = [];
	// Central-directory headers are self-describing and sequential; scan for the signature.
	for (let i = 0; i + 46 <= zip.length; i++) {
		if (view.getUint32(i, true) !== 0x02014b50) continue;
		const crc = view.getUint32(i + 16, true);
		const size = view.getUint32(i + 24, true);
		const nameLen = view.getUint16(i + 28, true);
		const extraLen = view.getUint16(i + 30, true);
		const commentLen = view.getUint16(i + 32, true);
		const name = new TextDecoder('latin1').decode(zip.subarray(i + 46, i + 46 + nameLen));
		// Not the `ppt/media/` DIRECTORY entry itself, which is a zero-length record.
		if (name.startsWith('ppt/media/') && !name.endsWith('/')) out.push(`${name}:${size}:${crc.toString(16)}`);
		i += 46 + nameLen + extraLen + commentLen - 1;
	}
	return out.sort();
}

async function exportPptx(page: Parameters<typeof gotoStudio>[0]) {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await dialog.getByRole('button', { name: /^PowerPoint/ }).click();
	const file = await download;
	const path = await file.path();
	expect(path).toBeTruthy();
	return new Uint8Array(readFileSync(path as string));
}

test('the worker lane and the main-thread lane export the same PowerPoint', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(4);
	const viaWorker = mediaEntries(await exportPptx(page));

	const viaMainThread = await test.step('main-thread control', async () => {
		const context = await page.context().browser()?.newContext({ acceptDownloads: true });
		if (!context) throw new Error('no browser context');
		const control = await context.newPage();
		// The worker script never arrives — the failure the fallback exists for.
		await control.route('**/pptx-assemble-worker*.js', (route) => route.abort());
		await gotoStudio(control);
		await setEditorContent(control, DECK);
		await expect(railButtons(control)).toHaveCount(4);
		const bytes = mediaEntries(await exportPptx(control));
		await context.close();
		return bytes;
	});

	expect(viaWorker).toHaveLength(4);
	// The oracle only means something if the slides are distinguishable: four identical
	// images would make any permutation pass.
	expect(new Set(viaWorker).size).toBe(4);
	expect(viaWorker).toEqual(viaMainThread);
});
