import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

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
	await expect(notice).toContainText('Missing here: CSS :has().');
	await expect(notice).toContainText('stop getting security fixes');
	// A current engine made to fail the probe: its user agent says it is new enough, so it gets the general advice and
	// the docs link, never "you have Chrome 150; Lattice needs 111" (the per-browser wording is unit-tested).
	await expect(notice).toContainText('Chrome 111, Edge 111, Firefox 128, Safari 16.4');
	await expect(notice.getByRole('link', { name: 'Supported browsers' })).toHaveAttribute('href', /getting-started\/#supported-browsers$/);
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
	await expect(page.locator(NOTICE)).toContainText('Missing here: CSS :has() and structuredClone().');
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
