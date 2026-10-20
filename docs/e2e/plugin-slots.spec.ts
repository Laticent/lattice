import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// ── Host slots and a plugin's own stylesheet, in the real Studio (owner, 2026-10-20; HARD RULE #23) ──
//
// The demo plugin `status-card` (lib/packages/_demo-host-slots) draws `${status}`, `${title}` and `${detail}`
// slots and returns the values for them. Imported through the REAL Library, listed in a deck, approved from the
// notice above the preview and run in the real sandbox frame:
//
//   1. FILLED     the badge holds the returned word, the title the returned text, the detail a table the host
//                 rendered from returned markdown; no `${` is left on the slide
//   2. STYLED     the plugin's own `styles.css` reached the preview, scoped to its root: the badge has a fill, and a
//                 heading outside the plugin's root is untouched
//   3. THREE WIDTHS the card fits 1440, 820 and 390 px (screenshots when LATTICE_EVIDENCE_DIR is set)

test.describe.configure({ timeout: 300_000 });

const DEMO = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../lib/packages/_demo-host-slots/status-card');
const NAME = 'status-card';

async function demoZip(): Promise<Buffer> {
	const zip = new JSZip();
	for (const file of fs.readdirSync(DEMO)) zip.file(`${NAME}/${file}`, fs.readFileSync(path.join(DEMO, file)));
	return zip.generateAsync({ type: 'nodebuffer' });
}

async function importZip(page: Parameters<typeof gotoStudio>[0], buffer: Buffer) {
	const input = page.locator('input[type="file"][accept=".zip"]');
	if (!(await input.count())) {
		const docked = page.getByRole('button', { name: 'Open Library' });
		await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
	}
	await input.setInputFiles({ name: `${NAME}.zip`, mimeType: 'application/zip', buffer });
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: '1 plugin(s)' }).first()).toBeVisible();
	await page.keyboard.press('Escape');
}

const DECK = `---
plugins: [${NAME}]
---

## Outside the plugin

\`\`\`${NAME}
status: at-risk
title: Q3 launch readiness

| Workstream | Owner |
|:--|:--|
| Legal review | Dana |
| Pricing | Mei |
\`\`\`
`;

test(`a plugin's \${slots} fill from its returned values and its stylesheet reaches the preview, scoped @smoke`, async ({ page }) => {
	const evidence = process.env.LATTICE_EVIDENCE_DIR;
	const shot = async (name: string) => {
		if (evidence) await page.screenshot({ path: `${evidence}/plugin-slots-${name}.png` });
	};
	await gotoStudio(page);
	await importZip(page, await demoZip());
	const preview = livePreview(page);
	const notice = page.locator('[data-slot="code-packages"]');
	await setEditorContent(page, DECK);
	await expect(notice).toHaveAttribute('data-state', 'unapproved', { timeout: 30_000 });
	await notice.getByRole('button', { name: `Run the code of ${NAME}` }).click();

	const root = preview.locator(`[data-lattice-plugin="${NAME}"]`);
	// 1. FILLED
	await expect(root.locator('.lp-status-card-badge')).toHaveText('at-risk', { timeout: 30_000 });
	await expect(root.locator('.lp-status-card-title')).toHaveText('Q3 launch readiness');
	await expect(root.locator('.lp-status-card-detail table tbody tr')).toHaveCount(2);
	await expect(root.locator('.lp-status-card-detail th').first()).toHaveText('Workstream');
	expect(await preview.locator('section').first().innerText()).not.toContain('${');
	await expect(preview.locator(`section[data-returned-${NAME}--status="at-risk"]`)).toHaveCount(1);

	// 2. STYLED, and scoped: the badge has a fill from the plugin's sheet; a heading outside the root is not touched by it.
	const fill = await root.locator('.lp-status-card-badge').evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(fill, 'the badge carries the plugin stylesheet fill').not.toMatch(/^rgba\(0, 0, 0, 0\)$|^transparent$/);
	const bordered = await root.locator('.lp-status-card-card').evaluate((el) => getComputedStyle(el).borderTopWidth);
	expect(bordered).toBe('1px');
	const heading = await preview.locator('h2').first().evaluate((el) => getComputedStyle(el).borderTopWidth);
	expect(heading, 'a rule of the plugin sheet did not reach the author heading').toBe('0px');

	// 3. THREE WIDTHS
	for (const [width, height] of [
		[1440, 900],
		[820, 1180],
		[390, 844],
	]) {
		await page.setViewportSize({ width, height });
		await expect(root.locator('.lp-status-card-badge')).toBeVisible();
		// The preview cross-fades while the layout changes: the picture is taken once two frames in a row are identical.
		let previous = '';
		await expect
			.poll(
				async () => {
					const current = (await page.screenshot()).toString('base64');
					const same = current === previous;
					previous = current;
					return same;
				},
				{ timeout: 15_000, intervals: [300] },
			)
			.toBe(true);
		await shot(String(width));
	}
});
