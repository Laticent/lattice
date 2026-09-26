import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// The Studio's live lint runs the PANE rules (lib/authoring/lint-core.js findPaneIssues). Its
// vocab (studio.astro → buildVocabSets) carries no pane data, so lint-core falls back to the
// table baked from the manifests (lib/authoring/pane-lint.generated.js). Without that fallback
// the rules returned nothing in the editor while `lint:deck` warned — the regression this pins.
// A stacked `kpi` pane (kpi does not fit a stacked band) and a 20-item list pane (past its
// budget) must each be underlined at their marker.
const PANES_DECK = [
	'---',
	'theme: indaco',
	'---',
	'',
	'## Scorecard.',
	'',
	'<!-- panes: stack -->',
	'<!-- pane: kpi -->',
	'',
	'1. 42%',
	'   - Gross margin',
	'',
	'<!-- pane: list -->',
	'',
	...Array.from({ length: 20 }, (_, i) => `- Point ${i + 1}`),
	'',
].join('\n');

test('the editor underlines a pane that does not fit and a pane past its budget', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, PANES_DECK);
	await expect(page.locator('.cm-lintRange-warning').filter({ hasText: 'pane: kpi' }).first()).toBeVisible({ timeout: 15_000 });
	await expect(page.locator('.cm-lintRange-warning').filter({ hasText: 'pane: list' }).first()).toBeVisible();
});
