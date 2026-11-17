import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium, expect, type Page, test } from '@playwright/test';

// Chart detail cards in the EXPORTED HTML player's Present view
// (engineering/decisions/2026-11-16-cenno-popover-library.md §7). The real CLI exports
// `examples/chart-detail-reveal.md` once; every test drives that file. @crosswidth runs it in
// Chromium at desktop and phone width, @gecko in Firefox, @webkit-tablet in WebKit at iPad landscape, and
// @webkit-phone in WebKit as an iPhone 15 Pro (touch, phone viewport).
//
// Slide 3 is a funnel with four bands (marks 0-3), each with a detail; slide 4 is a map.
// CONTROL ARMS sit beside each "nothing happened" claim: the slide-turn test first proves the arrow
// keys DO turn the deck, so an unchanged index while a chart has focus means the reveal took them.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let html = '';
let hostile = '';

// The checker's repro (PR #3259): an author `style` on a funnel row's META item turned a link into a
// 9000px fixed overlay over the whole player, so a click anywhere opened the author's URL.
const HOSTILE_DECK = `---
theme: indaco
---

<!-- _class: funnel -->

## Footer vector.

- Discovery \`312\`
  - Body line <span id="bodyx" style="position:fixed;left:0;top:0;width:9000px;height:9000px;background:red">B</span>
  - Meta line <a id="metax" href="https://example.com" style="position:fixed;left:-3000px;top:-3000px;width:9000px;height:9000px;background:lime;display:block">M</a>
- Qualified \`196\`
  - Two
`;

test.beforeAll(async ({ browserName: _engine }, testInfo) => {
	test.setTimeout(300_000);
	fs.mkdirSync(testInfo.outputDir, { recursive: true });
	html = path.join(testInfo.outputDir, 'chart-detail-reveal.html');
	const res = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), path.join(ROOT, 'examples', 'chart-detail-reveal.md'), html, '--player', '-q'], {
		cwd: ROOT,
		encoding: 'utf8',
		timeout: 280_000,
		env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: chromium.executablePath() },
	});
	expect(res.status, `the export itself succeeded — stderr: ${(res.stderr || '').slice(-800)}`).toBe(0);
	const deck = path.join(testInfo.outputDir, 'hostile.md');
	fs.writeFileSync(deck, HOSTILE_DECK);
	hostile = path.join(testInfo.outputDir, 'hostile.html');
	const res2 = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), deck, hostile, '--player', '-q'], {
		cwd: ROOT,
		encoding: 'utf8',
		timeout: 280_000,
		env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: chromium.executablePath() },
	});
	expect(res2.status, `the hostile export succeeded — stderr: ${(res2.stderr || '').slice(-800)}`).toBe(0);
});

const CARD = '.cenno.lattice-chart-card';
const FUNNEL = '.lp-frame.lp-active .funnel-svg';
const slideIndex = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.lp-frame')].findIndex((f) => f.classList.contains('lp-active')));

async function toFunnel(page: Page) {
	await page.goto(`file://${html}`);
	await expect(page.locator('.lp-frame.lp-active')).toHaveCount(1);
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await expect(page.locator(`${FUNNEL} [data-mark="1"]`)).toBeVisible();
}

