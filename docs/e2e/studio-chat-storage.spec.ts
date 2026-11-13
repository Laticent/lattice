// Chats live in IndexedDB, and the Studio warns before localStorage fills, on the real Studio
// (HARD RULE #23; engineering/decisions/2026-11-11-studio-storage-pointer-records.md §4 item 4,
// §11). Deck text and every chat used to share localStorage's ~5.2 M characters; a full allowance
// refuses deck edits, so the chats moved out (chat-store.ts) and Privacy & Data now says when the
// space passes 80% (local-quota.ts). Run in Chromium, Firefox and WebKit: the allowance and how
// WebKit counts non-Latin-1 text differ by engine.
import type { Page } from '@playwright/test';
import { expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

const MODELS = [{ id: 'test/model', name: 'Test Model', context_length: 200000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } }];
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;

/** What the chat database holds for a deck, read straight from IndexedDB. */
const storedThread = (page: Page, deckId: string) =>
	page.evaluate(
		(id) =>
			new Promise<string[] | null>((resolve) => {
				const open = indexedDB.open('lattice-studio-chats');
				open.onerror = () => resolve(null);
				open.onsuccess = () => {
					const db = open.result;
					if (!db.objectStoreNames.contains('chats')) return resolve(null);
					const get = db.transaction('chats').objectStore('chats').get(id);
					get.onsuccess = () => resolve(get.result ? (get.result.messages as { content: string }[]).map((m) => m.content) : null);
					get.onerror = () => resolve(null);
				};
			}),
		deckId,
	);
const activeDeck = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem('lattice-studio-active') || 'null') as { deckId?: string } | null)?.deckId ?? null);
// The chat's model choice shares the prefix and stays in localStorage: it is a preference, not a thread.
const legacyKeys = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('lattice-studio-chat-') && k !== 'lattice-studio-chat-selection'));

