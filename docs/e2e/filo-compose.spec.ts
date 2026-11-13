// Compose on Filo, on the real Studio (HARD RULE #23): slice 4 of
// engineering/decisions/2026-10-27-filo-undo-history.md (§3.3). Compose keeps no undo of its own;
// ⌘Z with focus in Compose goes to the deck's one history and lands AT ONCE (never parked until
// blur), the structural guard lets the restore of a deck wipe through, the pill's Undo drives the
// same history, and an undo waits out an IME composition. Runs in all three engines.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { DEFAULT_COALESCE_MS } from '../src/lib/filo/history';
import { openDeckInCompose, savedDeck } from './compose-insert';
import { expect, gotoStudio, test } from './studio-fixture';

const DECK = ['<!-- _class: content -->\n\n# One\n\nBody one.', '<!-- _class: content -->\n\n# Two\n\nBody two.', '<!-- _class: content -->\n\n# Three\n\nBody three.'].join('\n\n---\n\n');

/** The undo chord as the page's platform binds it (studio-filo.ts `undoChord`). */
async function chord(page: Page, verb: 'undo' | 'redo'): Promise<void> {
	const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
	const mod = mac ? 'Meta' : 'Control';
	await page.keyboard.press(verb === 'undo' ? `${mod}+z` : `${mod}+Shift+z`);
}

const slides = (page: Page) => page.locator('.cs-host .cs-slide');
const composeFocused = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('.cs-host .ProseMirror'));

/** Click at the end of slide `i`'s body paragraph, the way an author puts the caret there. */
async function caretInBody(page: Page, i: number): Promise<void> {
	await slides(page).nth(i).locator('p').last().click();
	await page.keyboard.press('End');
}

for (const tag of ['@gecko', '@webkit-tablet']) test.describe(`Compose on Filo ${tag}`, () => {
	test('⌘Z with focus in Compose undoes at once, and ⌘⇧Z redoes', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await caretInBody(page, 1);
		await page.keyboard.type(' MARK');
		await expect.poll(() => savedDeck(page)).toContain('Body two. MARK');
		expect(await composeFocused(page), 'witness: focus is in Compose').toBe(true);
		await chord(page, 'undo');
		// On screen at once, with focus still in the editor: nothing parked until blur.
		await expect(slides(page).nth(1)).not.toContainText('MARK');
		expect(await composeFocused(page), 'the undo took focus away from Compose').toBe(true);
		await expect.poll(() => savedDeck(page)).toBe(DECK);
		await chord(page, 'redo');
		await expect(slides(page).nth(1)).toContainText('Body two. MARK');
		// The next keystroke builds on what is on screen, not on a stale document.
		await page.keyboard.type('!');
		await expect.poll(() => savedDeck(page)).toContain('Body two. MARK!');
	});

	test('select all twice, Delete, then ⌘Z brings the whole deck back (the structural guard lets it through)', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await caretInBody(page, 0);
		const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
		await page.keyboard.press(mac ? 'Meta+a' : 'Control+a');
		await page.keyboard.press(mac ? 'Meta+a' : 'Control+a');
		await page.keyboard.press('Delete');
		await expect(slides(page), 'witness: the deck was wiped to one slide').toHaveCount(1);
		await chord(page, 'undo');
		await expect(slides(page), 'the undo of a deck wipe was refused').toHaveCount(3);
		await expect(slides(page).nth(2)).toContainText('Body three.');
		await expect.poll(() => savedDeck(page)).toBe(DECK);
	});

	test('the pill’s Undo drives the same history', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await caretInBody(page, 2);
		await page.keyboard.type(' PILL');
		const undo = page.locator('.cs-slide-active').getByRole('button', { name: 'Undo' });
		await expect(undo, 'the pill offers Undo once there is something to undo').toBeEnabled();
		await undo.click();
		await expect(slides(page).nth(2)).not.toContainText('PILL');
		await expect.poll(() => savedDeck(page)).toBe(DECK);
	});

	test('one history across panes: ⌘Z in Compose undoes an edit made in Markdown', async ({ page }) => {
		// The deck's load must be its OWN step. Filo coalesces typing commits less than DEFAULT_COALESCE_MS (500 ms)
		// apart, and the load and " FROMMD" both arrive as Markdown typing. On a fast runner they landed inside one window,
		// so the ⌘Z took back the load too and left the welcome deck (10 of 10 runs on compose-default, which skips a pane
		// mount; under load the gap was usually wider). The page clock is moved past the window between them.
		await page.clock.install();
		await openDeckInCompose(page, DECK);
		await page.clock.fastForward(DEFAULT_COALESCE_MS + 100);
		await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
		await page.getByLabel('Deck source').click();
		await page.keyboard.press('ControlOrMeta+End');
		await page.keyboard.type(' FROMMD');
		await expect.poll(() => savedDeck(page)).toContain('FROMMD');
		await page.getByRole('button', { name: 'Compose — rich editor', exact: true }).first().click();
		await caretInBody(page, 0);
		await chord(page, 'undo');
		await expect.poll(() => savedDeck(page)).toBe(DECK);
		await expect(slides(page).nth(2)).not.toContainText('FROMMD');
	});

	// An IME composition owns the keys: an undo asked for during one waits for it to end. A real IME is
	// not drivable here, so the composition is the browser's own `compositionstart` / `compositionend`
	// on the editor, which is what ProseMirror reads `view.composing` from.
	test('an undo during an IME composition waits for it to end, then lands', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await caretInBody(page, 1);
		await page.keyboard.type(' IME');
		await expect.poll(() => savedDeck(page)).toContain('Body two. IME');
		await page.locator('.cs-host .ProseMirror').dispatchEvent('compositionstart', { data: '' });
		await page.locator('.cs-slide-active').getByRole('button', { name: 'Undo' }).click();
		// Nothing moved while composing.
		await expect.poll(() => savedDeck(page)).toContain('Body two. IME');
		await expect(slides(page).nth(1)).toContainText('IME');
		await page.locator('.cs-host .ProseMirror').dispatchEvent('compositionend', { data: '' });
		await expect(slides(page).nth(1)).not.toContainText('IME');
		await expect.poll(() => savedDeck(page)).toBe(DECK);
	});
});

