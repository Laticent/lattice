import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// LINT READS THE SLIDES THE ENGINE CUTS (lib/authoring/lint-core.js `lintTextWith`).
//
// `split: headings` is the default, so the first `---` chunk below renders as TWO slides: the
// `_class: cards-grid` above "## Where the quarter came from" belongs to the second one only.
// Lint used to read the chunk as one cards-grid slide, so the editor underlined the plain
// slide's "EMEA" line (a `content` slide on the page) and left the real cards-grid line alone.
// This drives the real editor at both widths the Studio lays out differently.
const DECK = [
	'---',
	'theme: indaco',
	'---',
	'',
	'## Pipeline review',
	'',
	'- **EMEA.** Three late deals closed.',
	'',
	'<!-- _class: cards-grid -->',
	'',
	'## Where the quarter came from',
	'',
	'- **Renewals.** Held flat in APAC.',
	'- **New logos.** Up in EMEA.',
	'',
	'---',
	'',
	'## Closing',
	'',
	'Thanks.',
	'',
].join('\n');

for (const [width, height] of [
	[820, 1180],
	[390, 844],
] as const) {
	test.describe(`at ${width}px`, () => {
		test.use({ viewport: { width, height } });

		test('the inline-title error sits on the cards-grid slide, not the plain slide above it', async ({ page }, info) => {
			await gotoStudio(page);
			if (width < 600) await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
			await setEditorContent(page, DECK);
			const errors = page.locator('.cm-lintRange-error');
			await expect(errors.filter({ hasText: 'Renewals' }).first()).toBeVisible({ timeout: 15_000 });
			await expect(errors.filter({ hasText: 'EMEA.' })).toHaveCount(0);
			const path = info.outputPath(`lint-split-${width}.png`);
			await page.screenshot({ path });
			await info.attach(`lint-split-${width}.png`, { path, contentType: 'image/png' });
		});
	});
}
