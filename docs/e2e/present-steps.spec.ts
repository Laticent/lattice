import { expect, gotoStudio, isPhone, railButtons, setEditorContent, test, typeDeck } from './studio-fixture';

// Steps are a behavior: one slide, walked in place
// (engineering/decisions/2026-11-09-steps-as-a-behavior.md).
//
// A `_focusSteps` slide used to be copied once per step by the parser, so the Studio counted
// N slides for one; a `_build` slide was one slide that nothing walked. Both are now ONE slide
// whose units carry their step, and Present's cursor walks them: next lights the next row,
// or reveals the next item, before it leaves the slide (S2). This drives the REAL Studio,
// because the thing under test is what the presented frame paints (HARD RULE #23).

const DECK = `---
theme: indaco
paginate: true
---

# Steps

---

<!-- _class: table -->
<!-- _focusSteps: row 1 | row 2 -->

## Two rows, walked

| Region | Q3 |
|---|---|
| North | 12 |
| South | 9 |

---

<!-- _build -->

## Built in place

- First
- Second

---

# End
`;

// Every width (@crosswidth) and both other engines: a phone's one-pane layout types the deck through `typeDeck` and
// moves with the keyboard, which every Present surface reads from the same keymap.
test('Present walks a focus walk and a build on one slide each, and the rail counts four slides @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, DECK);
	await page.getByRole('button', { name: 'Present', exact: true }).first().click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	// FOUR slides: one per authored slide. The copy made this five.
	await expect(dialog.getByText(/^\s*\d+\s*\/\s*4\s*$/).first()).toBeVisible();
	const frame = page.frameLocator('[aria-label="Presented slide"] iframe.live');
	const section = frame.locator('section').first();
	const next = () => page.keyboard.press('ArrowRight');
	const prev = () => page.keyboard.press('ArrowLeft');
	// The state the frame paints, read in one go: the step, and each unit's mark.
	const paint = () =>
		section.evaluate((s) => ({
			at: s.getAttribute('data-step-at'),
			rows: [...s.querySelectorAll('tbody tr')].map((r) => (r.classList.contains('lat-focus') ? 'F' : r.classList.contains('lat-recede') ? 'r' : '.')).join(''),
			items: [...s.querySelectorAll('li')].map((li) => (getComputedStyle(li).visibility === 'visible' ? 'v' : 'h')).join(''),
		}));

	// Home lands on the first slide, at rest.
	await page.keyboard.press('Home');
	await expect(section.locator('h1')).toHaveText('Steps');
	// Entered by next, a focus slide lands on its first step.
	await next();
	await expect.poll(paint).toEqual({ at: '1', rows: 'Fr', items: '' });
	await next();
	await expect.poll(paint).toEqual({ at: '2', rows: 'rF', items: '' });
	// Entered by next, a build lands with nothing revealed, then reveals one item a press.
	await next();
	await expect.poll(paint).toEqual({ at: '0', rows: '', items: 'hh' });
	await next();
	await expect.poll(paint).toEqual({ at: '1', rows: '', items: 'vh' });
	await next();
	await expect.poll(paint).toEqual({ at: '2', rows: '', items: 'vv' });
	await next();
	await expect(section.locator('h1')).toHaveText('End');
	// Back: the build re-enters on its last step, then steps back one item.
	await prev();
	await expect.poll(paint).toEqual({ at: '2', rows: '', items: 'vv' });
	await prev();
	await expect.poll(paint).toEqual({ at: '1', rows: '', items: 'vh' });
});

test('a jump lands a stepping slide at rest: every row even, nothing lit (S1)', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(4);
	await railButtons(page).nth(1).click();
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const section = page.frameLocator('[aria-label="Presented slide"] iframe.live').locator('section').first();
	await expect(section.locator('h2')).toHaveText('Two rows, walked');
	await expect
		.poll(() => section.evaluate((s) => ({ at: s.getAttribute('data-step-at'), lit: s.querySelectorAll('.lat-focus, .lat-recede').length })))
		.toEqual({ at: null, lit: 0 });
});

test('opening Present ON a build slide starts it hidden, so it still builds (D2)', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(4);
	await railButtons(page).nth(2).click();
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const section = page.frameLocator('[aria-label="Presented slide"] iframe.live').locator('section').first();
	await expect(section.locator('h2')).toHaveText('Built in place');
	const items = () => section.evaluate((s) => ({ at: s.getAttribute('data-step-at'), items: [...s.querySelectorAll('li')].map((li) => (getComputedStyle(li).visibility === 'visible' ? 'v' : 'h')).join('') }));
	await expect.poll(items).toEqual({ at: '0', items: 'hh' });
	await dialog.getByRole('button', { name: 'Next slide' }).click();
	await expect.poll(items).toEqual({ at: '1', items: 'vh' });
});

// Tagged @crosswidth only to keep its desktop run beside the WebKit and Gecko ones; a phone has no second screen to
// stage onto, so it skips there.
test('the Stage paints the console\'s step, and drives the steps from its own keyboard @crosswidth @webkit-tablet @gecko', async ({ page, context }) => {
	test.skip(isPhone(page), 'the Stage is not offered on a phone');
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(4);
	await railButtons(page).nth(0).click();
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const launcher = dialog.getByRole('button', { name: 'Stage' });
	test.skip((await launcher.count()) === 0, 'the Stage is not offered below the md breakpoint');
	const popup = context.waitForEvent('page');
	await launcher.click();
	const stage = await popup;
	await expect(stage.locator('#latt-film .lattice')).not.toBeEmpty();
	// The Stage's painted slide: its step, and the lit row.
	const stagePaint = () =>
		stage.evaluate(() => {
			const secs = Array.from(document.querySelectorAll<HTMLElement>('.lattice > section'));
			const i = secs.findIndex((s) => s.style.visibility !== 'hidden');
			const s = secs[i];
			return { slide: i, at: s?.getAttribute('data-step-at') ?? null, rows: s ? [...s.querySelectorAll('tbody tr')].map((r) => (r.classList.contains('lat-focus') ? 'F' : r.classList.contains('lat-recede') ? 'r' : '.')).join('') : '' };
		});
	await dialog.getByRole('button', { name: 'Next slide' }).click();
	await expect.poll(stagePaint, { timeout: 15_000 }).toEqual({ slide: 1, at: '1', rows: 'Fr' });
	// A key pressed ON the Stage moves the console's cursor, and the step comes back.
	await stage.keyboard.press('ArrowRight');
	await expect.poll(stagePaint, { timeout: 15_000 }).toEqual({ slide: 1, at: '2', rows: 'rF' });
});
