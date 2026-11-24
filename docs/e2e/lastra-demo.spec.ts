import { expect, test } from '@playwright/test';

// The /libraries/lastra/ demo, driven in all three engines and at phone width. The page runs the real
// @laticent/lastra in the tab (src/lib/lastra-demo.ts): it reads each sample's header, decodes it in
// JavaScript, turns it upright and writes a JPEG at the long edge the reader picked. Every number below
// comes from lastra, not from the browser, so each engine must show the same ones. `data-done` on the
// body names the picture whose verdict is drawn: the signal to wait on.

test('@crosswidth @webkit-phone @webkit-tablet @gecko the demo reads, turns and re-encodes each sample the same in every engine', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/libraries/lastra/');
	const body = page.locator('body');
	const fact = (k: string) => page.locator('#facts dt', { hasText: k }).locator('xpath=following-sibling::dd[1]');

	await expect(body).toHaveAttribute('data-done', 'canoe.jpg');
	await expect(fact('Stored size')).toHaveText('1600 × 1000');
	await expect(fact('Without metadata')).toContainText('−');
	await expect(page.locator('#outsize')).toContainText('640 × 400');
	await expect(page.locator('#verdict')).toContainText('under 150 KB');
	await expect(page.locator('#out img')).toHaveCount(1);

	// Stored sideways with the turn after the frame header: lastra reports the painted size, and the
	// JPEG it writes is upright.
	await page.getByRole('button', { name: 'Turned, EXIF after the frame' }).click();
	await expect(body).toHaveAttribute('data-done', 'mug-exif-after-frame.jpg');
	await expect(fact('Stored size')).toHaveText('1000 × 1600');
	await expect(fact('Painted size')).toHaveText('1600 × 1000');
	await expect(page.locator('#outsize')).toContainText('640 × 400');
	await expect(page.locator('#verdict')).toContainText('keeps this file');

	// A longer edge re-encodes at that size; a lower quality writes fewer bytes.
	await page.locator('#edges button[data-edge="1280"]').click();
	await expect(page.locator('#outsize')).toContainText('1280 × 800');
	const bytesAt = async () => Number(/(\d+) KB/.exec((await page.locator('#outsize').textContent()) ?? '')?.[1]);
	const at90 = await bytesAt();
	await page.locator('#q').fill('30');
	await expect(page.locator('#qv')).toHaveText('30');
	await expect.poll(bytesAt).toBeLessThan(at90);

	// A PNG's eXIf turn is one not every engine applies, and lastra says so.
	await page.getByRole('button', { name: 'A turned PNG' }).click();
	await expect(body).toHaveAttribute('data-done', 'canoe-turned.png');
	await expect(fact('Every engine turns it')).toHaveText('no');

	// A file that is not a picture is refused by name, not thrown.
	await page.locator('#file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') });
	await expect(body).toHaveAttribute('data-done', 'notes.txt');
	await expect(fact('Format')).toContainText('not a picture');
	expect(errors).toEqual([]);
});
