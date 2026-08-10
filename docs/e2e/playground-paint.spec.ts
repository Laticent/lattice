import { expect, test } from './studio-fixture';

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
	await page.locator('#pg-galleries-trigger').click();
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
