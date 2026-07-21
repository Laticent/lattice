import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// PWA surface: the manifest is linked and valid, the service worker activates
// on the built site, and offline navigation is served from the runtime cache.
//
// The shared config BLOCKS service workers (see playwright.config.ts); this
// file opts back in — it exists to exercise the worker.
//
// The offline test does NOT use context.setOffline(): Playwright's offline
// emulation applies to page-originated requests only, and a controlling
// worker re-originates navigations, so setOffline "passes" while the network
// silently keeps serving (a false positive we hit when this spec was first
// written). Instead the test serves dist/ from its own throwaway HTTP server
// and KILLS it — a real connection failure the worker must absorb.
test.use({ serviceWorkers: 'allow' });

const DIST = fileURLToPath(new URL('../dist', import.meta.url));

const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.wasm': 'application/wasm',
};

/** Minimal static server over the built site — just enough for the worker to install.
 *  `hits` records every request path so a test can PROVE a strategy (cache-first serves
 *  with zero server hits; SWR fires a background revalidation that DOES hit). Responses
 *  are `no-store` so the browser's own HTTP cache can't mask a real network fetch —
 *  Cache Storage ignores Cache-Control, so the service worker still caches + serves. */
function serveDist(): Promise<{ server: Server; origin: string; hits: string[] }> {
	const hits: string[] = [];
	const server = createServer(async (req, res) => {
		try {
			const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
			hits.push(pathname);
			const rel = normalize(pathname).replace(/^([/\\.])+/, '');
			let file = join(DIST, rel);
			if (pathname.endsWith('/')) file = join(file, 'index.html');
			let body: Buffer;
			try {
				body = await readFile(file);
			} catch {
				body = await readFile(join(DIST, rel, 'index.html')); // extensionless route
				file = 'index.html';
			}
			res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
			res.end(body);
		} catch {
			res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
		}
	});
	// Ephemeral port: no collision with the shared preview server or a future
	// second server-spawning spec; reject (not hang) if listen itself fails.
	return new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (typeof address === 'string' || address === null) return reject(new Error('no port assigned'));
			resolve({ server, origin: `http://127.0.0.1:${address.port}`, hits });
		});
	});
}

test('manifest is linked from both page shells and parses', async ({ page, request }) => {
	// Standalone route (via <ResourceHints>).
	await page.goto('/');
	await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute('href', '/site.webmanifest');
	// Starlight docs route (via the ThemeProvider override).
	await page.goto('/overview/');
	await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute('href', '/site.webmanifest');
	// Own-head route (carries <PwaHead> directly, not via <ResourceHints>).
	await page.goto('/features/');
	await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute('href', '/site.webmanifest');

	const manifest = await (await request.get('/site.webmanifest')).json();
	// The Studio IS the app: installing launches the editor, not the homepage
	// (2026-07-03-pwa-studio-identity.md). Scope stays site-wide so docs open
	// inside the installed window.
	expect(manifest.name).toBe('Lattice Studio');
	expect(manifest.start_url).toBe('/studio/');
	expect(manifest.scope).toBe('/');
	expect(manifest.display).toBe('standalone');
	for (const icon of manifest.icons) {
		expect((await request.get(icon.src)).status()).toBe(200);
	}
	for (const shortcut of manifest.shortcuts) {
		expect((await request.get(shortcut.url)).status()).toBe(200);
	}
});

