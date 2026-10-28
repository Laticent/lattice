import { expect, test } from '@playwright/test';

/**
 * The Playground builds CodeMirror only when someone can see it, or a reader shows up
 * (`docs/src/components/playground/EditorHost.tsx`; followup 2921-p1, note
 * engineering/decisions/2026-10-26-lighthouse-home-runtime-prefetch.md §13). On an Explore load the editor is
 * `display: none`, and `createEditor` cost 171 ms of the hydration task there. Until the view exists the host's
 * adapter holds the text, so the draft still restores and renders. Each arm reads one thing the deferral could
 * break: that no view exists when it should not, that the text the adapter holds reaches the view that does, and that a reader's
 * first sign of life builds it ahead of the switch.
 */

const SOURCE_KEY = 'lattice-docs-pg-source';
const DECK = '---\ntheme: cuoio\n---\n\n# Saved draft title\n\n---\n\n# Second slide\n';

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

test('@crosswidth an Explore load builds no editor; the switch to Edit builds it on the walked deck', async ({ page }) => {
	await page.goto('/playground/?view=read', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('body')).toHaveAttribute('data-view', 'read');
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/, { timeout: 90_000 });
	await page.waitForTimeout(3_000);
	await expect(page.locator('.cm-editor'), 'CodeMirror was built while the editor was hidden').toHaveCount(0);
	await page.getByRole('tab', { name: 'Edit' }).click();
	await expect(page.locator('body')).toHaveAttribute('data-view', 'edit');
	await expect(page.locator('.cm-content').first()).toContainText('Inventory', { timeout: 30_000 });
	await expect(page.locator('.pg-editor-placeholder')).toHaveCount(0);
	// And it is the live editor, not a picture of one.
	await page.locator('.cm-content').first().click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nTyped after the switch');
	await expect(page.locator('.cm-content').first()).toContainText('Typed after the switch');
	await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), SOURCE_KEY)).toContain('Typed after the switch');
});

test('@crosswidth the first sign of a reader builds the hidden editor ahead of the switch', async ({ page }) => {
	await page.goto('/playground/?view=read', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/, { timeout: 90_000 });
	await page.waitForTimeout(1_500);
	await expect(page.locator('.cm-editor')).toHaveCount(0);
	// The listener arrives with hydration, which the live preview has already passed; moving until it lands is belt and braces.
	await expect
		.poll(async () => {
			await page.mouse.move(40 + Math.random() * 100, 40 + Math.random() * 100);
			return page.locator('.cm-editor').count();
		}, { timeout: 15_000 })
		.toBe(1);
	// Still Explore, still hidden: warming changed nothing the reader can see.
	await expect(page.locator('body')).toHaveAttribute('data-view', 'read');
	await expect(page.locator('#editor-host')).toBeHidden();
});

test('@crosswidth an Edit-first load builds the editor at once, as before', async ({ page }) => {
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.cm-content').first()).toContainText('Saved draft title', { timeout: 40_000 });
	await expect(page.locator('.pg-editor-placeholder')).toHaveCount(0);
});

test('@crosswidth a key pressed with the caret scrolled out of the rendered lines steps from the caret', async ({ page }) => {
	// CodeMirror renders the lines near the viewport. With the caret on line 1 and the editor scrolled far
	// past them, its own ArrowDown stepped from the viewport (line 23 on an 8-slide deck); editor.js steps by
	// the document's lines from the caret when the caret is not drawn.
	const long = ['---', 'theme: cuoio', '---', ''];
	for (let i = 1; i <= 40; i++) long.push(`# Slide ${i} title`, '', '- point', '', '---', '');
	await page.addInitScript(([key, src]) => localStorage.setItem(key as string, src as string), [SOURCE_KEY, long.join('\n')]);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.cm-content').first()).toContainText('Slide 1 title', { timeout: 40_000 });
	await page.locator('.cm-content').first().focus();
	await page.evaluate(() => {
		(document.querySelector('.cm-scroller') as HTMLElement).scrollTop = 4000;
	});
	await expect(page.locator('.cm-lineNumbers .cm-activeLineGutter'), 'line 1 should be out of the rendered lines').toHaveCount(0);
	await page.keyboard.press('ArrowDown');
	await expect(page.locator('.cm-lineNumbers .cm-activeLineGutter')).toHaveText('2');
});
