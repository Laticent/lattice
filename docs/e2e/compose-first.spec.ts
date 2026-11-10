import { expect, type Page, test } from '@playwright/test';
import { waitForStudioPaint } from './studio-fixture';

// COMPOSE FIRST (engineering/decisions/2026-11-10-compose-first.md). The rest of the suite stores Source
// before it opens the Studio (`gotoStudio` in studio-fixture.ts), because its editor helpers type Markdown.
// This file is the one place that opens the Studio the way a new visitor does, with nothing stored, and pins
// what that visitor gets: Compose, listed before Source, with words wherever the pane can hold them.

const COMPOSE = 'Compose — rich editor';
const SOURCE = 'Markdown source';

/** A deck with one finding the lint core fixes on its own: a card-style item written inline. */
const FIXABLE = '<!-- _class: cards-grid -->\n\n# Three things\n\n- **Speed.** It renders fast.\n- **Taste.** It looks right.\n- **Trust.** It never surprises.\n';

async function openFresh(page: Page, seed: Record<string, string> = {}): Promise<void> {
	if (Object.keys(seed).length) {
		await page.addInitScript((entries) => {
			for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
		}, seed);
	}
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await waitForStudioPaint(page);
}

/** The visible order of the two mode buttons, by their left edge (or, on a phone's bar, the same). */
async function modeOrder(page: Page): Promise<string[]> {
	const xs = await Promise.all(
		[COMPOSE, SOURCE].map(async (name) => ({ name, x: (await page.getByRole('button', { name, exact: true }).first().boundingBox())?.x ?? Number.NaN })),
	);
	return xs.sort((a, b) => a.x - b.x).map((e) => e.name);
}

test('a first visit writes in Compose, and Compose is listed before Source', async ({ page }) => {
	await openFresh(page);
	await expect(page.getByRole('button', { name: COMPOSE, exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('#studio-pane-editor .cs-host .ProseMirror')).toBeVisible();
	await expect(page.getByLabel('Deck source')).toHaveCount(0);
	expect(await modeOrder(page)).toEqual([COMPOSE, SOURCE]);
});

test('choosing Source is remembered across a reload', async ({ page }) => {
	await openFresh(page);
	await page.getByRole('button', { name: SOURCE, exact: true }).click();
	await expect(page.getByLabel('Deck source')).toBeVisible();
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForStudioPaint(page);
	await expect(page.getByRole('button', { name: SOURCE, exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByLabel('Deck source')).toBeVisible();
});

// The words go only when the pane cannot hold them: the editor pane at a tablet's 820 px is about 377 px, and
// both words fit there. Measured by the text being RENDERED, and by the header row not overflowing its box.
for (const [label, width, height] of [
	['desktop', 1440, 900],
	['tablet', 820, 1180],
] as const) {
	test(`the Compose and Source words show at ${label} width, and the header row does not overflow`, async ({ page }) => {
		await page.setViewportSize({ width, height });
		await openFresh(page);
		for (const name of [COMPOSE, SOURCE]) {
			const word = page.getByRole('button', { name, exact: true }).locator('span');
			await expect(word).toBeVisible();
		}
		const row = await page.locator('#studio-pane-editor [data-slot="edit-bar"]').evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
		expect(row.scroll, 'the editor header row overflows its pane').toBeLessThanOrEqual(row.client);
	});
}

test('Fix all works in Compose', async ({ page }) => {
	await openFresh(page, { 'lattice-studio-src-welcome': JSON.stringify(FIXABLE) });
	const fix = page.getByRole('button', { name: 'Fix all issues', exact: true });
	await expect(fix).toBeEnabled({ timeout: 20_000 });
	await fix.click();
	await expect(fix).toBeDisabled({ timeout: 20_000 });
	await page.getByRole('button', { name: SOURCE, exact: true }).click();
	await expect(page.getByLabel('Deck source')).not.toContainText('**Speed.**');
});

test('@mobile the phone bar lists Compose before Source, and Compose opens by default', async ({ page }) => {
	await openFresh(page);
	expect(await modeOrder(page)).toEqual([COMPOSE, SOURCE]);
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await expect(page.locator('#studio-pane-editor .cs-host .ProseMirror')).toBeVisible();
});