/** The center of band `i` of the funnel on stage, in page coordinates. */
async function bandCenter(page: Page, i: number) {
	const b = await page.locator(`${FUNNEL} [data-mark="${i}"]`).boundingBox();
	if (!b) throw new Error(`band ${i} has no box`);
	return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

const cardTitle = (page: Page) => page.locator(`${CARD} [data-cenno-part=title]`);

test('hovering a band opens its card next to the pointer, dims the rest, and leaving closes it @crosswidth @gecko @webkit-tablet @webkit-phone', async ({ page }) => {
	await toFunnel(page);
	const p = await bandCenter(page, 1);
	// One move from outside the chart onto the band's center: the card anchors where the pointer FIRST
	// reached the mark (and then holds still rather than chase it), so a multi-step approach would anchor it
	// at the band's edge instead.
	await page.mouse.move(10, p.y);
	await page.mouse.move(p.x, p.y);
	await expect(cardTitle(page)).toHaveText('Qualified');
	await expect(page.locator(`${CARD} [data-cenno-part=value]`)).toHaveText('196');
	const facts = await page.evaluate(
		({ card, funnel, x, y }) => {
			const c = document.querySelector(card) as HTMLElement;
			const r = c.getBoundingClientRect();
			// The description renders in the card's shadow root, styled by the deck.
			const host = [...c.querySelectorAll('[data-cenno-part=body] *')].find((e) => e.shadowRoot);
			const body = host?.shadowRoot?.textContent ?? '';
			const marks = [...document.querySelectorAll(`${funnel} [data-mark]`)] as SVGElement[];
			return {
				topLayer: typeof c.showPopover === 'function' ? c.matches(':popover-open') : true,
				body: body.trim(),
				// Just below the pointer and over its column (the card shifts left near the right edge).
				nearPointer: r.top >= y && r.top <= y + 60 && r.left <= x + 1 && r.right >= x - 1,
				// The values the reveal sets (the computed ones are mid-transition here).
				dims: marks.map((m) => m.style.opacity),
				passesPointer: getComputedStyle(c).pointerEvents === 'none',
			};
		},
		{ card: CARD, funnel: FUNNEL, ...p },
	);
	expect(facts.topLayer).toBe(true);
	expect(facts.body).toContain('budget timing');
	expect(facts.nearPointer, 'the card opens just below the pointer').toBe(true);
	expect(facts.dims).toEqual(['0.45', '1', '0.45', '0.45']);
	expect(facts.passesPointer, 'a hover card never sits between the pointer and the marks').toBe(true);

	// Another band switches the card; leaving the chart closes it.
	const q = await bandCenter(page, 2);
	await page.mouse.move(q.x, q.y, { steps: 3 });
	await expect(cardTitle(page)).toHaveText('Procurement');
	await page.mouse.move(10, 300, { steps: 3 });
	await expect(page.locator(CARD)).toHaveCount(0);
	await expect.poll(() => page.evaluate((f) => [...document.querySelectorAll(`${f} [data-mark]`)].map((m) => (m as SVGElement).style.opacity).join(','), FUNNEL)).toBe(',,,');
});

test('digits open mark n of the chart on stage and 0 closes it @crosswidth @gecko @webkit-tablet @webkit-phone', async ({ page }) => {
	await toFunnel(page);
	await page.keyboard.press('3');
	await expect(cardTitle(page)).toHaveText('Procurement');
	await page.keyboard.press('1');
	await expect(cardTitle(page)).toHaveText('Discovery');
	await page.keyboard.press('0');
	await expect(page.locator(CARD)).toHaveCount(0);
});

test('a focused chart takes the arrow keys and walks its marks, without turning the slide @crosswidth @gecko @webkit-tablet @webkit-phone', async ({ page }) => {
	await toFunnel(page);
	// CONTROL: unfocused, the arrow keys turn the deck in this engine.
	const start = await slideIndex(page);
	await page.keyboard.press('ArrowRight');
	await expect.poll(() => slideIndex(page)).toBe(start + 1);
	await page.keyboard.press('ArrowLeft');
	await expect.poll(() => slideIndex(page)).toBe(start);

	const chart = page.locator(`${FUNNEL}[data-chart-reveal]`);
	await expect(chart).toHaveAttribute('tabindex', '0');
	// The chart keeps the name its kernel gave it, and says which keys it now answers.
	await expect(chart).toHaveAttribute('aria-labelledby', /.+/);
	await expect(chart).toHaveAttribute('aria-keyshortcuts', /ArrowRight/);
	await chart.focus();
	await page.keyboard.press('ArrowRight');
	await expect(cardTitle(page)).toHaveText('Discovery');
	// The focus ring is drawn INSIDE the chart (its frame clips at the chart's edge, so an outward ring
	// never painted) and is at least 2px on screen.
	const ring = await chart.evaluate((el) => {
		const cs = getComputedStyle(el);
		return { offset: Number.parseFloat(cs.outlineOffset), width: Number.parseFloat(cs.outlineWidth), style: cs.outlineStyle };
	});
	expect(ring.style).toBe('solid');
	expect(ring.width).toBeGreaterThanOrEqual(2);
	expect(ring.offset).toBeLessThanOrEqual(-ring.width);
	await page.keyboard.press('ArrowRight');
	await expect(cardTitle(page)).toHaveText('Qualified');
	await page.keyboard.press('End');
	await expect(cardTitle(page)).toHaveText('Closed-won');
	expect(await slideIndex(page)).toBe(start);
	await page.keyboard.press('Escape');
	await expect(page.locator(CARD)).toHaveCount(0);
	await expect(chart).toBeFocused();
});

test('turning the slide closes an open card @crosswidth @gecko @webkit-tablet @webkit-phone', async ({ page }) => {
	await toFunnel(page);
	await page.keyboard.press('2');
	await expect(cardTitle(page)).toHaveText('Qualified');
	const start = await slideIndex(page);
	await page.locator('#lp-next').click();
	await expect.poll(() => slideIndex(page)).toBe(start + 1);
	await expect(page.locator(CARD)).toHaveCount(0);
});

async function touchPage(browser: Browser) {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
	const page = await ctx.newPage();
	await toFunnel(page);
	return { ctx, page };
}

test('a tap pins a card, a second tap on the same band or elsewhere closes it, and a tap never turns the slide @crosswidth @gecko @webkit-tablet @webkit-phone', async ({ browser }) => {
	const { ctx, page } = await touchPage(browser);
	try {
		const start = await slideIndex(page);
		const p = await bandCenter(page, 0);
		await page.touchscreen.tap(p.x, p.y);
		await expect(cardTitle(page)).toHaveText('Discovery');
		expect(await page.evaluate((c) => getComputedStyle(document.querySelector(c) as Element).pointerEvents, CARD), 'a pinned card takes the touch, so its body can scroll').not.toBe('none');
		await page.touchscreen.tap(p.x, p.y);
		await expect(page.locator(CARD)).toHaveCount(0);
		await page.touchscreen.tap(p.x, p.y);
		await expect(cardTitle(page)).toHaveText('Discovery');
		await page.touchscreen.tap(20, 200);
		await expect(page.locator(CARD)).toHaveCount(0);
		expect(await slideIndex(page)).toBe(start);
	} finally {
		await ctx.close();
	}
});

test('author styles in a detail never escape the card: the page stays the player, not the author link @crosswidth @gecko @webkit-tablet @webkit-phone', async ({ page }) => {
	await page.goto(`file://${hostile}`);
	await expect(page.locator('.lp-frame.lp-active .funnel-svg [data-mark="0"]')).toBeVisible();
	// The CONTROL: the author's styles survive the export (so this test is not passing on a sanitized file).
	expect(fs.readFileSync(hostile, 'utf8')).toContain('position:fixed;left:-3000px');
	await page.keyboard.press('1'); // a keyboard card takes the pointer, the worst case
	await expect(cardTitle(page)).toHaveText('Discovery');
	const hits = await page.evaluate(() => {
		const at = (x: number, y: number) => {
			const el = document.elementFromPoint(x, y);
			return el ? el.id || el.tagName : null;
		};
		return [at(4, 4), at(innerWidth / 2, innerHeight - 4), at(innerWidth - 4, innerHeight / 2)];
	});
	for (const hit of hits) expect(hit, 'nothing the author styled covers the player').not.toMatch(/^(metax|bodyx)$/);
	const link = await page.evaluate(() => {
		const host = [...document.querySelectorAll('.lattice-chart-card [data-cenno-part=footer] *')].find((e) => e.shadowRoot);
		const a = host?.shadowRoot?.querySelector('#metax') as HTMLElement | null;
		return a ? { style: a.getAttribute('style'), position: getComputedStyle(a).position } : null;
	});
	expect(link, 'the meta link is drawn, inside the footer').not.toBeNull();
	expect(link?.style).toBeNull();
	expect(link?.position).not.toBe('fixed');
});
