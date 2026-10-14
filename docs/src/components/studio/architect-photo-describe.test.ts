import { afterEach, describe, expect, it, vi } from 'vitest';
import { setBudget } from './architect';
import { IMAGE_LOOKS, lookTokens } from './image-look';
import { pictureTokensFor } from './picture-tokens';
import { languageFor } from './studio-language';
import { saveSettings } from './studio-store';
import { buildPhotoDescriptionPrompt, cleanPhotoDescription, cleanPhotoName, lookCharge, modelSees, suggestPhotoDescription } from './suggest-photo-description';

const fake = vi.hoisted(() => ({ model: null as unknown }));
vi.mock('./architect', async (importOriginal) => ({ ...(await importOriginal<typeof import('./architect')>()), architectModel: async () => fake.model }));

// The call itself needs a connected cloud model, so its states (no key, a model that cannot read images, a reply) are
// driven on the real Studio with OpenRouter mocked (docs/e2e/library-image-metadata.spec.ts). What is pure and
// testable here is the prompt and the cleaner that turns a reply into something safe to put in a field.
describe('buildPhotoDescriptionPrompt', () => {
	it('sends the picture as an image part, with a system contract that forbids guessing', () => {
		const msgs = buildPhotoDescriptionPrompt('data:image/jpeg;base64,AAAA');
		expect(msgs[0].role).toBe('system');
		expect(msgs[0].content).toMatch(/Never guess names, places, brands or text you cannot read/);
		expect(msgs[0].content).toMatch(/at most 20 words/);
		expect(msgs[0].content).toMatch(/"name"/);
		const parts = msgs[1].content as unknown as { type: string; image_url?: { url: string } }[];
		expect(parts.map((p) => p.type)).toEqual(['text', 'image_url']);
		expect(parts[1].image_url?.url).toBe('data:image/jpeg;base64,AAAA');
	});
});

describe('what a Suggest call sends', () => {
	it('is the thumbnail, one fixed instruction and the language, with no standing instructions of the author', () => {
		localStorage.setItem('lattice-studio-instructions', 'ALWAYS WRITE IN PIRATE VOICE, SECRET HOUSE STYLE');
		const msgs = buildPhotoDescriptionPrompt('data:image/jpeg;base64,AAAA', 'fr');
		const sent = JSON.stringify(msgs);
		expect(sent).not.toMatch(/PIRATE|STANDING INSTRUCTIONS/);
		expect(msgs).toHaveLength(2);
		expect(String(msgs[0].content)).toContain(`Write the description in ${languageFor('fr').label}.`);
		expect(msgs[1].content).toHaveLength(2);
	});
});

describe('cleanPhotoDescription', () => {
	it('takes the reply down to one capitalized sentence in the field', () => {
		expect(cleanPhotoDescription('  "a team on a roof at sunset"\n')).toBe('A team on a roof at sunset');
		expect(cleanPhotoDescription('Photo of two people at a workbench.')).toBe('Two people at a workbench.');
		expect(cleanPhotoDescription('An image of a red door')).toBe('A red door');
	});

	it('keeps it within the description limit, cut by characters', () => {
		const out = cleanPhotoDescription('word '.repeat(80));
		expect(Array.from(out).length).toBeLessThanOrEqual(140);
	});

	it('gives nothing for an empty or invisible-only reply, and strips hidden characters from a real one', () => {
		expect(cleanPhotoDescription('')).toBe('');
		expect(cleanPhotoDescription('​‮  \n')).toBe('');
		expect(cleanPhotoDescription('A door‮​')).toBe('A door');
	});
});

describe('suggestPhotoDescription', () => {
	it('declines anything that is not an image data URL, without asking a model', async () => {
		for (const bad of ['', 'https://x.test/a.jpg', 'data:text/html;base64,AAAA', 'javascript:alert(1)']) {
			expect(await suggestPhotoDescription(bad)).toEqual({ status: 'nochange' });
		}
	});
});

describe('cleanPhotoName', () => {
	it('makes a name the Library accepts, or nothing', () => {
		expect(cleanPhotoName('Black Suede Brogue')).toBe('black-suede-brogue');
		expect(cleanPhotoName('  “Team on the roof!”  ')).toBe('team-on-the-roof');
		expect(cleanPhotoName('shop-floor.jpg')).toBe('shop-floor');
		expect(cleanPhotoName('a'.repeat(80)).length).toBeLessThanOrEqual(32);
		expect(cleanPhotoName('')).toBe('');
		expect(cleanPhotoName('!!!')).toBe('');
		expect(cleanPhotoName(undefined)).toBe('');
		expect(cleanPhotoName('x​‮y')).toBe('xy');
	});
});

