/**
 * The code formatter in the Studio (engineering/decisions/2026-10-15-code-plugin.md §6 and §9).
 *
 * Formatting is an AUTHORING step: it rewrites the source in the editor, through the same planner and
 * formatters as `lattice fmt`. The render never formats. So these drive the two ways a Studio author
 * formats — the "Format code blocks" command, and leaving the editor with a block that asks — and read
 * the result where it lands, in the deck source. Python, Java and PHP each run code that has broken in
 * a browser before (ruff's and Java's WebAssembly, PHP's file-system stub), so each is formatted here
 * rather than assumed to load.
 */
import type { Page, Request } from '@playwright/test';
import { expect, gotoStudio, LIVE_PREVIEW, setEditorContent, persistedSource as storedSource, test } from './studio-fixture';

/** The deck source the Studio autosaved, decoded (it is stored as a JSON string). */
async function persistedSource(page: Page): Promise<string> {
	const raw = await storedSource(page);
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

/** Every file a page fetches from the formatter's directory (tools/build-code-format.js). */
function formatRequests(page: Page): string[] {
	const seen: string[] = [];
	page.on('request', (r: Request) => {
		const m = r.url().match(/\/playground\/v\/[0-9a-f]+\/fmt\/([^?#/]+)/);
		if (m) seen.push(m[1]);
	});
	return seen;
}

async function runCommand(page: Page, label: string) {
	await page.keyboard.press('ControlOrMeta+k');
	await page.getByPlaceholder('Search or run a command…').fill(label);
	await page.getByRole('option', { name: label }).click();
}

test.skip(({ isMobile }) => isMobile, 'the editor and the preview share one pane on a phone; the desktop project covers the formatter');

test('"Format code blocks" rewrites the source, and nothing is fetched or formatted before it runs', async ({ page }) => {
	const fetched = formatRequests(page);
	await gotoStudio(page);
	await setEditorContent(page, [
		'# Code',
		'',
		'```ts',
		'const a={b:1}',
		'```',
		'',
		'```py',
		'def f(a,b):',
		'  return a+b',
		'```',
		'',
		'```java',
		'class A{void m(){int x=1;}}',
		'```',
		'',
		'```php',
		'<?php function f($a){return $a+1;}',
		'```',
		'',
		'`@code{format=off}`',
		'```js',
		'const  keep = 1',
		'```',
		'',
	].join('\n'));
	// The render shows the source as written: formatting is not a render step.
	await expect(page.frameLocator(LIVE_PREVIEW).locator('code.language-ts').first()).toContainText('const a={b:1}', { timeout: 20_000 });
	expect(fetched, 'no formatter is fetched until the author formats').toEqual([]);

	await runCommand(page, 'Format code blocks');
	await expect.poll(() => persistedSource(page), { timeout: 30_000 }).toContain('const a = { b: 1 };');
	const source = await persistedSource(page);
	expect(source).toContain('def f(a, b):\n    return a + b');
	expect(source).toContain('void m() {');
	expect(source).toContain('return $a + 1;');
	expect(source, 'format=off keeps its text').toContain('const  keep = 1');
	await expect(page.frameLocator(LIVE_PREVIEW).locator('code.language-ts').first()).toContainText('const a = { b: 1 };', { timeout: 20_000 });
	expect(fetched).toEqual(expect.arrayContaining(['browser.mjs', 'ruff_fmt_bg.wasm', 'tree-sitter-java_orchard.wasm']));
	await expect(page.getByText(/Formatted 4 code blocks/)).toBeVisible();
});

test('leaving the editor formats the blocks that ask, and only those', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '# Code\n\n`@code{format}`\n```ts\nconst a={b:1}\n```\n\n```ts\nconst b={c:2}\n```\n');
	await page.getByLabel('Deck source').click();
	await page.getByLabel('Deck source').blur();
	await expect.poll(() => persistedSource(page), { timeout: 30_000 }).toContain('const a = { b: 1 };');
	expect(await persistedSource(page), 'a block that does not ask keeps its text').toContain('const b={c:2}');
});
