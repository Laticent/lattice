import type { Page, Route } from '@playwright/test';
import { expect, test } from './studio-fixture';

// ── A first render that HANGS, on the real Studio (owner, 2026-11-28, D4) ──────────────────────────────────────
//
// A request the preview's render waits on that never answers used to leave the Studio's loader spinning for good: a
// loader host had no failure surface for a render that never settles (#1164's "honest spin"). The iPad's first-render
// stall (followups.d/3368-p1) was that. Now a render that has not settled after 30 s shows the failure card with Retry,
// and the card clears itself if the render settles later (DeckPreview.test.tsx pins the 30 s to the millisecond).
// This asks what only a browser answers (HARD RULE #23): the card shows in the built Studio, it goes when the held
// request answers, and Retry recovers once the request that failed can be made again.
//
// Time is Playwright's page clock (#32): the test fast-forwards the 30 s, never sleeps them. The waits before that are
// on signals (the held request arriving, the card, the frame's reveal). The service worker is blocked so the routes
// below meet the requests. A deck that is not the newcomer is seeded, so no bake paints a slide first: that is the
// iPad stall's state ("bake none").

test.use({ serviceWorkers: 'block' });

const SOURCE_KEY = 'lattice-studio-src-welcome';
const DECK = ['# A held render', '', 'One slide, no newcomer bake.', ''].join('\n');
const card = (page: Page) => page.locator('[aria-label="Live deck preview"] .nacre-failed').first();
const revealed = (page: Page) =>
	page
		.locator('[aria-label="Live deck preview"] iframe.live')
		.first()
		.evaluate((f: HTMLIFrameElement) => f.style.opacity)
		.catch(() => '');

/** Hold every request matching `pattern`: none is answered until `release` (continue) or `fail` (abort). */
async function hold(page: Page, pattern: string) {
	const held: Route[] = [];
	let mode: 'hold' | 'pass' | 'abort' = 'hold';
	let seen!: () => void;
	const arrived = new Promise<void>((r) => (seen = r));
	await page.route(pattern, (route) => {
		if (mode === 'pass') return route.continue();
		if (mode === 'abort') return route.abort();
		held.push(route);
		seen();
	});
	return {
		arrived,
		release: async () => {
			mode = 'pass';
			await Promise.all(held.splice(0).map((r) => r.continue()));
		},
		fail: async () => {
			mode = 'pass';
			await Promise.all(held.splice(0).map((r) => r.abort()));
		},
	};
}

async function openHeld(page: Page, pattern: string) {
	await page.clock.install();
	await page.addInitScript(([k, deck]) => localStorage.setItem(k, JSON.stringify(deck)), [SOURCE_KEY, DECK]);
	const h = await hold(page, pattern);
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	const previewTab = page.getByRole('button', { name: 'Preview', exact: true }).first();
	await h.arrived;
	if (await previewTab.isVisible()) await previewTab.click();
	return h;
}

test('@crosswidth @webkit-phone @webkit-tablet @gecko a render held on a lazy chunk shows the failure card at 30 s, and the card goes when the chunk answers', async ({ page }) => {
	const h = await openHeld(page, '**/_astro/image-size-memo.*.js');
	// The render is stuck inside the held import, and no card says so yet.
	await expect(card(page)).toHaveCount(0);
	await page.clock.runFor(30_000);
	await expect(card(page).locator('.nacre-failed__text')).toHaveText('This preview couldn’t render — the slide did not finish loading; check the connection, then Retry.');
	await expect(card(page).getByRole('button', { name: 'Retry' })).toBeVisible();
	// The chunk answers: the held render settles, the slide shows, and the card clears itself.
	await h.release();
	await expect.poll(() => revealed(page)).toBe('1');
	await expect(card(page)).toHaveCount(0);
});

test('@crosswidth @webkit-phone @webkit-tablet @gecko a render held on the theme shows the card, and Retry renders once the theme can be fetched again', async ({ page }) => {
	const h = await openHeld(page, '**/playground/v/*/themes/*.css');
	await page.clock.runFor(30_000);
	await expect(card(page).locator('.nacre-failed__text')).toContainText('did not finish loading');
	// The held request fails (a connection that drops): the render settles as a failure, and the theme fetcher drops it,
	// so the next ask fetches again. The requests after this one pass.
	await h.fail();
	await expect(card(page)).toHaveCount(1);
	await card(page).getByRole('button', { name: 'Retry' }).click();
	await expect.poll(() => revealed(page)).toBe('1');
	await expect(card(page)).toHaveCount(0);
});
