import { expect, gotoStudio, test, typeDeck } from './studio-fixture';

// What Present keeps drawn, held on real engines. On a 4K deck WebKit sizes a frame's compositing layers by the frame's
// own box (3840x2160) times the screen's pixel density, not by its shrunk on-screen size, so an iPhone at 3x paid about
// 300 MB per layer and Present reloaded the tab (owner, 2026-11-20). Two rules keep that bounded:
//   1. while Present is open the editor's preview is `display: none`, so only Present's frame is drawn;
//   2. no slide frame is itself animated: the reveal fades the frame's display-sized slot (`.lat-frame-slot`), and the
//      frame's own opacity is set in one step (single-slide-render.ts `frameSlot`, `fadeInSlot`).
//   3. Guide's dims never transition opacity: the Guide steps it as inline style (present-guide.ts `crossfadeOpacity`),
//      so nothing inside the slide runs a compositor animation while it plays.
// Measured in WebKit at 3x with rules 1 and 2: Present's opening peak fell from 1,445-1,756 MB to 957-1,015 MB.
const deck = `---
marp: true
theme: indaco
size: 4k
---

## The editor's frame steps aside

- Present draws one slide frame
- The Guide dims the rest
- Without a single animation in the slide

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

// `delivery: expressive`, so every block the narration names is focused and its peers recede: under the default
// `restrained` the salience budget can leave plain bullets unfocused (present-guide.spec.ts says the same).
const guided = deck.replace('size: 4k\n', 'size: 4k\ndelivery: expressive\n');

// Not on `webkit-phone`: there, Playwright's WebKit with Voice off never moves Present past its first cue, with or without
// Guide, and the same with #3304's docs/src changes reverted to the merge base (2026-11-20), so no dim is ever reached.
// WebKit itself is covered by `webkit-tablet`, and the iOS Simulator's real WebKit advanced Present with Voice off.
test('Guide dims the slide with no animation inside the frame @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, guided);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const presented = dialog.locator('[aria-label="Presented slide"] iframe.live');
	await expect(presented).toHaveCSS('opacity', '1', { timeout: 20000 });
	// Present opens on the editor caret's slide, the last one after typing; the first has the bullets to recede.
	await page.keyboard.press('Home');
	await expect(dialog).toContainText(/1\s*\/\s*2/);
	// As present-delivery.spec.ts does: Guide on, and its stage (the cursor) built, before Play.
	await dialog.getByRole('button', { name: /^Guide (on|off)/ }).click();
	await expect(page.locator('.vetrina-cursor')).toHaveCount(1);
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();
	// The Guide is working: something in the slide has receded. Voice is off, so Present runs its estimate clock.
	const slide = dialog.frameLocator('[aria-label="Presented slide"] iframe.live');
	await expect(slide.locator('.lat-guide-dim').first()).toBeAttached({ timeout: 30_000 });
	// Read the frame repeatedly through a few beats: never an animation, never an opacity transition, and the dims land.
	let sawDimLevel = false;
	for (let i = 0; i < 12; i++) {
		const s = await presented.evaluate((fr) => {
			const d = (fr as HTMLIFrameElement).contentDocument as Document;
			const dims = [...d.querySelectorAll('.lat-guide-dim, .lat-guide-dim-inner, .lat-guide-undim')];
			const opacityTransition = dims.some((e) => {
				const cs = getComputedStyle(e);
				return cs.transitionProperty.split(',').some((p, k) => /opacity|all/.test(p) && Number.parseFloat(cs.transitionDuration.split(',')[k] ?? '0') > 0);
			});
			const landed = [...d.querySelectorAll('.lat-guide-dim')].some((e) => Number(getComputedStyle(e).opacity) < 0.95);
			// Only what WebKit runs on the compositor counts: opacity, transform and filter transitions, and any CSS or
			// script animation. A color or background transition repaints and needs no layer, so the dims keep theirs.
			const animations = d.getAnimations().filter((a) => !/^(color|background-color)$/.test((a as CSSTransition).transitionProperty ?? '')).map((a) => {
				const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
				const what = (a as CSSTransition).transitionProperty ?? (a as CSSAnimation).animationName ?? 'script';
				return `${what} on ${t ? `${t.tagName.toLowerCase()}.${[...t.classList].join('.')}` : '?'}`;
			});
			return { animations, opacityTransition, landed };
		});
		expect(s.animations, 'no compositor animation runs inside the slide frame').toEqual([]);
		expect(s.opacityTransition, 'no dim transitions its opacity').toBe(false);
		sawDimLevel ||= s.landed;
		await presented.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
	}
	expect(sawDimLevel, 'the receded parts reach their dim level').toBe(true);
});
