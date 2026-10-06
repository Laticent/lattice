import type { Page } from '@playwright/test';
import { expect, gotoStudio, persistedSource, setEditorContent, test } from './studio-fixture';

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

// The editor reads a cell's marker through the engine's list-text grammar
// (lib/core/cell-marker-edit.mjs; the Segno phase-3 follow-up), in three places: the badge on
// each marker cell, the length the picker replaces, and the serializer un-escaping `\[!\]`.
test('every marker cell is badged, a pick keeps the cell\'s words, and the source keeps all six', async ({ page }) => {
	await openTableCell(page);
	const badges = page.locator('.cs-host td .cs-cellmark');
	await expect(badges).toHaveCount(6);
	const sems = await badges.evaluateAll((els) => els.map((e) => [...e.classList].find((c) => c.startsWith('cs-cellmark-'))));
	expect(sems.sort()).toEqual(['fail', 'pass', 'skip', 'todo', 'unknown', 'warn'].map((s) => `cs-cellmark-${s}`));

	// A marker followed by words: the pick replaces the marker and ONE space, never the words.
	await page.locator('.cs-host td').nth(1).click(); // GDPR · Notice, `[x]`
	await page.keyboard.press('End');
	await page.keyboard.type(' Signal taxonomy');
	await page.getByRole('button', { name: 'Table actions' }).first().click();
	await page.getByRole('menuitem', { name: 'Unknown', exact: true }).click();
	await expect(page.locator('.cs-host td').nth(1)).toHaveText('[?] Signal taxonomy');

	// The serializer escapes a leading `[!]` and the editor restores it: the source holds every
	// marker as typed, none as `\[…\]`.
	await expect.poll(() => persistedSource(page)).toContain('| GDPR | [?] Signal taxonomy | [!] |');
	const source = await persistedSource(page);
	for (const row of ['| CCPA | [?] | [ ] |', '| LGPD | [-] | [/] |']) expect(source).toContain(row);
	expect(source).not.toMatch(/\\\[/);
});
