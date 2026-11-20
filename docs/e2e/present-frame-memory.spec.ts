import { expect, gotoStudio, test, typeDeck } from './studio-fixture';

// What Present keeps drawn, held on real engines. On a 4K deck WebKit sizes a frame's compositing layers by the frame's
// own box (3840x2160) times the screen's pixel density, not by its shrunk on-screen size, so an iPhone at 3x paid about
// 300 MB per layer and Present reloaded the tab (owner, 2026-11-20). Two rules keep that bounded:
//   1. while Present is open the editor's preview is `display: none`, so only Present's frame is drawn;
//   2. no slide frame is itself animated: the reveal fades the frame's display-sized slot (`.lat-frame-slot`), and the
//      frame's own opacity is set in one step (single-slide-render.ts `frameSlot`, `fadeInSlot`).
// Measured in WebKit at 3x with the two rules: Present's opening peak fell from 1,445-1,756 MB to 957-1,015 MB.
const deck = `---
marp: true
theme: indaco
size: 4k
---

## The editor's frame steps aside

- Present draws one slide frame

---

## A second slide

- So the deck has somewhere to go
`;

test('Present draws one slide frame, and no slide frame is animated @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, deck);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const presented = dialog.locator('[aria-label="Presented slide"] iframe.live');
	await expect(presented).toHaveCSS('opacity', '1', { timeout: 20000 });

	// 1. The editor's preview is not drawn under Present.
	await expect(page.locator('figure[aria-label="Live deck preview"]')).toHaveCSS('display', 'none');

	// 2. The frame sits in its display-sized slot, carries no transition of its own, and runs no animation.
	const frame = await presented.evaluate((fr) => ({
		slot: fr.parentElement?.className ?? '',
		transition: getComputedStyle(fr).transitionProperty,
		duration: getComputedStyle(fr).transitionDuration,
		running: fr.getAnimations().length,
	}));
	expect(frame.slot).toBe('lat-frame-slot');
	expect(frame.duration.split(',').every((d) => Number.parseFloat(d) === 0), `the frame transitions ${frame.transition} over ${frame.duration}`).toBe(true);
	expect(frame.running).toBe(0);

	// Leaving Present gives the editor its preview back.
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(page.locator('figure[aria-label="Live deck preview"]')).not.toHaveCSS('display', 'none');
});