// THE BROWSER'S OWN IME PIPELINE (Chromium only: the DevTools protocol drives it). The test above
// fires bare composition events; `Input.imeSetComposition` makes Chromium compose for real: the
// composing text lands in the editor and the browser fires its own compositionstart/update/end, as
// a Japanese keyboard does. An undo pressed mid-composition must not touch the deck or tear the
// composition; when the IME commits, the undo lands, and the committed text is never left half-made.
// Still not a device's IME (UNVERIFIED there), but the same path in the browser.
test('an undo during a real Chromium IME composition waits for the commit, then lands', async ({ page, browserName }) => {
	test.skip(browserName !== 'chromium', 'the DevTools protocol drives the IME in Chromium only');
	await openDeckInCompose(page, DECK);
	await caretInBody(page, 1);
	await page.keyboard.type(' IME');
	await expect.poll(() => savedDeck(page)).toContain('Body two. IME');
	// Compose in another slide: typing never joins across a slide break, so the commit is its own
	// step and the undo's target is unambiguous (no timer to wait out).
	await caretInBody(page, 0);
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
	await expect(slides(page).nth(0)).toContainText('Body one.にほ');
	await page.locator('.cs-slide-active').getByRole('button', { name: 'Undo' }).click();
	// Mid-composition: the deck did not move and the composing text is intact.
	await expect.poll(() => savedDeck(page)).toContain('Body two. IME');
	await expect(slides(page).nth(0)).toContainText('Body one.にほ');
	// Commit the composition as composed (Chromium's insertText mid-composition commits the composing
	// text). Then the queued undo lands and takes back exactly one step, the commit, leaving the
	// typing before it.
	await cdp.send('Input.insertText', { text: 'にほ' });
	await expect.poll(() => savedDeck(page)).not.toContain('にほ');
	await expect.poll(() => savedDeck(page)).toContain('Body two. IME');
	await expect(slides(page).nth(0)).not.toContainText('にほ');
	await expect(slides(page).nth(1)).toContainText('IME');
});

