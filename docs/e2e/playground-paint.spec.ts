import { controlReady, expect, test } from './studio-fixture';

// Consolidation of scripts/check-preview-render.mjs (the puppeteer paint guard
// behind preview-e2e-nightly.yml) into the Playwright suite, per the decision
// doc's parity criterion. Reproduces the exact reported flow: load a gallery
// from Edit view → the tab flips to Preview AND the deck actually paints. Tagged
// @crosswidth so it runs at desktop AND mobile (matching the original script's
// two viewports). The old script is retired only once this is signed off.

// Stub the blocking externals the deck srcdoc pulls in, so the in-iframe FIT
// agent isn't gated on the network (mirrors the puppeteer script's stubs).
test.beforeEach(async ({ context }) => {
	await context.route(/mermaid.*\.js($|\?)/, (route) =>
		route.fulfill({
			contentType: 'text/javascript',
			body: 'window.mermaid={initialize(){},run(){},render(){return{svg:""}}};',
		}),
	);
	await context.route(/katex.*\.css($|\?)/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
	await context.route(/fonts\.googleapis|fonts\.gstatic/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
});

test('@crosswidth playground: loading a gallery flips to Preview and the deck paints', async ({ page }) => {
	// Pin the editor surface: a pristine profile opens Explore by design (PR 6);
	// this spec guards the EDIT-mode gallery→Preview paint regression.
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });

	// Open the Galleries sheet and load the first gallery deck (the reported flow).
	// GATE ON HYDRATION, not on the button being there (#1815). The Playground island is
	// `client:load`, so the trigger is server-rendered and Playwright's auto-wait (attached +
	// visible + stable + enabled) is satisfied ~300-480ms before anything wires it — measured
	// on this page. A click in that window is DROPPED, not queued: React does not replay it,
	// so the button stays inert, the sheet never opens, and the failure surfaces one line
	// later as `expect(dialog).toBeVisible()` timing out on a page that looks perfectly fine.
	// Reproduced deterministically by delaying the island's own module the way a contended
	// worker does (the test below); as REPORTED it was one nightly red on `mobile` at two
	// workers against 8/8 green at `--workers=1`, which is what the window looks like from
	// the outside. Mechanism and the trap inside it: engineering/gotchas/docs-site.md.
	const galleries = page.locator('#pg-galleries-trigger');
	await controlReady(galleries);
	await galleries.click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.locator('button', { hasText: /\d+\s+slides?/ }).first().click();

	// A gallery is a deck to explore — loading one lands in Explore (view read,
	// pane preview) and the deck shows (2026-07-06 simplification).
	await expect(page.locator('body')).toHaveAttribute('data-view', 'read');
	await expect(page.locator('body')).toHaveAttribute('data-pane', 'preview');

	// The deck genuinely paints inside the preview iframe (visible + real slides).
	const preview = page.frameLocator('#preview');
	await expect(preview.locator('.lattice')).toBeVisible({ timeout: 12_000 });
	await expect(preview.locator('section').first()).toBeVisible();
});

// ── The gate above has to be a GATE (#1815) ───────────────────────────────────────────
//
// The defect this pins is a test that cannot fail honestly: a click that lands in the
// unwired window is DROPPED, so the spec fails one line later, blaming a dialog that was
// never asked to open. It surfaced as one intermittent nightly red and would have gone on
// looking like a different bug every time.
//
// Holding the window open is what makes it a test rather than a hope. Delaying the island's
// own modules does to hydration exactly what a contended worker does — the server HTML is
// painted and interactive-LOOKING for as long as we choose. With no gate at all the sheet
// opened 0 times out of 8 under this delay; with the gate, 8 of 8.
//
// It pins the READINESS GATE, not the whole of `controlReady`: the React-commit half of that
// helper closes a further ~100ms margin that Playwright's own click round-trip happens to
// cover, so removing that half would not turn this red. The docblock on `controlReady` and
// the gotchas entry carry that measurement.

