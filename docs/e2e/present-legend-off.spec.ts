import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// The legend plugin's off switch on the real Present overlay (lib/plugins/legend/legend.docs.md,
// "Turning it off"). The kernel (lib/core/legend.js `legendOff`) and the narrator's deck plumbing are
// unit-tested; this pins the surface a presenter sees and hears. Present narrates one slide at a
// time, split from the deck, so the deck's `legend: off` reaches the narrator only through
// PresentOverlay's `chartDeck`. With it, the callout is neither drawn nor read; without it, the
// caption band would still say "Callout at …". No voice and no key: with the voice off, Present
// runs the estimate clock and still builds the caption band.
const deck = (frontMatter: string) => `---
marp: true
theme: indaco${frontMatter}
---

<!-- _class: heatmap -->

## Retention by cohort

| | M0 | M1 | M2 |
| --- | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 |
| Feb 2026 | 100 | 58 | 31 |

\`@legend{{Onboarding change, row="Feb 2026", col=M2}}\`
`;

async function present(page: import('@playwright/test').Page, source: string) {
	await gotoStudio(page);
	await setEditorContent(page, source);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const cc = dialog.getByRole('button', { name: 'Captions' });
	if ((await cc.getAttribute('aria-pressed')) !== 'true') await cc.click();
	await page.getByRole('button', { name: 'Play the presentation' }).click();
	return dialog;
}

test('with the legend on, Present draws the callout and reads it aloud', async ({ page }, testInfo) => {
	const dialog = await present(page, deck(''));
	await expect(dialog.locator('.latt-cc-track')).toContainText('Callout at Feb 2026, M2: Onboarding change', { timeout: 15000 });
	const slide = dialog.frameLocator('[aria-label="Presented slide"] iframe.live');
	await expect(slide.locator('svg .legend--anchored').first()).toBeAttached();
	await expect(slide.locator('svg text.legend-number').first()).toBeAttached();
	await page.screenshot({ path: testInfo.outputPath('present-legend-on.png') });
});

test('with `legend: off` in the front matter, Present neither draws the callout nor reads it', async ({ page }, testInfo) => {
	const dialog = await present(page, deck('\nlegend: off'));
	const band = dialog.locator('.latt-cc-track');
	// The rows are read, so the band is live; the callout sentence is not among them.
	await expect(band).toContainText('Feb 2026', { timeout: 15000 });
	await expect(band).not.toContainText('Callout');
	await expect(band).not.toContainText('Onboarding change');
	const slide = dialog.frameLocator('[aria-label="Presented slide"] iframe.live');
	await expect(slide.locator('svg.heatmap-svg').first()).toBeAttached();
	await expect(slide.locator('svg .legend--anchored')).toHaveCount(0);
	await expect(slide.locator('code', { hasText: '@legend' })).toHaveCount(0);
	await page.screenshot({ path: testInfo.outputPath('present-legend-off.png') });
});
