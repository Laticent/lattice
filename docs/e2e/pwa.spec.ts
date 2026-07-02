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
const PORT = 4331;
const ORIGIN = `http://127.0.0.1:${PORT}`;

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

/** Minimal static server over the built site — just enough for the worker to install. */
function serveDist(): Promise<Server> {
	const server = createServer(async (req, res) => {
		try {
			const pathname = decodeURIComponent(new URL(req.url ?? '/', ORIGIN).pathname);
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
			res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
			res.end(body);
		} catch {
			res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
		}
	});
	return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

test('manifest is linked from both page shells and parses', async ({ page, request }) => {
	// Standalone route (via <ResourceHints>).
	await page.goto('/');
	await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute('href', '/site.webmanifest');
	// Starlight docs route (via the ThemeProvider override).
	await page.goto('/overview/');
	await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute('href', '/site.webmanifest');

	const manifest = await (await request.get('/site.webmanifest')).json();
	expect(manifest.name).toBe('Lattice');
	expect(manifest.display).toBe('standalone');
	for (const icon of manifest.icons) {
		expect((await request.get(icon.src)).status()).toBe(200);
	}
});

test('service worker activates and serves navigation offline', async ({ page }) => {
	const server = await serveDist();
	try {
		await page.goto(`${ORIGIN}/`);
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
		await page.goto(`${ORIGIN}/never-visited-while-online/`);
		await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
	} finally {
		server.closeAllConnections();
		server.close();
	}
});
