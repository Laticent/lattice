import fs from 'node:fs';
import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, openDeckSettingsAt, openSection, test } from './studio-fixture';

// NO SETTINGS SECTION SCROLLS SIDEWAYS, IN EITHER SCOPE, AT ANY SHIPPED WIDTH (#2203).
//
// The deck panel's General section scrolled sideways by 13–28px: the Language trigger's one-line label ("Auto — English
// (United States)") set a 258px floor inside a 231px control column, and `min-w-0` on the column cannot pull a child under
// its own `min-width: auto`. Nobody saw it because the panel opens on Look, and every spec tested the section it opened on.
// So this one walks every section the strip offers, deck and slide, at 1440 / 820 / 390, and reads the scroller's
// `scrollWidth - clientWidth` in each.
//
// It also writes every settings row's box to `rows.json` in the test output, which is how the fix was shown to move no
// row but the one it was for: run it before and after, and diff the two files.

const WIDTHS = [
	{ width: 1440, height: 900 },
	{ width: 820, height: 1180 },
	{ width: 390, height: 844 },
];

/** The sections the strip offers right now: the chevron's menu holds the whole list. */
async function sectionNames(page: Page): Promise<string[]> {
	await page.getByRole('button', { name: CHROME.settings.allSections }).click();
	const names = await page.getByRole('menuitem').allInnerTexts();
	await page.keyboard.press('Escape');
	return names.map((n) => n.trim()).filter(Boolean);
}

/** Sideways overflow of the open settings body and every scrolling box above it, plus each row's box. */
function measure(page: Page) {
	return page.evaluate(() => {
		const scopes = [...document.querySelectorAll<HTMLElement>('[class*="@container/settings"]')].filter((el) => el.getClientRects().length > 0);
		let over = 0;
		for (const scope of scopes) {
			for (let el: HTMLElement | null = scope, i = 0; el && i < 8; el = el.parentElement, i++) {
				const cs = getComputedStyle(el);
				if (el === scope || /auto|scroll/.test(cs.overflowX) || /auto|scroll/.test(cs.overflowY)) over = Math.max(over, el.scrollWidth - el.clientWidth);
			}
		}
		const rows = scopes.flatMap((scope) =>
			[...scope.querySelectorAll<HTMLElement>('[class*="@max-[320px]/settings:flex-col"]')]
				.filter((r) => r.getClientRects().length > 0)
				.map((r) => {
					const b = r.getBoundingClientRect();
					const kids = [...r.children].map((c) => {
						const k = c.getBoundingClientRect();
						return [Math.round(k.width), Math.round(k.height)];
					});
					return { text: (r.textContent ?? '').trim().slice(0, 48), w: Math.round(b.width), h: Math.round(b.height), kids };
				}),
		);
		return { over, rows };
	});
}

test('@crosswidth @webkit-tablet @gecko every settings section fits its panel at 1440, 820 and 390', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name === 'mobile', 'the test walks all three widths itself; the desktop project runs it');
	test.setTimeout(240_000);
	const record: Record<string, unknown> = {};
	for (const vp of WIDTHS) {
		await page.setViewportSize(vp);
		await gotoStudio(page);
		await openDeckSettingsAt(page, vp.width);
		for (const scope of ['deck', 'slide'] as const) {
			if (scope === 'slide') {
				const inPanel = page.getByRole('button', { name: 'Slide scope', pressed: false });
				if (await inPanel.count()) await inPanel.first().click();
				else await page.getByRole('button', { name: CHROME.slideSettings }).first().click();
			}
			const names = await sectionNames(page);
			expect(names.length).toBeGreaterThan(3);
			for (const name of names) {
				await openSection(page, name);
				// The strip always shows the active section's pill, so a selected pill means the switch landed.
				await expect(page.locator('[role="tablist"]:not([aria-label="Library sections"])').getByRole('tab', { name, exact: true, selected: true }).first()).toBeVisible();
				const m = await measure(page);
				record[`${vp.width}/${scope}/${name}`] = m.rows;
				expect.soft(m.over, `${scope} › ${name} scrolls sideways at ${vp.width}px`).toBeLessThanOrEqual(0);
			}
		}
	}
	fs.writeFileSync(testInfo.outputPath('rows.json'), JSON.stringify(record, null, 1));
});
