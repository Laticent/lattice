// Direct provider keys (lifecycle note §7 step 2): the two transports, the price lookup, and
// the adapter routing the cloud tier to the provider the author chose. Every request is mocked.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readChatSelection, selectChat } from '../../../lib/model-selection.js';
import { __resetOpenRouterKeyForTests, openRouterKeySettled, readProviderKey, writeProviderKey } from '../../../lib/openrouter-key.js';
import { createArchitectModel } from './architect-model.js';
import { catalogIdsFor, directBackend, estimateCost, pickDefaultModel, priceRow, toAnthropicBody, usablePrice } from './direct-providers.js';

const CATALOG = [
	{ id: 'openai/gpt-6.1-terra', name: 'OpenAI: GPT-6.1 Terra', promptPerM: 1, completionPerM: 5, contextLength: 400000, vision: true },
	{ id: 'google/gemini-3.8-flash', name: 'Google: Gemini 3.8 Flash', promptPerM: 0.825, completionPerM: 4.125, contextLength: 1000000, vision: true },
	{ id: 'anthropic/claude-sonnet-5.5', name: 'Anthropic: Claude Sonnet 5.5', promptPerM: 2, completionPerM: 10, contextLength: 1000000, vision: true },
];

function sse(lines: string[]) {
	const enc = new TextEncoder();
	return new ReadableStream({
		start(c) {
			for (const l of lines) c.enqueue(enc.encode(`${l}\n`));
			c.close();
		},
	});
}

beforeEach(() => {
	localStorage.clear();
	__resetOpenRouterKeyForTests();
});
afterEach(() => vi.unstubAllGlobals());

