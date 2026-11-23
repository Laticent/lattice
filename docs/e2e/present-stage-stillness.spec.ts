import { layoutSettled } from './barriers';
import { watchStillness } from './stillness';
import { expect, gotoStudio, test } from './studio-fixture';

// The Stage press changes the console in the frame of the press, and nothing on it moves again on its own (flaky shape
// F10, engineering/decisions/2026-11-06-flaky-tests.md). The console turns into the presenter view (the side column, the
// talk clock), and the caption band and the rail leave for the Stage window. All of that used to wait for the Stage
// document to say `ready`, 0.9 to 1.2 s after the press, and the Next arrow then jumped 337 px (1440 wide) under a
// pointer that had moved on: a click aimed at it was lost 1 time in 20 (present-steps.spec.ts, #3439).
//
// Tagged @crosswidth so the desktop run sits beside the WebKit and Gecko ones; below the Stage launcher's `md`
// breakpoint there is no Stage to open, so the narrow widths skip.
test('the Stage press changes the console at once, and no control moves on its own afterward @crosswidth @webkit-tablet @gecko', async ({ page, context }) => {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const launcher = dialog.getByRole('button', { name: 'Stage' });
	test.skip((await launcher.count()) === 0, 'the Stage is not offered below the md breakpoint');
	await layoutSettled(page);

	const still = await watchStillness(page, '[role="dialog"][aria-label="Present"]');
	const popup = context.waitForEvent('page');
	await launcher.click();
	const stage = await popup;
	// The LAST thing a Stage does on the way up: it says `ready`, and the console renders the rail into it. A move the
	// console makes because the Stage is live has happened by the time the rail is there.
	await expect(stage.locator('#latt-rail [role="group"]')).toHaveCount(1);
	await layoutSettled(page);
	await still.stop();

	// The press did change the console, so the watcher saw it as the answer to an input, not as nothing.
	await expect(dialog.getByText(/Talk time/i)).toBeVisible();
	expect(await still.unexpected(), 'a control on the console moved on its own after the Stage press').toEqual([]);
});
