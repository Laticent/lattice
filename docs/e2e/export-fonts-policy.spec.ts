import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// The font policy (lib/core/font-policy.js) on the REAL Studio: the Share → Webpage panel's "Fonts" choice decides how much
// of the emoji font the downloaded player carries. The oracle is the downloaded FILE: its emoji @font-face rules and size.
test.describe.configure({ timeout: 300_000 });

const DECK = '# Launch \u{1F680} \u{2705}\n\nFlag \u{1F1EB}\u{1F1F7}\n';

async function webpage(page: Page, emoji?: string): Promise<string> {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: /Webpage/ }).click();
	if (emoji) await dialog.getByRole('combobox', { name: 'Emoji font' }).selectOption(emoji);
	const download = page.waitForEvent('download', { timeout: 240_000 });
	await dialog.getByRole('button', { name: /Download webpage/ }).click();
	return readFileSync((await (await download).path()) as string, 'utf8');
}

const emojiFaces = (html: string) => [...html.matchAll(/@font-face\{[^}]*Noto Color Emoji[^}]*\}/g)].map((m) => m[0]);

test('@smoke Share → Webpage cuts the emoji font to the deck by default, and System ships none', async ({ page }) => {
	const exact = await webpage(page);
	const faces = emojiFaces(exact);
	expect(faces.length).toBeGreaterThan(0);
	// Cut to the deck's three emoji: a few KB each, never a 60 to 700 KB slice.
	expect(Math.max(...faces.map((f) => f.length))).toBeLessThan(20_000);
	const none = await webpage(page, 'system');
	expect(emojiFaces(none).length).toBe(0);
});
