import { expect, type Page, test } from '@playwright/test';
import { serveDist } from './serve-dist';
import { CHROME, waitForStudioPaint } from './studio-fixture';

// Compose, Present, the reading view and Fabricate open OFFLINE after an online visit that never
// opened them. They are React.lazy, and the service worker caches a /_astro/ chunk only once it has been
// fetched (docs/public/sw.js has no precache list), so without the idle warm-up
// (studio-warm.ts › startStudioWarmUp) an offline open shows the chunk-load card. Fabricate warms
// only for a browser that has opened it before, so the first test also pins that a visitor who
// never has does not download it.
// See engineering/decisions/2026-09-26-studio-panel-lazy-loading.md § Warming Present,
// Fabricate and the reading view.
//
// A real network cut, not context.setOffline() — see serve-dist.ts.
test.use({ serviceWorkers: 'allow' });

const chunk = (name: string) => new RegExp(`^/_astro/${name}\\.[\\w-]+\\.js$`);
const KATEX = /^\/playground\/v\/[0-9a-f]+\/lattice-katex\.js$/;

async function cachedPaths(page: Page): Promise<string[]> {
	return page.evaluate(async () => {
		const name = (await caches.keys()).find((k) => k.includes('assets'));
		if (!name) return [];
		const keys = await (await caches.open(name)).keys();
		return keys.map((r) => new URL(r.url).pathname);
	});
}

/** Load the Studio controlled by the worker, and wait until the warm-up has cached `names`. */
async function warmOnline(page: Page, origin: string, names: Array<string | RegExp>, { fabricateUsed = false, saveData = false } = {}): Promise<void> {
	await page.addInitScript(
		([used, save]) => {
			try {
				localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'craft' }));
				if (used) localStorage.setItem('lattice-studio-fabricate-used', '1');
			} catch {}
			if (save) Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
		},
		[fabricateUsed, saveData],
	);
	await page.goto(`${origin}/studio/`, { waitUntil: 'domcontentloaded' });
	await page.evaluate(() => navigator.serviceWorker.ready);
	await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
	// The first load ran before the worker claimed the page, so its fetches were not cached.
	// This controlled load is the "online session" the user had.
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForStudioPaint(page);
	await expect
		.poll(async () => {
			const cached = await cachedPaths(page);
			return names.every((n) => cached.some((p) => (typeof n === 'string' ? chunk(n) : n).test(p)));
		}, { timeout: 60_000, message: `the warm-up never cached ${names.join(', ')}` })
		.toBe(true);
	// The cache write trails the fetch (waitUntil); let the queue settle before the cut.
	let last = -1;
	await expect
		.poll(async () => {
			const n = (await cachedPaths(page)).length;
			const settled = n === last;
			last = n;
			return settled;
		}, { intervals: [1000], timeout: 30_000 })
		.toBe(true);
}

async function goOffline(page: Page, server: import('node:http').Server): Promise<void> {
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForStudioPaint(page);
}

test('Present and the reading view open offline after a session that never opened them', async ({ page }) => {
	test.setTimeout(180_000);
	const { server, origin, hits } = await serveDist();
	try {
		// Each surface's whole on-demand path, not just its own chunk: Present's narration and the
		// reading view import player-core and player-prune once open.
		await warmOnline(page, origin, ['PresentOverlay', 'ReadArticle', 'narration-projection', 'player-core\\.generated', 'player-prune\\.generated', KATEX]);
		expect(hits.filter((p) => chunk('Fabricate').test(p)), 'Fabricate warmed for a browser that never opened it').toEqual([]);

		await goOffline(page, server);

		await page.getByRole('button', { name: 'Present' }).click();
		const present = page.getByRole('dialog', { name: 'Present' });
		await expect(present.getByText(/^1 \/ \d+$/)).toBeVisible({ timeout: 30_000 });
		await page.keyboard.press('Escape');
		await expect(present).toBeHidden();

		await page.getByRole('button', { name: CHROME.postureStops[0] }).click();
		await page.getByRole('button', { name: CHROME.readArticle }).click();
		await expect(page.locator('article.st-read-article h1, article.st-read-article h2').first()).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText('This deck could not be turned into an article')).toHaveCount(0);
		// The starter deck reads as math to the detector, so the article loaded the KaTeX provider,
		// offline, from the copy the warm-up cached. Without it, math would fall back to source text.
		expect(await page.evaluate(() => (window as { __latticeKatexReady?: boolean }).__latticeKatexReady)).toBe(true);
	} finally {
		server.closeAllConnections();
		server.close();
	}
});

test('Fabricate opens offline after a deploy-fresh session, for a browser that has used it', async ({ page }) => {
	test.setTimeout(180_000);
	const { server, origin } = await serveDist();
	try {
		await warmOnline(page, origin, ['Fabricate', 'gallery-gate'], { fabricateUsed: true });
		await goOffline(page, server);

		await page.getByRole('button', { name: 'Workspace launcher' }).click();
		await page.getByRole('menuitem', { name: 'Fabricate' }).click();
		await expect(page.getByRole('textbox', { name: 'Theme name' })).toBeVisible({ timeout: 30_000 });
	} finally {
		server.closeAllConnections();
		server.close();
	}
});

