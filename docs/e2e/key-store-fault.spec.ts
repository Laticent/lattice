// The key store against the WebKit fault it guards (followups 3079-p2), injected in the REAL engine:
// IndexedDB still holds the sealing key, but a read of it answers nothing. The store must keep the
// sealed OpenRouter key (a read that failed is transient), and must still remove it when the sealing
// key is genuinely gone (both `get` and `count` see nothing). The fault is injected by wrapping
// IDBObjectStore's own methods before the Studio loads; the engine underneath is the real one.
// engineering/decisions/2026-11-07-studio-model-spine.md §10.1.
import type { Page } from '@playwright/test';
import { expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

// A fake credential, named FAKE so no reader (or scanner) mistakes it for a secret.
const OR_FAKE = 'sk-or-v1-e2e-key-store-fault-0c0c';
const SLOT = 'lattice-db-or-key';
const MODELS = [{ id: 'test/model', name: 'Test Model', context_length: 200000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'], output_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } }];

async function setUp(page: Page) {
	await page.addInitScript(
		([slot, fake]) => {
			if (!sessionStorage.getItem('fault-seeded')) {
				localStorage.setItem(slot, fake); // plaintext from before encryption: the store seals it in place
				localStorage.setItem('lattice-studio-chat-selection', JSON.stringify({ v: 1, last: {}, source: 'cloud', provider: 'openrouter', model: 'test/model' }));
				localStorage.setItem('lattice-db-dedup', 'off');
				sessionStorage.setItem('fault-seeded', '1');
			}
			// The fault, armed per load from sessionStorage: 'get' = the read answers nothing while the entry
			// is there (the WebKit case); 'gone' = get AND count see nothing (a real loss).
			const mode = sessionStorage.getItem('fault') || '';
			if (mode) {
				const proto = IDBObjectStore.prototype;
				const get = proto.get;
				const count = proto.count;
				proto.get = function (k) {
					return k === 'openrouter-at-rest' ? get.call(this, '__fault__') : get.call(this, k);
				};
				if (mode === 'gone') {
					proto.count = function (k) {
						return k === 'openrouter-at-rest' ? count.call(this, '__fault__') : count.call(this, k);
					};
				}
			}
		},
		[SLOT, OR_FAKE] as const,
	);
	await page.route('https://openrouter.ai/**', (route) => {
		const url = route.request().url();
		if (/\/api\/v1\/(auth\/)?key(\?|$)/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"usage":0,"limit":null}}' });
		return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: url.includes('/models') ? MODELS : [] }) });
	});
	const log: string[] = [];
	page.on('console', (m) => {
		if (m.text().startsWith('[lattice-key]')) log.push(m.text());
	});
	await gotoStudio(page);
	// The store seals the plaintext key in place (and creates the sealing key in IndexedDB).
	await expect.poll(() => page.evaluate((s) => String(localStorage.getItem(s)).startsWith('v1:'), SLOT), { timeout: 30_000 }).toBe(true);
	return log;
}

const reloadWith = async (page: Page, mode: string) => {
	await page.evaluate((m) => sessionStorage.setItem('fault', m), mode);
	await page.reload();
};

test('@crosswidth @webkit-phone @webkit-tablet @gecko a sealing key that is stored but reads as nothing keeps the stored key, and it opens again', async ({ page }) => {
	const log = await setUp(page);
	const envelope = await page.evaluate((s) => localStorage.getItem(s), SLOT);
	await reloadWith(page, 'get');
	// The guard saw the entry with `count` and called the read transient.
	await expect.poll(() => log.some((l) => l.includes('the sealing key is stored but its read answered nothing')), { timeout: 30_000 }).toBe(true);
	expect(await page.evaluate((s) => localStorage.getItem(s), SLOT)).toBe(envelope);
	expect(log.filter((l) => l.includes('removed'))).toEqual([]);
	// The read recovers: the same key opens and the chip names the model, not "needs a key".
	await reloadWith(page, '');
	await openChatAtWidth(page, page.viewportSize()?.width ?? 1440);
	await expect(page.getByTestId('chat-model-chip-name')).toHaveText('Test Model', { timeout: 30_000 });
	expect(await page.evaluate((s) => localStorage.getItem(s), SLOT)).toBe(envelope);
});

test('@crosswidth @webkit-phone @webkit-tablet @gecko a sealing key that is genuinely gone still removes the envelope it can never open', async ({ page }) => {
	const log = await setUp(page);
	await reloadWith(page, 'gone');
	await expect.poll(() => page.evaluate((s) => localStorage.getItem(s), SLOT), { timeout: 30_000 }).toBeNull();
	expect(log.some((l) => l.includes('removed the stored openrouter entry: no sealing key is stored'))).toBe(true);
});
