import { ENGINE_GLOB } from './engine-glob';
import { expect, LIVE_PREVIEW, test } from './studio-fixture';

// ── The Studio newcomer bake (scripts/bake-studio-newcomer.mjs, studio.astro, single-slide-render.ts `adoptBake`) ──
//
// A first visit writes a build-time document into the live preview before the engine has loaded, and
// the first real render PATCHES that document instead of writing its own. Each assertion below guards a
// way this can fail silently: a bake the page never fetches is just the old cold start; a bake the
// renderer refuses is the same; and a bake the first render writes over is a slide that shows, blanks
// and shows again, which is worse than no bake. Decision: engineering/decisions/2026-11-08-studio-newcomer-bake.md.
//
// No `gotoStudio` here: it seeds a posture into storage, and this spec is about what a visitor with an
// empty profile gets. Each test is its own browser context, so storage starts empty.

type Write = { engine: boolean };

/**
 * Count every `srcdoc` write to the live preview's frame, and whether the engine had loaded at the time.
 * Inside each frame, log every swap stamp a patch writes (`data-lattice-swap`, single-slide-render.ts
 * `patchSlideBody`) to the top window. A LOG, not a read of the attribute: the frame's runtime consumes
 * the stamp, and how soon differs by engine, so waiting for the attribute itself is a race (HARD RULE #32).
 * The patch calls `setAttribute` on an element of the frame, so the frame realm's prototype is the one to wrap.
 */
async function recordWrites(page: import('@playwright/test').Page) {
	await page.addInitScript(() => {
		type Top = Window & { __liveWrites?: { engine: boolean }[]; __swaps?: string[]; LatticePlayground?: unknown };
		if (window !== window.top) {
			const top = window.top as Top | null;
			const set = Element.prototype.setAttribute;
			Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
				if (name === 'data-lattice-swap' && this.classList.contains('lattice')) top?.__swaps?.push(String(value));
				return set.call(this, name, value);
			};
			return;
		}
		const w = window as Top & { __history0?: number };
		// The history length before anything is written, read at document start: a write that pushed an entry shows here.
		w.__history0 = history.length;
		w.__liveWrites = [];
		w.__swaps = [];
		const d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
		if (!d?.set || !d.get) return;
		const { get, set } = d;
		Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
			configurable: true,
			get,
			set(this: HTMLIFrameElement, v: string) {
				if (this.classList.contains('live') && this.closest('[aria-label="Live deck preview"]')) w.__liveWrites?.push({ engine: !!w.LatticePlayground });
				set.call(this, v);
			},
		});
	});
}

/** The live preview's host attribute and frame state, read in the page. */
function previewState(page: import('@playwright/test').Page) {
	return page.evaluate((sel) => {
		const fr = document.querySelector<HTMLIFrameElement>(sel);
		const host = fr?.parentElement ?? null;
		const doc = fr?.contentDocument ?? null;
		const w = window as unknown as { __liveWrites: Write[]; __swaps: string[]; __history0: number };
		return {
			bake: host?.getAttribute('data-lattice-bake') ?? null,
			writes: w.__liveWrites,
			swaps: w.__swaps,
			marked: !!(fr?.contentWindow as (Window & { __bakeMark?: boolean }) | null)?.__bakeMark,
			history: history.length,
			history0: w.__history0,
			title: doc?.querySelector('.lattice h1')?.textContent ?? '',
		};
	}, LIVE_PREVIEW);
}

