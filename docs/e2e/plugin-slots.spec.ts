import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { pictureStill } from './barriers';
import { expect, gotoStudio, LIVE_PREVIEW, livePreview, setEditorContent, shareExport, test, toastText } from './studio-fixture';

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
//   3. SHARE → PDF the export draws the same deck through the same door and downloads a PDF
//   4. THREE WIDTHS the card fits 1440, 820 and 390 px (screenshots when LATTICE_EVIDENCE_DIR is set)
//   5. RELOAD     with the plugin approved, no frame of the new page paints the badge's words without its fill (#3292)

test.describe.configure({ timeout: 300_000 });

const DEMO = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../lib/packages/_demo-host-slots/status-card');
const NAME = 'status-card';

async function demoZip(): Promise<Buffer> {
	const zip = new JSZip();
	for (const file of fs.readdirSync(DEMO)) zip.file(`${NAME}/${file}`, fs.readFileSync(path.join(DEMO, file)));
	return zip.generateAsync({ type: 'nodebuffer' });
}

async function importZip(page: Parameters<typeof gotoStudio>[0], buffer: Buffer) {
	const input = page.locator('[data-testid="library-import-input"]');
	// The Library button toggles, and the panel may be open from an earlier visit or still mounting. Look, click only when the input is absent,
	// then wait for it; a click that landed on a Library that was just opening closes it, so look again and click again (up to three tries).
	for (let attempt = 0; attempt < 3; attempt++) {
		if (await input.count()) break;
		const docked = page.getByRole('button', { name: 'Open Library' });
		await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
		if (await input.waitFor({ state: 'attached', timeout: 6000 }).then(() => true, () => false)) break;
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

type BadgeWatch = { __badgeWatch: { bare: string[]; filled: number; done: boolean } };

/**
 * Watch every painted frame (#3292): a `requestAnimationFrame` loop in the Studio page reads the live preview frame (a
 * same-origin srcdoc, so the parent can read it on every engine; an init script does not reach it in Chromium) and
 * records each frame where the badge shows its text with no fill. It stops after 60 filled frames in a row. Installed
 * before Approve (`page.evaluate`) and before a reload (`page.addInitScript`, the top page only).
 * Before the fix, after Approve it saw the bare frame in 2 of 40 Chromium and 3 of 40 WebKit runs under 4 workers;
 * after a reload with the plugin approved, in 3 of 6 Chromium and 3 of 8 Gecko runs. With it, 0 of 120 for each.
 */
function installBadgeWatch({ sel, name }: { sel: string; name: string }) {
	if (window.top !== window) return;
	const w = { bare: [] as string[], filled: 0, done: false };
	(window as unknown as BadgeWatch).__badgeWatch = w;
	let frame = 0;
	const tick = () => {
		frame++;
		for (const f of document.querySelectorAll<HTMLIFrameElement>(sel)) {
			const badge = f.contentDocument?.querySelector(`[data-lattice-plugin="${name}"] .lp-status-card-badge`);
			if (!badge || badge.textContent?.trim() !== 'at-risk' || !badge.getClientRects().length) continue;
			const fill = f.contentWindow?.getComputedStyle(badge).backgroundColor ?? '';
			if (/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(fill)) {
				w.bare.push(`frame ${frame}: ${fill}`);
				w.filled = 0;
			} else w.filled++;
		}
		if (w.filled >= 60) w.done = true;
		else requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}

/** The watcher's verdict: wait for its 60 filled frames, then no frame may have painted the text without the fill. */
async function expectNoBareFrame(page: Parameters<typeof gotoStudio>[0], when: string) {
	await expect.poll(() => page.evaluate(() => (window as unknown as BadgeWatch).__badgeWatch?.done ?? false), { timeout: 60_000 }).toBe(true);
	const watch = await page.evaluate(() => (window as unknown as BadgeWatch).__badgeWatch);
	expect(watch.bare, `no frame painted the badge text without the plugin fill ${when}`).toEqual([]);
}

// All three engines, as plugin-fence.spec.ts runs them: `@gecko` runs on the desktop (Chromium) project and the gecko one;
// the `@webkit-tablet` twin runs on WebKit (the desktop project skips a title naming @webkit).
for (const tag of [' @gecko', ' @webkit-tablet']) {
	test(`a plugin's \${slots} fill from its returned values and its stylesheet reaches the preview and the PDF, scoped @smoke${tag}`, async ({ page, browserName }) => {
		const evidence = process.env.LATTICE_EVIDENCE_DIR;
		const shot = async (name: string) => {
			if (evidence) await page.screenshot({ path: `${evidence}/plugin-slots-${name}-${browserName}.png` });
		};
		await gotoStudio(page);
		await importZip(page, await demoZip());
		const preview = livePreview(page);
		const notice = page.locator('[data-slot="code-packages"]');
		await setEditorContent(page, DECK);
		await expect(notice).toHaveAttribute('data-state', 'unapproved', { timeout: 30_000 });
		await page.evaluate(installBadgeWatch, { sel: LIVE_PREVIEW, name: NAME });
		await notice.getByRole('button', { name: `Approve the code of ${NAME}` }).click();

		const root = preview.locator(`[data-lattice-plugin="${NAME}"]`);
		// 1. FILLED
		await expect(root.locator('.lp-status-card-badge')).toHaveText('at-risk', { timeout: 30_000 });
		await expect(root.locator('.lp-status-card-title')).toHaveText('Q3 launch readiness');
		await expect(root.locator('.lp-status-card-detail table tbody tr')).toHaveCount(2);
		await expect(root.locator('.lp-status-card-detail th').first()).toHaveText('Workstream');
		expect(await preview.locator('section').first().innerText()).not.toContain('${');
		await expect(preview.locator(`section[data-returned-${NAME}--status="at-risk"]`)).toHaveCount(1);

		// 2. STYLED, and scoped: the badge has a fill from the plugin's sheet; a heading outside the root is not touched by it.
		// Never polled, on purpose: the badge's text and the plugin's sheet come from the same render (code-packages/door.ts
		// `approvalsInStamp`, #3292), so the first frame with the text has the fill. A transparent read, here or on any frame
		// `installBadgeWatch` saw, is that promise broken, which CI caught once before the fix (run 44098310773), not a race to wait out.
		const fill = await root.locator('.lp-status-card-badge').evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(fill, 'the badge carries the plugin stylesheet fill').not.toMatch(/^rgba\(0, 0, 0, 0\)$|^transparent$/);
		// And every frame before this read: the watcher saw the badge's text on 60 frames in a row with its fill, and never without it.
		await expectNoBareFrame(page, 'after Approve');
		const bordered = await root.locator('.lp-status-card-card').evaluate((el) => getComputedStyle(el).borderTopWidth);
		expect(bordered).toBe('1px');
		const heading = await preview.locator('h2').first().evaluate((el) => getComputedStyle(el).borderTopWidth);
		expect(heading, 'a rule of the plugin sheet did not reach the author heading').toBe('0px');

		// 3. SHARE → PDF: the export renders the same deck through the same door and downloads.
		await page.getByRole('button', { name: 'Share', exact: true }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		const download = page.waitForEvent('download', { timeout: 90_000 });
		await shareExport(page, 'pdf');
		const d = await download;
		expect(d.suggestedFilename()).toMatch(/\.pdf$/);
		await expect(toastText(page)).toContainText(/PDF ready( \([^)]+\))?\./);
		const pdfPath = (await d.path()) as string;
		expect(fs.statSync(pdfPath).size).toBeGreaterThan(1000);
		if (evidence) fs.copyFileSync(pdfPath, `${evidence}/plugin-slots-share-${browserName}.pdf`);
		await page.keyboard.press('Escape');

		// 4. THREE WIDTHS
		for (const [width, height] of [
			[1440, 900],
			[820, 1180],
			[390, 844],
		]) {
			await page.setViewportSize({ width, height });
			await expect(root.locator('.lp-status-card-badge')).toBeVisible();
			// The preview cross-fades while the layout changes: the picture is taken once two shots in a row are identical.
			await pictureStill(page);
			await shot(String(width));
		}

		// 5. RELOAD, the plugin approved in the session before: from the first frame of the new page, the badge never shows
		// its words without its fill. A render can begin before the Studio's stamp holds the plugins (door.ts `withPlugins`).
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.addInitScript(installBadgeWatch, { sel: LIVE_PREVIEW, name: NAME });
		await page.reload();
		await expectNoBareFrame(page, 'after a reload');
	});
}
