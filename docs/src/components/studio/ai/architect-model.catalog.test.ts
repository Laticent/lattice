import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArchitectModel } from './architect-model.js';

// The price catalog: one fetch however many callers ask, and fetched up front for a connected user, because the budget gate
// compares an estimate against the cap and with no price it lets the call through.
const CATALOG = { data: [{ id: 'anthropic/claude-sonnet-5.5', name: 'Sonnet', pricing: { prompt: '0.000002', completion: '0.00001' }, architecture: { input_modalities: ['text', 'image'] } }] };

function stubFetch() {
	const calls: string[] = [];
	const fetchStub = vi.fn(async (url: unknown) => {
		calls.push(String(url));
		await new Promise((r) => setTimeout(r, 5));
		return new Response(JSON.stringify(CATALOG), { status: 200, headers: { 'content-type': 'application/json' } });
	});
	vi.stubGlobal('fetch', fetchStub);
	return calls;
}

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
});

describe('the OpenRouter model catalog', () => {
	it('is fetched once when several callers ask while it is loading', async () => {
		const calls = stubFetch();
		const m = createArchitectModel({ getSettings: () => ({}) }) as unknown as { listOpenRouterModels: () => Promise<{ id: string }[]> };
		const [a, b, c] = await Promise.all([m.listOpenRouterModels(), m.listOpenRouterModels(), m.listOpenRouterModels()]);
		expect(calls.filter((u) => u.includes('/models'))).toHaveLength(1);
		expect(a).toBe(b);
		expect(b).toBe(c);
		expect(a[0].id).toBe('anthropic/claude-sonnet-5.5');
	});

	it('is fetched as soon as a connected model exists, so the price is known before the first spend', async () => {
		localStorage.setItem('lattice-db-or-key', 'sk-test-not-real');
		localStorage.setItem('lattice-db-or-model', 'anthropic/claude-sonnet-5.5');
		const calls = stubFetch();
		const m = createArchitectModel({ getSettings: () => ({}) }) as unknown as { openRouterModelPrice: () => { promptPerM: number } | null };
		expect(m.openRouterModelPrice()).toBeNull(); // not yet: the fetch is in flight
		await vi.waitFor(() => expect(m.openRouterModelPrice()).not.toBeNull());
		expect(calls.filter((u) => u.includes('/models'))).toHaveLength(1);
	});

	it('is not fetched for a user who has not connected (no key, nothing to spend)', async () => {
		const calls = stubFetch();
		createArchitectModel({ getSettings: () => ({}) });
		await new Promise((r) => setTimeout(r, 20));
		expect(calls).toHaveLength(0);
	});

	it('survives a failed fetch and can be asked again', async () => {
		let n = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				n++;
				if (n === 1) throw new Error('offline');
				return new Response(JSON.stringify(CATALOG), { status: 200 });
			}),
		);
		const m = createArchitectModel({ getSettings: () => ({}) }) as unknown as { listOpenRouterModels: () => Promise<unknown[]> };
		await expect(m.listOpenRouterModels()).rejects.toThrow('offline');
		expect(await m.listOpenRouterModels()).toHaveLength(1);
	});
});
