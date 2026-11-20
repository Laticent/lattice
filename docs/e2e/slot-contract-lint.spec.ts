import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// THE SLOT CONTRACT REACHES THE STUDIO (W1 and W5 of
// engineering/decisions/2026-11-19-deterministic-authoring-audit.md).
//
// The contract does not live in lint-core's bundle: it rides the lint VOCABULARY as one packed
// string (`slotContract`), which studio.astro inlines and the island unpacks. A vitest proves the
// shipped vocab fires the three rules in Node (docs/src/lib/editor-diagnostics.test.ts); this drives
// the real editor, so the page, the island and the lint worker are all on the path. Each wrong form
// gets its mark on the `_class` line, and the same slide written right gets none.
const deck = (slides: string[]) => ['---', 'theme: indaco', '---', '', slides.join('\n\n---\n\n'), ''].join('\n');

// An agenda with no `##` heading is wrong; either list marker is right (W2's list contract).
const AGENDA_NO_HEADING = '<!-- _class: agenda -->\n\n- Pipeline\n- Hiring';
const AGENDA_DASH = '<!-- _class: agenda -->\n\n## What we cover\n\n- Pipeline\n- Hiring';
const CARDS_H1 = '<!-- _class: cards-grid -->\n\n# Three outputs\n\n- Briefs\n  - one page\n- Logs\n  - every call';
const CARDS_H2 = '<!-- _class: cards-grid -->\n\n## Three outputs\n\n- Briefs\n  - one page\n- Logs\n  - every call';
const KPI_FOREIGN = '<!-- _class: kpi gallery -->\n\n## Revenue held\n\n1. 4%\n   - growth';
const KPI_OWN = '<!-- _class: kpi spotlight -->\n\n## Revenue held\n\n1. 4%\n   - growth';

test('@crosswidth @webkit-phone @gecko the slot contract marks the wrong forms in the editor, and the right forms stay clean', async ({ page }, info) => {
	await gotoStudio(page);
	const width = page.viewportSize()?.width;
	if (width !== undefined && width < 700) await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();

	await setEditorContent(page, deck([AGENDA_NO_HEADING, CARDS_H1, KPI_FOREIGN]));
	const errors = page.locator('.cm-lintRange-error');
	const warnings = page.locator('.cm-lintRange-warning');
	// slot-contract: `agenda` with no heading, and `cards-grid` under a `#` heading.
	await expect(errors.filter({ hasText: '_class: agenda' }).first()).toBeVisible({ timeout: 15_000 });
	await expect(errors.filter({ hasText: '_class: cards-grid' }).first()).toBeVisible();
	// foreign-variant: `gallery` is image's, scene's and video's, not kpi's.
	await expect(warnings.filter({ hasText: '_class: kpi gallery' }).first()).toBeVisible();
	const wrong = info.outputPath(`slot-contract-wrong-${width}.png`);
	await page.screenshot({ path: wrong });
	await info.attach(`slot-contract-wrong-${width}.png`, { path: wrong, contentType: 'image/png' });

	await setEditorContent(page, deck([AGENDA_DASH, CARDS_H2, KPI_OWN]));
	// The marks clear once the slides are written right. A count of zero needs the pass to have
	// run on the new text first: wait for the agenda mark to go, then read the rest.
	await expect(errors.filter({ hasText: '_class: agenda' })).toHaveCount(0, { timeout: 15_000 });
	await expect(errors.filter({ hasText: '_class: cards-grid' })).toHaveCount(0);
	await expect(warnings.filter({ hasText: '_class: kpi' })).toHaveCount(0);
});