for (const tag of ['', ' @gecko', ' @webkit-tablet']) test.describe(`chat storage${tag}`, () => {
	test('a chat is stored in IndexedDB, not localStorage, and is there after a reload', async ({ page }) => {
		test.setTimeout(90_000);
		await page.addInitScript(() => {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-db-or-model', 'test/model');
		});
		await page.route('https://openrouter.ai/**', async (route) => {
			const url = route.request().url();
			if (!url.includes('/chat/completions')) {
				await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS } : { data: [] }) });
				return;
			}
			const frames = [
				{ id: 'g1', choices: [{ index: 0, delta: { content: 'A reply kept in IndexedDB.' } }] },
				{ id: 'g1', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
			];
			await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(frames) });
		});
		await gotoStudio(page);
		await openChatAtWidth(page, page.viewportSize()?.width ?? 1440);
		await page.getByRole('textbox', { name: 'Message the Architect' }).fill('where does this chat live?');
		await page.getByRole('button', { name: 'Send', exact: true }).click();
		await expect(page.getByText('A reply kept in IndexedDB.')).toBeVisible({ timeout: 30_000 });
		const deckId = await activeDeck(page);
		expect(deckId).toBeTruthy();
		await expect.poll(() => storedThread(page, deckId as string)).toEqual(['where does this chat live?', 'A reply kept in IndexedDB.']);
		expect(await legacyKeys(page)).toEqual([]);
		await page.reload();
		await openChatAtWidth(page, page.viewportSize()?.width ?? 1440);
		await expect(page.getByText('A reply kept in IndexedDB.')).toBeVisible();
	});

	test('two tabs: a write that falls back after another tab wrote is merged, never put over it', async ({ context }) => {
		test.setTimeout(150_000);
		await context.addInitScript(() => {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-db-or-model', 'test/model');
		});
		let n = 0;
		await context.route('https://openrouter.ai/**', async (route) => {
			const url = route.request().url();
			if (!url.includes('/chat/completions')) {
				await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS } : { data: [] }) });
				return;
			}
			n++;
			const frames = [
				{ id: `g${n}`, choices: [{ index: 0, delta: { content: `reply number ${n}` } }] },
				{ id: `g${n}`, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
			];
			await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(frames) });
		});
		const send = async (page: Page, text: string, reply: string) => {
			await page.getByRole('textbox', { name: 'Message the Architect' }).fill(text);
			await page.getByRole('button', { name: 'Send', exact: true }).click();
			await expect(page.getByText(reply)).toBeVisible({ timeout: 30_000 });
		};
		const width = (p: Page) => p.viewportSize()?.width ?? 1440;

		// Tab A starts the conversation; tab B opens the same deck's chat, read from IndexedDB.
		const a = await context.newPage();
		await gotoStudio(a);
		await openChatAtWidth(a, width(a));
		await send(a, 'first from tab a', 'reply number 1');
		const deckId = (await activeDeck(a)) as string;
		await expect.poll(() => storedThread(a, deckId)).toEqual(['first from tab a', 'reply number 1']);
		const b = await context.newPage();
		await gotoStudio(b);
		await openChatAtWidth(b, width(b));
		await expect(b.getByText('reply number 1')).toBeVisible();

		// Tab A writes again. Tab B hears it on the chats channel (the signal it is waiting for: its copy is stale now).
		await b.evaluate(() => {
			const w = window as unknown as { __chatHeard: unknown[] };
			w.__chatHeard = [];
			new BroadcastChannel('lattice-studio-chats').onmessage = (e) => w.__chatHeard.push(e.data);
		});
		await send(a, 'second from tab a', 'reply number 2');
		await expect.poll(() => b.evaluate(() => (window as unknown as { __chatHeard: unknown[] }).__chatHeard.length)).toBeGreaterThan(0);

		// Tab B's database now refuses every write, so its next message falls back to localStorage, built on its old copy.
		await b.evaluate(() => {
			IDBObjectStore.prototype.put = () => {
				throw new DOMException('refused for the test', 'UnknownError');
			};
		});
		await send(b, 'from tab b', 'reply number 3');
		await expect.poll(() => b.evaluate((id) => localStorage.getItem(`lattice-studio-chat-${id}`), deckId)).not.toBeNull();
		expect(await b.evaluate((id) => (JSON.parse(localStorage.getItem('lattice-studio-chat-fallback') || '{}') as Record<string, string>)[id] ?? null, deckId)).toBeNull();

		// A fresh tab loads the deck: every message of both tabs is there, tab A's second one included.
		const c = await context.newPage();
		await gotoStudio(c);
		await openChatAtWidth(c, width(c));
		for (const text of ['first from tab a', 'second from tab a', 'from tab b', 'reply number 2', 'reply number 3']) await expect(c.getByText(text, { exact: true })).toBeVisible();
	});

	test('an edit applied while a reply streams stays applied, and edits the deck once', async ({ page }) => {
		test.setTimeout(120_000);
		await page.addInitScript(() => {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-db-or-model', 'test/model');
		});
		// The reply is held open until the test releases it: Apply is clicked while it is still arriving.
		let release: () => void = () => {};
		const held = new Promise<void>((r) => {
			release = r;
		});
		await page.route('https://openrouter.ai/**', async (route) => {
			const url = route.request().url();
			if (!url.includes('/chat/completions')) {
				await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS } : { data: [] }) });
				return;
			}
			await held;
			const frames = [
				{ id: 'g1', choices: [{ index: 0, delta: { content: 'the reply that streamed meanwhile' } }] },
				{ id: 'g1', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
			];
			await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(frames) });
		});
		await gotoStudio(page);
		const deckId = (await activeDeck(page)) as string;
		// An earlier turn whose reply proposed inserting a slide, saved the way a thread is stored.
		const MARK = 'Inserted-by-proposal-7f3a';
		await page.evaluate(
			([id, mark]) => {
				const body = `# ${mark}`;
				localStorage.setItem(
					`lattice-studio-chat-${id}`,
					JSON.stringify([
						{ role: 'user', content: 'add a slide' },
						{ role: 'assistant', content: 'Here is a new slide.', proposed: [{ label: 'New slide', slide: 1, action: 'insert', raw: { action: 'insert', slide: 1, body }, before: '', after: body, diff: [{ type: 'add', text: body }] }] },
					]),
				);
			},
			[deckId, MARK],
		);
		await page.reload();
		await openChatAtWidth(page, page.viewportSize()?.width ?? 1440);
		await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible();
		await page.getByRole('textbox', { name: 'Message the Architect' }).fill('and one more thing?');
		await page.getByRole('button', { name: 'Send', exact: true }).click();
		// Mid-reply: apply the earlier proposal.
		await page.getByRole('button', { name: 'Apply' }).click();
		await expect(page.getByText('Applied', { exact: true })).toBeVisible();
		release();
		await expect(page.getByText('the reply that streamed meanwhile')).toBeVisible({ timeout: 30_000 });
		// The edit is still applied: no Apply button came back, and the stored thread says so.
		await expect(page.getByRole('button', { name: 'Apply' })).toHaveCount(0);
		await expect
			.poll(() =>
				page.evaluate(
					(id) =>
						new Promise<boolean | null>((resolve) => {
							const open = indexedDB.open('lattice-studio-chats');
							open.onsuccess = () => {
								const get = open.result.transaction('chats').objectStore('chats').get(id);
								get.onsuccess = () => resolve(get.result ? !!get.result.messages.find((m: { content: string }) => m.content === 'Here is a new slide.')?.applied : null);
							};
						}),
					deckId,
				),
			)
			.toBe(true);
		// The deck was edited once.
		await expect.poll(() => page.evaluate(([id, mark]) => (localStorage.getItem(`lattice-studio-src-${id}`) || '').split(mark).length - 1, [deckId, MARK])).toBe(1);
	});

	test('a chat saved by an older build moves out of localStorage and still shows', async ({ page }) => {
		await gotoStudio(page);
		const deckId = await activeDeck(page);
		expect(deckId).toBeTruthy();
		// What the previous build left: this deck's thread and one of a deck never opened here.
		await page.evaluate((id) => {
			localStorage.setItem(`lattice-studio-chat-${id}`, JSON.stringify([{ role: 'user', content: 'asked before the upgrade' }, { role: 'assistant', content: 'answered before the upgrade' }]));
			localStorage.setItem('lattice-studio-chat-never-opened', JSON.stringify([{ role: 'user', content: 'another deck' }]));
		}, deckId as string);
		await page.reload();
		// The idle migration empties localStorage of chats without the author opening either one.
		await expect.poll(() => legacyKeys(page), { timeout: 20_000 }).toEqual([]);
		expect(await storedThread(page, 'never-opened')).toEqual(['another deck']);
		expect(await storedThread(page, deckId as string)).toEqual(['asked before the upgrade', 'answered before the upgrade']);
		await openChatAtWidth(page, page.viewportSize()?.width ?? 1440);
		await expect(page.getByText('answered before the upgrade')).toBeVisible();
	});

	test('Privacy & Data warns once localStorage passes 80% of its allowance', async ({ page }) => {
		await gotoStudio(page);
		const openData = async () => {
			await page.getByRole('button', { name: 'Workspace settings' }).first().click();
			await page.getByRole('tab', { name: 'Data' }).click();
		};
		await openData();
		await expect(page.getByText('Your data')).toBeVisible();
		await expect(page.getByTestId('local-quota-warning')).toHaveCount(0);
		await page.keyboard.press('Escape');
		// Top localStorage up to 85% of the measured allowance (local-quota.ts), as Latin-1 text so
		// every engine counts it alike.
		await page.evaluate(() => {
			let used = 0;
			for (let i = 0; i < localStorage.length; i++) {
				const k = localStorage.key(i) as string;
				used += k.length + (localStorage.getItem(k) ?? '').length;
			}
			localStorage.setItem('lattice-e2e-filler', 'x'.repeat(Math.ceil(5_242_272 * 0.85) - used));
		});
		await openData();
		const warning = page.getByTestId('local-quota-warning');
		await expect(warning).toBeVisible();
		await expect(warning).toContainText(/Deck storage is 8\d% full/);
		await expect(warning).toContainText(/of 5\.2\s?M characters/);
	});
});
