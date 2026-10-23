import type { Page } from '@playwright/test';
import { expect, gotoStudio, livePreview, persistedSource, setEditorContent, test, waitForStudioPaint } from './studio-fixture';

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

	// The native bullet and progress readers and the heatmap's `{> …}` description, on the real surface: the Studio's live preview,
	// where the browser runtime builds the chart in Chromium (HARD RULE #23). The jsdom tests pin the same markup.
	const SLIDES = {
		bullet: '<!-- _class: bullet -->\n\n## KPIs\n\n- Uptime `{99.4%, target=99.9%, floor=99.0%, band=[99.5%]}`\n- Latency `{180, target=200}`',
		progress: '<!-- _class: progress -->\n\n## Launch\n\n- Build `{68%, at-risk, note="Waiting on the Q4 vendor slot"}`\n- Docs `{90%, on-track}`',
		heatmap: [
			'<!-- _class: heatmap -->',
			'',
			'## Retention',
			'',
			'| Cohort | M0 | M1 `{> The onboarding change shipped here}` | `{>}` |',
			'|---|--:|--:|---|',
			'| Jan | 100 | 62 `{> dipped, then recovered}` | Launch cohort |',
			'| Feb | 100 | `{> not reached yet}` | Pilot pricing |',
		].join('\n'),
	};
	const previewText = async (page: Page, selector: string) => {
		const el = livePreview(page).locator(selector).first();
		await el.waitFor({ state: 'attached', timeout: 30_000 });
		return (await el.textContent()) ?? '';
	};

	test('@gecko @webkit-tablet a native bullet record draws its band and floor in the browser runtime', async ({ page }) => {
		await gotoStudio(page);
		await setEditorContent(page, SLIDES.bullet);
		await waitForStudioPaint(page);
		await expect.poll(() => previewText(page, '.lattice section svg desc'), { timeout: 30_000 }).toContain('on a scale from 99%');
		// Control: the chart is the bullet's, not the raw record.
		expect(await livePreview(page).locator('.lattice section').first().innerText()).not.toContain('floor=');
	});

	test('@gecko @webkit-tablet a native progress record draws its note in the browser runtime', async ({ page }) => {
		await gotoStudio(page);
		await setEditorContent(page, SLIDES.progress);
		await waitForStudioPaint(page);
		await expect.poll(() => previewText(page, '.lattice section .progress-note'), { timeout: 30_000 }).toBe('Waiting on the Q4 vendor slot');
		expect(await livePreview(page).locator('.lattice section').first().innerText()).not.toContain('note=');
	});

	test('@gecko @webkit-tablet a heatmap description on a cell, a column and a row reaches the chart in the browser runtime', async ({ page }) => {
		await gotoStudio(page);
		await setEditorContent(page, SLIDES.heatmap);
		await waitForStudioPaint(page);
		const desc = () => previewText(page, '.lattice section svg desc');
		await expect.poll(desc, { timeout: 30_000 }).toContain('Column M1: The onboarding change shipped here.');
		expect(await desc()).toContain('Row Jan: Launch cohort.');
		// The `{>}` column is no data column, and the cell notes ride the marks.
		expect(await desc()).toContain('2 rows by 2 columns');
		const details = livePreview(page).locator('.lattice section template.chart-detail');
		await expect(details).toHaveCount(2);
	});

	test('a `{> …}` description in a heatmap table stays code in Compose, and the deck is untouched', async ({ page }) => {
		await gotoStudio(page);
		await setEditorContent(page, SLIDES.heatmap);
		await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
		await page.locator('.cs-host .ProseMirror').waitFor();
		await page.locator('.cs-slide').first().waitFor();
		// Header cells are set in capitals, so compare without case.
		const text = (await page.locator('.cs-host .ProseMirror').innerText()).toLowerCase();
		for (const span of ['{> The onboarding change shipped here}', '{> dipped, then recovered}', '{> not reached yet}', '{>}']) expect(text).toContain(span.toLowerCase());
		// None of the description spans became an object.
		await expect(page.locator('.cs-npill .lat-pill')).toHaveCount(0);
		await expect.poll(() => savedDeck(page)).toBe(SLIDES.heatmap);
	});
});
