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

// A deck that sets `delivery:` exports with the Guide (owner ruling 2026-09-25, Fork 3a): the
// Studio's own kernel, inlined into the player, focuses what the narration names while the deck
// plays itself. This is the production Studio's share-export, so it also proves the Studio's CSS
// prune keeps the focus rules for a guided file (`#lp-app[data-lp-guide]`), which match nothing
// until the Guide runs.
const GUIDED = `---
marp: true
theme: indaco
pace: brisk
delivery: restrained
---

<!-- _class: content -->

## The quarter, line by line

- Hiring continued on plan across every team.
- ARR closed at $48.6M, ahead of plan.
- Payback stretched to 19 months.
`;

test('a delivery: deck exports with the Guide, which focuses what the narration names', async ({ page, context }, testInfo) => {
	await gotoStudio(page);
	await setEditorContent(page, GUIDED);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await page.getByRole('button', { name: /Webpage/ }).click();
	const captions = page.getByRole('switch', { name: 'Include captions' });
	await expect(captions).toBeVisible();
	if ((await captions.getAttribute('aria-checked')) !== 'true') await captions.click();
	const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.getByRole('button', { name: /Download webpage/ }).click()]);
	const file = testInfo.outputPath('guided.html');
	await dl.saveAs(file);
	const html = fs.readFileSync(file, 'utf8');
	expect(html).toContain('data-lp-guide');
	expect(html).toContain('__latticeGuide');
	expect(html, 'the prune kept the focus rules').toMatch(/\[data-guide\][^{]*\.lat-guide-dim/);

	await context.setOffline(true);
	const p = await context.newPage();
	const errors: string[] = [];
	p.on('pageerror', (e) => errors.push(e.message));
	await p.goto(`file://${file}`);
	await p.waitForSelector('#lp-play');
	await p.click('#lp-play');
	// A sentence names a bullet: it stays, its siblings recede to restrained's 0.45.
	// The crossfade settles on restrained's depth: polled, not slept.
	await p.waitForFunction(
		() => {
			const peer = document.querySelector('.lp-frame.lp-active li.lat-guide-dim');
			return !!document.querySelector('.lp-frame.lp-active li.lat-guide-undim') && !!peer && Math.abs(Number(getComputedStyle(peer).opacity) - 0.45) < 0.01;
		},
		null,
		{ timeout: 15000 },
	);
	// Pausing hands the slide back: the focus lifts.
	await p.click('#lp-play');
	await p.waitForFunction(() => document.querySelectorAll('.lat-guide-dim, .lat-guide-undim').length === 0, null, { timeout: 5000 });
	expect(errors).toEqual([]);
});

test('a deck with no delivery: exports without the Guide', async ({ page }, testInfo) => {
	await gotoStudio(page);
	await setEditorContent(page, GUIDED.replace('delivery: restrained\n', ''));
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await page.getByRole('button', { name: /Webpage/ }).click();
	const captions = page.getByRole('switch', { name: 'Include captions' });
	await expect(captions).toBeVisible();
	if ((await captions.getAttribute('aria-checked')) !== 'true') await captions.click();
	const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.getByRole('button', { name: /Download webpage/ }).click()]);
	const file = testInfo.outputPath('plain.html');
	await dl.saveAs(file);
	const html = fs.readFileSync(file, 'utf8');
	expect(html).not.toContain('__latticeGuide');
	expect(html).not.toContain('data-lp-guide');
	expect(html).not.toMatch(/\[data-guide\][^{]*\.lat-guide-dim/);
});
