import type { Page } from '@playwright/test';
import { openDeckInCompose } from './compose-insert';
import { editorFocusSettled, expect, pressSettled, test } from './studio-fixture';

// A CLICK DURING AN UNDO'S FLASH KEEPS THE CARET WHERE IT WAS PUT.
//
// An undo or redo in Compose flashes the slide it changed, and about three seconds later the flash clears itself with a
// transaction that no key or click started (change-flash.ts). A person undoes, clicks another slide and types inside those
// three seconds. The click moves the DOM caret at once, but ProseMirror reads that move from `selectionchange`, a queued
// task. When the flash cleared in between, its transaction was built on the OLD selection, `updateState` wrote that old caret
// back over the click, and the typing landed in the slide the caret came from, mid-paragraph. Measured 2026-11-17 with real
// clicks and keys: 1 in 48 at a person's pace in WebKit under load, and on the Studio E2E nightly (filo-compose.spec.ts).
//
// The race needs the clear to run between the caret move and its `selectionchange`. A real click cannot be timed into that
// gap (HARD RULE #32), so the test makes the gap: in ONE page task it moves the DOM caret the way a click does, then ends the
// flash's fade, which runs the clear synchronously. `selectionchange` cannot run inside that task, so the clear meets exactly
// the state a click leaves.
const DECK = ['<!-- _class: content -->\n\n# One\n\nBody one.', '<!-- _class: content -->\n\n# Two\n\nBody two.', '<!-- _class: content -->\n\n# Three\n\nBody three.'].join('\n\n---\n\n');

const slides = (page: Page) => page.locator('.cs-host .cs-slide');

async function undo(page: Page): Promise<void> {
	const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
	await page.keyboard.press(mac ? 'Meta+z' : 'Control+z');
}

// `@gecko` runs on desktop (Chromium) and gecko; `@webkit-tablet` on its own project (the desktop project leaves WebKit-tagged titles out).
for (const tag of ['@gecko', '@webkit-tablet']) test(`a click while an undo's flash is showing keeps the caret, and the typing lands where it was put ${tag}`, async ({ page }) => {
	await openDeckInCompose(page, DECK);
	await slides(page).nth(1).locator('p').last().click();
	await editorFocusSettled(page);
	await pressSettled(page, 'End');
	await page.keyboard.insertText(' MARK');
	await expect(slides(page).nth(1)).toContainText('Body two. MARK');
	await undo(page);
	await expect(slides(page).nth(1)).not.toContainText('MARK');
	// Witness: the undo's flash is on screen, so there is a clear still to come.
	await expect(page.locator('.cs-host .cs-flash-block').first()).toBeAttached();

	const { before, left } = await page.evaluate(() => {
		const pm = document.querySelector('.cs-host .ProseMirror') as HTMLElement;
		// Counted in this task: a flash that faded on its own between two round trips would make the clear below a no-op.
		const before = document.querySelectorAll('.cs-host .cs-flash-block').length;
		// The DOM caret moves into slide 1's text, at its end, as a click there moves it.
		const para = [...document.querySelectorAll('.cs-host .cs-slide')][0].querySelectorAll('p');
		const walker = document.createTreeWalker(para[para.length - 1], NodeFilter.SHOW_TEXT);
		let text: Text | null = null;
		for (let n = walker.nextNode(); n; n = walker.nextNode()) text = n as Text;
		if (!text) throw new Error('slide 1 has no text to put the caret in');
		document.getSelection()?.collapse(text, text.length);
		// The flash's fade ends now, in this same task: the plugin's `animationend` listener clears it.
		for (const a of pm.getAnimations({ subtree: true })) a.finish();
		pm.dispatchEvent(new AnimationEvent('animationend', { animationName: 'cs-flash-out-line', bubbles: true }));
		return { before, left: document.querySelectorAll('.cs-host .cs-flash-block').length };
	});
	// Witness: the flash was still up when the caret moved, and the clear ran inside the task, before `selectionchange` could.
	expect(before, 'the flash was still showing when the caret moved').toBeGreaterThan(0);
	expect(left, 'the flash cleared before ProseMirror read the caret move').toBe(0);

	await page.keyboard.insertText(' NEW');
	await expect(slides(page).nth(0), 'the typing went where the caret was put').toContainText('Body one. NEW');
	await expect(slides(page).nth(1), 'the typing did not go back to the slide the caret came from').not.toContainText('NEW');
});
