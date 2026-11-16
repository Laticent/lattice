import type { Page } from '@playwright/test';
import { openDeckInCompose, savedDeck } from './compose-insert';
import { expect, test, toastText } from './studio-fixture';

// COMPOSE'S CLIPBOARD SPEAKS MARKDOWN (engineering/decisions/2026-11-15-compose-markdown-clipboard.md).
// Before this, on the real Studio: a Markdown paste was saved ESCAPED (`\- \*\*Revenue\*\*`, `\---`), a copy put
// only the visible words on `text/plain`, and a deck file dropped on Compose was swallowed with no message.
//
// The paste and copy are dispatched as ClipboardEvents into the editor (Firefox's paste excepted, see `paste`):
// the system clipboard is shared across the whole browser and readable only on Chromium (see
// compose-stress.spec.ts), and the handlers under test are the editor's own, which run the same either way.
// Each wait is on the saved deck, never a clock.

const DECK = ['<!-- _class: title -->', '', '# Kickoff', '', 'Where we start.'].join('\n');
const PASTE = ['# Quarterly plan', '', '- **Revenue** up 12%', '- Hiring *paused*', '', '---', '', '<!-- _class: big-number -->', '', '# 42%', '', 'Gross margin'].join('\n');

/** Put the caret at the end of the given text in Compose. */
async function caretAfter(page: Page, text: string): Promise<void> {
	const target = page.locator('.cs-host .ProseMirror').getByText(text, { exact: true }).first();
	await target.click();
	await page.keyboard.press('End');
}

/**
 * Paste `data` at the focused editor, as the browser does for ⌘V. Chromium and WebKit take a synthetic paste
 * carrying a DataTransfer; Firefox drops the `clipboardData` a page passes to the constructor (measured: the event
 * arrives with an empty one), so there it goes through the real system clipboard and a real keypress, which only
 * carries `text/plain` — enough for every Firefox case here.
 */
async function paste(page: Page, data: Record<string, string>): Promise<void> {
	if (page.context().browser()?.browserType().name() === 'firefox') {
		await page.evaluate((t) => navigator.clipboard.writeText(t), data['text/plain']);
		await page.keyboard.press('ControlOrMeta+v');
		return;
	}
	await page.evaluate((d) => {
		const dt = new DataTransfer();
		for (const [type, value] of Object.entries(d)) dt.setData(type, value);
		const el = document.activeElement as HTMLElement;
		el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
	}, data);
}

/** Fire a copy at the focused editor and return what it put on the clipboard. */
async function copy(page: Page): Promise<{ plain: string; html: string }> {
	return page.evaluate(() => {
		const dt = new DataTransfer();
		(document.activeElement as HTMLElement).dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
		return { plain: dt.getData('text/plain'), html: dt.getData('text/html') };
	});
}

test.describe('Markdown on the Compose clipboard', () => {
	test('@gecko @webkit-tablet a Markdown paste becomes slides, layouts and formatting, never escaped text', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await caretAfter(page, 'Where we start.');
		await paste(page, { 'text/plain': PASTE });
		await expect.poll(() => savedDeck(page)).toContain('<!-- _class: big-number -->');
		const saved = await savedDeck(page);
		expect(saved).toContain('# Quarterly plan');
		expect(saved).toContain('**Revenue** up 12%');
		expect(saved).not.toMatch(/\\[-*#<]|\\---/);
		await expect(page.locator('.cs-slide')).toHaveCount(3);
	});

	test("Markdown copied out of VS Code (colored HTML over Markdown text) pastes as Markdown", async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await caretAfter(page, 'Where we start.');
		const vscode = `<meta charset="utf-8"><div style="white-space: pre;">${PASTE.split('\n').map((l) => `<div><span style="color: #569cd6;">${l.replace(/</g, '&lt;')}</span></div>`).join('')}</div>`;
		await paste(page, { 'text/plain': PASTE, 'text/html': vscode });
		await expect.poll(() => savedDeck(page)).toContain('<!-- _class: big-number -->');
		expect(await savedDeck(page)).not.toContain('\\---');
	});

	test('inline Markdown joins the paragraph at the caret', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await caretAfter(page, 'Where we start.');
		await paste(page, { 'text/plain': ' Then **ship** it.' });
		await expect.poll(() => savedDeck(page)).toContain('Where we start. Then **ship** it.');
		await expect(page.locator('.cs-slide')).toHaveCount(1);
	});

	test('a pasted deck keeps this deck\'s settings and says so', async ({ page }) => {
		await openDeckInCompose(page, `---\ntheme: indaco\n---\n\n${DECK}`);
		await caretAfter(page, 'Where we start.');
		await paste(page, { 'text/plain': `---\ntheme: cuoio\npaginate: true\n---\n\n${PASTE}` });
		await expect.poll(() => savedDeck(page)).toContain('<!-- _class: big-number -->');
		const saved = await savedDeck(page);
		expect(saved).toContain('theme: indaco');
		expect(saved).not.toContain('cuoio');
		expect(saved).not.toContain('paginate');
		await expect(toastText(page)).toContainText('were not applied');
	});

	test('a pasted directive that would fetch from another site is left out, with a message', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await caretAfter(page, 'Where we start.');
		await paste(page, { 'text/plain': `<!-- _backgroundImage: url(https://example.com/b.png) -->\n\n# Away\n\n---\n\n${PASTE}` });
		await expect.poll(() => savedDeck(page)).toContain('# Away');
		expect(await savedDeck(page)).not.toContain('example.com');
		await expect(toastText(page)).toContainText('left out');
	});

	test('a copy across slides puts their Markdown on text/plain, and the HTML copy stays', async ({ page }) => {
		await openDeckInCompose(page, `${DECK}\n\n---\n\n<!-- _class: big-number -->\n\n# 42%\n\nGross **margin**`);
		await page.locator('.cs-host .ProseMirror').getByText('Kickoff', { exact: true }).click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.press('ControlOrMeta+a');
		const { plain, html } = await copy(page);
		expect(plain).toContain('<!-- _class: title -->');
		expect(plain).toContain('# Kickoff');
		expect(plain).toMatch(/\n---\n/);
		expect(plain).toContain('Gross **margin**');
		expect(html).toContain('data-lattice-origin');
	});

	test('a deck file dropped on Compose opens as a new deck and leaves the open one alone', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await page.evaluate((md) => {
			const dt = new DataTransfer();
			dt.items.add(new File([md], 'dropped.md', { type: 'text/markdown' }));
			const el = document.querySelector('.cs-host .ProseMirror') as HTMLElement;
			const r = el.getBoundingClientRect();
			const at = { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.x + 40, clientY: r.y + 40 };
			el.dispatchEvent(new DragEvent('dragenter', at));
			el.dispatchEvent(new DragEvent('dragover', at));
			el.dispatchEvent(new DragEvent('drop', at));
		}, PASTE);
		await expect(page.locator('.cs-host .ProseMirror')).toContainText('Quarterly plan');
		await expect(page.locator('.cs-host .ProseMirror')).not.toContainText('Kickoff');
	});
});