test('under Save-Data the warm-up fetches the six panels but not Present or the reading view', async ({ page }) => {
	test.setTimeout(180_000);
	const { server, origin, hits } = await serveDist();
	try {
		// The last of the six panels, so the queue has reached the point where Present would start.
		await warmOnline(page, origin, ['LensesPanel'], { saveData: true });
		const surfaces = [...['ComposeView', 'PresentOverlay', 'ReadArticle', 'Fabricate'].map(chunk), KATEX];
		expect(hits.filter((p) => surfaces.some((re) => re.test(p))), 'Save-Data warmed a surface no visitor downloaded before').toEqual([]);
	} finally {
		server.closeAllConnections();
		server.close();
	}
});

/** Nothing on screen says a chunk failed: no reload card, and no panel still on its shell. */
async function expectLoaded(page: Page, what: string): Promise<void> {
	await expect(page.locator('[data-panel-shell]'), `${what} is still on its shell`).toHaveCount(0, { timeout: 15_000 });
	await expect(page.getByRole('alert').filter({ has: page.getByRole('button', { name: /reload/i }) }), `${what} showed the chunk-load card`).toHaveCount(0);
}

// The SWEEP. Every surface the Studio loads on demand, opened offline in one session that never
// opened any of them online: the six panels, Editor, Compose, Present, Fabricate and the reading
// view (the whole `React.lazy` / `lazyPanel` set in docs/src). The cases above prove each warm-up
// in isolation; this one is what would have caught Compose, which no single-surface case covered.
// A new on-demand surface belongs in this list.
test('every on-demand Studio surface opens offline after a session that opened none of them', async ({ page }) => {
	test.setTimeout(300_000);
	const { server, origin } = await serveDist();
	try {
		const panels = ['ShareSheet', 'WorkspaceSheet', 'SlideContext', 'ArchitectChat', 'Library', 'LensesPanel'];
		await warmOnline(page, origin, [...panels, 'Editor', 'ComposeView', 'PresentOverlay', 'ReadArticle', 'Fabricate'], { fabricateUsed: true });
		await goOffline(page, server);
		await expect(page.locator('.cm-editor').first(), 'the Editor did not load offline').toBeVisible({ timeout: 30_000 });

		const opens: Array<[string, () => Promise<unknown>]> = [
			['Share', () => page.getByRole('button', { name: 'Share', exact: true }).first().click()],
			['Workspace settings', () => page.getByRole('button', { name: CHROME.workspaceSettings, exact: true }).first().click()],
			['The Library', () => page.getByRole('button', { name: CHROME.library, exact: true }).first().click()],
			['Chat', () => page.getByRole('button', { name: CHROME.chat, exact: true }).first().click()],
			['Reader views', () => page.getByRole('button', { name: CHROME.lenses, exact: true }).first().click()],
			['Slide settings', () => page.getByRole('button', { name: CHROME.slideSettings, exact: true }).first().click()],
		];
		for (const [what, open] of opens) {
			await open();
			await expectLoaded(page, what);
			await page.keyboard.press('Escape');
		}

		await page.getByRole('button', { name: 'Compose — rich editor' }).click();
		await expect(page.locator('.ProseMirror').first(), 'Compose did not load offline').toBeVisible({ timeout: 30_000 });
		await expectLoaded(page, 'Compose');
		await page.getByRole('button', { name: 'Markdown source' }).click();

		await page.getByRole('button', { name: 'Present' }).first().click();
		await expect(page.getByRole('dialog', { name: 'Present' }).getByText(/^1 \/ \d+$/)).toBeVisible({ timeout: 30_000 });
		await page.keyboard.press('Escape');

		await page.getByRole('button', { name: 'Workspace launcher' }).click();
		await page.getByRole('menuitem', { name: 'Fabricate' }).click();
		await expect(page.getByRole('textbox', { name: 'Theme name' })).toBeVisible({ timeout: 30_000 });
		await expectLoaded(page, 'Fabricate');
		await page.getByRole('button', { name: 'Back to Compose' }).click();

		await page.getByRole('button', { name: CHROME.postureStops[0] }).click();
		await page.getByRole('button', { name: CHROME.readArticle }).click();
		await expect(page.locator('article.st-read-article h1, article.st-read-article h2').first()).toBeVisible({ timeout: 30_000 });
		await expectLoaded(page, 'the reading view');
	} finally {
		server.closeAllConnections();
		server.close();
	}
});

// Compose is a primary tab on a phone, and before it was warmed, tapping it offline replaced the
// whole Studio with the chunk-load card: found on a real iPhone against the PR preview, then
// reproduced here. The phone layout is where the tab lives, so this case runs at phone size.
test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('every tab opens offline after a session that never opened them', async ({ page }) => {
		test.setTimeout(240_000);
		const { server, origin } = await serveDist();
		try {
			await warmOnline(page, origin, ['ComposeView', 'PresentOverlay', 'ArchitectChat', 'SlideContext']);
			await goOffline(page, server);
			const tab = (name: string) => page.locator('button:visible').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first();
			for (const name of ['Source', 'Compose', 'Preview', 'Coach', 'Chat', 'Settings', 'Share', 'Present']) {
				await tab(name).tap();
				if (name === 'Compose') await expect(page.locator('.ProseMirror').first(), 'Compose did not load offline').toBeVisible({ timeout: 30_000 });
				if (name === 'Present') await expect(page.getByRole('dialog', { name: 'Present' }).getByText(/^1 \/ \d+$/)).toBeVisible({ timeout: 30_000 });
				await expectLoaded(page, `the ${name} tab`);
				await page.keyboard.press('Escape');
				await expect(page.getByRole('dialog')).toHaveCount(0);
			}
		} finally {
			server.closeAllConnections();
			server.close();
		}
	});
});
