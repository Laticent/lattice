import { rm } from 'node:fs/promises';
import { type BrowserContext, test as base, expect, type Page } from '@playwright/test';
import { appendToEditor, deckEditorText as editorText, gotoStudio, liveToast, waitForStudioPaint } from './studio-fixture';

// Vault slice 3 on real engines: deck text moves from localStorage into the storage vault, survives a reload from
// the vault alone, merges across two tabs, moves back on the undo path, and a full disk shows a notice
// (engineering/decisions/2026-11-28-vault-slice-3-as-built.md). Every wait is on a signal (#32).
//
// A PERSISTENT PROFILE PER TEST, as vault.spec.ts explains: WebKit refuses OPFS in an ephemeral context.
// The full disk is REAL on Chromium (a CDP quota override) and INJECTED on WebKit and Firefox (see that test).
// `webkit-phone` is Linux WebKit at an iPhone's size, NOT iOS: iOS Safari stays UNVERIFIED.

const test = base.extend<{ profile: BrowserContext }>({
	profile: async ({ playwright, browserName, baseURL }, use, testInfo) => {
		const u = testInfo.project.use;
		const dir = testInfo.outputPath('profile');
		const ctx = await playwright[browserName].launchPersistentContext(dir, {
			baseURL,
			viewport: u.viewport,
			userAgent: u.userAgent,
			deviceScaleFactor: u.deviceScaleFactor,
			isMobile: u.isMobile,
			hasTouch: u.hasTouch,
		});
		await use(ctx);
		await ctx.close();
		await rm(dir, { recursive: true, force: true });
	},
});
test.describe.configure({ timeout: 180_000 });

const ID = 'e2e-vault';
const DECK = '# Vault deck\n\n- first line\n';
/** On a phone the editor sits behind the Edit tab (one pane at a time) and may open in Compose: show the Markdown
 *  source before reading or typing. */
async function showEditor(page: Page): Promise<void> {
	if (await page.getByLabel('Deck source').isVisible()) return;
	const tab = page.getByRole('tab', { name: 'Edit', exact: true });
	if (await tab.count()) await tab.first().click();
	const source = page.getByRole('button', { name: 'Markdown source', exact: true });
	if (!(await page.getByLabel('Deck source').isVisible()) && (await source.count())) await source.first().click();
	await expect(page.getByLabel('Deck source')).toBeVisible();
}
async function deckEditorText(page: Page): Promise<string | null> {
	await showEditor(page);
	return editorText(page);
}
async function type(page: Page, text: string): Promise<void> {
	await showEditor(page);
	await appendToEditor(page, text);
}
const ls = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

/** A deck stored the pre-slice-3 way, opened as the active deck; the move takes it in on this load. */
async function seedLegacyDeck(page: Page): Promise<void> {
	await gotoStudio(page);
	await page.evaluate(
		({ id, deck }) => {
			const idx = JSON.parse(localStorage.getItem('lattice-studio-deck-index') || '[]');
			localStorage.setItem('lattice-studio-deck-index', JSON.stringify([{ id, title: 'Vault deck', builtin: false }, ...idx.filter((e: { id: string }) => e.id !== id)]));
			localStorage.setItem(`lattice-studio-src-${id}`, JSON.stringify(deck));
			localStorage.setItem('lattice-studio-active', JSON.stringify({ deckId: id, slideIndex: 0 }));
		},
		{ id: ID, deck: DECK },
	);
	await page.reload();
	await waitForStudioPaint(page);
}
/** The move has taken the deck in: its key is gone and the index marks it. */
async function moved(page: Page): Promise<void> {
	await expect.poll(() => ls(page, `lattice-studio-src-${ID}`), { timeout: 60_000 }).toBeNull();
	const idx = JSON.parse((await ls(page, 'lattice-studio-deck-index')) ?? '[]');
	expect(idx.find((e: { id: string }) => e.id === ID)?.vault).toBe(true);
}
/** Reload with the boot cache removed, so the text can only come from the vault. */
async function reloadFromVault(page: Page): Promise<void> {
	await page.evaluate(() => localStorage.removeItem('lattice-studio-boot-src'));
	await page.reload();
	await waitForStudioPaint(page);
}
/** True when the vault's record for the deck's file has the SHA-256 of the boot cache's text. */
const vaultHoldsCache = (page: Page) =>
	page.evaluate(async (id) => {
		const text = JSON.parse(localStorage.getItem('lattice-studio-boot-src') ?? 'null')?.text;
		if (typeof text !== 'string') return false;
		const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
		const db: IDBDatabase = await new Promise((res, rej) => {
			const r = indexedDB.open('lattice-vault');
			r.onsuccess = () => res(r.result);
			r.onerror = () => rej(r.error);
		});
		const rec = await new Promise<{ sha256?: string; deleted?: boolean } | undefined>((res) => {
			const q = db.transaction('entries').objectStore('entries').get(`Decks/${id}.md`);
			q.onsuccess = () => res(q.result);
			q.onerror = () => res(undefined);
		});
		db.close();
		return !!rec && !rec.deleted && rec.sha256 === hex;
	}, ID);
