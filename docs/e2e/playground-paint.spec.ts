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
