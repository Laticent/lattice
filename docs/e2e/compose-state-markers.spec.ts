import type { Page } from '@playwright/test';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// The six-marker cell-state picker in Compose (obligation-matrix / roadmap tables).
// engineering/decisions/2026-09-24-six-state-marks.md §10.
//
// The picker grew from four marker buttons to six, and on a narrow pane that pushed the
// slide's divider pill over the Collapse and Delete caps at the ends of its line —
// measured at 390px, the pill ran 34..356 over caps at 28..56 and 334..362, so neither cap
// could be tapped. Below a 460px pane the inline picker now moves into the table menu,
// which holds all six. Both halves are GEOMETRY and BEHAVIOR, so both are measured here
// rather than asserted from classes.

const COMPOSE = 'Compose — rich editor';

const DECK = [
	'---', 'marp: true', 'theme: indaco', '---', '',
	'<!-- _class: obligation-matrix -->', '', '## Duties by regime.', '',
	'| Regime | Notice | Export |', '| --- | :---: | :---: |',
	'| GDPR | [x] | [!] |', '| CCPA | [?] | [ ] |', '| LGPD | [-] | [/] |', '',
].join('\n');

async function openTableCell(page: Page): Promise<void> {
	await gotoStudio(page);
	// At 390px the Studio shows ONE pane: select the source editor before typing into it.
	const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true }).first();
	if (await sourceTab.isVisible().catch(() => false)) await sourceTab.click();
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	await page.locator('.cs-host td').filter({ hasText: '[?]' }).first().click();
	await page.locator('.cs-tblc').first().waitFor();
}

/** Is each slide cap the TOPMOST element at its own center — i.e. can it be tapped? */
async function capsReachable(page: Page): Promise<Record<string, boolean>> {
	return page.evaluate(() => {
		const out: Record<string, boolean> = {};
		for (const name of ['Collapse slide', 'Delete slide']) {
			const b = document.querySelector(`.cs-slide-active [aria-label="${name}"]`);
			if (!b) { out[name] = false; continue; }
			const r = b.getBoundingClientRect();
			const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
			out[name] = !!hit && (hit === b || b.contains(hit));
		}
		return out;
	});
}

test('@crosswidth a table cell\'s state picker never covers the slide caps', async ({ page }) => {
	await openTableCell(page);
	expect(await capsReachable(page)).toEqual({ 'Collapse slide': true, 'Delete slide': true });
});

test('@crosswidth the table menu offers all six markers and writes the one picked', async ({ page }) => {
	await openTableCell(page);
	await page.getByRole('button', { name: 'Table actions' }).first().click();
	for (const label of ['Yes', 'Partly', 'No', 'Unknown', 'Open', 'Does not apply']) {
		await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
	}
	await page.getByRole('menuitem', { name: 'No', exact: true }).click();
	// The caret cell held `[?]`; the menu replaces the marker at its start.
	await expect(page.locator('.cs-host td').nth(4)).toHaveText('[!]');
});
