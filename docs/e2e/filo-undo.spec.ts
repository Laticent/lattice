// ⌘Z from any focus, on the real Studio (HARD RULE #23): Filo slice 3,
// engineering/decisions/2026-10-27-filo-undo-history.md §3.5 and §10. Every writer of the deck
// source commits to ONE history, and the Studio root sends ⌘Z / ⌘⇧Z / Ctrl+Y to it from the
// editor, the preview, the rail, a settings panel and the page body. Runs in all three engines.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, gotoStudio, railButtons, setEditorContent, test } from './studio-fixture';

const DECK = ['# Filo deck', '', 'First slide.', '', '---', '', '# Second', '', 'Second slide.', '', '---', '', '# Third', '', 'Third slide.', ''].join('\n');

// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror's view through its DOM handle.
const editorDoc = (page: Page) => page.evaluate(() => ((document.querySelector('.cm-content') as any)?.cmTile?.root?.view?.state?.doc?.toString() ?? ''));
const railIndex = (page: Page) => railButtons(page).evaluateAll((bs) => bs.findIndex((b) => b.getAttribute('aria-current') === 'true' || b.getAttribute('aria-pressed') === 'true'));
const announced = (page: Page) => page.locator('span[role="status"][aria-live="polite"]').filter({ hasText: /^(Undid|Redid|Nothing)/ });

/** Load DECK, then make one edit in the editor: `MARK` typed at the end of slide 3. */
async function editedDeck(page: Page): Promise<{ before: string; after: string }> {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => editorDoc(page)).toBe(DECK);
	// A new step: the load-in above was typing too, and ⌘Z must undo only what follows. Typing
	// joins a step only next to where the last edit ended (the document end), so the edit goes on
	// the line above: the start of slide 3's last line.
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.type('MARK ');
	const after = await editorDoc(page);
	expect(after, 'witness: the edit landed').toContain('MARK');
	return { before: DECK, after };
}

/** The undo chord, as the platform the page reports binds it (studio-filo.ts `undoChord`). */
async function chord(page: Page, verb: 'undo' | 'redo' | 'redoY'): Promise<void> {
	const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
	const mod = mac ? 'Meta' : 'Control';
	await page.keyboard.press(verb === 'undo' ? `${mod}+z` : verb === 'redo' ? `${mod}+Shift+z` : `${mod}+y`);
}

