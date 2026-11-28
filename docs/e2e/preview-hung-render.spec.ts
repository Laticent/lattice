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
	let mode: 'hold' | 'pass' | 'untilPressed' = 'hold';
	let seen!: () => void;
	const arrived = new Promise<void>((r) => (seen = r));
	await page.route(pattern, async (route) => {
		if (mode === 'pass') return route.continue();
		if (mode === 'untilPressed') {
			const pressed = await page.evaluate(() => (window as { __retryPressed?: boolean }).__retryPressed === true).catch(() => false);
			return pressed ? route.continue() : route.abort();
		}
		held.push(route);
		seen();
	});
	return {
		arrived,
		release: async () => {
			mode = 'pass';
			await Promise.all(held.splice(0).map((r) => r.continue()));
		},
		// Fail what is held, and every request after it until the page has seen the Retry press: a render the page starts
		// by itself in between (the scheduler's catch-up) would otherwise fetch the theme and recover before the press, and
		// the arm would prove nothing about Retry. A capture listener marks the press before the button's own handler runs.
		fail: async () => {
			mode = 'untilPressed';
			await page.evaluate(() =>
				document.addEventListener('pointerdown', (e) => {
					if ((e.target as Element | null)?.closest?.('.nacre-failed__retry')) (window as { __retryPressed?: boolean }).__retryPressed = true;
				}, true),
			);
			await Promise.all(held.splice(0).map((r) => r.abort()));
		},
	};
}

/**
 * Step the page clock until the stall card shows. The held request can arrive before the render that waits on it starts (a
 * phone prefetches the theme before its preview pane is shown), so one 30 s step can end before that render's clock does.
 * DeckPreview.test.tsx pins the exact 30 s; this asks only that the card comes while the request is held. On the code
 * before #3617 it never does.
 */
async function runUntilStallCard(page: Page) {
	await expect
		.poll(
			async () => {
				await page.clock.runFor(5_000);
				return (await card(page).locator('.nacre-failed__text').textContent().catch(() => '')) ?? '';
			},
			{ timeout: 30_000, intervals: [0] },
		)
		.toContain('did not finish loading');
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

test('@crosswidth @webkit-phone @webkit-tablet @gecko a render held on a lazy chunk shows the failure card, and the card goes when the chunk answers', async ({ page }) => {
	const h = await openHeld(page, '**/_astro/image-size-memo.*.js');
	// The render is stuck inside the held import, and no card says so yet.
	await expect(card(page)).toHaveCount(0);
	await runUntilStallCard(page);
	await expect(card(page).locator('.nacre-failed__text')).toHaveText('This preview couldn’t render — the slide did not finish loading; check the connection, then Retry.');
	await expect(card(page).getByRole('button', { name: 'Retry' })).toBeVisible();
	// The chunk answers: the held render settles, the slide shows, and the card clears itself.
	await h.release();
	await expect.poll(() => revealed(page)).toBe('1');
	await expect(card(page)).toHaveCount(0);
});

test('@crosswidth @webkit-phone @webkit-tablet @gecko a render held on the theme shows the card, and Retry renders once the theme can be fetched again', async ({ page }) => {
	const h = await openHeld(page, '**/playground/v/*/themes/*.css');
	await runUntilStallCard(page);
	// The held request fails (a connection that drops): the render settles as a failure, and the theme fetcher drops it,
	// so the next ask fetches again. The requests after this one pass.
	await h.fail();
	// The failed render has settled: its own card replaces the stall card (it never waits on the stall card already up).
	await expect(card(page).locator('.nacre-failed__text')).not.toContainText('did not finish loading');
	await expect(card(page)).toHaveCount(1);
	await card(page).getByRole('button', { name: 'Retry' }).click();
	await expect.poll(() => revealed(page)).toBe('1');
	await expect(card(page)).toHaveCount(0);
});
