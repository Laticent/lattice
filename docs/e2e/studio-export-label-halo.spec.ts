import path from 'node:path';
import { expect, gotoStudio, SHARE_EXPORTS, setEditorContent, test } from './studio-fixture';

// A BAKED DIAGRAM LABEL KEEPS ITS CONTRAST AFTER THE PLAYER'S DARK TOGGLE, IN THE STUDIO'S OWN EXPORT.
//
// The webpage export bakes each Mermaid diagram for the player (`bakeSvg(…, { foreignObjectLabels: 'text' })`,
// docs/src/components/studio/export/deck-export.js), which rewrites an edge label's halo as a `<rect>` filled from a
// scheme token so the toggle can recolor it. The halo used to follow the FIRST token sharing its light value; on cuoio
// that is `--pass-on-mark`, white in dark, so after the toggle the label read light ink on a white box, 1.07:1
// (lib/plugins/chart-family/shared/standalone-svg.js `HALO_SURFACE_TOKENS`). The CLI path is pinned by
// test/integration/export/html-player.test.js; this drives the Studio's copy of the bake through the real Share sheet,
// opens the file it downloads and clicks the player's real toggle.
const F = String.fromCharCode(96, 96, 96);
const DECK = [
	'---', 'theme: cuoio', '---', '',
	'<!-- _class: diagram -->', '', '## A quote passes one check', '',
	`${F}mermaid`, 'flowchart LR', '  A[Quote] --> B{Above floor?}', '  B -->|yes| C[Send]', '  B -->|no| D[Review]', F, '',
].join('\n');

test('a baked edge label keeps AA contrast after the exported player toggles to dark', async ({ page }, testInfo) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.row }).click();
	const downloadPromise = page.waitForEvent('download', { timeout: 150_000 });
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.confirm }).click();
	// A real `.html` name: `download.path()` has no extension, and file:// would not parse it as HTML.
	const file = path.join(testInfo.outputDir, 'label-halo.html');
	await (await downloadPromise).saveAs(file);

	const viewer = await page.context().newPage();
	await viewer.goto(`file://${file}`);
	const toggle = viewer.locator('#lp-mode');
	// Start from light, whatever the browser's preference, then take the reader's own path to dark.
	if ((await viewer.locator('html').getAttribute('data-lp-scheme')) === 'dark') await toggle.click();
	await expect(viewer.locator('html')).toHaveAttribute('data-lp-scheme', 'light');
	await toggle.click();
	await expect(viewer.locator('html')).toHaveAttribute('data-lp-scheme', 'dark');

	const pairs = await viewer.evaluate(() => {
		const rgb = (c: string) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
		const lum = (c: string) => {
			const v = rgb(c).map((x) => {
				const s = x / 255;
				return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
		};
		const out: { text: string; halo: string; ink: string; ratio: number }[] = [];
		for (const g of document.querySelectorAll('section[data-lattice-slide] svg g')) {
			const rect = g.querySelector(':scope > rect');
			const text = g.querySelector(':scope > text');
			if (!rect || !text || !(text.textContent || '').trim()) continue;
			const span = text.querySelector('tspan') || text;
			const halo = getComputedStyle(rect).fill;
			const ink = getComputedStyle(span).fill;
			const [a, b] = [lum(halo), lum(ink)];
			out.push({ text: (text.textContent || '').trim(), halo, ink, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) });
		}
		return out;
	});
	await viewer.close();

	// The two edge labels carry a halo; a label with no halo is not what this test reads.
	expect(pairs.map((p) => p.text).sort(), 'both edge labels were baked with a halo').toEqual(expect.arrayContaining(['no', 'yes']));
	for (const p of pairs) expect(p.ratio, `"${p.text}": ink ${p.ink} on halo ${p.halo}`).toBeGreaterThanOrEqual(4.5);
});