// ── …and the window has to be measured from INSIDE the page (#2125) ───────────────────────
//
// The self-check below — the assertion that the island had NOT hydrated yet, which is the
// only thing making this run mean anything — used to read `body[data-view]` once, from the
// runner, straight after a `waitUntil: 'domcontentloaded'` goto. It stopped working, and
// deterministically: 6 runs in 6 red at both widths, on the assertion that says "this test
// proves nothing".
//
// `<script type="module">` is DEFERRED, and deferred scripts BLOCK DOMContentLoaded — so the
// 800ms delay lands on the very resources DCL waits for, and DCL is no longer the early
// milestone the old code took it for. What decides whether it falls inside the window is the
// SHAPE OF THE BUILD, which is the half of this that cost the most to find:
//
//   | dist built by | modulepreload hints on /playground/ | trigger has a box | hydrated |
//   |---|---|---|---|
//   | `npm run build:e2e` (Playwright's own webServer) |  0 | ~130-200ms | ~3.6-3.8s |
//   | `npm run build` (what the site ships)            | 41 | ~110-190ms | ~1.3-1.5s |
//
// `inject-modulepreload.mjs` — a post-build step `build` runs and `build:e2e` does not —
// hints the island's whole dependency set in the document head, so the chunks the island
// reaches by DYNAMIC import are already in flight with the static graph instead of being
// discovered one 800ms hop at a time after it. Hydration therefore lands a few milliseconds
// after DCL rather than seconds after it, and a self-check that starts looking at DCL reads
// an island that has already hydrated. Measured on this commit: 3 runs in 3 GREEN against a
// `build:e2e` dist and 6 runs in 6 RED against a `build` one, same spec, same code. That is
// also why the nightly never caught it (#2125, and the divergence itself is #2134).
//
// So sample per frame from document start and latch the two moments the claim is about: when
// the trigger first has a box, and when the island first announces itself on
// `body[data-view]`. Both timestamps come from the page's own clock, so no round trip from
// the runner can sit between them and no growth of the chunk graph can close the window from
// the test side. It is the pattern `playground-first-paint.spec.ts` adopted for exactly this
// class of window, and its traps are the same: `addInitScript` runs before
// `document.documentElement` exists, so every read is optional-chained.
//
// The gate's own evidence was re-derived while the window was re-opened, because a self-check
// that has been broken for a while is not evidence that the thing under it still works: with
// `controlReady` deleted, the sheet failed to open 8 times in 8 (4 repeats x desktop and
// mobile, `build` dist) — always on `expect(dialog).toBeVisible()`, with the self-check above
// passing in every one of those runs. The window is real and the gate is what crosses it.
type HydrationWindow = { visibleAt: number | null; hydratedAt: number | null };

function readWindow(page: import('@playwright/test').Page): Promise<HydrationWindow> {
	return page.evaluate(() => (window as unknown as { __hydrationWindow: HydrationWindow }).__hydrationWindow);
}

