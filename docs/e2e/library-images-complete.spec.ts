import type { Page } from '@playwright/test';
import { appendToEditor, CHROME, expect, gotoStudio, setEditorContent, test, typeInEditor } from './studio-fixture';

// The editor completes `asset:<name>` from the Library, in the real CodeMirror, on the real engines
// (engineering/decisions/2026-10-12-library-media-assets.md §2). Typed, not inserted: completion
// activates on typing.
test.describe.configure({ timeout: 180_000 });

async function addPhoto(page: Page, name: string) {
	await page.evaluate(async (fileName) => {
		const c = document.createElement('canvas');
		c.width = 320;
		c.height = 180;
		(c.getContext('2d') as CanvasRenderingContext2D).fillRect(0, 0, 320, 180);
		const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/png'));
		const dt = new DataTransfer();
		dt.items.add(new File([blob], fileName, { type: 'image/png' }));
		const input = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
		input.files = dt.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		// The format dialog asks how to store them; the probes take its default.
		for (let i = 0; i < 200; i++) {
			const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.textContent?.trim().startsWith('Add photo')) as HTMLButtonElement | undefined;
			if (b) {
				b.click();
				break;
			}
			await new Promise((r) => setTimeout(r, 50));
		}
	}, name);
}

async function withPhotos(page: Page) {
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Images' }).click();
	await addPhoto(page, 'Team Shot.png');
	await expect(page.locator('[data-media-card="team-shot"]')).toBeVisible();
	await page.getByRole('tab', { name: 'This deck' }).click();
	await addPhoto(page, 'Deck Only.png');
	await expect(page.locator('[data-media-card="deck-only"]')).toBeVisible();
}

const editorText = (page: Page) => page.getByLabel('Deck source');

test('@smoke typing an image reference offers the Library photos, shared and this deck’s own @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await withPhotos(page);
	await setEditorContent(page, '# Pics\n\n');
	await appendToEditor(page, '![team](as');
	const menu = page.locator('.cm-tooltip-autocomplete');
	await expect(menu).toBeVisible();
	await expect(menu.getByRole('option', { name: /asset:team-shot/ })).toBeVisible();
	await expect(menu.getByRole('option', { name: /asset:deck-only/ })).toContainText('this deck');
	// Narrow by typing, then accept: the reference lands whole.
	await page.keyboard.type('set:team');
	// Accept only once the menu has settled on the match: CodeMirror ignores an Enter that lands in its first moments.
	await expect(menu.getByRole('option', { name: /asset:team-shot/ })).toHaveAttribute('aria-selected', 'true');
	await expect(menu.getByRole('option')).toHaveCount(1);
	await page.keyboard.press('Enter');
	await expect(editorText(page)).toContainText('![team](asset:team-shot');
	// And it is the photo the slide then paints.
	await page.keyboard.type(')');
	await expect(page.locator('[aria-label="Live deck preview"] iframe.live').contentFrame().locator('img[alt="team"]').first()).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });
});

test('@smoke on a collage slide a list item offers whole photo lines, with the alt text selected @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await withPhotos(page);
	await setEditorContent(page, '<!-- _class: collage -->\n\n## Site walk\n\n');
	await typeInEditor(page, '- te');
	const menu = page.locator('.cm-tooltip-autocomplete');
	await expect(menu).toBeVisible();
	await expect(menu.getByRole('option', { name: /team-shot/ })).toContainText('photo');
	await expect(menu.getByRole('option', { name: /team-shot/ })).toHaveAttribute('aria-selected', 'true');
	await page.keyboard.press('Enter');
	await expect(editorText(page)).toContainText('![Team shot](asset:team-shot)');
	// The alt text is selected, so typing replaces it with something a screen reader can use.
	await page.keyboard.type('The whole team');
	await expect(editorText(page)).toContainText('![The whole team](asset:team-shot)');
});

test('a reference that is not asset: opens no photo menu @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await withPhotos(page);
	await setEditorContent(page, '# Pics\n\n');
	await appendToEditor(page, '![x](https://exa');
	await expect(page.locator('.cm-tooltip-autocomplete').getByRole('option', { name: /asset:/ })).toHaveCount(0);
});