describe('pricing from the OpenRouter catalog', () => {
	it('maps each provider id onto its catalog id', () => {
		expect(catalogIdsFor('openai', 'gpt-6.1-terra-2026-10-26')).toContain('openai/gpt-6.1-terra');
		expect(catalogIdsFor('gemini', 'models/gemini-3.8-flash')).toContain('google/gemini-3.8-flash');
		// Anthropic's direct ids use dashes and a date; OpenRouter uses a dot.
		expect(catalogIdsFor('anthropic', 'claude-sonnet-5-5-20260928')).toContain('anthropic/claude-sonnet-5.5');
		expect(priceRow('anthropic', 'claude-sonnet-5-5', CATALOG)?.completionPerM).toBe(10);
	});
	it('has no price for a model the catalog does not list, rather than a guessed one', () => {
		expect(priceRow('openai', 'gpt-unlisted', CATALOG)).toBeNull();
		expect(estimateCost({ prompt_tokens: 10, completion_tokens: 10 }, null)).toBeNull();
	});
	it('prices Anthropic cache writes at 1.25× and reads at 0.1×', () => {
		const usd = estimateCost({ prompt_tokens: 1_000_000, completion_tokens: 0, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 }, { promptPerM: 2, completionPerM: 10 });
		expect(usd).toBeCloseTo(2 + 2.5 + 0.2, 6);
	});
	it('defaults to the newest mid-priced model, never a "pro" or "lite" tier', () => {
		const models = [
			{ id: 'a-pro', promptPerM: 1, completionPerM: 5, created: 30 },
			{ id: 'b', promptPerM: 1, completionPerM: 5, created: 20 },
			{ id: 'c', promptPerM: 1, completionPerM: 5, created: 10 },
			{ id: 'd-lite', promptPerM: 0.1, completionPerM: 0.5, created: 40 },
			{ id: 'e', promptPerM: 10, completionPerM: 50, created: 50 },
		];
		expect(pickDefaultModel(models)).toBe('b');
	});
	it('a fallback never moves the author up in price', () => {
		// Nothing at $10 or less outside the side tiers: the cheapest main model, not the newest.
		const pricey = [
			{ id: 'claude-opus-9', promptPerM: 20, completionPerM: 100, created: 50 },
			{ id: 'claude-sonnet-9', promptPerM: 3, completionPerM: 12, created: 40 },
			{ id: 'claude-sonnet-8', promptPerM: 3, completionPerM: 11, created: 30 },
		];
		expect(pickDefaultModel(pricey, 'anthropic')).toBe('claude-sonnet-8');
	});
	it('with no prices at all, the newest model of the everyday family', () => {
		const bare = [
			{ id: 'claude-opus-9', promptPerM: null, completionPerM: null, created: 50 },
			{ id: 'claude-sonnet-9', promptPerM: null, completionPerM: null, created: 40 },
			{ id: 'claude-haiku-9', promptPerM: null, completionPerM: null, created: 45 },
		];
		expect(pickDefaultModel(bare, 'anthropic')).toBe('claude-sonnet-9');
		// "gemini" contains "mini": the side-tier filter must not drop every Gemini model.
		expect(pickDefaultModel([{ id: 'gemini-9-flash', promptPerM: 1, completionPerM: 4, created: 1 }, { id: 'gemini-9-pro', promptPerM: 2, completionPerM: 9, created: 2 }], 'gemini')).toBe('gemini-9-flash');
		expect(pickDefaultModel([{ id: 'gemini-9-pro' }, { id: 'gemini-9-flash' }, { id: 'gemini-9-flash-lite' }], 'gemini')).toBe('gemini-9-flash');
	});
	it('a list with no dates (Gemini) picks the highest version, not the first listed', () => {
		// Gemini's /models carries no `created`; it lists a retired gemini-2.5-flash first, and a live
		// run on 2026-11-08 got a 404 ("no longer available to new users") from defaulting to it.
		const listed = [
			{ id: 'gemini-2.5-flash', promptPerM: 0.3, completionPerM: 2.5 },
			{ id: 'gemini-2.5-pro', promptPerM: 1.25, completionPerM: 10 },
			{ id: 'gemini-3.5-flash', promptPerM: 0.3, completionPerM: 2.5 },
			{ id: 'gemini-3.8-flash', promptPerM: 0.3, completionPerM: 2.5 },
			{ id: 'gemini-3.10-flash-lite', promptPerM: 0.1, completionPerM: 0.4 },
			// The highest version, but outside the everyday family: a plain key got 429 on it.
			{ id: 'gemini-4-argon', promptPerM: 0.5, completionPerM: 4 },
		];
		expect(pickDefaultModel(listed, 'gemini')).toBe('gemini-3.8-flash');
		// Unpriced, the everyday family follows the same order.
		expect(pickDefaultModel(listed.map(({ id }) => ({ id })), 'gemini')).toBe('gemini-3.8-flash');
		// A creation date still wins over the version when the provider gives one.
		expect(pickDefaultModel([{ id: 'gpt-9', promptPerM: 1, completionPerM: 5, created: 1 }, { id: 'gpt-8', promptPerM: 1, completionPerM: 5, created: 2 }], 'openai')).toBe('gpt-8');
	});
});

describe('Anthropic request shape', () => {
	it('lifts system messages, maps tools, tool calls and tool results', () => {
		const body = toAnthropicBody({
			model: 'claude-sonnet-5-5',
			maxTokens: 0,
			json: true,
			stream: true,
			tools: [{ type: 'function', function: { name: 'edit_slides', description: 'edit', parameters: { type: 'object', properties: { a: { type: 'string' } } } } }],
			toolChoice: 'none',
			messages: [
				{ role: 'system', content: 'canon' },
				{ role: 'user', content: [{ type: 'text', text: 'hi' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] },
				{ role: 'assistant', content: '', tool_calls: [{ id: 't1', type: 'function', function: { name: 'edit_slides', arguments: '{"a":"b"}' } }] },
				{ role: 'tool', tool_call_id: 't1', content: 'ok' },
				{ role: 'tool', tool_call_id: 't2', content: 'ok2' },
			],
		});
		expect(body.max_tokens).toBeGreaterThan(0); // Anthropic requires one
		expect(body.system[0]).toMatchObject({ type: 'text', text: 'canon', cache_control: { type: 'ephemeral' } });
		expect(body.system.at(-1).text).toMatch(/JSON object only/);
		expect(body.tools[0]).toEqual({ name: 'edit_slides', description: 'edit', input_schema: { type: 'object', properties: { a: { type: 'string' } } } });
		expect(body.tool_choice).toEqual({ type: 'none' });
		expect(body.messages[0].content[1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } });
		expect(body.messages[1]).toEqual({ role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'edit_slides', input: { a: 'b' } }] });
		// Two tool results in a row merge into ONE user turn: the API needs alternating roles.
		expect(body.messages[2].role).toBe('user');
		expect(body.messages[2].content).toHaveLength(2);
		expect(body.messages).toHaveLength(3);
	});
});

