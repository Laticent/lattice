import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArchitectModel } from './architect-model.js';

// One call can run on a different OpenRouter model than the chat's, and can ask a reasoning model to think harder. The Library's
// photo description uses both (the image model and "Look closer"); no other caller passes either, so the chat's body is unchanged.
afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
});

async function send(opts: Record<string, unknown>) {
	localStorage.setItem('lattice-db-or-key', JSON.stringify('sk-test'));
	let body: Record<string, unknown> = {};
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init: { body: string }) => {
			body = JSON.parse(init.body);
			return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":1}' } }], usage: {} }), { status: 200 });
		}),
	);
	const m = createArchitectModel({ getSettings: () => ({}) });
	await m.complete({ messages: [{ role: 'user', content: 'hi' }], json: true, fallback: {}, ...opts });
	return body;
}

describe('a call on its own model', () => {
	it('uses the chat model by default, and no reasoning field', async () => {
		const body = await send({});
		expect(body.model).toBe('~anthropic/claude-sonnet-latest');
		expect(body.reasoning).toBeUndefined();
	});

	it('uses the model it names, and asks for the effort it names', async () => {
		const body = await send({ model: 'openai/gpt-5', reasoningEffort: 'medium' });
		expect(body.model).toBe('openai/gpt-5');
		expect(body.reasoning).toEqual({ effort: 'medium' });
	});
});

// "Show work" reads the model's thinking from the stream it already pays for. It must never ask for
// more: no `reasoning` field rides the body just because a caller listens.
describe('reasoning stream', () => {
	const sse = (chunks: unknown[]) => new Response(`${chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')}data: [DONE]\n\n`, { status: 200 });

	it('hands the thinking to onReasoning, from either shape, without adding a reasoning request', async () => {
		localStorage.setItem('lattice-db-or-key', JSON.stringify('sk-test'));
		let body: Record<string, unknown> = {};
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_u: string, init: { body: string }) => {
				body = JSON.parse(init.body);
				return sse([
					{ id: 'g1', choices: [{ delta: { reasoning: 'Let me ' } }] },
					{ choices: [{ delta: { reasoning_details: [{ type: 'reasoning.text', text: 'check the deck. ' }] } }] },
					{ choices: [{ delta: { content: 'Done.' } }] },
					{ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { cost: 0.01, prompt_tokens: 5, completion_tokens: 7, completion_tokens_details: { reasoning_tokens: 4 } } },
				]);
			}),
		);
		const m = createArchitectModel({ getSettings: () => ({}) });
		let thought = '';
		let usage: Record<string, unknown> = {};
		const text = await m.complete({ messages: [{ role: 'user', content: 'hi' }], onToken: () => {}, onReasoning: (t: string) => (thought += t), onUsage: (u: Record<string, unknown>) => (usage = u) });
		expect(text).toBe('Done.');
		expect(thought).toBe('Let me check the deck. ');
		expect(usage.completion_tokens_details).toEqual({ reasoning_tokens: 4 });
		expect(body.reasoning).toBeUndefined();
	});
});
