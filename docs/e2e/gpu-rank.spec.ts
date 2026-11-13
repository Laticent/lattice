import { expect, test } from './studio-fixture';

// The GPU rank on the real Studio (engineering/decisions/2026-11-12-device-capability-tiers.md §3.1, slice 1b remainder):
// detect-gpu ranks the renderer from a table served by OUR origin, never unpkg, and the System panel shows the rank.
//
// HARD RULE #32: the runner's GPU never decides. The CI browser draws in software, which detect-gpu blocklists without a
// table, so the page's WebGL renderer string is stubbed to a known discrete GPU, and the tier is pinned. Every wait is on a
// signal: a request, or the panel row.

// What each engine reports. Safari masks every Apple chip as "Apple GPU", and detect-gpu tells the models apart with its own
// context and the Apple table; the other engines get a known discrete GPU and its vendor's table.
const STUB = {
	chromium: { renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', table: /\/(d|m)-(geforce|nvidia)[^/]*\.json$/ },
	webkit: { renderer: 'Apple GPU', table: /\/(d|m)-apple[^/]*\.json$/ },
} as const;

test.describe.configure({ timeout: 180_000 });

test('@crosswidth @webkit-phone the GPU rank loads its table from our own origin and shows in the System panel', async ({ page, baseURL, browserName }) => {
	const stub = STUB[browserName as 'chromium' | 'webkit'];
	await page.addInitScript((renderer) => {
		const UNMASKED = 0x9246; // WEBGL_debug_renderer_info.UNMASKED_RENDERER_WEBGL
		for (const Ctx of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
			if (!Ctx) continue;
			const real = Ctx.prototype.getParameter;
			Ctx.prototype.getParameter = function (p: number) {
				return p === UNMASKED || p === this.RENDERER ? renderer : real.call(this, p);
			};
		}
	}, stub.renderer);
	const cdn: string[] = [];
	page.on('request', (r) => {
		if (/unpkg\.com|jsdelivr|detect-gpu@/.test(r.url())) cdn.push(r.url());
	});
	const table = page.waitForRequest((r) => stub.table.test(new URL(r.url()).pathname), { timeout: 150_000 });
	await page.goto('/studio/?system&tier=full', { waitUntil: 'domcontentloaded' });
	const req = await table;
	expect(new URL(req.url()).origin).toBe(new URL(baseURL as string).origin);
	expect((await req.response())?.ok()).toBe(true);

	const rank = page.locator('[data-testid="system-overlay"] dt').filter({ hasText: /^GPU rank$/ }).locator('xpath=following-sibling::dd[1]');
	await expect(rank).toHaveText(/^Tier [0-3] of 3$/, { timeout: 30_000 });
	expect(cdn).toEqual([]);
});

// A browser with WebGL turned off (headless Firefox has none either: "Exhausted GL driver options"). The test turns it off
// itself, so it means the same on every engine that runs it. No renderer means no rank: the library does not even load,
// nothing is fetched from anywhere, and the panel shows no GPU rank row (unknown never lowers the tier).
test('@gecko with no WebGL there is no GPU rank, and neither the library nor a table is fetched', async ({ page }) => {
	await page.addInitScript(() => {
		const real = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
			return /webgl/i.test(type) ? null : (real as (...a: unknown[]) => unknown).call(this, type, ...rest);
		} as typeof real;
	});
	const tables: string[] = [];
	page.on('request', (r) => {
		if (/\/(d|m)-[a-z-]+[^/]*\.json$|unpkg\.com|detect-gpu|gpu-rank-tables/.test(r.url())) tables.push(r.url());
	});
	await page.goto('/studio/?system&tier=full', { waitUntil: 'domcontentloaded' });
	// The runtime has run once the CPU probe has saved its score; the GPU rank starts at the same moment.
	await expect.poll(() => page.evaluate(() => localStorage.getItem('lattice-device-cpu')), { timeout: 150_000 }).not.toBeNull();
	await expect(page.locator('[data-testid="system-overlay"] dt').filter({ hasText: /^Graphics$/ })).toBeVisible();
	await expect(page.locator('[data-testid="system-overlay"] dt').filter({ hasText: /^GPU rank$/ })).toHaveCount(0);
	expect(tables).toEqual([]);
});
