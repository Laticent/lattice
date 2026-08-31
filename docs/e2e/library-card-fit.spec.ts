import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// A Library card's action row must FIT INSIDE ITS CARD at every width.
//
// It did not, in the docked panel, and nothing could see it. The grid was
// `grid-cols-1 sm:grid-cols-2` — a VIEWPORT breakpoint — while the docked Library is a
// ~270px column that is nearly always on a ≥640px screen. So it took two columns of
// 125px, and the four-control row overflowed its box by ~110px: Share and Delete were
// rendered, reported themselves visible, and sat behind the card's edge.
//
// This is the same shape of failure as the deck pill in `studio-header-fit.spec.ts`
// (#1417): the element engineered to absorb the pressure is the one that breaks
// silently, because every overflow oracle in the repo reads the HEADER's `scrollWidth`
// and this is a card in a panel. It is also invisible to jsdom, which has no layout —
// so a real browser measuring real boxes is the only oracle there is (HARD RULE #23).
//
// The row is measured against ITS OWN box rather than screenshotted, because a clipped
// control still paints inside a `overflow-hidden` card and a picture of it looks fine.

const KINDS = ['Probe Theme', '.quarter-callout', 'Boardroom Linen'];

async function retype(page: Parameters<typeof gotoStudio>[0], label: string, text: string) {
	await page.getByRole('textbox', { name: label }).click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type(text);
}

/** Save one of each versioned kind through the app's own Save, so all three card shapes exist. */
async function seedOneOfEach(page: Parameters<typeof gotoStudio>[0]) {
	await page.getByRole('button', { name: CHROME.workspaceLauncher }).click();
	await page.getByRole('menuitem', { name: /Fabricate/ }).click();
	await page.getByRole('textbox', { name: 'Theme name' }).fill('probe-theme');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(/Saved .*Probe Theme/)).toBeVisible();

	await page.getByRole('button', { name: 'Component', exact: true }).click();
	await page.getByRole('textbox', { name: 'Component name' }).fill('quarter-callout');
	await retype(page, 'Component skeleton', '<!-- _class: quarter-callout -->\n\n## Revenue is up 24%\n\nGrowth.');
	await retype(page, 'Component CSS', 'section.quarter-callout { display: grid; }\nsection.quarter-callout h2 { color: var(--accent); }');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(/Saved .*quarter-callout/)).toBeVisible();

	await page.getByRole('button', { name: 'Finish', exact: true }).click();
	await page.getByRole('textbox', { name: /finish name/i }).fill('Boardroom Linen');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(/Saved "Boardroom Linen"/)).toBeVisible();

	await page.getByRole('button', { name: /Back to Compose/ }).click();
}

test('@smoke every Library card action row fits its card at 1440 / 820 / 390', async ({ page }) => {
	test.slow(); // three widths, three kinds, seeded through the real Save path
	await gotoStudio(page);
	await seedOneOfEach(page);

	for (const width of [1440, 820, 390]) {
		await page.setViewportSize({ width, height: width === 1440 ? 900 : 1000 });
		// Open the Library by whichever route this tier offers — the docked rail at
		// desktop, the ⋯ menu at tablet, the drawer on a phone.
		if (width >= 1100) {
			await page.getByRole('button', { name: CHROME.library }).click();
		} else if (width >= 700) {
			await page.getByRole('button', { name: CHROME.searchOverflow, exact: true }).click();
			await page.getByRole('menuitem', { name: /^Library/ }).click();
		} else {
			await page.getByRole('button', { name: CHROME.moreControls, exact: true }).click();
			await page.getByRole('button', { name: /^Library/ }).click();
		}

		for (const kind of KINDS) {
			// Every card carries a Delete; its parent is the action row.
			const del = page.getByRole('button', { name: `Delete ${kind}` });
			await expect(del, `${kind} should have a card at ${width}px`).toBeVisible();
			const overflow = await del.evaluate((el) => {
				const row = el.parentElement;
				return row ? row.scrollWidth - row.clientWidth : -1;
			});
			expect(overflow, `${kind}'s action row overflows its card by ${overflow}px at ${width}px`).toBeLessThanOrEqual(0);
		}
		await page.keyboard.press('Escape');
	}
});
