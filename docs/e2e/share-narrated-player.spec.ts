// The Studio's narrated webpage export, PLAYED. share-emphasis.spec.ts reads the exported bytes;
// this opens the downloaded file from disk, offline, and presses Play. It is the one test that
// runs the player the production Studio bundle assembled — its LTT kernels inlined from the
// minified build — end to end (LTT step 2, engineering/ltt.md §The timing functions).
import * as fs from 'node:fs';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

test.setTimeout(300000); // one full engine export, then the deck plays itself

const DECK = `---
marp: true
theme: indaco
pace: brisk
---

# Probe

Cost discipline held. Yes. Pipeline coverage sits below target.

---

<!-- _class: divider -->

## Section two

---

## The close

Guidance is unchanged for now.
`;

test('the Webpage player the Studio exports plays itself from its timing track, offline', async ({ page, context }, testInfo) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await page.getByRole('button', { name: /Webpage/ }).click();
	// Captions ON, audio OFF: narration with no key (HARD RULE #24), timed entirely by the LTT.
	const captions = page.getByRole('switch', { name: 'Include captions' });
	await expect(captions).toBeVisible();
	if ((await captions.getAttribute('aria-checked')) !== 'true') await captions.click();
	const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.getByRole('button', { name: /Download webpage/ }).click()]);
	const file = testInfo.outputPath('narrated.html');
	await dl.saveAs(file);
	const html = fs.readFileSync(file, 'utf8');
	expect(html).toContain('application/lattice+ltt');
	expect(html).toContain('var positionAt=');

	// Offline is the export's whole contract: any request the page tries fails hard.
	await context.setOffline(true);
	const p = await context.newPage();
	const errors: string[] = [];
	p.on('pageerror', (e) => errors.push(e.message));
	await p.goto(`file://${file}`);
	await p.waitForSelector('#lp-play');
	expect(await p.evaluate(() => document.documentElement.classList.contains('lp-js')), 'the player script ran').toBe(true);
	await p.click('#lp-play');
	// The crawl lights words on the wall clock, through the inlined positionAt.
	await p.waitForFunction(() => document.querySelectorAll('#lp-caption .lp-cap-line.lp-now .lp-cap-w.lp-said').length >= 2, null, { timeout: 8000 });
	// And the deck runs itself to its last slide and stops there.
	await p.waitForFunction(() => document.getElementById('lp-play')?.getAttribute('aria-pressed') === 'false', null, { timeout: 60000 });
	expect(await p.evaluate(() => document.querySelector('body > #lp-bar > #lp-count')?.textContent?.trim())).toMatch(/^3 \//);
	expect(errors).toEqual([]);
});
