import fs from 'node:fs';
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
	// Twice: untagged for desktop Chromium, tagged for Firefox and WebKit (the desktop project leaves out `@webkit`).
	for (const tags of ['@crosswidth ', '@gecko @webkit-tablet @webkit-phone ']) {
		test(`${tags}a Markdown paste becomes slides, layouts and formatting, never escaped text`, async ({ page }) => {
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
	}

	test('slides pasted mid-slide go after that slide and never split it', async ({ page }) => {
		const two = ['<!-- _class: big-number -->', '', '# 42%', '', 'Gross margin is up. More here.'].join('\n');
		await openDeckInCompose(page, two);
		await caretAfter(page, 'Gross margin is up. More here.');
		await page.keyboard.press('Home');
		await paste(page, { 'text/plain': '## Summary\n\nWe grew.\n\n---\n\n## Risks\n\nChurn.' });
		await expect.poll(() => savedDeck(page)).toContain('## Risks');
		const saved = await savedDeck(page);
		expect(saved).toContain('Gross margin is up. More here.');
		expect(saved.match(/_class: big-number/g)).toHaveLength(1);
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

	// The owner's ruling (2026-11-16): a pasted deck's front matter is respected. Its keys replace the deck's; a key only the
	// deck has stays.
	test("a pasted deck's settings are applied, key by key, and the Studio names them", async ({ page }) => {
		await openDeckInCompose(page, `---\ntheme: indaco\ntitle: Kickoff\n---\n\n${DECK}`);
		await caretAfter(page, 'Where we start.');
		await paste(page, { 'text/plain': `---\ntheme: cuoio\npaginate: true\n---\n\n${PASTE}` });
		await expect.poll(() => savedDeck(page)).toContain('<!-- _class: big-number -->');
		const saved = await savedDeck(page);
		expect(saved.startsWith('---\ntheme: cuoio\ntitle: Kickoff\npaginate: true\n---')).toBe(true);
		expect(saved).not.toContain('indaco');
		await expect(toastText(page)).toContainText('Applied the pasted deck');
		// One undo takes back the settings and the slides together.
		await page.locator('.cs-host .ProseMirror').focus();
		await page.keyboard.press('ControlOrMeta+z');
		await expect.poll(() => savedDeck(page)).toContain('theme: indaco');
		expect(await savedDeck(page)).not.toContain('big-number');
	});

	// Slides copied from the middle of a deck start at a break. That `---` names no setting, so it is a break, and every
	// slide lands; read as front matter, the first slide vanished (the checker on #3234).
	test('slides copied from the middle of a deck, starting at a break, all land', async ({ page }) => {
		await openDeckInCompose(page, `---\ntheme: indaco\n---\n\n${DECK}`);
		await caretAfter(page, 'Where we start.');
		await paste(page, { 'text/plain': '---\n\n# Slide A\n\n---\n\n# Slide B\n' });
		await expect.poll(() => savedDeck(page)).toContain('# Slide B');
		const saved = await savedDeck(page);
		expect(saved).toContain('# Slide A');
		expect(saved.startsWith('---\ntheme: indaco\n---')).toBe(true);
		await expect(page.locator('.cs-slide')).toHaveCount(3);
	});

	// The engine renders the paste and the spine reads the markup (HARD RULE #22). One spelling a source pattern missed
	// (a record directive, from the red team) stands in for all of them: what matters is that the check is the renderer's.
	for (const [label, payload] of [
		['a background directive', '<!-- _backgroundImage: url(https://example.com/b.png) -->'],
		['a record directive', '<!-- {footer="![](https://example.com/f.png)"} -->'],
	] as const) {
		test(`a paste that would load from another site is refused whole, with a message: ${label}`, async ({ page }) => {
			await openDeckInCompose(page, DECK);
			await caretAfter(page, 'Where we start.');
			const before = await savedDeck(page);
			await paste(page, { 'text/plain': `${payload}\n\n# Away\n\n---\n\n${PASTE}` });
			await expect(toastText(page)).toContainText('loads something from another site');
			expect(await savedDeck(page)).toBe(before);
		});
	}

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
		// The open deck is still there, unchanged, beside the new one.
		const decks = () =>
			page.evaluate(() =>
				Object.keys(localStorage)
					.filter((k) => k.startsWith('lattice-studio-src-'))
					.map((k) => localStorage.getItem(k) ?? ''),
			);
		await expect.poll(async () => (await decks()).some((d) => d.includes('Quarterly plan'))).toBe(true);
		expect((await decks()).some((d) => d.includes('Where we start.'))).toBe(true);
	});

	// THE REAL BROWSER PIPELINE (Chromium): the system clipboard written as an app writes it, and real keystrokes, so
	// the browser itself builds the paste and copy events; and a file dropped through CDP's drag input, which is how the
	// browser delivers an OS drag. The synthetic events above cover the other engines; these cover the browser's own path.
	test.describe('through the real clipboard and drag pipeline', () => {
		test.beforeEach(async ({ page, browserName }) => {
			test.skip(browserName !== 'chromium', 'the clipboard permissions and CDP drag input are Chromium’s');
			await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
		});

		/** Put flavors on the system clipboard the way VS Code or a chat app does. */
		const writeClipboard = (page: Page, data: Record<string, string>) =>
			page.evaluate(async (d) => {
				const item: Record<string, Blob> = {};
				for (const [type, value] of Object.entries(d)) item[type] = new Blob([value], { type });
				await navigator.clipboard.write([new ClipboardItem(item)]);
			}, data);

		test('⌘V of Markdown copied from a code editor (HTML + text) lands as slides', async ({ page }) => {
			await openDeckInCompose(page, DECK);
			await caretAfter(page, 'Where we start.');
			const vscode = `<meta charset="utf-8"><div style="white-space: pre;">${PASTE.split('\n').map((l) => `<div><span>${l.replace(/</g, '&lt;')}</span></div>`).join('')}</div>`;
			await writeClipboard(page, { 'text/plain': PASTE, 'text/html': vscode });
			await page.keyboard.press('ControlOrMeta+v');
			await expect.poll(() => savedDeck(page)).toContain('<!-- _class: big-number -->');
			expect(await savedDeck(page)).not.toMatch(/\\[-*#<]|\\---/);
			await expect(page.locator('.cs-slide')).toHaveCount(3);
		});

		test('⌘⇧V pastes the same Markdown as plain text, and Shift+Insert pastes it as Markdown', async ({ page }) => {
			await openDeckInCompose(page, DECK);
			await caretAfter(page, 'Where we start.');
			await writeClipboard(page, { 'text/plain': ' see **this**' });
			await page.keyboard.press('ControlOrMeta+Shift+v');
			// Plain: the asterisks are text, which the deck must write escaped so they stay text.
			await expect.poll(() => savedDeck(page)).toContain('see \\*\\*this\\*\\*');
			await page.keyboard.press('End');
			await writeClipboard(page, { 'text/plain': ' and **that**' });
			await page.keyboard.press('Shift+Insert');
			await expect.poll(() => savedDeck(page)).toContain('and **that**');
		});

		test('⌘C across slides puts their Markdown on the system clipboard', async ({ page }) => {
			await openDeckInCompose(page, `${DECK}\n\n---\n\n<!-- _class: big-number -->\n\n# 42%\n\nGross **margin**`);
			await page.locator('.cs-host .ProseMirror').getByText('Kickoff', { exact: true }).click();
			await page.keyboard.press('ControlOrMeta+a');
			await page.keyboard.press('ControlOrMeta+a');
			await writeClipboard(page, { 'text/plain': 'sentinel' });
			await page.keyboard.press('ControlOrMeta+c');
			await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).not.toBe('sentinel');
			const plain = await page.evaluate(() => navigator.clipboard.readText());
			expect(plain).toContain('<!-- _class: big-number -->');
			expect(plain).toMatch(/\n---\n/);
			expect(plain).toContain('Gross **margin**');
		});

		test('a deck file dropped through the browser drag input opens as a new deck', async ({ page }) => {
			await openDeckInCompose(page, DECK);
			const file = test.info().outputPath('dropped.md');
			fs.writeFileSync(file, PASTE);
			const box = await page.locator('.cs-host .ProseMirror').boundingBox();
			if (!box) throw new Error('no editor');
			const cdp = await page.context().newCDPSession(page);
			const at = { x: box.x + 60, y: box.y + 60 };
			const data = { items: [], files: [file], dragOperationsMask: 1 };
			await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', ...at, data });
			await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', ...at, data });
			await cdp.send('Input.dispatchDragEvent', { type: 'drop', ...at, data });
			await expect(page.locator('.cs-host .ProseMirror')).toContainText('Quarterly plan');
			await expect(page.locator('.cs-host .ProseMirror')).not.toContainText('Kickoff');
		});
	});
});