describe('the transports', () => {
	it('Anthropic: sends the browser-access header and maps the stream back', async () => {
		writeProviderKey('anthropic', 'sk-ant-test-key-0000000000');
		await openRouterKeySettled();
		const calls: { url: string; init: RequestInit }[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init: RequestInit) => {
				calls.push({ url, init });
				return new Response(
					sse([
						'event: message_start',
						'data: {"type":"message_start","message":{"usage":{"input_tokens":1000,"output_tokens":1}}}',
						'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}',
						'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo"}}',
						'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu1","name":"edit_slides"}}',
						'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"a\\":"}}',
						'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"1}"}}',
						'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":500}}',
						'data: {"type":"message_stop"}',
					]),
					{ status: 200 },
				);
			}),
		);
		const b = directBackend('anthropic', { catalog: async () => CATALOG, catalogNow: () => CATALOG });
		const tokens: string[] = [];
		const usage: Record<string, unknown>[] = [];
		const finish: string[] = [];
		const tools: unknown[] = [];
		const out = await b.complete({ model: 'claude-sonnet-5-5', messages: [{ role: 'user', content: 'hi' }], onToken: (t: string) => tokens.push(t), onUsage: (u: Record<string, unknown>) => usage.push(u), onFinishReason: (r: string) => finish.push(r), onToolCalls: (c: unknown[]) => tools.push(...c) });
		expect(out).toBe('Hello');
		expect(tokens).toEqual(['Hel', 'lo']);
		expect(finish).toEqual(['length']);
		expect(tools).toEqual([{ id: 'tu1', type: 'function', function: { name: 'edit_slides', arguments: '{"a":1}' } }]);
		expect(usage[0]).toMatchObject({ prompt_tokens: 1000, completion_tokens: 500, estimated: true });
		expect(usage[0].cost).toBeCloseTo(1000 * 2e-6 + 500 * 10e-6, 9);
		expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
		const h = calls[0].init.headers as Record<string, string>;
		expect(h['x-api-key']).toBe('sk-ant-test-key-0000000000');
		expect(h['anthropic-dangerous-direct-browser-access']).toBe('true');
		expect(h.Authorization).toBeUndefined();
	});

	it('OpenAI: the OpenRouter-shaped request at the provider base, max_completion_tokens, estimated usage', async () => {
		writeProviderKey('openai', 'sk-proj-test-key-0000000000');
		await openRouterKeySettled();
		let sent: Record<string, unknown> = {};
		let url = '';
		vi.stubGlobal(
			'fetch',
			vi.fn(async (u: string, init: RequestInit) => {
				url = u;
				sent = JSON.parse(String(init.body));
				return new Response(sse(['data: {"choices":[{"delta":{"content":"ok"}}]}', 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}', 'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":10,"total_tokens":110}}', 'data: [DONE]']), { status: 200 });
			}),
		);
		const b = directBackend('openai', { catalog: async () => CATALOG, catalogNow: () => CATALOG });
		const usage: Record<string, unknown>[] = [];
		const out = await b.complete({ model: 'gpt-6.1-terra', maxTokens: 500, json: true, messages: [{ role: 'system', content: [{ type: 'text', text: 'canon', cache_control: { type: 'ephemeral' } }] }, { role: 'user', content: 'hi' }], onToken: () => {}, onUsage: (u: Record<string, unknown>) => usage.push(u) });
		expect(out).toBe('ok');
		expect(url).toBe('https://api.openai.com/v1/chat/completions');
		expect(sent.max_completion_tokens).toBe(500);
		expect(sent.max_tokens).toBeUndefined();
		expect(sent.stream_options).toEqual({ include_usage: true });
		expect(sent.response_format).toEqual({ type: 'json_object' });
		// OpenRouter's cache mark is flattened away for a provider that caches on its own.
		expect((sent.messages as { content: unknown }[])[0].content).toBe('canon');
		expect(usage[0].cost).toBeCloseTo(100 * 1e-6 + 10 * 5e-6, 9);
	});

	it('Gemini: the OpenAI-compatible endpoint with a Bearer key', async () => {
		writeProviderKey('gemini', 'AIzaTestKey000000000000000');
		await openRouterKeySettled();
		const seen: { url: string; auth: string }[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (u: string, init: RequestInit) => {
				seen.push({ url: u, auth: (init.headers as Record<string, string>).Authorization });
				return Response.json({ choices: [{ message: { content: '{"x":1}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 5 } });
			}),
		);
		const b = directBackend('gemini', { catalog: async () => CATALOG, catalogNow: () => CATALOG });
		expect(await b.complete({ model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'hi' }] })).toBe('{"x":1}');
		expect(seen[0]).toEqual({ url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', auth: 'Bearer AIzaTestKey000000000000000' });
	});

	it('a 401 names the provider and marks its key rejected', async () => {
		writeProviderKey('openai', 'sk-proj-test-key-0000000000');
		await openRouterKeySettled();
		vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"Incorrect API key"}}', { status: 401 })));
		const b = directBackend('openai', { catalog: async () => CATALOG, catalogNow: () => CATALOG });
		await expect(b.complete({ model: 'gpt-6.1-terra', messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(/^OpenAI error 401: /);
		expect(b.keyInvalid()).toBe(true);
	});

	it('lists the provider’s own chat models, priced, without embeddings or audio', async () => {
		writeProviderKey('openai', 'sk-proj-test-key-0000000000');
		await openRouterKeySettled();
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [{ id: 'gpt-6.1-terra', created: 2 }, { id: 'text-embedding-3-large', created: 3 }, { id: 'gpt-audio', created: 4 }, { id: 'gpt-unlisted', created: 1 }] })));
		const b = directBackend('openai', { catalog: async () => CATALOG, catalogNow: () => CATALOG });
		const list = await b.listModels();
		expect(list.map((m: { id: string }) => m.id)).toEqual(['gpt-6.1-terra', 'gpt-unlisted']);
		expect(list[0]).toMatchObject({ name: 'OpenAI: GPT-6.1 Terra', promptPerM: 1, completionPerM: 5 });
		expect(list[1].promptPerM).toBeNull();
		expect(b.getModel()).toBe('gpt-6.1-terra'); // the default, derived from the priced list
		expect(await b.accountInfo()).toBeNull(); // no balance a browser key can read
	});
});

describe('the adapter routes the cloud tier to the chosen provider', () => {
	it('saveProviderKey selects the provider; removing the key leaves the selection reading needs-key', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [] })));
		const m = createArchitectModel({});
		expect(m.availability().provider).toBe('openrouter');
		expect(m.availability().openRouterReady).toBe(false);
		m.saveProviderKey('anthropic', 'sk-ant-test-key-0000000000');
		await openRouterKeySettled();
		expect(readChatSelection()).toMatchObject({ source: 'cloud', provider: 'anthropic' });
		expect(m.availability()).toMatchObject({ provider: 'anthropic', openRouterReady: true, generation: 'openrouter' });
		expect(m.openRouterKeySettingsUrl()).toMatch(/console\.anthropic\.com/);
		expect(m.providersWithKeys()).toEqual(['anthropic']);
		m.removeProviderKey('anthropic');
		await openRouterKeySettled();
		expect(readProviderKey('anthropic')).toBeNull();
		// Never substituted: the selection stays Anthropic and says it needs a key.
		expect(m.availability()).toMatchObject({ provider: 'anthropic', generation: 'floor', readiness: { state: 'needs-key', provider: 'anthropic' } });
	});

	it('the stored direct key is sealed, never in clear', async () => {
		const m = createArchitectModel({});
		m.saveProviderKey('gemini', 'AIzaTestKey000000000000000');
		await openRouterKeySettled();
		const raw = localStorage.getItem('lattice-db-gemini-key') ?? '';
		// jsdom has no IndexedDB, so the key is kept in memory only (§9), never written in clear.
		expect(raw).not.toContain('AIzaTestKey');
	});

	it('disconnectAllProviders removes every key', async () => {
		const m = createArchitectModel({});
		m.saveProviderKey('openai', 'sk-proj-test-key-0000000000');
		m.saveProviderKey('openrouter', 'sk-or-v1-test');
		await openRouterKeySettled();
		m.disconnectAllProviders();
		await openRouterKeySettled();
		expect(m.providersWithKeys()).toEqual([]);
	});
});

