import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// THE CHART CARD IN PRESENT, on the real Present surface (HARD RULE #23). Present mounts the same
// `ChartDetailLayer` as the Playground and the Studio preview (PINNED mode), and routes Escape
// through the layer's `handleKey` first: an Escape that closes an OPEN card is consumed, and an
// Escape with no card open falls through to leave Present. #2811 added outside-press dismissal to
// the layer; this spec pins that it did not disturb Present's Escape contract.

test.describe.configure({ timeout: 120_000 });

const DECK = [
	'---', 'marp: true', 'theme: indaco', '---', '',
	'<!-- _class: bar -->', '', '## EMEA is where the quarter was won.', '',
	'- North America `$4.1M`', '  - Flat on last year.',
	'- LATAM `$1.2M`', '  - Two new logos.',
	'- EMEA `$6.8M`', '  - Three renewals landed.', '',
].join('\n');

test('the chart card in Present closes on a press outside, and Escape closes the card before it leaves Present', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const frame = dialog.frameLocator('[aria-label="Presented slide"] iframe.live');
	const card = page.locator('[data-slot="popover-content"][data-state="open"]').filter({ hasText: 'EMEA' });
	const openCard = async () => {
		await page.mouse.move(5, 5);
		const bar = await frame.locator('rect.bar-mark[data-mark="2"]').boundingBox();
		if (!bar) throw new Error('no EMEA bar');
		await page.mouse.move(bar.x + bar.width / 2 - 30, bar.y + bar.height / 2 - 30);
		await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2, { steps: 10 });
		await expect(card).toBeVisible({ timeout: 15_000 });
	};

	// A press outside the slide closes the card and leaves Present open.
	await openCard();
	await page.mouse.click(2, 2);
	await expect(card).toBeHidden({ timeout: 5_000 });
	await expect(dialog).toBeVisible();

	// ONE Escape closes the card and nothing else: the dialog stays.
	await openCard();
	await page.keyboard.press('Escape');
	await expect(card).toBeHidden({ timeout: 5_000 });
	await expect(dialog).toBeVisible();

	// With no card open, Escape goes on to leave Present (two steps when it is fullscreen).
	await expect(async () => {
		if (await dialog.isVisible()) await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden({ timeout: 1_000 });
	}).toPass({ timeout: 15_000 });
});