test('service worker activates and serves navigation offline', async ({ page }) => {
	const { server, origin } = await serveDist();
	try {
		await page.goto(`${origin}/`);
		await page.evaluate(() => navigator.serviceWorker.ready);
		// clients.claim() races the assertion — poll until this page is controlled.
		await expect
			.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
			.toBe(true);

		// A CONTROLLED navigation is what populates the page cache (the first
		// load ran before the worker claimed the page), and the cache write is
		// deferred via waitUntil — poll until both '/' and the offline fallback
		// are actually cached before cutting the network.
		await page.reload();
		await expect
			.poll(() =>
				page.evaluate(async () => {
					const home = await caches.match(`${location.origin}/`);
					const fallback = await caches.match('/offline/');
					return Boolean(home && fallback);
				}),
			)
			.toBe(true);

		// Real offline: no server at all.
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));

		// Visited page → served from the runtime cache.
		await page.reload();
		await expect(page).toHaveTitle(/Lattice/);
		// Unvisited page → the branded offline fallback.
		await page.goto(`${origin}/never-visited-while-online/`);
		await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
	} finally {
		server.closeAllConnections();
		server.close();
	}
});

// Content-hashed assets — OUR /playground/v/<hash>/ bundle AND Astro's /_astro/ build
// chunks — are immutable, so the worker serves them CACHE-FIRST (2026-07-21): a
// warm-cache reload must not re-fetch them (the reload-revalidation storm the storage
// overlay surfaced). This proves such an asset serves with ZERO server hits, and — as a
// control that the counter works — that a NON-hashed same-origin asset (SWR) DOES fire a
// revalidation hit.
test('content-hashed assets are served cache-first; non-hashed stay stale-while-revalidate', async ({ page }) => {
	const { server, origin, hits } = await serveDist();
	try {
		await page.goto(`${origin}/`);
		await page.evaluate(() => navigator.serviceWorker.ready);
		await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
		// A controlled reload populates the ASSETS cache (deferred via waitUntil).
		await page.reload();

		// Poll until BOTH immutable families are cached, capturing ONE path from each —
		// /playground/v/<hash>/ AND Astro's /_astro/ — so the added `_astro` branch (the one
		// with no version-eviction) is asserted deterministically, not left to insertion order.
		// The homepage reliably loads both (hero live-preview engine + its React island chunks).
		let paths: { versioned: string | null; astro: string | null } = { versioned: null, astro: null };
		await expect
			.poll(
				async () => {
					paths = await page.evaluate(async () => {
						const assetsName = (await caches.keys()).find((k) => k.includes('assets'));
						if (!assetsName) return { versioned: null, astro: null };
						const cache = await caches.open(assetsName);
						const ps = (await cache.keys()).map((r) => new URL(r.url).pathname);
						return {
							versioned: ps.find((p) => /\/playground\/v\/[0-9a-f]{8,}\//.test(p)) ?? null,
							astro: ps.find((p) => p.startsWith('/_astro/')) ?? null,
						};
					});
					return Boolean(paths.versioned && paths.astro);
				},
				{ timeout: 15000 },
			)
			.toBe(true);

		// CACHE-FIRST: fetching a cached immutable asset serves it from the cache with NO
		// network touch, so the server sees no new hit — asserted for one asset of EACH family.
		// Wait for the reload to settle first so a still-in-flight populate fetch can't be
		// mistaken for a revalidation.
		await page.waitForLoadState('networkidle');
		for (const p of [paths.versioned as string, paths.astro as string]) {
			const before = hits.filter((h) => h === p).length;
			await page.evaluate((u) => fetch(u).then((r) => r.text()), p);
			await page.waitForTimeout(600); // give any (wrongly) fired revalidation time to land
			expect(hits.filter((h) => h === p).length, `${p} should serve cache-first (no server hit)`).toBe(before);
		}

		// CONTROL — SWR: the manifest is same-origin and NOT versioned, so fetching it
		// fires a background revalidation that DOES reach the server. Proves the zero above
		// is real cache-first behavior, not a dead counter / HTTP-cache artifact.
		const mBefore = hits.filter((h) => h === '/site.webmanifest').length;
		await page.evaluate(() => fetch('/site.webmanifest').then((r) => r.text()));
		await expect.poll(() => hits.filter((h) => h === '/site.webmanifest').length, { timeout: 5000 }).toBeGreaterThan(mBefore);
	} finally {
		server.closeAllConnections();
		server.close();
	}
});
