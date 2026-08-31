import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// The ⋯ overflow trigger does NOT carry one accessible name across the breakpoints, and
// the `CHROME` map in studio-fixture.ts said it did until this spec was written.
//
// Why that mattered enough to pin: at tablet the ⋯ is the ONLY route to Coach, Chat,
// Library and Reader views — the activity rail that carries them one-tap is gated on
// `desktop && craft` (StudioShell.tsx), and the phone's eight-cell bar only carries
// Coach/Chat/Settings. So a reader of the map who looks for 'Menu' at 820px finds nothing
// and concludes four panels are unreachable there. That is exactly what #1876 reported,
// and it was wrong: all four open at 700, 820, 1024 and 1099 through 'More controls'.
//
// The 2026-08-18 header pass is what split the names — it made `overflowMenu`
// (aria-label "More controls") the row's permanent right edge from 700 up, leaving the
// bare `mobile &&` button as the only 'Menu' in the tree. `studio-header-fit.spec.ts` was
// reconciled with that world; the `CHROME` map's prose was not, for twelve days.
//
// So this spec pins the SPLIT rather than either name: which trigger exists at which
// width, and that exactly one of them does. A future pass that re-unifies the names is
// welcome to — it just has to come here and say so, which is the whole point.
const TIERS = [
	{ width: 390, tier: 'mobile', present: CHROME.moreControls, absent: CHROME.searchOverflow },
	{ width: 820, tier: 'tablet', present: CHROME.searchOverflow, absent: CHROME.moreControls },
	{ width: 1440, tier: 'desktop', present: CHROME.searchOverflow, absent: CHROME.moreControls },
];

// Scoped to the Studio header, never the page: a local `astro dev` run injects its own
// dev-toolbar button named "Menu" into the accessibility tree, and the `/studio/` SSR
// skeleton ships inert triggers of its own. Same reasoning as studio-header-fit.spec.ts.
const headerOf = (page: Parameters<typeof gotoStudio>[0]) => page.locator('[data-studio-root] header');

test('@smoke the ⋯ overflow trigger is named per tier — one exists, and it is the right one', async ({ page }) => {
	await gotoStudio(page);
	const header = headerOf(page);

	for (const { width, tier, present, absent } of TIERS) {
		await page.setViewportSize({ width, height: 900 });
		// Wait on an observable consequence of the re-layout rather than a sleep.
		await expect(
			header.getByRole('button', { name: present, exact: true }),
			`${tier} (${width}px) should carry exactly one “${present}” trigger`,
		).toHaveCount(1);
		await expect(
			header.getByRole('button', { name: absent, exact: true }),
			`${tier} (${width}px) should carry no “${absent}” trigger`,
		).toHaveCount(0);
	}
});

// The reachability claim itself, at the width #1876 said was broken. This is the assertion
// that would have closed that issue on the day it was filed — and note what it does NOT
// do: enumerate `button` elements. The issue's measurement did, and a Radix
// `DropdownMenuItem` is a `role="menuitem"` div inside a CLOSED menu, so a button census
// at 820px reports 36 either way and cannot see this route at all.
test('@smoke every tool panel opens at tablet width, through the ⋯ menu', async ({ page }) => {
	await gotoStudio(page);
	await page.setViewportSize({ width: 820, height: 900 });
	const header = headerOf(page);

	for (const panel of ['Coach', 'Chat', 'Library', 'Reader views']) {
		const trigger = header.getByRole('button', { name: CHROME.searchOverflow, exact: true });
		await expect(trigger).toHaveCount(1);
		await trigger.click();
		const row = page.getByRole('menuitem', { name: new RegExp(`^${panel}`) });
		await expect(row, `“${panel}” should be a row in the tablet ⋯ menu`).toHaveCount(1);
		await row.click();
		// The panel itself arrived — its own heading, not merely the menu row that named it.
		await expect(
			page.getByRole('heading', { name: panel, exact: true }),
			`“${panel}” should open at 820px`,
		).toBeVisible();
		await page.keyboard.press('Escape');
	}
});
