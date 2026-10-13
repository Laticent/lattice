import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ArchitectModel, loadChatAgent, setBudget } from './architect';
import { pictureTokensFor } from './picture-tokens';

// The budget gate, driven through the real chat agent: the same attached photo, the same prices, two
// models. What differs is only what one picture costs on each (picture-tokens.ts), so the hard stop must
// pass the cheap-image model and refuse the dear-image one.
const PRICE = { promptPerM: 10, completionPerM: 0 };
const PHOTOS = [{ name: 'shop-floor', dataUrl: 'data:image/jpeg;base64,AAAA' }];

function fakeModel(id: string, price: { promptPerM: number; completionPerM: number; imagePerM?: number | null } = PRICE, aliasSlug: string | null = null) {
	const complete = vi.fn(async () => 'Done.');
	const model = {
		openRouterModel: () => id,
		openRouterModelPrice: () => price,
		listOpenRouterModels: async () => [{ id, vision: true, aliasSlug }],
		complete,
	} as unknown as ArchitectModel;
	return { model, complete };
}

describe('the chat agent’s budget gate prices an attached photo by model', () => {
	let chatAgent: Awaited<ReturnType<typeof loadChatAgent>>['chatAgent'];
	beforeAll(async () => {
		({ chatAgent } = await loadChatAgent());
	});
	afterEach(() => setBudget(null, 'alert'));
	const turn = (model: ArchitectModel) => chatAgent(model, [{ role: 'user', content: 'Use my photo.' }], '# A deck', undefined, { photos: PHOTOS, grounding: { catalog: [], findings: [] } });

	// Measured through this harness at $10/M (prompt only): the default photo (2,400 tokens) turn costs between $0.05
	// and $0.10, the same turn with the photo priced at 10x the prompt rate between $0.25 and $0.30, and on GPT-4o mini
	// (36,850 tokens) between $0.40 and $0.50. A $0.15 cap sits between the first and the other two.
	const CAP = 0.15;

	it('passes a model whose pictures cost the default, and refuses one whose pictures cost 15x that', async () => {
		expect(pictureTokensFor('openai/gpt-4o-mini').photo).toBeGreaterThan(15 * pictureTokensFor('anthropic/claude-sonnet-5.5').photo);
		const base = fakeModel('anthropic/claude-sonnet-5.5');
		const dear = fakeModel('openai/gpt-4o-mini');
		// A cap too small for either: both refuse, so the pass below is the margin and not an unenforced gate.
		setBudget(0.01, 'stop');
		expect(await turn(base.model)).toMatchObject({ status: 'blocked', reply: expect.stringMatching(/exceed your \$0\.01 cap/) });
		expect(base.complete).not.toHaveBeenCalled();
		setBudget(CAP, 'stop');
		await turn(base.model);
		expect(base.complete).toHaveBeenCalledTimes(1);
		const refused = await turn(dear.model);
		expect(dear.complete).not.toHaveBeenCalled();
		expect(refused).toMatchObject({ status: 'blocked', reply: expect.stringMatching(/exceed your \$0\.15 cap/) });
	});

	it('refuses a photo the model prices itself above the token figure', async () => {
		const plain = fakeModel('anthropic/claude-sonnet-5.5', { promptPerM: 10, completionPerM: 0, imagePerM: null });
		// 10x the prompt rate is still read as a token rate: 2,400 tokens at $100/M is $0.24, not $0.024.
		const dear = fakeModel('anthropic/claude-sonnet-5.5', { promptPerM: 10, completionPerM: 0, imagePerM: 100 });
		setBudget(CAP, 'stop');
		await turn(plain.model);
		await turn(dear.model);
		expect(plain.complete).toHaveBeenCalledTimes(1);
		expect(dear.complete).not.toHaveBeenCalled();
	});

	it('prices a ~…-latest alias as the model it points at', async () => {
		const alias = fakeModel('~vendor/gpt-latest', PRICE, 'openai/gpt-4o-mini');
		const plain = fakeModel('~vendor/claude-latest', PRICE, 'anthropic/claude-sonnet-5.5');
		setBudget(CAP, 'stop');
		await turn(plain.model);
		await turn(alias.model);
		expect(plain.complete).toHaveBeenCalledTimes(1);
		expect(alias.complete).not.toHaveBeenCalled();
	});
});
