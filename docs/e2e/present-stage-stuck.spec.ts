import { expect, gotoStudio, test } from './studio-fixture';

// A STAGE WHOSE DECK NEVER SAYS `ready` CLOSES, AND THE CONSOLE GETS ITS CAPTIONS AND RAIL BACK. The console lets go of
// the caption band and the progress rail on the Stage press, and only the Stage document's `ready` hands them to the
// Stage. A deck whose runtime dies before that handshake would leave them on neither surface for as long as the window
// stays up, so the console's Stage controller gives a deck document 20 seconds to say `ready` and then closes it
// (`onStuck`, stage-window.js). Here the console stops hearing `ready` (a capture listener swallows it before the
// controller's own), and Playwright's clock steps past the deadline instead of sleeping through it (HARD RULE #32).
test('a Stage whose deck never says ready closes, and the rail comes back to the console @crosswidth @webkit-tablet @gecko', async ({ page, context }) => {
	await page.clock.install();
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const launcher = dialog.getByRole('button', { name: 'Stage' });
	test.skip((await launcher.count()) === 0, 'the Stage is not offered below the md breakpoint');
	await expect(dialog.getByRole('group', { name: /Deck progress/ })).toBeVisible();

	// The deck's runtime "dies" before the handshake: the console never hears `ready`.
	await page.evaluate(() => {
		window.addEventListener(
			'message',
			(e) => {
				if ((e.data as { stage?: string } | null)?.stage === 'ready') e.stopImmediatePropagation();
			},
			true,
		);
	});
	const popup = context.waitForEvent('page');
	await launcher.click();
	const stage = await popup;
	// The deck document is in the window (not just "Preparing the stage…"), and the console has let go of the rail.
	await expect(stage.locator('#latt-stage')).toHaveCount(1);
	await expect(dialog.getByRole('group', { name: /Deck progress/ })).toHaveCount(0);
	await expect(launcher).toHaveAttribute('aria-pressed', 'true');

	const closed = stage.waitForEvent('close');
	await page.clock.runFor(21_000);
	await closed;
	// The notice that goes with it is a status toast that dismisses itself on its own timer, so it is checked in the
	// console's unit test (studio.present-console.test.tsx), not raced here.
	await expect(launcher).toHaveAttribute('aria-pressed', 'false');
	await expect(dialog.getByRole('group', { name: /Deck progress/ })).toBeVisible();
});
