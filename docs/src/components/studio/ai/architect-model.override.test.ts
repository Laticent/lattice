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
