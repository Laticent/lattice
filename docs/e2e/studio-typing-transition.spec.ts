import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, openInspector, openSection, persistedSource, setEditorContent, test } from './studio-fixture';

// THE EDITOR'S TYPING IS A TRANSITION (StudioShell.tsx setSourceFromEditor): the shell's `source` can trail the
// editor by a keystroke or two while React renders. Anything that is not typing must act on the LATEST text: a
// click (a slide action, a settings switch), and the save when the page goes away. Each case types (as the author,
// through CodeMirror) and then acts in ONE page task, so no render of the typed text can land in between, and fails
// if the action used the text without the last keystrokes. That makes the race exist on every engine; Chromium also
// throttles the CPU, which widens it further. engineering/decisions/2026-10-29-studio-activity-audit.md.

const DECK = ['# One', '', 'First slide.', '', '---', '', '# Two', '', 'Second slide.', ''].join('\n');
// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle, as editor-cursor-channel.test.tsx does.
const editorDoc = (page: Page) => page.evaluate(() => ((document.querySelector('.cm-content') as any)?.cmTile?.root?.view?.state?.doc?.toString() ?? ''));

async function throttled(page: Page, browserName: string): Promise<void> {
	if (browserName !== 'chromium') return;
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
}

// One body, two tags: `@gecko` runs on desktop Chromium AND Firefox; `@webkit-tablet` on WebKit.
for (const tag of ['@gecko', '@webkit-tablet']) test.describe(`typing in flight ${tag}`, () => {
	test('a slide action right after typing keeps the last keystrokes', async ({ page, browserName }) => {
		await gotoStudio(page);
		await setEditorContent(page, DECK);
		await expect.poll(() => editorDoc(page)).toBe(DECK);
		await throttled(page, browserName);
		// The menu opens first; then ONE page task types into the editor (as the author, through CodeMirror) and presses
		// Duplicate, so the press lands before any render of the typed text. That is harsher than real input (a key and
		// a press are separate events, and before the transition each key rendered synchronously), and the pre-transition
		// build fails it too; it pins the guarantee the transition needs: a press commits the typing in flight before
		// any handler reads it (StudioShell.tsx catchUpEditor). Playwright's own clicks wait for the element to settle,
		// long enough for the transition to land and hide the race.
		await page.locator('[data-strip]').filter({ visible: true }).getByRole('button', { name: 'Slide actions' }).first().click();
		const item = page.locator('[data-strip-menu-content] [data-strip-action="duplicate"]');
		await item.waitFor();
		await item.evaluate((el) => {
			// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle, as editorDoc does.
			const view = (document.querySelector('.cm-content') as any)?.cmTile?.root?.view;
			view.dispatch({ changes: { from: view.state.doc.length, insert: 'KEEPME' }, userEvent: 'input.type' });
			el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse' }));
			el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse' }));
			(el as HTMLElement).click();
		});
		await expect.poll(() => editorDoc(page).then((d) => d.split('KEEPME').length - 1), { message: 'the duplicate was made from text without the last keystrokes' }).toBe(2);
	});

	test('a settings switch right after typing keeps the last keystrokes and writes the setting', async ({ page, browserName }) => {
		await gotoStudio(page);
		await setEditorContent(page, DECK);
		await expect.poll(() => editorDoc(page)).toBe(DECK);
		// The docked Inspector stays open beside the editor, so ONE click lands while the typing is in flight.
		await openInspector(page);
		await openSection(page, CHROME.deckTab.chrome);
		const toggle = page.getByRole('switch', { name: 'Page numbers' });
		await expect(toggle).toHaveAttribute('aria-checked', 'true');
		await throttled(page, browserName);
		// Types and presses in one page task: Playwright's own click waits for the element to settle, two animation
		// frames, long enough for the transition to land and hide the race this pins.
		await toggle.evaluate((el) => {
			// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle, as editorDoc does.
			const view = (document.querySelector('.cm-content') as any)?.cmTile?.root?.view;
			view.dispatch({ changes: { from: view.state.doc.length, insert: 'KEEPTOO' }, userEvent: 'input.type' });
			el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse' }));
			el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse' }));
			(el as HTMLElement).click();
		});
		await expect.poll(() => editorDoc(page), { message: 'the settings write landed without the last keystrokes, or not at all' }).toMatch(/paginate: false[\s\S]*KEEPTOO/);
	});

	test('leaving the page right after typing saves the last keystrokes', async ({ page, browserName }) => {
		await gotoStudio(page);
		await setEditorContent(page, DECK);
		await expect.poll(() => editorDoc(page)).toBe(DECK);
		await throttled(page, browserName);
		await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle, as editorDoc does.
			const view = (document.querySelector('.cm-content') as any)?.cmTile?.root?.view;
			view.dispatch({ changes: { from: view.state.doc.length, insert: 'SAVEME' }, userEvent: 'input.type' });
			window.dispatchEvent(new Event('pagehide'));
		});
		expect(await persistedSource(page), 'the save on leaving wrote text without the last keystrokes').toContain('SAVEME');
	});
});
