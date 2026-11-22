import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, openDeckSettingsAt, openSection, persistedSource, setEditorContent, test } from './studio-fixture';

// Deck setup → Speech → Terms: ONE list over `terms:` and the `acronyms:` / `lexicon:` it absorbed
// (engineering/decisions/2026-11-16-terms-registry.md). The unit tier covers the editor in jsdom and
// the writer byte for byte; what only the real Studio can answer is whether the panel reaches the
// list at every shipped width, fits it without sideways scroll, and writes the deck through the real
// settings funnel without touching the rest of its front matter (#1257, HARD RULE #23).

const DECK = [
	'---',
	'# legal signed off on this footer',
	'theme: indaco',
	'acronyms:',
	'  CRO: chief revenue officer',
	'lexicon:',
	'  Derby: Darby',
	'---',
	'',
	'# Q4 with the CRO',
	'',
].join('\n');

/** The deck as saved: the store keeps it JSON-encoded (code-format.spec.ts reads it the same way). */
async function savedDeck(page: Page): Promise<string> {
	const raw = await persistedSource(page);
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

// Every shipped width, from the one project (the house pattern: library-image-metadata.spec.ts).
for (const width of [1440, 820, 390]) {
	test(`at ${width}px the Terms list shows both older keys, fits, and saves terms: losslessly`, async ({ page }, info) => {
		// The source editor is a separate pane at phone width, so the deck goes in at desktop width and
		// the window then narrows to the width under test.
		await page.setViewportSize({ width: 1440, height: 900 });
		await gotoStudio(page);
		await setEditorContent(page, DECK);
		await expect.poll(() => savedDeck(page)).toContain('Derby: Darby');
		await page.setViewportSize({ width, height: width === 1440 ? 900 : 1000 });
		await openDeckSettingsAt(page, width);
		await openSection(page, CHROME.deckTab.speech);

		const terms = page.getByLabel('Term', { exact: true });
		await expect(terms).toHaveCount(2);
		await expect.poll(async () => (await terms.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).sort()).toEqual(['CRO', 'Derby']);
		const row = page.getByRole('listitem').filter({ has: page.getByLabel('Hear CRO') });

		// Every control in the row sits inside it and the window, and the field a person types the
		// pronunciation into is wide enough to read (a row's own box can fit while a child spills out).
		await row.scrollIntoViewIfNeeded();
		const rowBox = await row.boundingBox();
		expect(rowBox && rowBox.x >= 0 && rowBox.x + rowBox.width <= width + 0.5, `row ${JSON.stringify(rowBox)} inside ${width}px`).toBe(true);
		for (const control of await row.locator('input, button').all()) {
			const b = await control.boundingBox();
			expect(b && rowBox && b.x >= rowBox.x - 0.5 && b.x + b.width <= rowBox.x + rowBox.width + 0.5, `control ${JSON.stringify(b)} inside row ${JSON.stringify(rowBox)}`).toBe(true);
		}
		const sayBox = await row.getByLabel('Say it as').boundingBox();
		expect(sayBox && sayBox.width >= 160, `Say it as is ${sayBox?.width}px wide`).toBe(true);
		await page.screenshot({ path: info.outputPath(`terms-${width}.png`) });

		// A pronunciation for CRO: written as one terms: block; the comment and theme stay put.
		const say = row.getByLabel('Say it as');
		await say.fill('C R O');
		await say.press('Enter');
		await expect.poll(() => savedDeck(page)).toContain('pronounce: "C R O"');
		const saved = await savedDeck(page);
		expect(saved).toContain('# legal signed off on this footer\ntheme: indaco\nterms:');
		expect(saved).toContain('expansion: "chief revenue officer"');
		expect(saved).toContain('Derby: Darby');
		expect(saved).not.toMatch(/^acronyms:|^lexicon:/m);
		expect(saved).toContain('# Q4 with the CRO');
	});
}
