import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// THE GUIDE RUNG on the real Present surface (#1397).
//
// Guide points a Vetrina cursor at the part of the slide currently being narrated. Everything
// about it that can be wrong is a coordinate or a clock, and neither survives a unit test:
// jsdom has no layout, so the cursor's position there is whatever the test stubs, and the
// "one conductor" property is about a real reader driving a real cursor. HARD RULE #23.
//
// No key and no voice are needed. The reader's cue clock runs on the silent rung exactly as it
// does on a narrated one — the same reason the beat spec can measure a hold without audio.

test.describe.configure({ timeout: 180_000 });

const CURSOR = '.vetrina-cursor';

test('Guide points the cursor INTO the slide, and stops when it is switched off', async ({ page }) => {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();

	// Off by default — a delivery flourish should not surprise a presenter.
	await expect(page.locator(CURSOR)).toHaveCount(0);

	const guide = dialog.getByRole('button', { name: /^Guide (on|off)/ });
	await guide.click();
	await expect(page.locator(CURSOR)).toHaveCount(1);

	// Drive the narration. The cursor must land ON the slide card — the whole feature is
	// pointing INSIDE an iframe from a stage that never enters one, so a cursor that stays at
	// its spawn point (screen center) means the cross-frame mapping produced nothing.
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();

	const card = dialog.locator('iframe.live');
	await expect(card).toBeVisible();
	const frame = await card.boundingBox();
	expect(frame, 'no slide frame to point into').not.toBeNull();

	// "Is the cursor inside the slide" is NOT sufficient, and getting that wrong would have made
	// this spec worthless: the cursor spawns at the center of the screen, and in Present the
	// slide card IS the center of the screen. A cursor that never moved at all would have passed.
	//
	// So the oracle is MOVEMENT ONTO TARGETS: sample where the cursor sits as cues advance, and
	// require at least two DISTINCT resting positions, each of them inside the slide frame, and
	// each away from the spawn point. A stage that resolved nothing leaves the cursor at spawn
	// forever; a stage that resolved the wrong space leaves it off the slide.
	const spawn = { x: 1440 / 2, y: 900 * 0.42 };
	const seen: { x: number; y: number }[] = [];
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline && seen.length < 2) {
		const box = await page.locator(CURSOR).boundingBox();
		if (box && frame) {
			const p = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
			const onSlide = p.x >= frame.x && p.x <= frame.x + frame.width && p.y >= frame.y && p.y <= frame.y + frame.height;
			const movedFromSpawn = Math.hypot(p.x - spawn.x, p.y - spawn.y) > 40;
			const isNew = !seen.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 24);
			if (onSlide && movedFromSpawn && isNew) seen.push(p);
		}
		await page.waitForTimeout(120);
	}
	expect(seen.length, `the Guide cursor never settled on two distinct places inside the slide (saw ${JSON.stringify(seen)}) — it either resolved no target or resolved the wrong coordinate space`).toBeGreaterThanOrEqual(2);

	// Switching Guide off tears the stage down; the real pointer is never left hidden.
	await guide.click();
	await expect(page.locator(CURSOR)).toHaveCount(0);
	await expect.poll(async () => page.evaluate(() => getComputedStyle(document.querySelector('.lx-ui.fixed.inset-0.z-\\[100\\]') as Element).cursor)).not.toBe('none');
});

const backdropCursor = (page: import('@playwright/test').Page) =>
	page.evaluate(() => getComputedStyle(document.querySelector('.lx-ui.fixed.inset-0.z-\\[100\\]') as Element).cursor);

test('the real pointer hides only over the slide, never over the dock', async ({ page }) => {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await dialog.getByRole('button', { name: /^Guide (on|off)/ }).click();
	// Playback, because the pointer is only taken away while Guide is actually AIMING at
	// something. Turning Guide on is not enough and must not be — see the next spec.
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();

	// After a few seconds of stillness the backdrop hides the pointer…
	await expect.poll(() => backdropCursor(page), { timeout: 20_000 }).toBe('none');

	// …but the dock NEVER does. You must always be able to find and click Pause; a presenter
	// hunting an invisible cursor over the transport is the failure this rule exists to prevent.
	const transport = dialog.getByRole('button', { name: /^(Pause|Play the presentation)$/ });
	expect(await transport.evaluate((el) => getComputedStyle(el).cursor)).not.toBe('none');

	// And it comes back INSTANTLY on any movement — before anything else happens.
	await page.mouse.move(400, 300);
	await expect.poll(() => backdropCursor(page), { timeout: 2_000 }).not.toBe('none');
});

// A slide narrated ENTIRELY by a speaker note says things the slide does not show, so Guide has
// nothing to point at. What it used to do then was the worst of both: return early, leaving the
// cursor parked on the previous sentence's target — a confident arrow resting on an unrelated
// line — while the real pointer stayed hidden. The viewer had one pointer, and it was lying.
//
// The two halves have to fail together: no target means the fake cursor goes away AND the real
// one comes back. That is the invariant this drives on the real surface.
test('with nothing on the slide to point at, the cursor hides and the real pointer returns', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(
		page,
		[
			'---',
			'marp: true',
			'theme: indaco',
			'---',
			'',
			'<!-- _class: statement -->',
			'',
			'## Margins expanded across every region.',
			'',
			'<!-- note: The commentary for this slide lives only in the speaker notes and appears nowhere on the slide itself. -->',
			'',
		].join('\n'),
	);

	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^Guide (on|off)/ }).click();
	await expect(page.locator(CURSOR)).toHaveCount(1);
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();

	// The narration is the note; nothing on the slide contains it. The cursor must go invisible.
	await expect
		.poll(() => page.locator(CURSOR).evaluate((el) => getComputedStyle(el).opacity), {
			timeout: 30_000,
			message: 'the Guide cursor stayed visible on a slide it could not aim at — it is parked on nothing, claiming something',
		})
		.toBe('0');

	// …and having hidden it, the real pointer may NOT be taken away. Held across the idle timer
	// that would otherwise hide it, so this cannot pass by simply being sampled too early.
	await page.waitForTimeout(5_000);
	expect(await backdropCursor(page), 'the real pointer was hidden while Guide had nothing to point at — the viewer has no pointer at all').not.toBe('none');
});
