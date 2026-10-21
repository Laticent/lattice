/**
 * The Studio's Webpage export bakes the logo wall PACKED, as the live preview shows it.
 *
 * The Studio inlines each `sample:` mark as `data:image/svg+xml;charset=utf-8,…`. The wall's shape
 * reader (lib/core/logo-wall-pack.js `svgFromDataUri`) once accepted only a bare or `;base64` data
 * URI, so every mark read as unknown and the export baked `data-logo-wall="fallback"` (equal cells).
 * Real surface: the real Share → Webpage flow, the file read back from disk.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, gotoStudio, SHARE_EXPORTS, setEditorContent, test } from './studio-fixture';

const deck = `---
marp: true
---

<!-- _class: logo-wall -->

## Four shapes, one weight.

- ![Pinnacle](sample:logo-pinnacle.svg)
- ![Keystone](sample:logo-keystone.svg)
- ![Spire](sample:logo-spire.svg)
- ![Acme](sample:logo-acme.svg)
`;

test('the Webpage export bakes the logo wall packed, not as the equal-cell grid', async ({ page }, testInfo) => {
	test.setTimeout(150_000);
	await gotoStudio(page);
	await setEditorContent(page, deck);
	await expect(page.locator('[aria-label="Live deck preview"] iframe.live').first()).toBeVisible();
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.row }).click();
	const download = page.waitForEvent('download', { timeout: 120_000 });
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.confirm }).click();
	const file = path.join(testInfo.outputDir, 'wall.html');
	await (await download).saveAs(file);
	const html = await readFile(file, 'utf8');
	const states = [...html.matchAll(/data-logo-wall="(\w+)"/g)].map((m) => m[1]);
	expect(states).toEqual(['packed']);
});