describe('modelSees', () => {
	const catalog = [
		{ id: 'anthropic/claude-sonnet-5-5', vision: true },
		{ id: 'anthropic/claude-sonnet-5', vision: true },
		{ id: 'deepseek/deepseek-chat', vision: false },
	];
	it('reads the catalog, and unknown means no', () => {
		expect(modelSees(catalog, 'anthropic/claude-sonnet-5-5')).toBe(true);
		expect(modelSees(catalog, 'deepseek/deepseek-chat')).toBe(false);
		expect(modelSees(catalog, 'nobody/nothing')).toBe(false);
	});
	it('reads a ~latest alias through its family, since the alias is not itself listed', () => {
		expect(modelSees(catalog, '~anthropic/claude-sonnet-latest')).toBe(true);
		expect(modelSees(catalog, '~deepseek/deepseek-chat-latest')).toBe(false);
		expect(modelSees(catalog, '~nobody/nothing-latest')).toBe(false);
	});
});

describe('how closely the model looks', () => {
	it('costs more tokens at every step, and only the thorough look asks the model to think', () => {
		expect(lookTokens('quick')).toBeLessThan(lookTokens('careful'));
		expect(lookTokens('careful')).toBeLessThan(lookTokens('thorough'));
		expect(IMAGE_LOOKS.quick.effort).toBeUndefined();
		expect(IMAGE_LOOKS.careful.effort).toBeUndefined();
		expect(IMAGE_LOOKS.thorough.effort).toBe('medium');
	});
});

describe('lookCharge — a Suggest picture is priced by the model that reads it', () => {
	const claude = pictureTokensFor('anthropic/claude-sonnet-5.5');
	const mini = pictureTokensFor('openai/gpt-4o-mini');
	it('charges the model’s measured figure, never less than Claude’s edge² / 750 for that look', () => {
		// quick (512 px): Claude's formula says 350 tokens, the table's thumbnail figure for a default model is more.
		expect(lookCharge('quick', claude, null).tokens).toBe(claude.thumb);
		expect(lookCharge('quick', claude, null).tokens).toBeGreaterThan(lookTokens('quick'));
		// careful (1024 px) and thorough (1568 px) have no 1024 figure and are charged the 1568 px one.
		expect(lookCharge('careful', claude, null).tokens).toBe(Math.max(lookTokens('careful'), claude.photo));
		expect(lookCharge('thorough', claude, null).tokens).toBe(Math.max(lookTokens('thorough'), claude.photo));
	});
	it('charges the dear-picture models what they bill: GPT-4o mini reads a 512 px picture as thousands of tokens', () => {
		expect(lookCharge('quick', mini, null).tokens).toBe(mini.thumb);
		expect(mini.thumb).toBeGreaterThan(5 * claude.thumb);
	});
	it('adds the model’s own image-price surcharge in dollars, and none without one', () => {
		expect(lookCharge('quick', claude, { promptPerM: 3, imagePerM: null }).usd).toBe(0);
		expect(lookCharge('quick', claude, { promptPerM: 3, imagePerM: 9 }).usd).toBeCloseTo((claude.thumb * 6) / 1e6, 9);
	});
});

describe('suggestPhotoDescription — the budget gate prices the picture by the image model', () => {
	// $10/M and no output cost, so the whole estimate is the picture and the system prompt: a 512 px look is 2,000 tokens ($0.02) on a default
	// model and 13,200 ($0.13) on GPT-4o mini. A $0.08 cap sits between them.
	const PRICE = { promptPerM: 10, completionPerM: 0 };
	const fakeModel = (complete: ReturnType<typeof vi.fn>) => ({
		availability: () => ({ generation: 'openrouter' }),
		listOpenRouterModels: async () => ['anthropic/claude-sonnet-5.5', 'openai/gpt-4o-mini'].map((id) => ({ id, vision: true })),
		openRouterModelPrice: () => PRICE,
		complete,
	});
	afterEach(() => {
		setBudget(null, 'alert');
		localStorage.clear();
	});
	const run = async (imageModel: string) => {
		const complete = vi.fn(async () => ({ description: 'Two people at a bench', name: 'bench' }));
		fake.model = fakeModel(complete);
		saveSettings({ imageModel, imageLook: 'quick' });
		setBudget(0.08, 'stop');
		return { out: await suggestPhotoDescription('data:image/jpeg;base64,AAAA'), complete };
	};
	it('lets a model whose pictures cost the default through', async () => {
		const { out, complete } = await run('anthropic/claude-sonnet-5.5');
		expect(complete).toHaveBeenCalledTimes(1);
		expect(out.status).toBe('ok');
	});
	it('refuses GPT-4o mini, whose 512 px picture is thousands of tokens, before sending it', async () => {
		const { out, complete } = await run('openai/gpt-4o-mini');
		expect(complete).not.toHaveBeenCalled();
		expect(out).toMatchObject({ status: 'blocked' });
	});
});