// One body, two tags: `@gecko` runs on desktop Chromium AND Firefox; `@webkit-tablet` on WebKit.
for (const tag of ['@gecko', '@webkit-tablet']) test.describe(`Filo: ⌘Z from any focus ${tag}`, () => {
	test('from the page body: undo, then redo with ⌘⇧Z and with Ctrl+Y', async ({ page }) => {
		const { before, after } = await editedDeck(page);
		await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
		expect(await page.evaluate(() => document.activeElement === document.body), 'witness: focus is on the page body').toBe(true);
		await chord(page, 'undo');
		await expect.poll(() => editorDoc(page)).toBe(before);
		await expect(announced(page)).toHaveText(/^Undid: Typing/);
		await chord(page, 'redo');
		await expect.poll(() => editorDoc(page)).toBe(after);
		await chord(page, 'undo');
		await expect.poll(() => editorDoc(page)).toBe(before);
		const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
		if (!mac) {
			await chord(page, 'redoY');
			await expect.poll(() => editorDoc(page)).toBe(after);
		}
	});

	// Safari's Edit menu Undo and iOS's shake / three-finger undo do not press ⌘Z: WebKit runs its
	// own undo command, which reaches the page as a `historyUndo` beforeinput. That command is
	// reachable here as `document.execCommand('undo')`, which raises the same event in WebKit; in
	// Chromium and Firefox it raises none (measured), so there it would test nothing. A device's
	// gesture itself, and Chrome's own Edit menu, are still not driven.
	test('WebKit\'s own undo command (Safari Edit menu, iOS shake) goes to Filo, not the editor', async ({ page, browserName }) => {
		test.skip(browserName !== 'webkit', 'execCommand raises historyUndo in WebKit only');
		const { before } = await editedDeck(page);
		await page.locator('.cm-content').first().click();
		const seen = await page.evaluate(() => {
			let type = '';
			addEventListener('beforeinput', (e) => { type ||= (e as InputEvent).inputType; }, { capture: true, once: true });
			document.execCommand('undo');
			return type;
		});
		expect(seen, 'witness: the browser raised its own history event').toBe('historyUndo');
		await expect.poll(() => editorDoc(page)).toBe(before);
		await expect(announced(page)).toHaveText(/^Undid: Typing/);
	});

	test('from the rail, and the undo reveals the slide it changed', async ({ page }) => {
		const { before } = await editedDeck(page);
		await railButtons(page).first().click();
		await expect.poll(() => railIndex(page), { message: 'witness: the rail moved to slide 1' }).toBe(0);
		// A rail click hands the caret to the editor; put the keyboard back on the rail, where an
		// author who arrows through the slides has it.
		await railButtons(page).first().focus();
		expect(await page.evaluate(() => !!document.activeElement?.closest('nav[aria-label="Slide navigator"]')), 'witness: focus is on the rail').toBe(true);
		await chord(page, 'undo');
		await expect.poll(() => editorDoc(page)).toBe(before);
		// THE REVEAL (§3.4): the edit was on slide 3, so every pane goes there.
		await expect.poll(() => railIndex(page), { message: 'the undo did not reveal the slide it changed' }).toBe(2);
	});

	test('from the preview', async ({ page }) => {
		const { before } = await editedDeck(page);
		// The middle of the slide, as an author clicks it: the frame takes no pointer events, so the
		// click lands on the Studio's own preview box, never inside the iframe.
		const box = await page.getByRole('figure', { name: 'Live deck preview' }).boundingBox();
		if (!box) throw new Error('no preview on screen');
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		expect(await page.evaluate(() => document.activeElement?.tagName !== 'IFRAME' && !document.activeElement?.closest('[data-filo-owned]')), 'witness: focus is on the preview, outside the editor and the frame').toBe(true);
		await chord(page, 'undo');
		await expect.poll(() => editorDoc(page)).toBe(before);
	});

	test('a settings write is one step, undone from the settings panel', async ({ page }) => {
		await gotoStudio(page);
		await setEditorContent(page, DECK);
		await expect.poll(() => editorDoc(page)).toBe(DECK);
		// Rename rewrites the title heading through the settings funnel.
		page.once('dialog', (d) => d.accept('Renamed deck'));
		await page.locator('header').getByRole('button', { name: /^Filo deck/ }).first().click();
		await page.getByRole('menuitem', { name: /^Rename/ }).click();
		await expect.poll(() => editorDoc(page)).toContain('# Renamed deck');
		await page.getByRole('button', { name: 'Deck scope' }).first().click();
		await page.getByRole('button', { name: 'Deck scope' }).first().focus();
		expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'witness: focus is in the settings panel').toBe('Deck scope');
		await chord(page, 'undo');
		await expect.poll(() => editorDoc(page)).toBe(DECK);
		await expect(announced(page)).toHaveText(/^Undid: Rename/);
	});

	test('from inside the deck editor, and a text field keeps its own undo', async ({ page }) => {
		const { before, after } = await editedDeck(page);
		// In the editor: Filo's undo (the editor keeps no history of its own).
		await chord(page, 'undo');
		await expect.poll(() => editorDoc(page)).toBe(before);
		await chord(page, 'redo');
		await expect.poll(() => editorDoc(page)).toBe(after);
		// A native text field (the chat composer, a settings field mid-edit) keeps the browser's
		// undo: ⌘Z there must not reach the deck.
		const field = await page.evaluate(() => {
			const el = document.createElement('input');
			el.type = 'text';
			el.id = 'filo-probe';
			document.body.append(el);
			return true;
		});
		expect(field).toBe(true);
		await page.locator('#filo-probe').click();
		await page.keyboard.type('abc');
		await chord(page, 'undo');
		// The field's own undo ran (the signal that the chord was handled)…
		await expect.poll(() => page.locator('#filo-probe').inputValue(), { message: 'the text field’s own undo did not run' }).not.toBe('abc');
		// …and the deck was left alone.
		expect(await editorDoc(page), 'a ⌘Z in a text field undid the deck').toBe(after);
	});
});

