import fs from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const AXE_SRC = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
/** The same rule set as axe-site.spec.ts: WCAG 2.0 to 2.2 A and AA, plus axe's best practices. */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa', 'best-practice'];

// The landing page's old-browser notice (engineering/decisions/2026-11-12-device-capability-tiers.md §6.2), on every engine
// and width the decline-screen spec runs on.
//
// HARD RULE #32: the runner's own browser never decides. A current browser is made "old" on purpose by turning one
// required feature off in the page before any script runs; the unpinned assertion is about what does NOT happen. Every
// wait is on the notice or the page, never a duration.

const NOTICE = '[data-testid="old-browser"]';

/** Make this page's browser lack CSS :has(), the way a browser older than it does: CSS.supports answers no for it. */
async function withoutHas(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const real = CSS.supports.bind(CSS);
		CSS.supports = ((a: string, b?: string) => (b === undefined && /:has\(/.test(a) ? false : b === undefined ? real(a) : real(a, b))) as typeof CSS.supports;
	});
}

/** Make this page's browser lack structuredClone, which a browser older than 2022 does. */
async function withoutStructuredClone(page: Page): Promise<void> {
	await page.addInitScript(() => {
		delete (globalThis as { structuredClone?: unknown }).structuredClone;
	});
}

test('@crosswidth @webkit-phone @webkit-tablet @gecko an old browser gets an honest notice on the landing page, and can continue', async ({ page }) => {
	await withoutHas(page);
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	const notice = page.locator(NOTICE);
	await expect(notice).toBeVisible();
	await expect(notice.getByRole('heading', { name: 'Lattice needs a newer browser.' })).toBeFocused();
	await expect(notice.locator('details').last()).toContainText('This browser is missing CSS :has(), which Lattice needs.');
	await expect(notice).toContainText('stop getting security fixes');
	// A current engine made to fail the probe: its user agent says it is new enough, so it gets the general advice and the
	// supported list, never "you have Chrome 150; Lattice needs 111" (the per-browser wording is unit-tested).
	await expect(notice).toContainText('Update to a current browser, then open this page again.');
	// Self-contained: the supported list is in the notice, collapsed until opened, and no link leads into the site.
	const supported = notice.locator('details', { has: page.locator('summary', { hasText: 'Supported browsers' }) });
	await expect(supported.locator('li').first()).toBeHidden();
	await supported.locator('summary').click();
	await expect(supported.locator('li')).toContainText(['Chrome 111 or newer', 'Edge 111 or newer', 'Firefox 128 or newer']);
	await expect(notice.locator('a[href^="/"], a:not([href^="http"])')).toHaveCount(0);
	// The slide the reader is missing has loaded, in the page's mode.
	const slide = notice.locator('figure img');
	await expect(slide).toHaveAttribute('src', /old-browser\/hero-(light|dark)\.jpg$/);
	await expect.poll(() => slide.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1120);
	// The page beneath stays in view but blurred, out of reach and hidden from assistive technology.
	await expect(page.locator('body > main')).toHaveAttribute('aria-hidden', 'true');
	await expect(page.locator('body > main')).toHaveCSS('pointer-events', 'none');
	await expect(notice.getByRole('button', { name: 'Continue anyway' })).toBeAttached();
	await notice.getByRole('button', { name: 'Continue anyway' }).scrollIntoViewIfNeeded();
	await expect(notice.getByRole('button', { name: 'Continue anyway' })).toBeInViewport({ ratio: 1 });

	await notice.getByRole('button', { name: 'Continue anyway' }).click();
	await expect(notice).toHaveCount(0);
	await expect(page.locator('body > main')).not.toHaveAttribute('aria-hidden', 'true');
	await expect(page.locator('body > main')).toHaveCSS('pointer-events', 'auto');

	// The rest of this tab stays past it: a reload does not show it again.
	await page.reload({ waitUntil: 'load' });
	await expect(page.locator('html')).toHaveAttribute('data-old-browser', '');
	await expect(notice).toHaveCount(0);
});

test('@crosswidth @webkit-phone @gecko every missing feature is named', async ({ page }) => {
	await withoutHas(page);
	await withoutStructuredClone(page);
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	await expect(page.locator(NOTICE).locator('details').last()).toContainText('This browser is missing CSS :has() and structuredClone(), which Lattice needs.');
});

test('@crosswidth @webkit-phone @gecko a current browser never sees the notice or downloads it', async ({ page }) => {
	const fetched: string[] = [];
	page.on('request', (r) => {
		if (r.url().endsWith('/old-browser.js')) fetched.push(r.url());
	});
	await page.goto('/', { waitUntil: 'load' });
	await expect(page.locator('html')).not.toHaveAttribute('data-old-browser', '');
	await expect(page.locator(NOTICE)).toHaveCount(0);
	expect(fetched).toEqual([]);
});

test('@crosswidth @webkit-phone @gecko the notice has no axe findings in either color mode, and Tab never leaves it', async ({ page }) => {
	await withoutHas(page);
	for (const colorScheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme });
		await page.goto('/', { waitUntil: 'load' });
		const notice = page.locator(NOTICE);
		await expect(notice).toBeVisible();
		// The card fades in; axe measures contrast, so it waits for the finished state, not a duration.
		await expect.poll(() => notice.locator('.lob-card').evaluate((c) => getComputedStyle(c).opacity)).toBe('1');
		await page.evaluate(() => document.fonts.ready);
		await page.evaluate(AXE_SRC);
		const found = await page.evaluate(
			(values) =>
				(window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe
					.run(document, { runOnly: { type: 'tag', values } })
					.then((r) => r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)),
			AXE_TAGS,
		);
		expect(found, `axe findings in ${colorScheme} mode`).toEqual([]);

		// A keyboard reader cycles through the notice's controls and the browser's own UI, never the blurred page beneath.
		for (let i = 0; i < 8; i++) {
			await page.keyboard.press('Tab');
			const where = await page.evaluate(() => {
				const a = document.activeElement;
				if (!a || a === document.body || a === document.documentElement) return 'browser';
				return a.closest('[data-testid="old-browser"]') ? 'notice' : `page: ${a.tagName} ${a.textContent?.trim().slice(0, 40)}`;
			});
			expect(where, `Tab ${i + 1} in ${colorScheme} mode`).toMatch(/^(notice|browser)$/);
		}
	}
});
