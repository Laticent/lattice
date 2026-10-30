// Undo survives a reload, on the real Studio (HARD RULE #23): Filo slice 5,
// engineering/decisions/2026-10-27-filo-undo-history.md §5. The three acceptance tests of §5:
// edit, reload, ⌘Z; a page killed between the Studio's source write and Filo's IndexedDB write;
// and the source changed behind the Studio's back. Runs in all three engines.
import type { Page } from '@playwright/test';
import { savedDeck } from './compose-insert';
import { expect, gotoStudio, setEditorContent, test, waitForStudioPaint } from './studio-fixture';

const DECK = ['# Reload deck', '', 'First slide.', '', '---', '', '# Second', '', 'Second slide.', ''].join('\n');

// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror's view through its DOM handle.
const editorDoc = (page: Page) => page.evaluate(() => ((document.querySelector('.cm-content') as any)?.cmTile?.root?.view?.state?.doc?.toString() ?? ''));
const announced = (page: Page) => page.locator('span[role="status"][aria-live="polite"]').filter({ hasText: /^(Undid|Redid|Nothing)/ });

/** Every stored history's text, from Filo's IndexedDB store (`studio-filo-persist.ts` FILO_DB). */
const storedTexts = (page: Page) =>
	page.evaluate(
		() =>
			new Promise<string[]>((resolve) => {
				const req = indexedDB.open('lattice-filo');
				req.onerror = () => resolve([]);
				req.onsuccess = () => {
					const db = req.result;
					if (!db.objectStoreNames.contains('histories')) {
						db.close();
						resolve([]);
						return;
					}
					const all = db.transaction('histories', 'readonly').objectStore('histories').getAll();
					all.onsuccess = () => {
						db.close();
						resolve((all.result as Array<{ snap: { text: string } }>).map((r) => r.snap.text));
					};
					all.onerror = () => resolve([]);
				};
			}),
	);

async function chord(page: Page): Promise<void> {
	const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
	await page.keyboard.press(mac ? 'Meta+z' : 'Control+z');
}

/** The latest history announcement (`Announce`), raw: each one toggles a zero-width tail, so the
 *  same words twice still read as a new value. '' before the first. */
const lastSaid = (page: Page) =>
	page.evaluate(() => [...document.querySelectorAll('span[role="status"][aria-live="polite"]')].map((e) => e.textContent ?? '').find((t) => /^(Undid|Redid|Nothing|Changed outside)/.test(t)) ?? '');

/**
 * Press ⌘Z (focus on the page body) until `landed` holds. The history loads from IndexedDB after
 * the Studio paints; until then an undo finds nothing, says so, and changes nothing (an empty
 * history is replaced only while untouched), so the press is repeated. NEVER blindly: each press
 * is followed by a wait for its own outcome, either `landed` or a new announcement, before the
 * next. A retry fired before the previous press resolved would undo one step too many on a busy
 * machine, which is how the first version of this helper failed once in ~140 runs.
 */
async function pressUntil(page: Page, landed: () => Promise<boolean>, what: string): Promise<void> {
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		const said = await lastSaid(page);
		await chord(page);
		await expect.poll(async () => (await landed()) || (await lastSaid(page)) !== said, { message: `this ⌘Z neither ${what} nor said anything`, timeout: 15_000 }).toBe(true);
		if (await landed()) return;
	}
	throw new Error(`the stored history never arrived: no ⌘Z ${what} within 30 s`);
}

/** ⌘Z after a reload, until it undoes something: the text on screen moves off `shown`. */
async function undoAfterReload(page: Page, shown: string): Promise<void> {
	await pressUntil(page, async () => (await editorDoc(page)) !== shown, 'changed the deck');
}

/** Load DECK, wait until the history holds it, then type `mark` at the end of slide 1's body. */
async function editAndStore(page: Page, mark: string): Promise<string> {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => savedDeck(page)).toBe(DECK);
	// A new step after the load-in: typing joins a step only next to where the last edit ended.
	await page.locator('.cm-line').filter({ hasText: 'First slide.' }).first().click();
	await page.keyboard.press('End');
	// One insert, one step: typed key by key, a loaded machine's gaps past the 500 ms grouping
	// window would split the word into several steps, and one ⌘Z would take back only the last.
	await page.keyboard.insertText(mark);
	const after = await editorDoc(page);
	expect(after, 'witness: the edit landed').toContain(mark);
	await expect.poll(() => savedDeck(page), { message: 'the Studio never saved the source' }).toBe(after);
	await expect.poll(() => storedTexts(page), { message: 'Filo never stored the history', timeout: 15_000 }).toContain(after);
	return after;
}

async function reload(page: Page): Promise<void> {
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForStudioPaint(page);
}

