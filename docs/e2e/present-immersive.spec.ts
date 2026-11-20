// Present on a phone turned sideways (2026-11-20 owner report, defect 2). Docked chrome above and below the slide left
// it a thumbnail in a 393px-tall landscape box. Now the slide fills the screen and the chrome floats over it, fading a
// few seconds after the last touch; a tap brings it back, and a tap while it shows hides it.
//
// WebKit at the iPhone 15 Pro descriptor, because the bug was reported from an iPhone and the morph keys on a
// touch-pointer media query. This is Playwright's WebKit build, not iOS Safari: the claim it supports is the layout and
// the tap rule, not Safari's own toolbar behavior.
import { expect, gotoStudio, test } from './studio-fixture';

test('@webkit-phone a sideways phone gives Present the whole screen, with chrome that fades and comes back on a tap', async ({ page }) => {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	// Turn the phone.
	await page.setViewportSize({ width: 852, height: 393 });
	const stage = dialog.locator('[data-present-immersive]');
	await expect(stage).toBeVisible();
	// The turn re-lays the deck out in steps; the stage is held back until the size is still, then shown.
	await expect(dialog).not.toHaveAttribute('data-settling', /.*/);
	await expect(dialog).toHaveCSS('opacity', '1');
	// The slide fills the screen: fit by height, less only the 12px frame above and below it that the Studio's own
	// landscape preview keeps (no docked chrome). Docked, it was under half this.
	const frame = dialog.locator('[data-slide-frame]').first();
	await expect.poll(async () => (await frame.boundingBox())?.height ?? 0).toBeGreaterThan(393 - 2 * 12 - 2);
	await page.screenshot({ path: test.info().outputPath('immersive-revealed.png') });
	// The chrome fades on its own…
	const top = dialog.locator('[data-present-chrome="top"]');
	const dock = dialog.locator('[data-present-chrome="dock"] > div').filter({ has: page.getByRole('button', { name: /Play the presentation|Pause/ }) });
	await expect(top).toHaveCSS('opacity', '0', { timeout: 8000 });
	await expect(dock).toHaveCSS('opacity', '0');
	await page.screenshot({ path: test.info().outputPath('immersive-faded.png') });
	// …a tap on the slide brings it back…
	await page.touchscreen.tap(426, 196);
	await expect(top).toHaveCSS('opacity', '1');
	await expect(dock).toHaveCSS('opacity', '1');
	// …and while it shows, the transport works (Play is reachable over the slide).
	await dock.getByRole('button', { name: 'Play the presentation' }).tap();
	await expect(dock.getByRole('button', { name: 'Pause' })).toBeVisible();
	// The captions ride ON the slide as subtitles, inside its frame, sized by the slide: the type is a fixed share of
	// the slide's width, so a bigger slide gets bigger captions (they used to float mid-slide at a fixed 18px).
	const cc = frame.locator('[data-present-cc-over] .latt-cc-band[data-shown="1"]');
	await expect(cc).toBeVisible({ timeout: 15000 });
	// …and it PLAYS: the highlight walks the words with the voice off. It used to sit on word one forever,
	// waiting on a voice that was still being prepared (read-aloud.ts, PREPARE_WAIT_MS).
	await expect.poll(() => cc.evaluate((el) => el.querySelectorAll('.latt-cc-line[data-state="now"] [data-spoken="1"]').length + el.querySelectorAll('.latt-cc-line[data-state="read"]').length), { timeout: 10000 }).toBeGreaterThan(1);
	// The band blooms open (a max-height transition); wait for it to finish, not a duration.
	await expect.poll(async () => (await cc.boundingBox())?.height ?? 0).toBeGreaterThan(40);
	// Lifted clear of the floating controls while they show.
	const dockTop = (await dialog.locator('[data-present-chrome="dock"]').boundingBox())?.y ?? 0;
	await expect.poll(async () => { const b = await cc.boundingBox(); return (b?.y ?? 0) + (b?.height ?? 0); }).toBeLessThanOrEqual(dockTop + 1);
	await page.screenshot({ path: test.info().outputPath('immersive-captions-revealed.png') });
	const ratio = async () => {
		const f = await frame.boundingBox();
		const c = await cc.boundingBox();
		const px = await cc.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
		expect(c && f && c.y >= f.y - 1 && c.y + c.height <= f.y + f.height + 1, 'the caption left the slide').toBe(true);
		return px / (f?.width ?? 1);
	};
	const small = await ratio();
	expect(small).toBeGreaterThan(0.02);
	expect(small).toBeLessThan(0.03);
	await page.setViewportSize({ width: 932, height: 430 });
	await expect.poll(ratio).toBeCloseTo(small, 3);
	// A second tap on the slide hides it again at once.
	await page.touchscreen.tap(466, 215);
	await expect(top).toHaveCSS('opacity', '0');
	await page.screenshot({ path: test.info().outputPath('immersive-captions-faded.png') });
	// Turning back to portrait restores the docked layout.
	await page.setViewportSize({ width: 393, height: 852 });
	await expect(stage).toHaveCount(0);
});