describe('red-team and checker findings (BYOK phase 2)', () => {
	it('a catalog row with no price, or a $0 one, prices nothing rather than $0', () => {
		expect(usablePrice({ promptPerM: null, completionPerM: 5 })).toBeNull();
		expect(usablePrice({ promptPerM: 0, completionPerM: 0 })).toBeNull();
		expect(usablePrice({ promptPerM: 1, completionPerM: 5 })).toMatchObject({ promptPerM: 1, completionPerM: 5 });
		const b = directBackend('openai', { catalog: async () => [], catalogNow: () => [{ id: 'openai/gpt-free', promptPerM: 0, completionPerM: 0 }] });
		expect(b.modelPrice('gpt-free')).toBeNull();
	});

	it('Gemini answers a bad key with 400 API_KEY_INVALID: read as a rejected key', async () => {
		writeProviderKey('gemini', 'AIzaTestKey000000000000000');
		await openRouterKeySettled();
		const body = '[{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}]';
		vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 400 })));
		const b = directBackend('gemini', { catalog: async () => CATALOG, catalogNow: () => CATALOG });
		expect(await b.checkKey('AIzaTestKey000000000000000')).toBe(401);
		await expect(b.complete({ model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(/^Gemini error 401: /);
		expect(b.keyInvalid()).toBe(true);
		// Any other 400 stays a 400.
		vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"bad field"}}', { status: 400 })));
		expect(await b.checkKey('AIzaTestKey000000000000000')).toBe(400);
	});

	it('never asks for reasoning or thinking on a direct key', () => {
		const body = toAnthropicBody({ model: 'claude-sonnet-5-5', maxTokens: 20000, messages: [{ role: 'user', content: 'hi' }], reasoningEffort: 'high' });
		expect(body.thinking).toBeUndefined();
	});

	it('the chosen provider stays the cloud tier while its key is not yet open, never falling to OpenRouter', async () => {
		const m = createArchitectModel({});
		m.saveProviderKey('openrouter', 'sk-or-v1-test');
		await openRouterKeySettled();
		selectChat({ provider: 'anthropic' }); // chosen, but no key readable yet
		expect(m.availability()).toMatchObject({ provider: 'anthropic', openRouterReady: false, generation: 'floor' });
	});

	it('a stored provider name that is not a provider migrates as OpenRouter', () => {
		localStorage.setItem('lattice-db-provider', 'constructor');
		expect(readChatSelection().provider).toBe('openrouter');
	});
});