const bootCacheText = async (page: Page) => JSON.parse((await ls(page, 'lattice-studio-boot-src')) ?? 'null')?.text ?? null;

test.describe('decks in the storage vault @crosswidth @webkit-phone @gecko', () => {
	test('the move takes a deck in, and an edit survives a reload from the vault alone', async ({ profile }) => {
		const page = await profile.newPage();
		await seedLegacyDeck(page);
		await moved(page);
		await reloadFromVault(page);
		await expect.poll(() => deckEditorText(page), { timeout: 30_000 }).toContain('- first line');
		await type(page, '\n- typed after the move');
		// The boot cache is written in the same moment as the save; then the vault write lands.
		await expect.poll(() => bootCacheText(page)).toContain('typed after the move');
		// The signal that the vault holds it: the index record for Decks/<id>.md carries the cached text's SHA-256.
		await expect.poll(() => vaultHoldsCache(page), { timeout: 30_000 }).toBe(true);
		await reloadFromVault(page);
		await expect.poll(() => deckEditorText(page), { timeout: 30_000 }).toContain('- typed after the move');
	});

	test('two tabs: an edit in one reaches the other, merged', async ({ profile }) => {
		const a = await profile.newPage();
		await seedLegacyDeck(a);
		await moved(a);
		const b = await profile.newPage();
		await gotoStudio(b);
		await expect.poll(() => deckEditorText(b), { timeout: 30_000 }).toContain('- first line');
		await type(a, '\n- from tab A');
		await expect.poll(() => deckEditorText(b), { timeout: 30_000 }).toContain('- from tab A');
		await type(b, '\n- from tab B');
		await expect.poll(() => deckEditorText(a), { timeout: 30_000 }).toContain('- from tab B');
		expect(await deckEditorText(a)).toContain('- from tab A');
	});

	test('the move-back puts the deck in its key again, read back', async ({ profile }) => {
		const page = await profile.newPage();
		await seedLegacyDeck(page);
		await moved(page);
		await page.evaluate(() => localStorage.setItem('lattice-deck-storage', 'local'));
		await page.reload();
		await waitForStudioPaint(page);
		await expect.poll(() => ls(page, `lattice-studio-src-${ID}`), { timeout: 60_000 }).toBe(JSON.stringify(DECK));
		const idx = JSON.parse((await ls(page, 'lattice-studio-deck-index')) ?? '[]');
		expect(idx.find((e: { id: string }) => e.id === ID)?.vault).toBeUndefined();
		await page.reload();
		await waitForStudioPaint(page);
		await expect.poll(() => deckEditorText(page), { timeout: 30_000 }).toContain('- first line');
	});

	test('a full disk shows a notice', async ({ profile, browserName }) => {
		const page = await profile.newPage();
		await seedLegacyDeck(page);
		await moved(page);
		if (browserName === 'chromium') {
			// REAL: the origin's quota is set to exactly what it already uses, so the next vault write is refused.
			const cdp = await profile.newCDPSession(page);
			const usage = await page.evaluate(async () => (await navigator.storage.estimate()).usage ?? 0);
			await cdp.send('Storage.overrideQuotaForOrigin', { origin: new URL(page.url()).origin, quotaSize: usage });
		} else {
			// INJECTED on WebKit and Firefox: neither gives Playwright a quota control. Firefox keeps a 10 GiB quota whatever
			// `dom.quotaManager.temporaryStorage.fixedLimit` says (measured 2026-11-28, three profiles), so the vault index's
			// writes throw QuotaExceededError instead.
			await page.evaluate(() => {
				const put = IDBObjectStore.prototype.put;
				IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
					if (this.transaction.db.name === 'lattice-vault') throw new DOMException('injected full disk', 'QuotaExceededError');
					return put.apply(this, args);
				};
			});
		}
		// Any vault write trips it, so a short edit does: a 4,000-character line typed key by key outran the test's
		// timeout on Firefox under load (#33, the repeat run's root cause).
		await type(page, `\n- ${'a line to save '.repeat(25)}`);
		await expect(liveToast(page, /storage is full/)).toBeVisible({ timeout: 30_000 });
	});
});
