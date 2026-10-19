import type { Page } from '@playwright/test';
import { expect, gotoStudio, persistedSource, setEditorContent, test } from './studio-fixture';

/**
 * COMPOSE — a chart row's `{…}` record is the chart's, not a pill.
 *
 * `{4.2}` is a valid pill, so Compose used to draw it as one object on a chart slide while the engine
 * drew a bar from it. The engine, the runtime, lint and Compose now ask one question
 * (lib/core/chart-rows.js `ownsRecordSpan`, engineering/decisions/2026-10-14-chart-authoring-uniform-model.md
 * §10): the chart's record stays the code it is, and a real pill beside it still draws. The oracle for
 * "Compose did not rewrite the deck" is the persisted source, byte for byte. `desktop` only.
 */

const COMPOSE = 'Compose — rich editor';

const DECK = [
	'<!-- _class: bar -->',
	'',
	'## Revenue by region',
	'',
	'- EMEA `{NEW, tag}` new `{4.2}`',
	'- APAC `{1.8}`',
	'- AMER `{3.5}`',
	'',
	'---',
	'',
	'<!-- _class: heatmap -->',
	'',
	'## Load by hour',
	'',
	'| | Mon | Tue |',
	'|---|---|---|',
	'| AM | `{3}` | `{5}` |',
	'| PM | `{7}` | `{2}` |',
].join('\n');

async function savedDeck(page: Page): Promise<string> {
	const raw = await persistedSource(page);
	try {
		const v = JSON.parse(raw);
		return typeof v === 'string' ? v : raw;
	} catch {
		return raw;
	}
}

test.describe('compose chart records', () => {
	test('@smoke a chart row\'s record stays code, a pill in its label still draws, and the deck is untouched', async ({ page }) => {
		await gotoStudio(page);
		await setEditorContent(page, DECK);
		await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
		await page.locator('.cs-host .ProseMirror').waitFor();
		await page.locator('.cs-slide').first().waitFor();

		// The label pill is the only object on the bar slide.
		await expect(page.locator('.cs-slide').first().locator('.cs-npill .lat-pill')).toHaveCount(1);
		const text = await page.locator('.cs-host .ProseMirror').innerText();
		for (const record of ['{4.2}', '{1.8}', '{3.5}']) expect(text).toContain(record);
		// Control: the label pill's grammar is not shown, so the pill really is drawn.
		expect(text).not.toContain('{NEW, tag}');

		// A table cell holding a record is the heatmap's too: none of the four cells became an object.
		for (const record of ['{3}', '{5}', '{7}', '{2}']) expect(text).toContain(record);
		await expect(page.locator('.cs-npill .lat-pill')).toHaveCount(1);

		// Nothing was rewritten: the saved deck is the typed deck.
		await expect.poll(() => savedDeck(page)).toBe(DECK);
	});
});
