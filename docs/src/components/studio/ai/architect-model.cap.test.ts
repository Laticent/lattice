import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeModelError } from '../model-error';
import { affordableTokens, createArchitectModel, MIN_AFFORDABLE_REPLY } from './architect-model.js';

// A key with its own spending limit (a gift link's key): OpenRouter refuses a request whose worst
// case it cannot cover and says how many tokens it can. Measured live on 2026-11-10 with a $0.05
// key on Claude Sonnet: "This request requires more credits, or fewer max_tokens. You requested up
// to 16384 tokens, but can only afford 3333." No real request here: fetch is stubbed.
const refusal = (n: number) =>
	new Response(JSON.stringify({ error: { code: 402, message: `This request requires more credits, or fewer max_tokens. You requested up to 16384 tokens, but can only afford ${n}. To increase, visit https://openrouter.ai/settings/keys` } }), { status: 402 });
const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: 'ready' } }], usage: {} }), { status: 200 });

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
});

function stub(...replies: Response[]) {
	localStorage.setItem('lattice-db-or-key', JSON.stringify('sk-test'));
	const bodies: Record<string, unknown>[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init: { body: string }) => {
			bodies.push(JSON.parse(init.body));
			return replies.shift() ?? ok();
		}),
	);
	return bodies;
}

describe('a capped key that cannot cover the full reply ceiling', () => {
	it('reads the affordable count from the refusal', () => {
		expect(affordableTokens('… but can only afford 3333. To increase …')).toBe(3333);
		expect(affordableTokens('Insufficient credits')).toBeNull();
	});

	it('asks again, once, for what the key can afford, and the reply comes back', async () => {
		const bodies = stub(refusal(3333), ok());
		const m = createArchitectModel({ getSettings: () => ({}), defaultMaxTokens: 16384 });
		const text = await m.complete({ messages: [{ role: 'user', content: 'hi' }] });
		expect(text).toBe('ready');
		expect(bodies.map((b) => b.max_tokens)).toEqual([16384, Math.floor(3333 * 0.95)]);
	});

	it('does not retry when too little is left for a useful reply, and says the key is used up', async () => {
		const bodies = stub(refusal(MIN_AFFORDABLE_REPLY - 1));
		const m = createArchitectModel({ getSettings: () => ({}), defaultMaxTokens: 16384 });
		const err = await m.complete({ messages: [{ role: 'user', content: 'hi' }], surfaceErrors: true }).catch((e: Error) => e);
		expect(bodies).toHaveLength(1);
		const said = describeModelError(String((err as Error).message), 'openrouter');
		expect(said).toMatch(/used up its spending limit/);
		expect(said).toMatch(/Sign in with your own OpenRouter account/);
		expect(said).not.toMatch(/account is out of credits/);
	});

	it('retries only once: a second refusal stands', async () => {
		const bodies = stub(refusal(3333), refusal(3000));
		const m = createArchitectModel({ getSettings: () => ({}), defaultMaxTokens: 16384 });
		await expect(m.complete({ messages: [{ role: 'user', content: 'hi' }], surfaceErrors: true })).rejects.toThrow(/402/);
		expect(bodies).toHaveLength(2);
	});

	it('leaves any other 402 alone: an empty account still reads as out of credits', async () => {
		const bodies = stub(new Response(JSON.stringify({ error: { code: 402, message: 'Insufficient credits' } }), { status: 402 }));
		const m = createArchitectModel({ getSettings: () => ({}), defaultMaxTokens: 16384 });
		const err = await m.complete({ messages: [{ role: 'user', content: 'hi' }], surfaceErrors: true }).catch((e: Error) => e);
		expect(bodies).toHaveLength(1);
		expect(describeModelError(String((err as Error).message), 'openrouter')).toMatch(/out of credits/);
	});

	it('a fully spent key (OpenRouter answers 403 "Key limit exceeded") reads as used up, not as a rejected connection', async () => {
		stub(new Response(JSON.stringify({ error: { code: 403, message: 'Key limit exceeded (total limit). Manage it using https://openrouter.ai/workspaces/default/keys/abc' } }), { status: 403 }));
		const m = createArchitectModel({ getSettings: () => ({}), defaultMaxTokens: 16384 });
		const err = await m.complete({ messages: [{ role: 'user', content: 'hi' }], surfaceErrors: true }).catch((e: Error) => e);
		const said = describeModelError(String((err as Error).message), 'openrouter');
		expect(said).toMatch(/used up its spending limit/);
		expect(said).not.toMatch(/rejected the connection/);
		expect(localStorage.getItem('lattice-db-or-key-invalid')).toBeNull();
	});
});
