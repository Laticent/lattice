import { expect, gotoStudio, test, typeDeck } from './studio-fixture';

// The editor's `spark-too-big` warning is MEASURED, not linted: the preview reports sparks too big for their space
// (docs/src/lib/spark-fit.ts), and the editor re-runs its lint pass on a new measurement (Editor.tsx, the `measuredKey`
// effect). Bringing a slide into the preview with no edit must show its warning without waiting for a keystroke. The
// effect used to call `forceLinting`, which only hurries a pass already scheduled, so an idle linter ignored it.

// Slide 1 sets a large framed spark in a table row, where it stands taller than the row's text. Slide 2 names two sizes on
// one spark, a LINTED finding: its underline is the signal that the editor's own pass for the typing has landed.
const DECK = [
	'---\ntitle: Sparks\n---\n',
	'\n## Quarter by quarter\n\n| Region | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Q7 | Q8 | Trend |\n|---|---|---|---|---|---|---|---|---|---|\n| North America | 12 | 14 | 13 | 18 | 17 | 21 | 19 | 24 | `~{1 3 2 5 4 6 3 7 2 8 5 9, lg}` |\n',
	'\n## Next steps\n\nTwo sizes: `~{1 2, sm, lg}`\n',
].join('\n---\n').replace('---\n\n---\n', '---\n\n');

test('a measured spark brought into view with no edit shows its warning', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await typeDeck(page, DECK);
	const spark = page.locator('.cm-line', { hasText: 'North America' }).locator('.cm-lintRange');
	// The caret ends on slide 2, so the preview shows slide 2 and slide 1 is not measured. Wait for the editor's pass for the
	// typing (slide 2's underline), so nothing after the caret move can be that pass arriving late.
	await expect(page.locator('.cm-line', { hasText: 'Two sizes' }).locator('.cm-lintRange')).not.toHaveCount(0, { timeout: 20_000 });
	await expect(spark).toHaveCount(0);

	// A caret move is not an edit: the preview draws slide 1, measures its spark, and only the measurement can re-lint.
	await page.locator('.cm-content').click();
	await page.keyboard.press('ControlOrMeta+Home');
	await expect(spark).toHaveCount(1, { timeout: 10_000 });
	await spark.first().hover();
	await expect(page.locator('.cm-tooltip-lint')).toContainText('spark-too-big');
});
