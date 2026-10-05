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
		if (out.status === 'ok') expect(out.reply).toContain('connection dropped');
	});
});

describe('the transport self-heal', () => {
	it('treats a model that cannot take tools as LIVE, so the chat falls back on the author’s own model', async () => {
		const { isDeadModelError } = await import('./ai/architect-model.js');
		const toolless = '{"error":{"message":"No endpoints found that support tool use. Try disabling \\"x\\".","code":404}}';
		expect(isDeadModelError(404, toolless)).toBe(false);
		// A genuinely retired id still self-heals.
		expect(isDeadModelError(404, '{"error":{"message":"No endpoints found for some/retired-model."}}')).toBe(true);
		expect(isDeadModelError(400, 'some/x is not a valid model ID')).toBe(true);
	});
});
