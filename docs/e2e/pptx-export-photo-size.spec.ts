import { readFileSync } from 'node:fs';
import { expect, gotoStudio, railButtons, setEditorContent, test } from './studio-fixture';

// A slide is stored as one picture. As PNG, a photograph costs 2 to 6 MB at 2560 x 1440 and a
// 35-slide photo deck came out at 76 MB; as a q92 JPEG it is about a tenth of that. A flat
// slide (text on a color) is smaller and crisper as PNG. This drives the real Studio export
// and reads the .pptx back: the photo slide's picture must be a JPEG and small, the flat
// slide's must stay a PNG. docs/src/lib/calco/picture.ts owns the thresholds.
test.describe.configure({ timeout: 240_000 });

/** Every `ppt/media/*` entry of a zip: its name and stored size, from the central directory. */
function mediaEntries(zip: Uint8Array) {
	const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
	const out: Array<{ name: string; size: number }> = [];
	for (let i = 0; i + 46 <= zip.length; i++) {
		if (view.getUint32(i, true) !== 0x02014b50) continue;
		const size = view.getUint32(i + 24, true);
		const nameLen = view.getUint16(i + 28, true);
		const extraLen = view.getUint16(i + 30, true);
		const commentLen = view.getUint16(i + 32, true);
		const name = new TextDecoder('latin1').decode(zip.subarray(i + 46, i + 46 + nameLen));
		if (name.startsWith('ppt/media/') && !name.endsWith('/')) out.push({ name, size });
		i += 46 + nameLen + extraLen + commentLen - 1;
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

test('a photographic slide exports as a small JPEG and a flat slide stays a PNG', async ({ page }) => {
	await gotoStudio(page);
	// A photograph-like picture: smooth color plus noise, which is what makes PNG expensive.
	const photo = await page.evaluate(() => {
		const c = document.createElement('canvas');
		c.width = 1600;
		c.height = 1000;
		const ctx = c.getContext('2d') as CanvasRenderingContext2D;
		const g = ctx.createLinearGradient(0, 0, 1600, 1000);
		g.addColorStop(0, '#2b6cb0');
		g.addColorStop(1, '#c05621');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 1600, 1000);
		const img = ctx.getImageData(0, 0, 1600, 1000);
		for (let i = 0; i < img.data.length; i += 4) {
			const n = (Math.random() - 0.5) * 60;
			img.data[i] += n;
			img.data[i + 1] += n;
			img.data[i + 2] += n;
		}
		ctx.putImageData(img, 0, 0);
		return c.toDataURL('image/jpeg', 0.85);
	});
	const deck = [
		`<!-- _class: image spotlight -->\n\n## A photograph carries this slide.\n\n![bg](${photo})`,
		'<!-- _class: big-number -->\n\n`Flat`\n\n- 42\n  - plain text on a plain color.',
	].join('\n\n---\n\n');
	await setEditorContent(page, deck);
	await expect(railButtons(page)).toHaveCount(2);

	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^PowerPoint/ }).click();
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await dialog.getByRole('button', { name: /^Download PowerPoint/ }).click();
	const path = await (await download).path();
	const media = mediaEntries(new Uint8Array(readFileSync(path as string)));

	expect(media).toHaveLength(2);
	const [first, second] = media;
	expect(first.name).toMatch(/\.jpe?g$/);
	expect(second.name).toMatch(/\.png$/);
	// A 2560 x 1440 noisy photograph is several MB as PNG; the JPEG is well under 2 MB.
	expect(first.size).toBeLessThan(2_000_000);
});
