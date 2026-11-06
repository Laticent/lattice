import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArchitectModel } from './architect-model.js';

// P3 of the Studio BYOK hardening: a revoked key was never noticed. Every cloud request
// failed, the Workspace still said "OpenRouter — active", and nothing offered the fix.
// A 401 from any OpenRouter call made with the stored key now marks it rejected until a
// new key is written. (engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §2)

const KEY = 'lattice-db-or-key';
type M = {
	availability: () => { openRouterReady: boolean; openRouterKeyInvalid: boolean };
	openRouterAccount: () => Promise<unknown>;
	openRouterCredits: () => Promise<unknown>;
	disconnectOpenRouter: () => void;
	restoreOpenRouterKey?: (k: string) => void;
	complete: (o: unknown) => Promise<string>;
};
const make = () => createArchitectModel({ getSettings: () => ({}) }) as unknown as M;
const respond = (status: number) => vi.fn(async () => new Response(status === 200 ? '{"data":{}}' : '{"error":{"message":"User not found."}}', { status }));

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
});

describe('architect-model — a rejected key is noticed', () => {
	it('a 401 from the key readout marks the key invalid; the key itself stays', async () => {
		localStorage.setItem(KEY, 'sk-or-revoked');
		const m = make();
		expect(m.availability().openRouterKeyInvalid).toBe(false);
		vi.stubGlobal('fetch', respond(401));
		await m.openRouterAccount();
		expect(m.availability().openRouterKeyInvalid).toBe(true);
		expect(m.availability().openRouterReady).toBe(true);
		expect(localStorage.getItem(KEY)).toBe('sk-or-revoked');
	});
	it('a 401 on a completion marks it too, and announces the change once', async () => {
		localStorage.setItem(KEY, 'sk-or-revoked');
		const m = make();
		const heard = vi.fn();
		window.addEventListener('db-model-changed', heard);
		vi.stubGlobal('fetch', respond(401));
		await m.complete({ messages: [{ role: 'user', content: 'hi' }], fallback: '' });
		await m.complete({ messages: [{ role: 'user', content: 'again' }], fallback: '' });
		window.removeEventListener('db-model-changed', heard);
		expect(m.availability().openRouterKeyInvalid).toBe(true);
		expect(heard).toHaveBeenCalledTimes(1);
	});
	it('a late 401 from a request made with the OLD key does not mark the new one', async () => {
		localStorage.setItem(KEY, 'sk-or-old');
		const m = make();
		let release: (r: Response) => void = () => {};
		vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { release = r; })));
		const pending = m.openRouterAccount();
		localStorage.setItem(KEY, 'sk-or-new'); // a reconnect lands while the old request is out
		release(new Response('{}', { status: 401 }));
		await pending;
		expect(m.availability().openRouterKeyInvalid).toBe(false);
	});
	it('/credits is not a key-health signal: its 401 marks nothing', async () => {
		localStorage.setItem(KEY, 'sk-or-live');
		const m = make();
		vi.stubGlobal('fetch', respond(401));
		await m.openRouterCredits();
		expect(m.availability().openRouterKeyInvalid).toBe(false);
	});
	it('a 402 or 429 is not a rejected key', async () => {
		localStorage.setItem(KEY, 'sk-or-live');
		const m = make();
		for (const s of [402, 429, 500]) {
			vi.stubGlobal('fetch', respond(s));
			await m.openRouterAccount();
		}
		expect(m.availability().openRouterKeyInvalid).toBe(false);
	});
	it('disconnecting clears the mark, so the next key starts clean', async () => {
		localStorage.setItem(KEY, 'sk-or-revoked');
		const m = make();
		vi.stubGlobal('fetch', respond(401));
		await m.openRouterAccount();
		m.disconnectOpenRouter();
		localStorage.setItem(KEY, 'sk-or-new');
		expect(m.availability().openRouterKeyInvalid).toBe(false);
	});
});
