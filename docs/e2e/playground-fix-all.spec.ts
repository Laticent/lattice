import { expect, test } from '@playwright/test';

// The Playground's Alt-Shift-F runs the same "Fix all" as the Studio, through Squadra's fix driver,
// and says the same thing when it finishes (docs/src/lib/fix-all-notice.ts). Its editor is a lazy
// chunk, so the notice travels by lib/notify's action event rather than an import; this arm proves
// the event reaches a real toast. The refusal is the 500-pass cap: 501 inline-title cards on one
// slide (docs/e2e/editor-lint.spec.ts drives the Studio's side of the same deck).
const REFUSED_DECK = [
	'---', 'theme: indaco', '---', '', '# Title', '', '---', '', '<!-- _class: cards-grid -->', '', '## Bets', '',
	...Array.from({ length: 501 }, (_, i) => `- **Bet ${i}.** body ${i}`),
	'',
].join('\n');

// Not on `webkit-phone`: Alt-Shift-F is a keyboard shortcut, and the phone has no keyboard (driven
// there on 2026-10-29, the key never reached the editor, before any of this PR's code runs). The iPad
// project, with a hardware keyboard, runs it; the Studio's arm covers the phone through the palette.
test('@crosswidth @webkit-tablet @gecko Alt-Shift-F in the Playground names a fix it refused, and why', async ({ page }) => {
	test.setTimeout(150_000);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	const editor = page.locator('.cm-content').first();
	await expect(editor).toBeVisible({ timeout: 40_000 });
	await editor.click();
	// Select all, checked rather than assumed: CodeMirror reads the iPhone's user agent as a Mac, so
	// there it is Meta+A, and Control+A selects nothing (the reasoning is on studio-fixture.ts's
	// `selectAllInEditor`, which this mirrors for the Playground's editor).
	for (const combo of ['ControlOrMeta+a', 'Meta+a']) {
		await page.keyboard.press(combo);
		if (await page.evaluate(() => (window.getSelection()?.toString() ?? '').length > 0)) break;
	}
	await page.keyboard.press('Delete');
	await expect(editor).toHaveText('');
	await page.keyboard.insertText(REFUSED_DECK);
	// The key is consumed only once lint is live for the deck; the lint core loads on demand. CodeMirror
	// draws a lint underline only on lines in view, and the one card finding is near the top.
	await page.keyboard.press('ControlOrMeta+Home');
	await expect(page.locator('.cm-lintRange').first()).toBeAttached({ timeout: 40_000 });
	await page.keyboard.press('Alt+Shift+F');
	await expect(page.getByText('Fixed 500 issues. 1 fix was not applied.')).toBeVisible({ timeout: 90_000 });
	await expect(page.getByText('Slide 2, card-style-inline-title: Fix all stopped before reaching it; press Fix all again.')).toBeVisible();
	// CodeMirror draws only the lines in view; the first card is, and it was rewritten.
	await expect(editor).not.toContainText('**Bet 0.**');
	await expect(editor).toContainText('- Bet 0');
});
