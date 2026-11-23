import type { Page } from '@playwright/test';
import { expect, gotoStudio, test } from './studio-fixture';

// THE STAGE'S BUILD FAILURES, ON THE REAL STUDIO. The console lets go of the caption band and the rail on the Stage
// press (present-stage-stillness.spec.ts), so a Stage whose deck cannot be built must hand them back, and a live Stage
// must keep the deck it has when a later rebuild fails. The failure is injected in the page: the engine's `render`
// throws while `__stageFail` is set, which fails the Stage's own build (and, while it is set, any other render). The
// build's outcome is read from `<html data-stage-build>` (PresentOverlay), never waited out with a sleep (#32).
// Below the Stage launcher's `md` breakpoint there is no Stage, so the narrow widths skip.

async function failRendersOnDemand(page: Page) {
	await expect.poll(() => page.evaluate(() => typeof (window as unknown as { LatticePlayground?: { render?: unknown } }).LatticePlayground?.render)).toBe('function');
	await page.evaluate(() => {
		const w = window as unknown as { LatticePlayground: { render: (...a: unknown[]) => unknown }; __stageFail: boolean };
		const real = w.LatticePlayground.render.bind(w.LatticePlayground);
		w.__stageFail = false;
		w.LatticePlayground.render = (...a: unknown[]) => {
			if (w.__stageFail) throw new Error('injected render failure');
			return real(...a);
		};
	});
}
const setFail = (page: Page, on: boolean) =>
	page.evaluate((v) => {
		(window as unknown as { __stageFail: boolean }).__stageFail = v;
		delete document.documentElement.dataset.stageBuild;
	}, on);
const buildOutcome = (page: Page) => page.locator('html');

async function openPresent(page: Page) {
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const launcher = dialog.getByRole('button', { name: 'Stage' });
	return { dialog, launcher };
}

test('a Stage build that failed before the press is retried on the press, and the Stage comes up @crosswidth @webkit-tablet @gecko', async ({ page, context }) => {
	await gotoStudio(page);
	await failRendersOnDemand(page);
	await setFail(page, true);
	const { dialog, launcher } = await openPresent(page);
	test.skip((await launcher.count()) === 0, 'the Stage is not offered below the md breakpoint');
	// On a laptop the Stage document is built when Present opens: that build has failed.
	await expect(buildOutcome(page)).toHaveAttribute('data-stage-build', 'failed');
	await setFail(page, false);

	const popup = context.waitForEvent('page');
	await launcher.click();
	const stage = await popup;
	// The press built it again, and the Stage went live: the rail renders INTO the Stage, not on the console.
	await expect(buildOutcome(page)).toHaveAttribute('data-stage-build', 'built');
	await expect(stage.locator('#latt-rail [role="group"]')).toHaveCount(1);
	await expect(dialog.getByRole('group', { name: /Deck progress/ })).toHaveCount(0);
	await expect(launcher).toHaveAttribute('aria-pressed', 'true');
});

test('a Stage whose build fails again on the press closes, and the rail comes back to the console @crosswidth @webkit-tablet @gecko', async ({ page, context }) => {
	await gotoStudio(page);
	await failRendersOnDemand(page);
	await setFail(page, true);
	const { dialog, launcher } = await openPresent(page);
	test.skip((await launcher.count()) === 0, 'the Stage is not offered below the md breakpoint');
	await expect(buildOutcome(page)).toHaveAttribute('data-stage-build', 'failed');
	await page.evaluate(() => delete document.documentElement.dataset.stageBuild);

	const popup = context.waitForEvent('page');
	await launcher.click();
	const stage = await popup;
	await expect(buildOutcome(page)).toHaveAttribute('data-stage-build', 'failed');
	// Polled, not awaited as an event: the retry can fail, and the window close, before a listener could be added.
	await expect.poll(() => stage.isClosed()).toBe(true);
	await expect(launcher).toHaveAttribute('aria-pressed', 'false');
	await expect(dialog.getByRole('group', { name: /Deck progress/ })).toBeVisible();
});

test('a live Stage keeps its deck when a rebuild fails while a rewrite is in flight @crosswidth @webkit-tablet @gecko', async ({ page, context }) => {
	await gotoStudio(page);
	await failRendersOnDemand(page);
	// A `ready` the console never hears, switched on once the Stage is live, so the next rewrite stays in flight
	// (`stageHost` is null). Added BEFORE the Stage opens: listeners on the window run in the order they were added, so
	// this one must come before the Stage controller's own.
	await page.evaluate(() => {
		const w = window as unknown as { __swallowReady: boolean };
		w.__swallowReady = false;
		window.addEventListener('message', (e) => {
			if (w.__swallowReady && (e.data as { stage?: string } | null)?.stage === 'ready') e.stopImmediatePropagation();
		});
	});
	const { launcher } = await openPresent(page);
	test.skip((await launcher.count()) === 0, 'the Stage is not offered below the md breakpoint');
	const popup = context.waitForEvent('page');
	await launcher.click();
	const stage = await popup;
	await expect(stage.locator('#latt-rail [role="group"]')).toHaveCount(1);
	await page.evaluate(() => ((window as unknown as { __swallowReady: boolean }).__swallowReady = true));

	// A site chrome change rebuilds the Stage document, and the Stage's chrome ink is baked from the console's accent,
	// so a new accent puts a new deck document in (a rewrite).
	const repaint = (accent: string) =>
		page.evaluate((a) => {
			document.documentElement.style.setProperty('--accent', a);
			window.dispatchEvent(new CustomEvent('lattice-chrome-change'));
		}, accent);
	await setFail(page, false);
	await repaint('rgb(20, 90, 160)');
	await expect(buildOutcome(page)).toHaveAttribute('data-stage-build', 'built');
	// The rewrite replaced the document and nothing has said `ready`, so the console has not handed the rail back in.
	await expect(stage.locator('#latt-rail [role="group"]')).toHaveCount(0);
	// …and before it says `ready`, the next rebuild fails.
	await setFail(page, true);
	await repaint('rgb(160, 40, 40)');
	await expect(buildOutcome(page)).toHaveAttribute('data-stage-build', 'failed');
	// A LATER signal before reading the keep: one more change that builds. If the failure had closed the Stage, that
	// close (and the console's re-render) is done by the time this build lands, so the reads below cannot run early.
	await setFail(page, false);
	await repaint('rgb(40, 140, 60)');
	await expect(buildOutcome(page)).toHaveAttribute('data-stage-build', 'built');
	// The Stage kept the deck it had: still open, still pressed.
	await expect(launcher).toHaveAttribute('aria-pressed', 'true');
	expect(stage.isClosed()).toBe(false);
});
