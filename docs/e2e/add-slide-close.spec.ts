import type { Page } from '@playwright/test';
import { expect, gotoStudio, openAddSlide, test } from './studio-fixture';

// THE CLOSE ENDS WITHOUT A FLASH.
//
// Add slide stays mounted between opens (ui/persistent-surface.tsx) and hides itself when its exit
// animation ends. When a CSS animation ends, the element drops the animation's end state, so the
// frame or three before the hide landed showed the dialog back at full size and opacity — and the
// phone sheet back in its open position. On an iPad it read as a TV switching off. The surface now
// holds the last frame (`animation-fill-mode: forwards`) and hides in the same frame, as Radix's
// Presence does.
//
// Sampled per animation frame from the Escape until the box is hidden. A REBOUND is any frame,
// before the hide, where the box is more opaque than the frame before it (by more than noise), or
// sits back at the identity transform after it had moved.

type Frame = { display: string; opacity: number; moved: boolean; identity: boolean };

async function closeFrames(page: Page): Promise<Frame[]> {
	return page.evaluate(
		() =>
			new Promise<Frame[]>((done) => {
				const box = document.querySelector('[data-slot="persistent-surface-box"]') as HTMLElement;
				const out: Frame[] = [];
				const t0 = performance.now();
				let moved = false;
				const tick = () => {
					const cs = getComputedStyle(box);
					const identity = cs.transform === 'none' || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(cs.transform);
					if (!identity) moved = true;
					out.push({ display: cs.display, opacity: Number(cs.opacity), moved, identity });
					if (cs.display === 'none' || performance.now() - t0 > 1500) done(out);
					else requestAnimationFrame(tick);
				};
				document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
				requestAnimationFrame(tick);
			}),
	);
}

test('@crosswidth @webkit-phone closing Add slide ends on its last animation frame, with no flash back', async ({ page }, testInfo) => {
	test.setTimeout(90_000);
	await gotoStudio(page);
	await openAddSlide(page, testInfo.project.name === 'mobile');
	// Let the open animation finish, so only the close is sampled.
	await expect
		.poll(() => page.evaluate(() => document.querySelector('[data-slot="persistent-surface-box"]')?.getAnimations().length ?? -1))
		.toBe(0);
	const frames = await closeFrames(page);
	const shown = frames.filter((f) => f.display !== 'none');
	expect(frames.at(-1)?.display, 'the gallery never hid').toBe('none');
	for (let i = 1; i < shown.length; i++) {
		expect(shown[i].opacity, `frame ${i} flashed back to opacity ${shown[i].opacity} after ${shown[i - 1].opacity}`).toBeLessThanOrEqual(shown[i - 1].opacity + 0.2);
		expect(shown[i].identity && shown[i - 1].moved, `frame ${i} snapped back to its open position before hiding`).toBe(false);
	}
});
