/**
 * A code block's copy buttons on the real surfaces (lib/core/code-copy.mjs;
 * engineering/decisions/2026-10-15-code-plugin.md §9.7).
 *
 * Off by default: `@code{copy}` turns them on for a block. They are drawn only where a person reads
 * in a browser, never in an export. Both halves are driven here:
 *   - the Studio's live preview, whose box takes no pointer events, so the click goes through the
 *     page's bridge (docs/src/playground/code-copy-host.js) — and the clipboard is read back;
 *   - the exported webpage: baked in the Studio's capture frame, so its HTML must hold the marker and
 *     no button, and opened as a file, where the player draws them and they copy text and HTML.
 */
import fs from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, gotoStudio, LIVE_PREVIEW, setEditorContent, shareExport, test } from './studio-fixture';

const DECK = ['# Copy', '', '`@code{copy}`', '```ts', 'const answer = 42;', '```', '', '```ts', 'const quiet = 1;', '```', ''].join('\n');

test.skip(({ isMobile }) => isMobile, 'the editor and the preview share one pane on a phone; the desktop project covers the buttons');

async function clipboardText(page: Page): Promise<string> {
	return page.evaluate(() => navigator.clipboard.readText());
}

test('the Studio preview draws the buttons on a block that asks, and a click copies its code', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	const frame = page.frameLocator(LIVE_PREVIEW);
	await expect(frame.locator('pre[data-copy] .lat-code-copy-btn')).toHaveCount(2, { timeout: 20_000 });
	await expect(frame.locator('pre:not([data-copy]) .lat-code-copy-btn'), 'a block that does not ask has none').toHaveCount(0);

	await page.evaluate(() => navigator.clipboard.writeText('before'));
	const box = await frame.locator('.lat-code-copy-btn[data-kind="text"]').boundingBox();
	expect(box, 'the button is on screen').not.toBeNull();
	if (!box) return;
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await expect.poll(() => clipboardText(page), { timeout: 10_000 }).toBe('const answer = 42;');
	await expect(frame.locator('.lat-code-copy-btn[data-kind="text"]')).toHaveAttribute('aria-label', 'Copied');
});

test('the exported webpage carries the marker and no baked button; opened, it copies code and HTML', async ({ page, context }) => {
	test.setTimeout(300_000);
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(page.frameLocator(LIVE_PREVIEW).locator('pre[data-copy]')).toHaveCount(1, { timeout: 20_000 });
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	const pending = page.waitForEvent('download', { timeout: 240_000 });
	await shareExport(page, 'webpage');
	const file = await (await pending).path();
	const html = fs.readFileSync(file, 'utf8');
	expect(html, 'the marker travels').toMatch(/<pre[^>]*\sdata-copy[\s>=]/);
	expect(html, 'the capture frame drew no button into the export').not.toMatch(/class="lat-code-copy/);

	const reader = await context.newPage();
	// The download is saved with no extension, which a browser opens as text: give it its own name.
	const page2 = test.info().outputPath('deck.html');
	fs.copyFileSync(file, page2);
	await reader.goto(`file://${page2}`);
	// Two per marked block, and the player shows each block twice: on its slide and in its reading view.
	await expect(reader.locator('pre[data-copy] .lat-code-copy-btn')).toHaveCount(4, { timeout: 20_000 });
	await reader.locator('pre[data-copy]').first().hover();
	await reader.locator('.lat-code-copy-btn[data-kind="text"]').first().click();
	await expect.poll(() => clipboardText(reader), { timeout: 10_000 }).toBe('const answer = 42;');
	await reader.locator('.lat-code-copy-btn[data-kind="html"]').first().click();
	const copied = await reader.evaluate(async () => {
		const [item] = await navigator.clipboard.read();
		const html = item.types.includes('text/html') ? await (await item.getType('text/html')).text() : '';
		const text = item.types.includes('text/plain') ? await (await item.getType('text/plain')).text() : '';
		return { html, text };
	});
	expect(copied.text).toBe('const answer = 42;');
	expect(copied.html, 'colored, inline').toMatch(/<pre style="[^"]*background[^"]*">[\s\S]*<span style="color: rgb\(/);
	expect(copied.html).toContain('answer');
	await reader.close();
});