test('@crosswidth a Galleries click waits for hydration, not just for the button', async ({ page }) => {
	await page.route(/\/_astro\/.*\.js($|\?)/, async (route) => {
		await new Promise((r) => setTimeout(r, 800));
		await route.continue();
	});
	await page.addInitScript(() => {
		const log: { visibleAt: number | null; hydratedAt: number | null } = { visibleAt: null, hydratedAt: null };
		(window as unknown as { __hydrationWindow: typeof log }).__hydrationWindow = log;
		const t0 = performance.now();
		const tick = () => {
			const at = Math.round(performance.now() - t0);
			if (log.visibleAt === null) {
				const r = document.getElementById('pg-galleries-trigger')?.getBoundingClientRect();
				if (r && r.width > 0 && r.height > 0) log.visibleAt = at;
			}
			if (log.hydratedAt === null && document.body?.hasAttribute('data-view')) log.hydratedAt = at;
			if (log.visibleAt === null || log.hydratedAt === null) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	// `commit`, not `domcontentloaded`: with the module graph delayed, DCL is a milestone on
	// the other side of hydration. Nothing below depends on it — the sampler is already
	// running by then — and waiting for it would only spend the window before looking at it.
	await page.goto('/playground/?view=edit', { waitUntil: 'commit' });

	// The trap, stated: the button passes every actionability check Playwright makes long
	// before anything is listening to it. Asserting this first is the point — it is what a
	// spec written against presence alone would have been satisfied by.
	const galleries = page.locator('#pg-galleries-trigger');
	await expect(galleries).toBeVisible();
	// POLL for the latch rather than reading it once. Playwright's own visibility check and
	// the sampler observe the same DOM from opposite sides of the wire, so the assertion above
	// can be satisfied a frame before the sampler ticks — and a bare read would then report
	// `visibleAt: null` as "the trigger never appeared".
	await expect
		.poll(async () => (await readWindow(page)).visibleAt, {
			timeout: 15_000,
			message: 'the per-frame sampler never saw the Galleries trigger get a box — the window below was never measured',
		})
		.not.toBeNull();
	const seen = await readWindow(page);
	expect(
		seen.hydratedAt === null || seen.hydratedAt > (seen.visibleAt as number),
		`the island hydrated at ${seen.hydratedAt}ms and the trigger only had a box at ${seen.visibleAt}ms — the delay never opened the window, so this test proves nothing`,
	).toBe(true);

	await controlReady(galleries);
	await galleries.click();
	await expect(page.getByRole('dialog')).toBeVisible();

	// What the window actually was on this run, in the report. An OBSERVATION, not a budget —
	// but the next person asked to re-tune the 800ms delay should not have to re-derive it.
	const settled = await readWindow(page);
	test.info().annotations.push({ type: 'hydration-window', description: `trigger ${settled.visibleAt}ms → hydrated ${settled.hydratedAt}ms` });
});

// ── The instant shell must actually FIRE (#1553) ──────────────────────────────────────────
//
// The Playground has had a pre-paint snapshot replay for as long as it has had a preview: a
// cached last slide, painted into `.pg-ssr-shell` before the island hydrates, so a reload shows
// a real slide instead of an empty pane. It was dead. Every clause of its gate passed except
// one — it compared the snapshot's hash against `lattice-docs-pg-source`, the visitor's DRAFT,
// which only exists once they have typed into the editor. A visitor who only picks components
// never writes one, so the comparison was "96ae8e9b" against the hash of the empty string, the
// replay was rejected, `data-pg-shell` was never set, and the preview pane stayed a void for
// the ~4s until the engine rendered. It failed silently and no test could see it, because every
// existing assertion waits for the LIVE filmstrip, which arrives either way.
//
// So this asserts the thing that was missing: that the shell is switched ON at some point
// during a reload. It deliberately does not assert what the slide looks like — the point is the
// mechanism running at all.
test('a reload replays the cached slide before the engine renders', async ({ page }) => {
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	// Let a real session produce a real snapshot — the capture is the app's own, not hand-fed.
	await expect(page.locator('#pg-split-preview')).toBeVisible();
	await expect.poll(async () => await page.evaluate(() => !!localStorage.getItem('lattice-docs-pg-last-slide')), { timeout: 30_000 }).toBe(true);

	// Watch for the attribute across the whole reload: it is raised pre-paint and dropped again
	// when the live filmstrip takes over, so polling after the fact would miss it entirely.
	// Sampled per frame rather than with a MutationObserver: an init script runs at
	// document-start, when `document.documentElement` may not exist yet — observing null throws,
	// the flag never sets, and the test fails on a build where the shell works fine (it did).
	await page.addInitScript(() => {
		(window as unknown as { __shellFired: boolean }).__shellFired = false;
		const tick = () => {
			if (document.documentElement?.getAttribute('data-pg-shell') === 'on') {
				(window as unknown as { __shellFired: boolean }).__shellFired = true;
				return;
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect
		.poll(async () => await page.evaluate(() => (window as unknown as { __shellFired: boolean }).__shellFired), {
			timeout: 20_000,
			message: 'the pre-paint snapshot replay never ran — the preview pane was empty until the engine rendered',
		})
		.toBe(true);
});