// THE MAIN-THREAD BUDGET (§4.3): no history step over 16 ms, on the 134 KB deck, in all three
// engines. The Studio wraps its Filo calls in `performance.measure` (`filo:commit`, `filo:undo`,
// `filo:redo`); this drives typing, an undo, a redo, a settings write and a whole-deck replace
// (the broad path an AI apply and an import take) and reads every measure back. The deck is seeded
// as the boot deck's saved source: typing 134 KB in is a CodeMirror cost, not a history one, and it
// ran past the timeout in WebKit.
const BIG = readFileSync(fileURLToPath(new URL('../../examples/system-design-foundations.md', import.meta.url)), 'utf8');
for (const tag of ['@gecko', '@webkit-tablet']) test(`Filo stays under 16 ms per step on the 134 KB deck ${tag}`, async ({ page }) => {
	test.setTimeout(180_000);
	await page.addInitScript((src) => {
		if (!sessionStorage.getItem('filo-seeded')) {
			localStorage.setItem('lattice-studio-src-welcome', JSON.stringify(src));
			sessionStorage.setItem('filo-seeded', '1');
		}
	}, BIG);
	await gotoStudio(page);
	await expect.poll(() => editorDoc(page).then((d) => d.length), { timeout: 60_000, message: 'witness: the 134 KB deck is open' }).toBe(BIG.length);
	await page.evaluate(() => performance.clearMeasures());
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type(' budget');
	await chord(page, 'undo');
	await chord(page, 'redo');
	page.once('dialog', (d) => d.accept('Budget deck'));
	// The deck switcher is named by the deck's title (a narrower box drops the slide count).
	await page.locator('header').getByRole('button', { name: /^How to Think About Systems/ }).first().click();
	await page.getByRole('menuitem', { name: /^Rename/ }).click();
	await expect.poll(() => editorDoc(page)).toContain('Budget deck');
	// A broad change: the whole deck replaced, then the replace undone.
	await setEditorContent(page, '# Replaced\n');
	await expect.poll(() => editorDoc(page)).toBe('# Replaced\n');
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await chord(page, 'undo');
	await expect.poll(() => editorDoc(page).then((d) => d.length), { message: 'witness: the broad change was undone' }).toBeGreaterThan(100_000);
	const measures = await page.evaluate(() => performance.getEntriesByType('measure').filter((m) => m.name.startsWith('filo:')).map((m) => ({ name: m.name, ms: m.duration })));
	const kinds = new Set(measures.map((m) => m.name));
	expect(kinds, 'witness: every kind of history step was measured').toEqual(new Set(['filo:commit', 'filo:undo', 'filo:redo']));
	expect(measures.length, 'witness: typing, undo, redo, a settings write and a broad change were measured').toBeGreaterThan(8);
	const worst = measures.reduce((a, b) => (b.ms > a.ms ? b : a));
	console.log(`[filo budget] ${tag} ${measures.length} measures, worst ${worst.name} ${worst.ms.toFixed(2)} ms; all: ${measures.map((m) => `${m.name.slice(5)} ${m.ms.toFixed(1)}`).join(', ')}`);
	expect(worst.ms, `${worst.name} took ${worst.ms.toFixed(2)} ms on the main thread`).toBeLessThan(16);
});