// THE BUDGET FOR COMPOSE (§4.3), held as WORK, not milliseconds (HARD RULE #32). An undo on the 134 KB
// deck must touch the slide it changed and nothing else: the scoped transaction replaces ONE slide node,
// and the split and parse read only the source around that slide. The regression this guards is the
// full rebuild (every slide re-parsed and re-rendered, hundreds of ms here) or the whole-source path
// (the whole deck split and parsed on every undo). `filo:compose-work` carries what the apply did in
// its `detail`; a full rebuild leaves a `filo:compose-resync` mark. The time is logged, not asserted: a
// main-thread millisecond bar failed on runner load (19 ms against 16 in Firefox beside other engines),
// and the speed record lives in `npm run bench`'s Compose row (HARD RULE #19). The deck is seeded as the
// boot deck's saved source.
const BIG = readFileSync(fileURLToPath(new URL('../../examples/system-design-foundations.md', import.meta.url)), 'utf8');
for (const tag of ['@gecko', '@webkit-tablet']) test(`an undo in Compose replaces one slide and reads a small part of the 134 KB deck ${tag}`, async ({ page }) => {
	test.setTimeout(240_000);
	await page.addInitScript((src) => {
		if (!sessionStorage.getItem('filo-seeded')) {
			localStorage.setItem('lattice-studio-src-welcome', JSON.stringify(src));
			sessionStorage.setItem('filo-seeded', '1');
		}
	}, BIG);
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Compose — rich editor', exact: true }).first().click();
	await page.locator('.cs-host .cs-slide').nth(3).waitFor({ timeout: 60_000 });
	await page.evaluate(() => performance.clearMeasures());
	for (const i of [3, 1]) {
		await caretInBody(page, i);
		// A marker the deck does not already hold ("budget" appears in it seventeen times). WebKit
		// re-renders a replaced slide of this deck in 50-400 ms, so these waits are longer than the default.
		await page.keyboard.type(' FILOMARK');
		await chord(page, 'undo');
		await expect(slides(page).nth(i)).not.toContainText('FILOMARK', { timeout: 20_000 });
		await chord(page, 'redo');
		await expect(slides(page).nth(i)).toContainText('FILOMARK', { timeout: 20_000 });
		// A pause, so the next slide's typing is its own step.
		await page.keyboard.press('Escape');
	}
	type Work = { duration: number; scanned?: number; removed?: number; added?: number; deck?: number };
	const applies = (await page.evaluate(() =>
		performance.getEntriesByType('measure').filter((m) => m.name === 'filo:compose-work').map((m) => ({ duration: m.duration, ...((m as PerformanceMeasure).detail || {}) })),
	)) as Work[];
	const total = await page.evaluate(() => performance.getEntriesByType('measure').filter((m) => m.name === 'filo:compose-apply').map((m) => m.duration));
	const rebuilds = await page.evaluate(() => performance.getEntriesByName('filo:compose-resync').length);
	expect(rebuilds, 'an undo or redo fell back to rebuilding the whole of Compose').toBe(0);
	expect(applies.length, 'witness: two undos and two redos were applied to Compose').toBeGreaterThanOrEqual(4);
	console.log(
		`[filo compose budget] ${tag} history work ${applies.map((w) => w.duration.toFixed(1)).join(', ')} ms; read ${applies.map((w) => w.scanned).join(', ')} of ${applies[0].deck} characters; with ProseMirror's render ${total.map((m) => m.toFixed(1)).join(', ')} ms`,
	);
	for (const w of applies) {
		expect([w.removed, w.added], 'an undo or redo of one typed word replaces exactly one slide').toEqual([1, 1]);
		// Measured: 1,363 and 1,861 characters (the slide, the next slide's probe and the parse) on a deck of
		// 134,372; the whole-source path reads all of it. A sixteenth of the deck sits far from both.
		expect(w.scanned, `an undo or redo read ${w.scanned} characters of a ${w.deck}-character deck`).toBeLessThan((w.deck as number) / 16);
	}
});

