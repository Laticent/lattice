// The Studio's narrated webpage export, PLAYED. share-emphasis.spec.ts reads the exported bytes;
// this opens the downloaded file from disk, offline, and presses Play. It is the one test that
// runs the player the production Studio bundle assembled — its LTT kernels inlined from the
// minified build — end to end (LTT step 2, spec/LTT-1.0.md §The timing functions).
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

const GUIDED_CHART = `---
marp: true
theme: indaco
pace: brisk
delivery: restrained
---

<!-- _class: funnel -->

## Where the pipeline drops off.

- Visitors \`12,000\`
- Signups \`4,800\`
- Signed \`214\`
`;

// THE BINDING SURVIVES THE REAL EXPORT. The chart narrator binds each sentence to the stage it
// names, and the player plays that scene without reading the words (2026-09-27 note). A checker
// found the Studio's share path rebuilding each narration slide without the binding, so a sent
// deck never played a scene while the player's own check (which injects the refs) passed.
test('a delivery: chart deck exports its binding, and the player focuses the stage each sentence names', async ({ page, context }, testInfo) => {
	await gotoStudio(page);
	await setEditorContent(page, GUIDED_CHART);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await page.getByRole('button', { name: /Webpage/ }).click();
	// Captions on: with no voice, the captions are the narration the Guide rides.
	const captions = page.getByRole('switch', { name: 'Include captions' });
	await expect(captions).toBeVisible();
	if ((await captions.getAttribute('aria-checked')) !== 'true') await captions.click();
	const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.getByRole('button', { name: /Download webpage/ }).click()]);
	const file = testInfo.outputPath('guided-chart.html');
	await dl.saveAs(file);
	const html = fs.readFileSync(file, 'utf8');
	expect(html, 'the export carries the chart narration binding').toMatch(/"refs":\[\[/);
	expect(html).toContain('"unit":"stage"');

	await context.setOffline(true);
	const p = await context.newPage();
	const errors: string[] = [];
	p.on('pageerror', (e) => errors.push(e.message));
	await p.goto(`file://${file}`);
	await p.waitForSelector('#lp-play');
	await p.click('#lp-play');
	// Every stage the narration names is focused in turn, from its binding; the other stages recede.
	await p.waitForFunction(
		() => !!document.querySelector('.lp-frame.lp-active polygon.funnel-band.lat-guide-undim') && document.querySelectorAll('.lp-frame.lp-active polygon.funnel-band.lat-guide-dim').length === 2,
		null,
		{ timeout: 20000 },
	);
	expect(errors).toEqual([]);
});

const GUIDED_PROSE = `---
marp: true
theme: indaco
pace: brisk
delivery: restrained
---

## What we are asking for.

- Approve the Q4 hiring plan.
- Fund the data platform migration.
- Close the SMB pilot.
`;

// PROSE BINDS TOO (storyboards step 4). The narration builder records which bullet each sentence was
// read from, the Studio's export carries it, and the player focuses THAT bullet as its sentence is
// read, from the binding rather than by matching words. Checked per sentence against the caption.
test('a prose deck exports its bullet bindings, and the player focuses each bullet as it is read', async ({ page, context }, testInfo) => {
	await gotoStudio(page);
	await setEditorContent(page, GUIDED_PROSE);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await page.getByRole('button', { name: /Webpage/ }).click();
	const captions = page.getByRole('switch', { name: 'Include captions' });
	await expect(captions).toBeVisible();
	if ((await captions.getAttribute('aria-checked')) !== 'true') await captions.click();
	const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.getByRole('button', { name: /Download webpage/ }).click()]);
	const file = testInfo.outputPath('guided-prose.html');
	await dl.saveAs(file);
	const html = fs.readFileSync(file, 'utf8');
	expect(html, 'the export carries the prose binding').toMatch(/"refs":\[\[/);
	expect(html).toContain('"unit":"item"');

	await context.setOffline(true);
	const p = await context.newPage();
	const errors: string[] = [];
	p.on('pageerror', (e) => errors.push(e.message));
	await p.goto(`file://${file}`);
	await p.waitForSelector('#lp-play');
	await p.click('#lp-play');
	// Each bullet in turn: focused while its own sentence is the caption, its siblings receded.
	for (const item of ['Approve the Q4 hiring plan', 'Fund the data platform migration', 'Close the SMB pilot']) {
		await p.waitForFunction(
			(want) => {
				const on = [...document.querySelectorAll('.lp-frame.lp-active li.lat-guide-undim')].filter((li) => !li.classList.contains('lat-guide-dim'));
				const dim = document.querySelectorAll('.lp-frame.lp-active li.lat-guide-dim').length;
				return on.length === 1 && (on[0]?.textContent ?? '').includes(want) && dim === 2;
			},
			item,
			{ timeout: 20000 },
		);
	}
	expect(errors).toEqual([]);
});
