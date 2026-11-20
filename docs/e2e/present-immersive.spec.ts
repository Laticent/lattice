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
	// The slide fills the screen: fit by height, so its height is the viewport's (less nothing — no docked chrome).
	const frame = dialog.locator('[data-slide-frame]').first();
	await expect.poll(async () => (await frame.boundingBox())?.height ?? 0).toBeGreaterThan(393 * 0.95);
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
	// A second tap on the slide hides it again at once.
	await page.touchscreen.tap(426, 196);
	await expect(top).toHaveCSS('opacity', '0');
	// Turning back to portrait restores the docked layout.
	await page.setViewportSize({ width: 393, height: 852 });
	await expect(stage).toHaveCount(0);
});
