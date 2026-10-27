import { expect, test } from '@playwright/test';

/**
 * The Playground editor does not lint while it is hidden (`docs/src/playground/editor.js`, lever A of
 * engineering/decisions/2026-10-26-lighthouse-home-runtime-prefetch.md §9). Explore hides the editor with
 * `display: none`, and a lint there fetched the 279 KB lint core (`esm/lint.js`) and linted a draft nobody
 * could see. Both arms read what the gate changes: the request that must not happen, and the underline
 * that must still appear once the editor is shown. Only the third test proves the no-edit show path: in the
 * first, the switch to Edit swaps in the walked deck, which is an edit of its own.
 */

const SOURCE_KEY = 'lattice-docs-pg-source';
// `kpii` is one character off `kpi`: an unknown component, so the lint has a finding to underline.
const DECK = '---\ntheme: cuoio\n---\n\n<!-- _class: kpii -->\n\n# Stray slide\n';
const LINT_CORE = /\/esm\/lint\.js(\?|$)/;

test.beforeEach(async ({ page }) => {
	await page.addInitScript(
		([key, src]) => {
			try {
				localStorage.setItem(key as string, src as string);
			} catch {
				/* a blocked store just means the draft does not seed */
			}
		},
		[SOURCE_KEY, DECK],
	);
});

test('@crosswidth Explore never loads the lint core; Edit loads it and lints', async ({ page }) => {
	const lintLoads: string[] = [];
	page.on('request', (r) => {
		if (LINT_CORE.test(r.url())) lintLoads.push(r.url());
	});
	await page.goto('/playground/?c=kpi&view=read', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('body')).toHaveAttribute('data-view', 'read');
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/, { timeout: 90_000 });
	// The linter's first run is 350 ms after the editor mounts; give it several times that.
	await page.waitForTimeout(3_000);
	expect(lintLoads, 'the lint core loaded while the editor was hidden').toEqual([]);
	await expect(page.locator('.cm-lintRange')).toHaveCount(0);

	await page.getByRole('tab', { name: 'Edit' }).click();
	await expect(page.locator('body')).toHaveAttribute('data-view', 'edit');
	await expect.poll(() => lintLoads.length, { timeout: 30_000 }).toBeGreaterThan(0);

	// And the lint is live: a stray component gets its underline.
	await page.locator('.cm-content').first().click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\n---\n\n<!-- _class: kpii -->\n\n# Stray\n');
	await expect(page.locator('.cm-lintRange').first()).toBeVisible({ timeout: 30_000 });
});

test('@crosswidth an Edit-first visit lints at once, as before', async ({ page }) => {
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.cm-content').first()).toContainText('kpii', { timeout: 40_000 });
	await expect(page.locator('.cm-lintRange').first()).toBeVisible({ timeout: 30_000 });
});

test('@crosswidth showing a hidden editor lints it with no edit', async ({ page }) => {
	// The seeded draft has a finding from the first byte, and the editor pane is hidden before the page paints,
	// the way Explore and a phone's preview pane hide it. Removing the style is the only thing that happens next,
	// so the underline can come only from the show itself (the ResizeObserver in editor.js).
	await page.addInitScript(() => {
		const hide = () => {
			const s = document.createElement('style');
			s.id = 'e2e-hide-editor';
			s.textContent = '.pg-editor-host { display: none !important; }';
			document.head.append(s);
		};
		if (document.head) hide();
		else document.addEventListener('DOMContentLoaded', hide, { once: true });
	});
	const lintLoads: string[] = [];
	page.on('request', (r) => {
		if (LINT_CORE.test(r.url())) lintLoads.push(r.url());
	});
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await page.locator('.cm-content').first().waitFor({ state: 'attached', timeout: 40_000 });
	await page.waitForTimeout(3_000);
	expect(lintLoads, 'the lint core loaded while the editor was hidden').toEqual([]);
	await page.evaluate(() => document.getElementById('e2e-hide-editor')?.remove());
	await expect(page.locator('.cm-lintRange').first()).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('.cm-lintRange').first()).toContainText('kpii');
});
