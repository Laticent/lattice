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

	it('is fetched when a key is written during the session (OAuth return, Undo after Disconnect), not only when one was stored at load', async () => {
		const calls: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: unknown) => {
				calls.push(String(url));
				if (String(url).includes('/auth/keys')) return new Response(JSON.stringify({ key: 'sk-new' }), { status: 200 });
				return new Response(JSON.stringify(CATALOG), { status: 200 });
			}),
		);
		localStorage.setItem('lattice-db-or-model', 'anthropic/claude-sonnet-5.5');
		localStorage.setItem('lattice-db-or-verifier', 'v');
		const m = createArchitectModel({ getSettings: () => ({}) }) as unknown as { resumeOpenRouterAuth: (c: string) => Promise<boolean>; restoreOpenRouter: (k: string) => void; openRouterModelPrice: () => unknown };
		expect(calls.filter((u) => u.includes('/models'))).toHaveLength(0); // no key at creation: nothing fetched
		await m.resumeOpenRouterAuth('code');
		await vi.waitFor(() => expect(m.openRouterModelPrice()).not.toBeNull());
		expect(calls.filter((u) => u.includes('/models'))).toHaveLength(1);
	});

	it('abandons a catalog fetch that never answers (after 15 s), so the next call can try again', async () => {
		let n = 0;
		const timeouts: number[] = [];
		// The abort timer is the platform's, which fake timers do not drive: stand in a short one and assert the duration asked for.
		vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
			timeouts.push(ms);
			const c = new AbortController();
			setTimeout(() => c.abort(new Error('aborted')), 5);
			return c.signal;
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: unknown, init?: { signal?: AbortSignal }) => {
				n++;
				if (n === 1) return new Promise((_r, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
				return new Response(JSON.stringify(CATALOG), { status: 200 });
			}),
		);
		const m = createArchitectModel({ getSettings: () => ({}) }) as unknown as { listOpenRouterModels: () => Promise<unknown[]> };
		await expect(m.listOpenRouterModels()).rejects.toThrow('aborted');
		expect(timeouts).toEqual([15000]);
		expect(await m.listOpenRouterModels()).toHaveLength(1);
	});

	it('does not let a fetch that predates a self-heal overwrite the fresh catalog, or clear the fresh fetch’s slot', async () => {
		// Fetch A (the prefetch) starts, the cache is invalidated as a dead-model self-heal does, fetch B starts and lands, then A lands late.
		const gate: ((r: Response) => void)[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn((url: unknown) => (String(url).includes('/models') ? new Promise<Response>((resolve) => gate.push(resolve)) : Promise.resolve(new Response('{}', { status: 200 })))),
		);
		localStorage.setItem('lattice-db-or-key', 'sk-test-not-real');
		localStorage.setItem('lattice-db-or-model', 'fresh/model');
		const m = createArchitectModel({ getSettings: () => ({}) }) as unknown as { openRouterModelPrice: () => { promptPerM: number } | null; listOpenRouterModels: () => Promise<unknown[]>; __invalidateCatalog: () => void };
		expect(gate).toHaveLength(1);
		m.__invalidateCatalog();
		const b = m.listOpenRouterModels();
		await vi.waitFor(() => expect(gate).toHaveLength(2));
		const body = (id: string, prompt: string) => new Response(JSON.stringify({ data: [{ id, name: id, pricing: { prompt, completion: prompt }, architecture: { input_modalities: ['text'] } }] }), { status: 200 });
		gate[1](body('fresh/model', '0.000001'));
		await b;
		expect(m.openRouterModelPrice()?.promptPerM).toBe(1);
		// A lands late: it must not replace the cache, and a caller now must not start a third fetch.
		gate[0](body('stale/model', '0.000009'));
		await new Promise((r) => setTimeout(r, 10));
		expect(m.openRouterModelPrice()?.promptPerM).toBe(1);
		await m.listOpenRouterModels();
		expect(gate).toHaveLength(2);
	});

	it('prices a ~…-latest alias that is not itself listed at its family’s dearest member, and carries an image price through', async () => {
		localStorage.setItem('lattice-db-or-key', 'sk-test-not-real');
		const entry = (id: string, prompt: string, completion: string, image?: string) => ({ id, name: id, pricing: { prompt, completion, ...(image ? { image } : {}) }, architecture: { input_modalities: ['text', 'image'] } });
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [entry('vendor/gpt-1', '0.000001', '0.000002'), entry('vendor/gpt-2-pro', '0.000003', '0.000012', '0.000003'), entry('other/x', '0.1', '0.1')] }), { status: 200 })));
		const m = createArchitectModel({ getSettings: () => ({}) }) as unknown as { openRouterModelPrice: (id?: string) => { promptPerM: number; completionPerM: number; imagePerM: number | null } | null; listOpenRouterModels: () => Promise<unknown[]> };
		await m.listOpenRouterModels();
		expect(m.openRouterModelPrice('~vendor/gpt-latest')).toEqual({ promptPerM: 3, completionPerM: 12, imagePerM: 3 }); // the dearest of vendor/gpt-*
		expect(m.openRouterModelPrice('vendor/gpt-1')?.imagePerM).toBeNull();
		expect(m.openRouterModelPrice('~nobody/gpt-latest')).toBeNull();
	});
});
