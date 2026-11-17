import type { Page } from '@playwright/test';
import { openDeckInCompose } from './compose-insert';
import { editorFocusSettled, expect, test } from './studio-fixture';

// THE CLICK THAT FOCUSES COMPOSE KEEPS ITS CARET.
//
// prosemirror-view's `focus` handler starts a 20 ms timer on first focus; when it fires, if the DOM selection differs from
// the last one ProseMirror read, it writes its OWN selection back (`selectionToDOM`). A click that focuses the editor moves
// the DOM caret at once, but ProseMirror reads that move from `selectionchange`, and on a busy page WebKit delivered that
// event about 190 ms after the click: the timer fired first, the caret went back to where ProseMirror had it, and the first
// words typed after opening Compose landed there (2026-11-17, real clicks on the 134 KB deck: 3 in 96 first clicks in
// WebKit). Compose now reads the click's caret on a 0 ms timer for a focus a mousedown caused (pointer-focus-caret.ts).
//
// The race is that `selectionchange` arrives AFTER prosemirror-view's 20 ms timer. The test makes that so (HARD RULE #32:
// an order, not a guessed duration): a capture listener on the document, which runs before ProseMirror's own (bubble)
// listener there, holds `selectionchange` back until the timer has run. `editorFocusSettled` waits on a 20 ms timer started
// after the focus, which runs after prosemirror-view's (same-delay timers run in start order). Then the event flows again
// and the test types. The click and the keys are real.
const DECK = ['<!-- _class: content -->\n\n# One\n\nBody one.', '<!-- _class: content -->\n\n# Two\n\nBody two.', '<!-- _class: content -->\n\n# Three\n\nBody three.'].join('\n\n---\n\n');

const slides = (page: Page) => page.locator('.cs-host .cs-slide');

// GECKO ONLY, by what the engines do, not by choice: Gecko delivers the click's `selectionchange` as an event this test can
// hold back. WebKit delivered none at all for a click that focused Compose (counted at the window, the document and the
// editor, 2026-11-17), so there is nothing to hold and no order to force; its evidence is the real-click probe in the PR
// (3 in 96 first clicks before, 0 after). Chromium's `selectionToDOM` has its own guard for a held mouse button.
test("the click that focuses Compose keeps its caret when the click's selectionchange comes late @gecko", async ({ page, browserName }) => {
		test.skip(browserName !== 'firefox', "only Gecko delivers the click's selectionchange as an event the test can hold back (see above)");
		await openDeckInCompose(page, DECK);
		await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
		// Witness: Compose does not have focus, so the click below is a FIRST focus and arms prosemirror-view's timer.
		await expect.poll(() => page.evaluate(() => !document.activeElement?.closest('.cs-host .ProseMirror'))).toBe(true);
		await page.evaluate(() => {
			const w = window as unknown as { __holdSelectionChange: boolean; __heldSelectionChanges: number };
			w.__holdSelectionChange = true;
			w.__heldSelectionChanges = 0;
			document.addEventListener(
				'selectionchange',
				(e) => {
					if (!w.__holdSelectionChange) return;
					w.__heldSelectionChanges++;
					e.stopImmediatePropagation();
				},
				true,
			);
		});

		// A real click on the end of slide 3's text.
		const box = (await slides(page).nth(2).locator('p').last().boundingBox()) as { x: number; y: number; width: number; height: number };
		await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
		await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.cs-host .ProseMirror'))).toBe(true);
		await editorFocusSettled(page);
		// Witness, and the second half of the order: the click's selectionchange has arrived and was held back, so ProseMirror
		// could not read the caret from it before the timer ran. (Chromium and WebKit deliver it after the timer on their own.)
		await expect.poll(() => page.evaluate(() => (window as unknown as { __heldSelectionChanges: number }).__heldSelectionChanges), { message: 'the click produced a selectionchange that was held back' }).toBeGreaterThan(0);
		await page.evaluate(() => {
			(window as unknown as { __holdSelectionChange: boolean }).__holdSelectionChange = false;
		});

		await page.keyboard.insertText(' NEW');
		await expect(slides(page).nth(2), 'the typing went where the click put the caret').toContainText('Body three. NEW');
		await expect(slides(page).nth(0), 'the typing did not go back to where the caret was').not.toContainText('NEW');
	});
