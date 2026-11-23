import { expect, gotoStudio, test } from './studio-fixture';

// A STAGE WHOSE DECK HAS NOT SAID `ready` GIVES THE CONSOLE ITS CAPTIONS AND RAIL BACK. The console lets go of the
// caption band and the progress rail on the Stage press, and only the Stage document's `ready` hands them to the Stage.
// A deck whose runtime died before that handshake (or that is still loading) would leave them on neither surface, so
// the Stage controller gives a deck document 20 seconds to say `ready` (`onStuck`, stage-window.js) and the console
// then shows them again, keeping the window open: a late `ready` still hands them over (#3307's player watch keeps a
// slow Stage the same way). Here the console stops hearing `ready` (a capture listener swallows it before the
// controller's own), and Playwright's clock steps past the deadline instead of sleeping through it (HARD RULE #32).
test('a Stage whose deck has not said ready gives the rail back to the console @crosswidth @webkit-tablet @gecko', async ({ page, context }) => {
	await page.clock.install();
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const launcher = dialog.getByRole('button', { name: 'Stage' });
	test.skip((await launcher.count()) === 0, 'the Stage is not offered below the md breakpoint');
	const rail = dialog.getByRole('group', { name: /Deck progress/ });
	await expect(rail).toBeVisible();

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
	await expect(rail).toHaveCount(0);
	await expect(launcher).toHaveAttribute('aria-pressed', 'true');

	await page.clock.runFor(21_000);
	// The rail is back on the console, and the Stage is still open and still pressed: a late `ready` could still land.
	// The notice that goes with it is a status toast on its own timer, so the console's unit test checks its words.
	await expect(rail).toBeVisible();
	await expect(launcher).toHaveAttribute('aria-pressed', 'true');
	expect(stage.isClosed()).toBe(false);
});
