import http from 'node:http';
import path from 'node:path';
import { expect, gotoStudio, persistedSource, SHARE_EXPORTS, setEditorContent, test } from './studio-fixture';

/** Write the deck at any width: at phone width the editor sits behind the Source cell, so open it and come back to Preview. */
async function writeDeck(page: import('@playwright/test').Page, md: string): Promise<void> {
	// The editor is on screen at desktop width; at phone width it is behind the Source cell.
	const phone = !(await page.getByLabel('Deck source').isVisible());
	if (phone) await page.getByRole('button', { name: 'Markdown source', exact: true }).click();
	await setEditorContent(page, md);
	if (phone) await page.getByRole('button', { name: 'Preview', exact: true }).click();
}

// ── THE STUDIO'S WEBPAGE EXPORT CAN ASK THE READER BEFORE LOADING A SITE'S PICTURES (followups.d/2739-p3) ──
//
// The CLI's `--player-consent` lists the origins whose pictures the player may load, but only after the
// reader presses "Load pictures" in a banner. The Studio's Share → Webpage panel now offers the same, from
// the origins the deck's pictures use. Driven against a REAL loopback server, so every "no request" is a
// network log (HARD RULE #23):
//   1. the export itself contacts no site;
//   2. the file, opened, loads nothing before the reader consents, and shows the banner;
//   3. "Load pictures" fetches the picture (the control that makes the empty log a refusal);
//   4. with scripting off the file loads nothing and lists the picture as a link.
// All three engines, per playwright.config.ts: `@gecko` runs on desktop and Firefox, the WebKit twin on WebKit at tablet and iPhone size.

test.describe.configure({ timeout: 300_000 });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

for (const tag of [' @gecko', ' @webkit-tablet @webkit-phone']) {
	test(`a declared origin shows the banner and loads only after Load pictures${tag}`, async ({ page, browser }, testInfo) => {
		const hits: string[] = [];
		const server = http.createServer((req, res) => {
			hits.push(req.url || '');
			res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' });
			res.end(PNG);
		});
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
		const { port } = server.address() as { port: number };
		const host = `127.0.0.1:${port}`;
		try {
			await gotoStudio(page);
			await writeDeck(page, `---\ntheme: indaco\n---\n\n# Consent\n\n![a picture from elsewhere](http://${host}/p.png)\n`);
			await expect.poll(() => persistedSource(page)).toContain('# Consent');
			await page.getByRole('button', { name: 'Share', exact: true }).click();
			const dialog = page.getByRole('dialog');
			await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.row }).click();
			await dialog.getByRole('checkbox', { name: `Ask readers to load pictures from ${host}` }).click();
			if (process.env.CONSENT_EVIDENCE && testInfo.project.name === 'desktop') {
				for (const [w, h] of [[1440, 900], [820, 1100], [390, 844]]) {
					await page.setViewportSize({ width: w, height: h });
					await dialog.getByRole('checkbox', { name: `Ask readers to load pictures from ${host}` }).scrollIntoViewIfNeeded();
					await page.screenshot({ path: path.join(process.env.CONSENT_EVIDENCE, `panel-${w}.png`) });
				}
				await page.setViewportSize({ width: 1440, height: 900 });
			}
			const download = page.waitForEvent('download', { timeout: 240_000 });
			await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.confirm }).click();
			const file = testInfo.outputPath('consent.html');
			await (await download).saveAs(file);
			expect(hits, 'the export contacted no site').toEqual([]);

			// Opened with scripting on: banner, nothing fetched, then Load pictures fetches.
			const reader = await browser.newPage();
			await reader.goto(`file://${file}`);
			const banner = reader.locator('#lp-consent');
			await expect(banner).toBeVisible({ timeout: 30_000 });
			await expect(banner).toContainText(host.split(':')[0]);
			await reader.waitForTimeout(1500);
			expect(hits, 'nothing loads before the reader consents').toEqual([]);
			const shot = (n: string) => (process.env.CONSENT_EVIDENCE ? reader.screenshot({ path: path.join(process.env.CONSENT_EVIDENCE, `${testInfo.project.name}-${n}.png`) }) : undefined);
			await shot('1-before');
			await reader.getByRole('button', { name: 'Load pictures' }).click();
			await expect.poll(() => hits.length, { timeout: 30_000 }).toBeGreaterThan(0);
			await expect.poll(() => reader.locator('img').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
			await shot('2-after');
			await reader.close();

			// Scripting off: nothing loads, the picture is listed as a plain link.
			hits.length = 0;
			const context = await browser.newContext({ javaScriptEnabled: false });
			const plain = await context.newPage();
			await plain.goto(`file://${file}`);
			await expect(plain.locator('#lp-consent a').first()).toHaveAttribute('href', new RegExp(`${host}/p.png`));
			await plain.waitForTimeout(1500);
			expect(hits, 'nothing loads with scripting off').toEqual([]);
			await context.close();
		} finally {
			await new Promise((r) => server.close(r));
		}
	});
}
