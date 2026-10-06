// chatComplete on the cloud tier, end to end through the real wiring (prompt, loop, tools,
// fold, finalize) with a scripted backend standing in for OpenRouter. No network.
import { afterEach, describe, expect, it } from 'vitest';
import { architectModel, chatComplete } from './architect';

type Opts = { messages: { role: string }[]; tools?: unknown[]; toolChoice?: string; onToolCalls?: (c: unknown[]) => void; onToken?: (t: string) => void };
type Hooks = { __setBackend: (b: unknown) => void };

const DECK = '---\ntheme: indaco\n---\n\n<!-- _class: title -->\n# Q3 review\n\n---\n\n<!-- _class: content -->\n## Next\n\n- Hire two';

async function withBackend(complete: (o: Opts) => Promise<string>) {
	const m = (await architectModel()) as unknown as Hooks;
	m.__setBackend({ name: 'openrouter', complete, async embed() { return null; } });
}

afterEach(async () => {
	((await architectModel()) as unknown as Hooks).__setBackend(null);
});

describe('chatComplete — the cloud agent', () => {
	it('runs a tool round, stages a front-matter change, and returns one reviewable proposal', async () => {
		const seen: Opts[] = [];
		await withBackend(async (o) => {
			seen.push(o);
			if (seen.length === 1) {
				o.onToolCalls?.([{ id: 't1', type: 'function', function: { name: 'set_front_matter', arguments: '{"key":"finish","value":"atrium"}' } }]);
				return '';
			}
			o.onToken?.('Set the atrium finish.');
			return 'Set the atrium finish.';
		});
		const out = await chatComplete([{ role: 'user', content: 'Give it the atrium finish' }], DECK);
		expect(out.status).toBe('ok');
		if (out.status !== 'ok') return;
		expect(out.reply).toBe('Set the atrium finish.');
		expect(out.activity).toContain('Set finish');
		expect(out.proposed?.edits).toEqual([expect.objectContaining({ action: 'frontmatter', label: 'Front matter · finish' })]);
		expect(out.proposed?.source).toContain('finish: atrium');
		// Tools ride every round; the second round sees the tool result.
		expect(seen[0].tools?.length).toBeGreaterThan(0);
		expect(seen[1].messages.map((m) => m.role).slice(-2)).toEqual(['assistant', 'tool']);
	});

	it('falls back to the one-shot chat when the model refuses tool calls', async () => {
		await withBackend(async (o) => {
			if (o.tools?.length) throw new Error('OpenRouter error 404: No endpoints found that support tool use');
			o.onToken?.('One-shot answer.');
			return 'One-shot answer.';
		});
		const out = await chatComplete([{ role: 'user', content: 'Who is this for?' }], DECK);
		expect(out).toMatchObject({ status: 'ok', reply: 'One-shot answer.', proposed: null });
	});

	it('reports a connection that drops after a tool round instead of a blank reply', async () => {
		let n = 0;
		await withBackend(async (o) => {
			n++;
			if (n === 1) {
				o.onToken?.('Reading the deck.');
				o.onToolCalls?.([{ id: 't1', type: 'function', function: { name: 'read_slides', arguments: '{"from":1}' } }]);
				return 'Reading the deck.';
			}
			throw new Error('OpenRouter error 502');
		});
		const out = await chatComplete([{ role: 'user', content: 'Tighten slide 2' }], DECK);
		expect(out.status).toBe('ok');
		// A status from OpenRouter names its cause; a network failure still reads as a drop.
		if (out.status === 'ok') expect(out.reply).toMatch(/stopped partway\. OpenRouter or the model's provider had an error/);
	});
});

describe('the transport self-heal', () => {
	it('treats a model that cannot take tools as LIVE, so the chat falls back on the author’s own model', async () => {
		const { isDeadModelError } = await import('./ai/architect-model.js');
		const toolless = '{"error":{"message":"No endpoints found that support tool use. Try disabling \\"x\\".","code":404}}';
		expect(isDeadModelError(404, toolless)).toBe(false);
		// A genuinely retired id still self-heals on a request without tools; the chat names it instead.
		expect(isDeadModelError(404, '{"error":{"message":"No endpoints found for some/retired-model."}}')).toBe(true);
		expect(isDeadModelError(400, 'some/x is not a valid model ID')).toBe(true);
	});
});

describe('the transport never swaps the model on a tools request', () => {
	it('a "no endpoints" 404 on a tools request reaches the caller, with no retry on the default model', async () => {
		const { createArchitectModel } = await import('./ai/architect-model.js');
		localStorage.setItem('lattice-db-or-key', 'test-key');
		localStorage.setItem('lattice-db-or-model', 'some/model-without-tool-choice');
		const sent: string[] = [];
		const realFetch = globalThis.fetch;
		globalThis.fetch = (async (_url: string, init: { body: string }) => {
			sent.push(JSON.parse(init.body).model);
			return new Response('{"error":{"message":"No endpoints found that can handle the requested parameters.","code":404}}', { status: 404 });
		}) as unknown as typeof fetch;
		try {
			const m = createArchitectModel({ getSettings: () => ({}) });
			await expect(m.complete({ messages: [{ role: 'user', content: 'hi' }], tools: [{ type: 'function', function: { name: 'x', parameters: {} } }] })).rejects.toThrow(/404/);
			expect(sent).toEqual(['some/model-without-tool-choice']);
		} finally {
			globalThis.fetch = realFetch;
			localStorage.removeItem('lattice-db-or-key');
			localStorage.removeItem('lattice-db-or-model');
		}
	});
});

describe('a failed request says why, instead of an empty reply', () => {
	it('an out-of-credits 402 is reported, not silently retried as a one-shot', async () => {
		let calls = 0;
		await withBackend(async () => {
			calls++;
			throw new Error('OpenRouter error 402: {"error":{"message":"Insufficient credits","code":402}}');
		});
		const out = await chatComplete([{ role: 'user', content: 'i need a deck on the plight of day laborers' }], DECK);
		expect(out.status).toBe('blocked');
		if (out.status === 'blocked') expect(out.reply).toMatch(/out of credits/);
		expect(calls).toBe(1);
	});

	it('only a tools refusal falls back to the one-shot chat', async () => {
		const { isToolRefusal, describeModelError } = await import('./chat-agent');
		expect(isToolRefusal('OpenRouter error 404: No endpoints found that support tool use.')).toBe(true);
		expect(isToolRefusal('OpenRouter error 404: No endpoints found that can handle the requested parameters.')).toBe(true);
		expect(isToolRefusal('OpenRouter error 401: User not found')).toBe(false);
		expect(isToolRefusal('OpenRouter error 404: No endpoints found for some/retired-model.')).toBe(false);
		expect(describeModelError('OpenRouter error 401: User not found')).toMatch(/reconnect in Workspace/);
		expect(describeModelError('OpenRouter error 401: {"error":{"message":"User not found.","code":401}}')).toContain('(OpenRouter said: User not found.)');
		expect(describeModelError('OpenRouter error 404: No endpoints found for x/y')).toMatch(/pick another model/);
		expect(describeModelError('TypeError: Load failed')).toMatch(/never reached OpenRouter/);
	});
});

// The independent checker's findings on the shipped agent (decision note §9, continuation).
describe('checker pass: failures name their cause', () => {
	it('an error OpenRouter sends inside a 200 stream rejects a tools request instead of ending as an empty reply', async () => {
		const { createArchitectModel } = await import('./ai/architect-model.js');
		localStorage.setItem('lattice-db-or-key', 'test-key');
		const realFetch = globalThis.fetch;
		const frames = [
			'data: {"id":"gen-1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"t1","function":{"name":"edit_slides","arguments":"{\\"edits\\":[{"}}]}}]}\n\n',
			'data: {"id":"gen-1","error":{"code":"server_error","message":"Provider disconnected unexpectedly"},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}\n\n',
			'data: [DONE]\n\n',
		];
		globalThis.fetch = (async () =>
			new Response(
				new ReadableStream({
					start(c) {
						for (const f of frames) c.enqueue(new TextEncoder().encode(f));
						c.close();
					},
				}),
				{ status: 200 },
			)) as unknown as typeof fetch;
		try {
			const m = createArchitectModel({ getSettings: () => ({}) });
			const calls: unknown[] = [];
			await expect(m.complete({ messages: [{ role: 'user', content: 'hi' }], tools: [{ type: 'function', function: { name: 'x', parameters: {} } }], onToken: () => {}, onToolCalls: (c: unknown[]) => calls.push(...c) })).rejects.toThrow(/OpenRouter error 502: .*Provider disconnected/);
			// The half-streamed call never reaches the agent.
			expect(calls).toEqual([]);
		} finally {
			globalThis.fetch = realFetch;
			localStorage.removeItem('lattice-db-or-key');
		}
	});

	it('a context-length 400 is not a tools refusal, and says what is too long', async () => {
		const { isToolRefusal, describeModelError } = await import('./chat-agent');
		const ctx = 'OpenRouter error 400: {"error":{"message":"This endpoint\'s maximum context length is 32000 tokens. However, you requested about 40000 tokens (35000 of text input, 1000 of tool input, 4000 in the output).","code":400}}';
		expect(isToolRefusal(ctx)).toBe(false);
		expect(describeModelError(ctx)).toMatch(/too long for this model/);
		expect(isToolRefusal('OpenRouter error 429: {"error":{"message":"Rate limit 400/min on tool requests"}}')).toBe(false);
		expect(isToolRefusal('OpenRouter error 404: No endpoints found that support tool use.')).toBe(true);
	});

	it('a 403 for flagged input says moderation, not reconnect', async () => {
		const { describeModelError } = await import('./chat-agent');
		const out = describeModelError('OpenRouter error 403: {"error":{"message":"Your chosen model requires moderation and your input was flagged","code":403}}');
		expect(out).toMatch(/moderation flagged/);
		expect(out).not.toMatch(/reconnect/);
	});

	it('a 429 after a finished round names the rate limit, not a dropped connection', async () => {
		let n = 0;
		await withBackend(async (o) => {
			n++;
			if (n === 1) {
				o.onToolCalls?.([{ id: 't1', type: 'function', function: { name: 'read_slides', arguments: '{"from":1}' } }]);
				return '';
			}
			throw new Error('OpenRouter error 429: {"error":{"message":"Rate limit exceeded","code":429}}');
		});
		const out = await chatComplete([{ role: 'user', content: 'Tighten slide 2' }], DECK);
		expect(out.status).toBe('ok');
		if (out.status === 'ok') {
			expect(out.reply).toMatch(/rate-limiting/);
			expect(out.reply).not.toMatch(/connection dropped/);
		}
	});

	it('a Stop during a round that streamed only a tool call is still priced and reconciled', async () => {
		const spend = await import('./ai/spend.js');
		const before = spend.readSpend().session;
		const m = (await architectModel()) as unknown as Hooks & { openRouterGenerationCost?: (id: string) => Promise<number>; openRouterModelPrice?: () => unknown };
		const looked: string[] = [];
		const ctl = new AbortController();
		let n = 0;
		m.__setBackend({
			name: 'openrouter',
			async embed() {
				return null;
			},
			async complete(o: Opts & { onUsage?: (u: unknown) => void; onGenerationId?: (id: string) => void }) {
				n++;
				if (n === 1) {
					o.onUsage?.({ cost: 0.001, total_tokens: 10 });
					o.onToolCalls?.([{ id: 't1', type: 'function', function: { name: 'read_slides', arguments: '{"from":1}' } }]);
					return '';
				}
				o.onGenerationId?.('gen-2');
				ctl.abort();
				const e = new Error('aborted');
				e.name = 'AbortError';
				throw e;
			},
		});
		const orig = { cost: m.openRouterGenerationCost, price: m.openRouterModelPrice };
		m.openRouterGenerationCost = async (id: string) => {
			looked.push(id);
			return 0.002;
		};
		m.openRouterModelPrice = () => ({ promptPerM: 3, completionPerM: 15 });
		try {
			await chatComplete([{ role: 'user', content: 'Tighten slide 2' }], DECK, undefined, { signal: ctl.signal });
			await new Promise((r) => setTimeout(r, 0));
			expect(looked).toEqual(['gen-2']);
			expect(spend.readSpend().session).toBeGreaterThan(before);
		} finally {
			m.openRouterGenerationCost = orig.cost;
			m.openRouterModelPrice = orig.price;
		}
	});
});
