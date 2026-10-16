import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// The Studio's live lint runs the PANE rules (lib/authoring/lint-core.js findPaneIssues). Its
// vocab (studio.astro → buildVocabSets) carries no pane data, so lint-core falls back to the
// table baked from the manifests (lib/authoring/pane-lint.generated.js). Without that fallback
// the rules returned nothing in the editor while `lint:deck` warned — the regression this pins.
// A `code` pane (code does not read side by side) and a 20-item list pane (past its budget) must
// each be underlined at their marker.
//
// The deck is on the current syntax (`<!-- _class: columns -->` + `<!-- _pane: … -->`). It was on
// the old `<!-- pane: … -->` alias until 2026-10-15; `pane-syntax` became a WARNING on 2026-10-05,
// and CodeMirror paints overlapping findings in the most severe class, so the pane-arrange
// suggestion on that marker stopped showing as `.cm-lintRange-info` and this spec went red on main.
const PANES_DECK = [
	'---',
	'theme: indaco',
	'---',
	'',
	'## Code never sits beside prose.',
	'',
	'<!-- _class: columns -->',
	'<!-- _pane: code -->',
	'',
	'```js',
	'const x = 1;',
	'```',
	'',
	'<!-- _pane: content -->',
	'',
	'A line of prose.',
	'',
	'---',
	'',
	'## Scorecard.',
	'',
	'<!-- _class: columns -->',
	'<!-- _pane: list -->',
	'',
	...Array.from({ length: 20 }, (_, i) => `- Point ${i + 1}`),
	'',
	'<!-- _pane: content -->',
	'',
	'A line of prose.',
	'',
].join('\n');

test('the editor says a panes slide will re-orient, and underlines a pane past its budget', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, PANES_DECK);
	await expect(page.locator('.cm-lintRange-info').filter({ hasText: 'pane: code' }).first()).toBeVisible({ timeout: 15_000 });
	await expect(page.locator('.cm-lintRange-warning').filter({ hasText: 'pane: list' }).first()).toBeVisible();
});
