import fs from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { encodeGiftToken } from '../../lib/core/gift-link.mjs';

const AXE_SRC = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

// GIFT LINKS — /gift reads a key from the URL fragment (engineering/decisions/2026-11-06-gift-link-cli.md §6).
//
// FAKE KEYS ONLY, and no request to OpenRouter: the page stores the key without checking it (a card's
// key may still be activating), so nothing here needs a route mock. The PIN salt is fixed so every run
// builds the same link (HARD RULE #32).

const KEY = `sk-or-v1-${'0123456789abcdef'.repeat(4)}`;
const OTHER = `sk-or-v1-${'f'.repeat(64)}`;
const SALT = [1, 2, 3, 4, 5, 6, 7, 8];

const state = (page: import('@playwright/test').Page, s: string) => expect(page.locator('.gift-card')).toHaveAttribute('data-gift-state', s);

test.describe('gift link @crosswidth', () => {
	test('a plain link stores the key, clears the fragment, and the Studio fills chat from it', async ({ page }) => {
		await page.goto(`/gift/#${await encodeGiftToken(KEY)}`);
		await state(page, 'ready');
		// The key never stays in the address bar, the history entry or a shared tab.
		expect(new URL(page.url()).hash).toBe('');
		const stored = await page.evaluate(() => localStorage.getItem('lattice-db-or-key'));
		expect(stored, 'sealed, never in clear').toMatch(/^v1:/);
		expect(stored).not.toContain(KEY.slice(9));
		await page.getByRole('link', { name: 'Open the Studio' }).click();
		await expect
			.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lattice-studio-chat-selection') ?? '{}').provider), { timeout: 60_000 })
			.toBe('openrouter');
	});

	test('a locked link asks for the PIN, refuses a wrong one in words, and opens with the right one', async ({ page }) => {
		await page.goto(`/gift/#${await encodeGiftToken(KEY, { pin: '482913', salt: SALT })}`);
		await state(page, 'pin');
		await page.getByLabel('PIN').fill('111111');
		await page.getByRole('button', { name: 'Unlock' }).click();
		await expect(page.getByRole('alert')).toHaveText('That PIN does not open this gift link.');
		await page.getByLabel('PIN').fill('482 913');
		await page.getByRole('button', { name: 'Unlock' }).click();
		await state(page, 'ready');
	});

	test('a different stored key is replaced only when the visitor says so', async ({ page }) => {
		await page.goto(`/gift/#${await encodeGiftToken(OTHER)}`);
		await state(page, 'ready');
		await page.goto('about:blank');
		await page.goto(`/gift/#${await encodeGiftToken(KEY)}`);
		await state(page, 'replace');
		const before = await page.evaluate(() => localStorage.getItem('lattice-db-or-key'));
		await page.getByRole('button', { name: 'Use the gift' }).click();
		await state(page, 'ready');
		expect(await page.evaluate(() => localStorage.getItem('lattice-db-or-key'))).not.toBe(before);
	});

	test('a damaged link, or none, says so and stores nothing', async ({ page }) => {
		const token = await encodeGiftToken(KEY);
		await page.goto(`/gift/#${token.slice(0, 10)}${token[10] === 'Z' ? 'Y' : 'Z'}${token.slice(11)}`);
		await state(page, 'error');
		await expect(page.locator('[data-error-text]')).toContainText('damaged');
		await page.goto('/gift/');
		await state(page, 'error');
		expect(await page.evaluate(() => localStorage.getItem('lattice-db-or-key'))).toBeNull();
	});
});

test('the ready and PIN states have no axe findings, in either color mode', async ({ page }) => {
	const scan = async () => {
		await page.addScriptTag({ content: AXE_SRC });
		const ids = await page.evaluate(async () => {
			// biome-ignore lint/suspicious/noExplicitAny: axe is injected at runtime
			const r = await (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
			return r.violations.map((v: { id: string; nodes: { target: string[] }[] }) => `${v.id} @ ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
		});
		return ids;
	};
	for (const scheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		await page.goto(`/gift/#${await encodeGiftToken(KEY, { pin: '482913', salt: SALT })}`);
		await state(page, 'pin');
		expect(await scan(), `${scheme} PIN state`).toEqual([]);
		await page.getByLabel('PIN').fill('482913');
		await page.getByRole('button', { name: 'Unlock' }).click();
		await state(page, 'ready');
		expect(await scan(), `${scheme} ready state`).toEqual([]);
	}
});

test('on a phone, the gift offers "Send to my laptop" @webkit-phone', async ({ page }) => {
	await page.goto(`/gift/#${await encodeGiftToken(KEY, { pin: '482913', salt: SALT })}`);
	await state(page, 'pin');
	await page.getByLabel('PIN').fill('482913');
	await page.getByRole('button', { name: 'Unlock' }).click();
	await state(page, 'ready');
	await expect(page.getByRole('button', { name: 'Send to my laptop' })).toBeVisible();
});
