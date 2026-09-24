import { expect, test } from '@playwright/test';
import { gotoStudio, livePreview, setEditorContent } from './studio-fixture';

// A ```functionplot fence draws in the Studio, and its non-ASCII text survives.
//
// Until 2026-09-24 it drew NOWHERE on the docs site: the runtime inflates the placeholder only
// when `window.functionPlot` exists, and no docs host loaded the library, so the preview showed
// an empty stage and the Read pane had no figure. The runtime now loads function-plot.js on
// demand from beside itself (lib/runtime/index.js `ensureFunctionPlot`; staged by
// docs/scripts/sync-playground-assets.mjs). The label is `x²` because the same pass fixed the
// decoder that drew it as `xÂ²` (lib/core/base64-utf8.js), and the Read pane arm checks the
// viewBox that lets the re-hosted figure scale to the column instead of clipping
// (lib/core/function-plot-viewbox.js).
const DECK = `---
theme: indaco
---

# A plot with a superscript

The next slide draws a parabola and labels its axis with a superscript two.

---

## The square

\`\`\`functionplot
{
  "data": [{ "fn": "x^2" }],
  "xAxis": { "domain": [-3, 3], "label": "x" },
  "yAxis": { "domain": [0, 9], "label": "x²" },
  "grid": true
}
\`\`\`
`;

test('a function plot draws in the Studio preview and the Read pane, with x² intact', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);

	const labels = livePreview(page).locator('.functionplot text.axis-label');
	await expect(labels).toHaveCount(2, { timeout: 30_000 });
	expect(await labels.allTextContents()).toContain('x²');

	await page.keyboard.press('ControlOrMeta+k');
	await page.keyboard.type('Read as an article');
	await page.keyboard.press('Enter');
	const article = page.locator('article.st-read-article');
	const readLabels = article.locator('text.axis-label');
	await expect(readLabels).toHaveCount(2, { timeout: 30_000 });
	expect(await readLabels.allTextContents()).toContain('x²');
	await expect(article.locator('svg.function-plot')).toHaveAttribute('viewBox', /^0 0 \d+(\.\d+)? \d+(\.\d+)?$/);
});