for (const colorScheme of ['light', 'dark'] as const) {
	test(`a first visit (${colorScheme}) shows the baked slide, and the first render patches it in place @crosswidth @webkit-phone @gecko`, async ({ page }) => {
		await page.emulateMedia({ colorScheme });
		await recordWrites(page);
		// Hold the engine until the renderer has answered the bake, so the order this test asserts (the bake first, then
		// the live render) is the code's and not the network's (HARD RULE #32).
		await page.route(ENGINE_GLOB, async (route) => {
			await page.locator('[data-lattice-bake]').waitFor({ state: 'attached', timeout: 30_000 });
			await route.continue();
		});
		await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
		const frame = page.locator(LIVE_PREVIEW);
		await expect(frame).toHaveAttribute('style', /opacity: 1/, { timeout: 45_000 });
		// Mark the document the visitor first saw. A rewrite would replace its window, and the mark with it.
		await page.evaluate((sel) => {
			const w = document.querySelector<HTMLIFrameElement>(sel)?.contentWindow as (Window & { __bakeMark?: boolean }) | null;
			if (w) w.__bakeMark = true;
		}, LIVE_PREVIEW);
		const before = await previewState(page);
		expect(before.bake, 'the renderer did not adopt the bake').toBe('adopted');
		// One write so far, the bake, made before the engine had loaded (the engine is held until it is).
		expect(before.writes, 'the bake was not the first and only write, made before the engine').toEqual([{ engine: false }]);
		expect(before.title).toBe('Markdown for the boardroom');
		// The first real render lands as a patch, which stamps the swap kind on the slide root.
		await expect.poll(async () => (await previewState(page)).swaps.length, { timeout: 45_000, message: 'the first render never patched the adopted document' }).toBeGreaterThan(0);
		const after = await previewState(page);
		expect(after.writes, 'the first render wrote its own document over the bake').toHaveLength(1);
		expect(after.marked, 'the frame no longer holds the document the visitor first saw').toBe(true);
		expect(after.swaps[0], 'the bake described another slide, so the patch reflowed').toBe('in-place');
		expect(after.history, 'adopting the bake, or the patch over it, added a history entry').toBe(after.history0);
	});
}

test('a returning visitor never fetches the bake', async ({ page }) => {
	const fetched: string[] = [];
	page.on('request', (r) => {
		if (/studio-newcomer\//.test(r.url())) fetched.push(r.url());
	});
	await page.addInitScript(() => {
		// The app's own record of a deck being open: what any visit after the first leaves behind.
		localStorage.setItem('lattice-studio-active', JSON.stringify({ deckId: 'welcome' }));
	});
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await expect(page.locator(LIVE_PREVIEW)).toHaveAttribute('style', /opacity: 1/, { timeout: 45_000 });
	expect(fetched).toEqual([]);
	expect(await page.locator(LIVE_PREVIEW).evaluate((fr) => fr.parentElement?.getAttribute('data-lattice-bake') ?? null)).toBeNull();
});

test('a bake that no longer matches the render is refused, and the first render writes as before', async ({ page }) => {
	await recordWrites(page);
	// A bake from another build: same shape, another runtime. `adoptBake` must refuse it on that alone.
	await page.route(/studio-newcomer\/(light|dark)\.json$/, async (route) => {
		const res = await route.fetch();
		const bake = await res.json();
		await route.fulfill({ response: res, json: { ...bake, runtimeUrl: `${bake.runtimeUrl}?stale` } });
	});
	// Hold the engine until the renderer has answered the bake, so the refusal is the one this test
	// planted and never `written` (an engine that beat the bake) — the order must not depend on the race.
	await page.route(ENGINE_GLOB, async (route) => {
		await page.locator('[data-lattice-bake]').waitFor({ state: 'attached', timeout: 30_000 });
		await route.continue();
	});
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await expect(page.locator(LIVE_PREVIEW)).toHaveAttribute('style', /opacity: 1/, { timeout: 45_000 });
	const s = await previewState(page);
	expect(s.bake).toBe('refused:runtime');
	// The renderer wrote its own document, and nothing was written before the engine: the refused bake wrote nothing.
	expect(s.writes.length, 'the renderer did not write its own document').toBeGreaterThan(0);
	expect(s.writes.every((w) => w.engine), 'a write landed before the engine: the refused bake was written').toBe(true);
	await expect.poll(async () => (await previewState(page)).title, { timeout: 30_000 }).toBe('Markdown for the boardroom');
	// Exactly one write. Under load a second render with the same signature used to start while the first write was
	// still loading and write the whole document again (14 of 23 loaded runs on main 50f6f4a); it now waits for that
	// load and patches (single-slide-render.ts, the document-load wait; newcomer-bake decision §7).
	expect((await previewState(page)).writes, 'a first visit wrote the preview twice').toHaveLength(1);
});