for (const tag of ['@gecko', '@webkit-tablet']) test.describe(`Filo: undo survives a reload ${tag}`, () => {
	// Two Studio paints and an IndexedDB round trip: more than the 60 s default on a loaded runner.
	test.describe.configure({ timeout: 120_000 });

	test('edit, reload, ⌘Z: the edit before the reload is undone', async ({ page }) => {
		const after = await editAndStore(page, ' MARK');
		await reload(page);
		await expect.poll(() => editorDoc(page)).toBe(after);
		await undoAfterReload(page, after);
		await expect.poll(() => editorDoc(page)).toBe(DECK);
		await expect(announced(page)).toHaveText(/^Undid: Typing/);
	});

	test('a page killed between the source write and the history write: one "Unsaved changes" step', async ({ page }) => {
		const first = await editAndStore(page, ' ONE');
		// From here Filo's IndexedDB writes fail, as if the tab died before they ran: the Studio's
		// synchronous source write still lands, Filo's does not (including the pagehide flush).
		await page.evaluate(() => {
			const put = IDBObjectStore.prototype.put;
			(window as unknown as { __filoRefused: number }).__filoRefused = 0;
			IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...a: Parameters<IDBObjectStore['put']>) {
				if (this.transaction.db.name === 'lattice-filo') {
					(window as unknown as { __filoRefused: number }).__filoRefused++;
					throw new DOMException('killed', 'AbortError');
				}
				return put.apply(this, a);
			};
		});
		await page.keyboard.insertText(' TWO');
		const second = await editorDoc(page);
		await expect.poll(() => savedDeck(page)).toBe(second);
		await expect.poll(() => page.evaluate(() => (window as unknown as { __filoRefused: number }).__filoRefused), { message: 'witness: Filo tried to store the second edit', timeout: 15_000 }).toBeGreaterThan(0);
		expect(await storedTexts(page), 'witness: the store still holds the first edit only').toContain(first);
		await reload(page);
		await expect.poll(() => editorDoc(page)).toBe(second);
		await undoAfterReload(page, second);
		await expect.poll(() => editorDoc(page)).toBe(first);
		await expect(announced(page)).toHaveText(/^Undid: Unsaved changes/);
		await chord(page);
		await expect.poll(() => editorDoc(page), { message: 'the stack before the kill did not survive' }).toBe(DECK);
	});

	test('the source changed behind the Studio’s back: one gap step, then the stored past', async ({ page }) => {
		const after = await editAndStore(page, ' MARK');
		// Leave the Studio (its pagehide flush runs), change the stored source from a page of the same
		// origin that is not the Studio, then come back.
		await page.goto('/favicon.svg');
		const outside = `${after}\nWritten elsewhere.\n`;
		await page.evaluate((src) => {
			const key = Object.keys(localStorage).find((k) => k.startsWith('lattice-studio-src-'));
			if (!key) throw new Error('no stored source');
			localStorage.setItem(key, JSON.stringify(src));
		}, outside);
		await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
		await waitForStudioPaint(page);
		await expect.poll(() => editorDoc(page)).toBe(outside);
		// The first ⌘Z records the outside change as a step and stops: the text stays.
		await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
		await pressUntil(page, async () => (await lastSaid(page)).startsWith('Changed outside'), 'recorded the outside change');
		expect(await editorDoc(page), 'the gap step changes nothing on screen').toBe(outside);
		await chord(page);
		await expect.poll(() => editorDoc(page), { message: 'the second ⌘Z did not undo the outside change' }).toBe(after);
		await chord(page);
		await expect.poll(() => editorDoc(page), { message: 'the stored past was not applied after the gap' }).toBe(DECK);
	});

	// One writer per deck (§6.1): two tabs of one browser share IndexedDB, and their entries cannot
	// chain, so the second tab's history stays in memory and the tab says so. A real Web Lock.
	test('a second tab on the same deck keeps its undo in memory, and says so', async ({ page, context }) => {
		await gotoStudio(page);
		// The first tab claims the deck's lock once its storage module loads, a moment after it paints.
		// Wait for the claim, or a loaded machine lets the second tab claim first and the notice lands
		// in the first.
		await expect
			.poll(() => page.evaluate(async () => ((await navigator.locks.query()).held ?? []).some((l) => l.name?.startsWith('filo:'))), { message: 'the first tab never claimed the deck', timeout: 20_000 })
			.toBe(true);
		const second = await context.newPage();
		// Sample the status pill from before the boot, every 100 ms: the notice is raised while the tab
		// is still loading (it dwells 8 s), and a loaded machine can be slow to reach an assertion.
		await second.addInitScript(() => {
			const seen: string[] = [];
			(window as unknown as { __toasts: string[] }).__toasts = seen;
			setInterval(() => {
				const t = document.querySelector('[data-sonner-toaster]')?.textContent;
				if (t && !seen.includes(t)) seen.push(t);
			}, 100);
		});
		await gotoStudio(second);
		await expect
			.poll(() => second.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts.some((t) => t.includes('open in another tab'))), { message: 'the second tab never said its undo stays in memory', timeout: 20_000 })
			.toBe(true);
		await expect(page.getByText('open in another tab'), 'the first tab holds the deck and says nothing').toHaveCount(0);
	});
});
