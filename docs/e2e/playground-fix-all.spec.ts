import { expect, type Locator, type Page, test } from '@playwright/test';

// The Playground's Alt-Shift-F runs the same "Fix all" as the Studio, through Squadra's fix driver,
// and says the same thing when it finishes (docs/src/lib/fix-all-notice.ts). Its editor is a lazy
// chunk, so the notice travels by lib/notify's action event rather than an import; this arm proves
// the event reaches a real toast. The refusal is the 500-pass cap: 501 inline-title cards on one
// slide (docs/e2e/editor-lint.spec.ts drives the Studio's side of the same deck).
const REFUSED_DECK = [
	'---', 'theme: indaco', '---', '', '# Title', '', '---', '', '<!-- @meta{layout=cards-grid} -->', '', '## Bets', '',
	...Array.from({ length: 501 }, (_, i) => `- **Bet ${i}.** body ${i}`),
	'',
].join('\n');

/** Opens the Playground's editor on the 501-card deck and waits until lint is live for it (Alt-Shift-F is consumed only then). */
async function loadRefusedDeck(page: Page): Promise<Locator> {
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
	return editor;
}

// Not on `webkit-phone`: Alt-Shift-F is a keyboard shortcut, and the phone has no keyboard (driven
// there on 2026-10-29, the key never reached the editor, before any of this PR's code runs). The iPad
// project, with a hardware keyboard, runs it; the Studio's arm covers the phone through the palette.
test('@crosswidth @webkit-tablet @gecko Alt-Shift-F in the Playground names a fix it refused, and why', async ({ page }) => {
	test.setTimeout(150_000);
	const editor = await loadRefusedDeck(page);
	await page.keyboard.press('Alt+Shift+F');
	await expect(page.getByText('Fixed 500 issues. 1 fix was not applied.')).toBeVisible({ timeout: 90_000 });
	await expect(page.getByText('Slide 2, card-style-inline-title: Fix all stopped before reaching it; press Fix all again.')).toBeVisible();
	// CodeMirror draws only the lines in view; the first card is, and it was rewritten.
	await expect(editor).not.toContainText('**Bet 0.**');
	await expect(editor).toContainText('- Bet 0');
});

// Alt-Shift-F's passes run between keystrokes (lint-core `fixAllDetailed` with a pause), so the author can act while it
// works, and the Playground's `fixAllCommand` keeps the Studio's two guards: a result computed from a text that has since
// changed is not written, and says so; and a second press while a run is going starts nothing.
const STALE = 'The deck changed while Fix all was running, so nothing was changed. Press Fix all again.';

test('@crosswidth @webkit-tablet @gecko typing while Alt-Shift-F runs keeps the typing, writes no fixes, and says so', async ({ page }) => {
	test.setTimeout(150_000);
	const editor = await loadRefusedDeck(page);
	await page.keyboard.press('Alt+Shift+F');
	// Type only once the run has read the deck: before that, the typing is part of what it fixes (the driver's chunk
	// loads first; 50 ms of margin in Chromium, measured). Editor.tsx, deck-lint.ts and editor.js mark the run.
	await expect(page.locator('html[data-fix-all-running]')).toBeAttached({ timeout: 30_000 });
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('TYPED');
	await expect(page.getByText(STALE)).toBeVisible({ timeout: 90_000 });
	await expect(editor).toContainText('TYPED');
	await expect(page.getByText(/^Fixed \d+ issue/)).toHaveCount(0);
	// Nothing from the run was written: the first card, drawn once it is in view, keeps its inline title.
	await page.keyboard.press('ControlOrMeta+Home');
	await expect(editor).toContainText('**Bet 0.**');
});

test('@crosswidth @webkit-tablet @gecko a second Alt-Shift-F while one runs starts nothing', async ({ page }) => {
	test.setTimeout(150_000);
	await loadRefusedDeck(page);
	// Count Fix all's announcements on the channel the Playground raises them by (fix-all-notice.ts
	// `announceFixAllByEvent`), not on the pill: the pill shows one message at a time, and a second message raised
	// within a fraction of a second of the first can fail to replace it (seen with this guard off: a stale notice
	// raised 78 ms after "Fixed 500" never showed), so the pill alone can pass a test whose guard is gone.
	await page.evaluate(() => {
		const w = window as unknown as { __fixNotices: string[] };
		w.__fixNotices = [];
		window.addEventListener('lattice:notify-action', (e) => {
			const m = (e as CustomEvent<{ message?: string }>).detail?.message ?? '';
			if (/^Fixed \d+ issue|^The deck changed while Fix all/.test(m)) w.__fixNotices.push(m);
		});
	});
	await page.keyboard.press('Alt+Shift+F');
	await page.keyboard.press('Alt+Shift+F');
	await expect(page.getByText('Fixed 500 issues. 1 fix was not applied.')).toBeVisible({ timeout: 90_000 });
	// An absence needs the work it would come from to have had its turn: a second run started with the first shares the
	// page with it pass by pass and ends a few passes after it, inside 150 painted frames (a whole run paints at least
	// 128). Counted in frames, not milliseconds (HARD RULE #32).
	await page.evaluate(
		() =>
			new Promise<void>((done) => {
				let left = 150;
				const tick = () => (--left <= 0 ? done() : requestAnimationFrame(tick));
				requestAnimationFrame(tick);
			}),
	);
	// One run, one announcement: a second run would raise its own (stale, or "Fixed 1 issue.").
	expect(await page.evaluate(() => (window as unknown as { __fixNotices: string[] }).__fixNotices)).toEqual(['Fixed 500 issues. 1 fix was not applied.']);
});
