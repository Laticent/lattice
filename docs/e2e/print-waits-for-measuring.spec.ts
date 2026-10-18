/**
 * The Studio's vector print (Share -> Print deck -> Print, 1-up) holds for a measuring collage or logo wall.
 *
 * Both components measure their pictures before they pack and are hidden while they do (lib/core/
 * measure-kit.js). The print frame calls print() on a timer, so a slow picture used to reach the dialog as a
 * hidden list: a gap on the page. PrintOptionsPanel now waits (capped) for the frame's measuring lists and
 * settles what is left. The dialog itself is browser chrome, so this records the lists' state and computed
 * visibility inside the print frame AT THE MOMENT print() is called, which is what the dialog prints.
 * Measured against main's PrintOptionsPanel with every picture delayed 3 s: collage packed/visible,
 * logo-wall measuring/hidden. With the wait: both packed/visible.
 */
import { expect, gotoStudio, railButtons, SHARE_EXPORTS, setEditorContent, test } from './studio-fixture';

test.describe.configure({ timeout: 180_000 });
const deck = `---
marp: true
theme: indaco
---

<!-- _class: collage -->

## Four photos, packed.

- ![Tall portrait](sample:photo-tall.jpg)
- ![Wide landscape](sample:photo-wide.jpg)
- ![Square](sample:photo-square.jpg)
- ![Panorama](sample:photo-pano.jpg)

---

<!-- _class: logo-wall -->

## Four shapes, one weight.

- ![Pinnacle](sample:logo-pinnacle.svg)
- ![Keystone](sample:logo-keystone.svg)
- ![Spire](sample:logo-spire.svg)
- ![Acme](sample:logo-acme.svg)
`;

test('the vector print holds for a measuring collage and logo wall: none is hidden when print() is called', async ({ page }) => {
	const delay = Number(process.env.DELAY ?? 3000);
	await page.route(/samples\/(logo|photo)-.*\.(svg|jpg)/, async (route) => {
		await new Promise((r) => setTimeout(r, delay));
		await route.continue();
	});
	// In every child frame, print() records the lists' state instead of opening the dialog.
	await page.addInitScript(() => {
		if (window.top === window) return;
		window.print = () => {
			const top = window.top as unknown as { __printLog?: unknown[] };
			top.__printLog ??= [];
			const rows = [...document.querySelectorAll('[data-collage],[data-logo-wall]')].map((el) => ({
				kind: el.hasAttribute('data-collage') ? 'collage' : 'logo-wall',
				state: el.getAttribute('data-collage') ?? el.getAttribute('data-logo-wall'),
				visibility: getComputedStyle(el).visibility,
			}));
			top.__printLog.push({ at: Math.round(performance.now()), rows });
		};
	});
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, deck);
	await expect(railButtons(page)).toHaveCount(2);
	const dialog = page.getByRole('dialog');
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await dialog.getByRole('button', { name: SHARE_EXPORTS.print.row }).click();
	await expect(dialog.getByRole('img', { name: 'Print preview slide 1' })).toBeVisible({ timeout: 60_000 });
	await dialog.getByRole('radio', { name: '1-up', exact: true }).click();
	const t0 = Date.now();
	await dialog.getByRole('button', { name: 'Print', exact: true }).click();
	await expect.poll(() => page.evaluate(() => ((window as unknown as { __printLog?: unknown[] }).__printLog ?? []).length), { timeout: 60_000 }).toBeGreaterThan(0);
	const log = await page.evaluate(() => (window as unknown as { __printLog: unknown[] }).__printLog);
	const rows = (log as { rows: { kind: string; state: string; visibility: string }[] }[]).flatMap((l) => l.rows);
	expect(rows.map((r) => r.kind).sort()).toEqual(['collage', 'logo-wall']);
	for (const r of rows) {
		expect(r.state, `${r.kind} must not be left measuring`).not.toBe('measuring');
		expect(r.visibility, `${r.kind} must be visible`).toBe('visible');
	}
	// It waited for the delayed pictures rather than printing on the pre-gate timer.
	expect(Date.now() - t0).toBeGreaterThan(delay);
});
