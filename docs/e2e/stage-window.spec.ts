import { expect, gotoStudio, slideCount, test } from './studio-fixture';

// ── THE STAGE — the window the ROOM looks at ─────────────────────────────────
//
// Present used to have two presenter cockpits and no audience surface: the overlay
// showed the room an Exit button, a lens picker, four staging pills, a slide counter
// and a progress rail, and the second window duplicated the presenter's role rather
// than serving the audience (2026-08-24-stage-console-split.md §1–2). Architecture C
// splits them — the overlay stays the CONSOLE, and a chrome-free Stage window carries
// the deck to the projector.
//
// These cells drive the real thing, because every claim here is about a REAL second
// window and nothing else can stand in for one (HARD RULE #23): `context.waitForEvent
// ('page')` catches the popup, and the assertions are made inside it.
//
// What makes them oracles rather than formalities is the DIRECTION of the wire. The
// Stage does not navigate — the console posts `{pv:i}` at it, one way — so "the room
// followed the presenter" is measured on the Stage's own painted slide, and "the room
// cannot drive the deck" is measured by pressing the deck keys INSIDE the Stage and
// requiring the console not to move.

/** Open Present, then the Stage, and hand back both surfaces. */
async function openStage(page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext) {
	await gotoStudio(page);
	const total = await slideCount(page);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();

	// A ≥ md affordance: the launcher is `hidden … md:inline-flex`, because a phone has no
	// second screen to stage onto. So the mobile projects SKIP here rather than pass —
	// there is no surface to drive at 390px. Keyed on the control actually being offered
	// rather than on a width, so it tracks the breakpoint.
	const launcher = dialog.getByRole('button', { name: 'Stage' });
	test.skip((await launcher.count()) === 0, 'the Stage is not offered below the md breakpoint');

	const popupPromise = context.waitForEvent('page');
	await launcher.click();
	const stage = await popupPromise;
	// The deck really lands — the holding page is replaced and the engine paints.
	await expect(stage.locator('#latt-film .lattice')).not.toBeEmpty();
	return { stage, dialog, total, launcher };
}

/** Which slide the Stage is actually SHOWING — the one section left visible by the fit. */
const shownSlide = (stage: import('@playwright/test').Page) =>
	stage.evaluate(() => {
		const secs = Array.from(document.querySelectorAll('.lattice > section'));
		return secs.findIndex((s) => (s as HTMLElement).style.visibility !== 'hidden');
	});

test('the Stage carries the deck and NONE of the presenter\'s instruments', async ({ page, context }) => {
	const { stage, total } = await openStage(page, context);

	// The audience surface: the deck, the caption host and the rail. Nothing else.
	await expect(stage.locator('#latt-rail')).toHaveCount(1);
	await expect(stage.locator('#latt-cc')).toHaveCount(1);
	// The five things §2 says the room should never have been shown.
	await expect(stage.getByRole('button', { name: 'Exit present' })).toHaveCount(0);
	await expect(stage.getByRole('button', { name: 'Slides' })).toHaveCount(0);
	await expect(stage.getByRole('button', { name: 'Rehearse' })).toHaveCount(0);
	await expect(stage.getByRole('button', { name: 'Stage' })).toHaveCount(0);
	await expect(stage.getByText(`1 / ${total}`, { exact: true })).toHaveCount(0);
	// And the talk track, which is the one thing that must never reach an audience screen.
	await expect(stage.getByText('Speaker notes')).toHaveCount(0);
});

test('the console drives the room, and the room cannot drive the console', async ({ page, context }) => {
	const { stage, dialog, total } = await openStage(page, context);
	expect(await shownSlide(stage)).toBe(0);

	// Console → Stage. Two steps, so a single stale paint cannot pass as a follow.
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();
	await expect.poll(() => shownSlide(stage)).toBe(1);
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByText(`3 / ${total}`, { exact: true })).toBeVisible();
	await expect.poll(() => shownSlide(stage)).toBe(2);

	// Stage → nothing. Every key that turns a deck anywhere else in the product is inert
	// here: the audience is not a second driver, which is the whole difference between
	// this window and the presenter window it replaced.
	for (const key of ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Space', 'End', 'Home']) {
		await stage.keyboard.press(key);
	}
	await expect(dialog.getByText(`3 / ${total}`, { exact: true })).toBeVisible();
	expect(await shownSlide(stage)).toBe(2);
});

test('the progress rail lives on whichever surface the room is watching', async ({ page, context }) => {
	// §3's rule, as an observable: the rail is audience furniture, so it follows the deck
	// to the Stage and comes back to the console when there is no Stage — and is never on
	// both at once, which is the duplication the split exists to end.
	const { stage, dialog, launcher } = await openStage(page, context);
	const consoleRail = dialog.getByRole('group', { name: /Deck progress/ });
	const stageRail = stage.locator('#latt-rail [role="group"]');

	await expect.poll(() => stageRail.count()).toBe(1);
	await expect(consoleRail).toHaveCount(0);

	// Closing the Stage hands it back, in the same press.
	await launcher.click();
	await expect(consoleRail).toHaveCount(1);
});

test('a Stage the presenter closes by hand is reported, not left driving a dead window', async ({ page, context }) => {
	const { stage, dialog, launcher } = await openStage(page, context);
	await expect(launcher).toHaveAttribute('aria-pressed', 'true');

	// The `{stage:'closed'}` unload beat, on the real window. Polling `win.closed` would
	// report this up to a poll late — mid-sentence, on the one control a presenter is
	// looking at to know whether the room can still see the deck.
	await stage.close();
	await expect(launcher).toHaveAttribute('aria-pressed', 'false');
	await expect(dialog.getByRole('group', { name: /Deck progress/ })).toHaveCount(1);
});
