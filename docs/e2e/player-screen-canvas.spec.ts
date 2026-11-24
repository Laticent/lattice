import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, type Page, test } from '@playwright/test';

// THE SCREEN CANVAS in the exported player (lib/core/screen-canvas.mjs, lib/export/player-core.mjs `lpCanvas`): a 4K
// deck's player lays its slides out on HD wherever the slide is shown at 2,560 device px or fewer across, and on 4K only
// where the screen shows more. WebKit pays every layer inside a slide at the slide's own box times the density squared,
// so a 4K player opened on an iPhone could reload the tab (owner, 2026-11-20). The switch is the box and the slide's own
// 1% (`--_sec-1cqi`) together: with the box alone, type stayed at 4K size and the title overflowed (seen while building it).
//
// The phone arm runs on `webkit-phone`, the iPhone's engine at its size and density. The large-screen arm runs on
// `desktop`, at 1920x1080 and 2x: the slide is shown well over 2,560 device px wide. `@gecko` runs that arm in Firefox too.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DECK = `---
marp: true
theme: indaco
size: 4k
---

<!-- _class: title -->

# From signal to strategy

A decision framework for product leaders, quarterly

---

## The second slide

- So the deck has somewhere to go
`;

let html = '';

test.beforeAll(async ({ browserName: _engine }, testInfo) => {
	test.setTimeout(300_000);
	const dir = testInfo.outputDir;
	fs.mkdirSync(dir, { recursive: true });
	const md = path.join(dir, 'deck-4k.md');
	fs.writeFileSync(md, DECK);
	html = path.join(dir, 'deck-4k.html');
	const res = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, html, '--player', '-q'], {
		cwd: ROOT,
		encoding: 'utf8',
		timeout: 280_000,
		env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: chromium.executablePath() },
	});
	if (res.status !== 0) throw new Error(`export failed (${res.status}): ${res.stderr || res.stdout}`);
});

/** The shown slide's laid-out box, its own 1%, and the title's width as a share of the slide. */
function readSlide(page: Page) {
	return page.evaluate(() => {
		const s = document.querySelector('.lp-frame.lp-active section[data-lattice-slide]') as HTMLElement | null;
		const h1 = s?.querySelector('h1') as HTMLElement | null;
		return {
			box: s ? getComputedStyle(s).width : '',
			unit: s ? s.style.getPropertyValue('--_sec-1cqi') : '',
			titleShare: s && h1 ? Math.round((h1.scrollWidth / s.offsetWidth) * 100) : -1,
		};
	});
}

async function open(page: Page) {
	await page.goto(`file://${html}`);
	await expect(page.locator('.lp-frame.lp-active section[data-lattice-slide]')).toBeVisible();
	// The fit runs on load and on every resize; the box is the signal that it has.
	await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lp-cw'))).not.toBe('');
}

test('a 4K player lays out on HD on an iPhone @webkit-phone', async ({ page }) => {
	await open(page);
	const s = await readSlide(page);
	expect(s.box).toBe('1280px');
	expect(s.unit).toBe('12.800px');
	// The title fits inside the slide: with the box switched but not the unit, it ran past both edges.
	expect(s.titleShare).toBeLessThanOrEqual(100);
});

test('a 4K player keeps 4K on a large high-density screen, and crosses to HD when the window narrows @gecko', async ({ browser }) => {
	const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
	try {
		const page = await ctx.newPage();
		await open(page);
		await expect.poll(async () => (await readSlide(page)).box).toBe('3840px');
		expect((await readSlide(page)).unit).not.toBe('12.800px');
		await page.setViewportSize({ width: 800, height: 600 });
		await expect.poll(async () => (await readSlide(page)).box).toBe('1280px');
		const s = await readSlide(page);
		expect(s.unit).toBe('12.800px');
		expect(s.titleShare).toBeLessThanOrEqual(100);
	} finally {
		await ctx.close();
	}
});
