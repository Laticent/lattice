import fs from 'node:fs';
import path from 'node:path';
import { expect, gotoStudio, railButtons, setEditorContent, test, toastText } from '../studio-fixture';

// Journey: chart deck → PDF. Stylesheet-styled chart SVGs (radar, donut) are the
// export rasterizer's blind spot: html-to-image inlines computed styles onto
// HTMLElements ONLY, so a nested SVGElement clone keeps just classes — fills
// fell to SVG-default black and the CSS-sized root rescaled (the black-pentagon
// PDFs found on-device, jargon-gallery export). flattenChartSvgs bakes computed
// paint/text inline in the capture frame before rasterization; this journey
// pins BOTH the outcome (a real download) and the mechanism (the capture
// frame's chart polygon carries a baked non-black inline fill).
test.describe.configure({ timeout: 120_000 });

// The committed capture-sensitive coverage fixture (chart SVGs, Mermaid, ribbon
// chrome, dark bookend) — the SAME deck engineering/visual-review.md tells a
// human to eyeball through the real Share sheet on any export-pipeline change.
const FIXTURE = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'test', 'fixtures', 'export-coverage-deck.md');
const DECK = fs.readFileSync(FIXTURE, 'utf8');
const SLIDES = (DECK.match(/<!-- _class:/g) || []).length; // every fixture slide declares a class

test('a chart deck exports to PDF with styled (non-black) chart SVGs', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(SLIDES);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();

	// Probe the throwaway capture frame while the export runs. Discriminators
	// chosen to flip on the real regression (verified against the pre-fix
	// build): (a) flattened chart <text> carries a baked inline font-size —
	// unflattened text has none (its size lived in the stylesheet, which the
	// html-to-image clone drops); (b) no gradient <stop> may still carry a raw
	// var() in its inline stop-color — flatten resolves them to literal rgb.
	const flattenProbe = page.waitForFunction(() => {
		const f = document.querySelector('[data-lattice-export="capture"] iframe') as HTMLIFrameElement | null;
		const d = f?.contentDocument;
		const charts = d ? Array.from(d.querySelectorAll('section .radar-figure svg, section.piechart svg, section .chart-frame svg')) : [];
		const texts = charts.flatMap((c) => Array.from(c.querySelectorAll('text')));
		if (!texts.length) return null; // capture frame not up yet — keep polling
		const sizedTexts = texts.filter((t) => (t as SVGElement).style?.fontSize);
		const rawVarStops = charts.flatMap((c) => Array.from(c.querySelectorAll('stop')))
			.filter((st) => /var\(/.test((st as SVGElement).getAttribute('style') || ''));
		// Truthy ONLY once fully flattened — the probe may fire between frame
		// load and flattenChartSvgs, so an intermediate state keeps polling. On
		// regression (flatten never runs) this times out, failing the test.
		if (sizedTexts.length !== texts.length || rawVarStops.length) return null;
		return `sizedText=${sizedTexts.length}/${texts.length} rawVarStops=0`;
	}, { timeout: 60_000 });

	const download = page.waitForEvent('download', { timeout: 60_000 });
	await page.getByRole('dialog').getByRole('button', { name: /^PDF/ }).click();
	await flattenProbe; // resolves only when the capture frame's charts are baked
	expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
	await expect(toastText(page)).toContainText('PDF ready.');
});
