import { afterEach, describe, expect, it, vi } from 'vitest';

// AI finish-recipe path (#5a). Two layers under test:
//   • parseFinishReply — pulls the FIRST JSON object out of a (possibly fenced) model
//     reply and shapes it into the recipe-ish struct. It must extract ONLY structured
//     fields (numbers + the type/placement/name strings) and never forward arbitrary
//     model prose — the closed-vocab clamping is the caller's (coerceRecipe) job.
//   • generateFinish — the honest-degradation bridge: empty prompt → nochange, no model
//     → offline, a connected model → coerced recipe (model never authors CSS).
// coerceRecipe rejecting garbage/NaN/out-of-vocab is covered in finish-generate.test.ts;
// here we confirm parseFinishReply hands it raw strings that coerceRecipe then clamps.

import { coerceRecipe } from './finish-generate';

// A controllable fake of the architect model module. The mock backend lets each test
// drive the `complete()` reply; availability decides offline vs connected.
const state: { generation: string; reply: string } = { generation: 'floor', reply: '' };

vi.mock('@/components/studio/ai/architect-model.js', () => ({
	createArchitectModel: () => ({
		availability: () => ({ generation: state.generation, promptApi: 'unknown', webgpu: false, webllmReady: false, universalReady: false, openRouterReady: false, modelOn: true }),
		refreshAvailability: async () => {},
		complete: async () => state.reply,
		openRouterModelPrice: () => null,
		openRouterModelName: () => null,
		openRouterModel: () => '',
		openRouterKeySettingsUrl: () => '',
		openRouterAccount: () => null,
		openRouterCredits: () => null,
	}),
}));

// Import AFTER the mock so the architect module binds the fake. parseFinishReply is the
// pure extractor; generateFinish is the bridge.
const { generateFinish, parseFinishReply } = await import('./architect');

afterEach(() => {
	state.generation = 'floor';
	state.reply = '';
});

describe('parseFinishReply — extracts structure, never forwards model prose', () => {
	it('pulls a JSON object out of a fenced reply', () => {
		const reply = 'Here is your finish:\n```json\n{"name":"calm","wash":{"type":"corner-glow","intensity":9},"texture":{"type":"grid","intensity":7,"scale":30},"mark":{"type":"none","placement":"center"},"edge":{"type":"none","intensity":6}}\n```\nEnjoy!';
		const out = parseFinishReply(reply);
		expect(out).not.toBeNull();
		expect(out?.name).toBe('calm');
		expect(out?.recipe.wash.type).toBe('corner-glow');
		expect(out?.recipe.wash.intensity).toBe(9);
		expect(out?.recipe.texture.scale).toBe(30);
	});

	it('returns null on a reply with no JSON object (no fabricated recipe)', () => {
		expect(parseFinishReply('I cannot do that.')).toBeNull();
		expect(parseFinishReply('')).toBeNull();
		expect(parseFinishReply('{ not json')).toBeNull();
	});

	it('forwards only typed fields — numbers as numbers, no stray prose leaks through', () => {
		const reply = '{"name":"x","wash":{"type":"spotlight","intensity":"12","note":"ignore me"},"texture":{},"mark":{},"edge":{}}';
		const out = parseFinishReply(reply);
		// intensity coerced to a number; the stray `note` key is dropped (not on the shape).
		expect(typeof out?.recipe.wash.intensity).toBe('number');
		expect(JSON.stringify(out?.recipe)).not.toContain('ignore me');
		// Missing layers come back as empty-typed (caller's coerceRecipe defaults them).
		expect(out?.recipe.texture.type).toBe('');
		expect(out?.recipe.mark.type).toBe('');
	});

	it('a malicious type string is extracted raw, then coerceRecipe clamps it to vocab', () => {
		const reply = '{"wash":{"type":"red; } body { color:red","intensity":99},"texture":{},"mark":{"type":"skull","placement":"nowhere"},"edge":{}}';
		const parsed = parseFinishReply(reply);
		expect(parsed).not.toBeNull();
		// parseFinishReply does NOT validate — the dangerous string survives extraction…
		expect(parsed?.recipe.wash.type).toContain('body');
		// …but coerceRecipe (the disposer) snaps it to a safe in-vocab value.
		const safe = coerceRecipe(parsed?.recipe);
		expect(safe.wash.type).toBe('none'); // unknown → none
		expect(safe.mark.type).toBe('none');
		expect(safe.wash.intensity).toBeLessThanOrEqual(20);
	});
});

describe('generateFinish — honest degradation', () => {
	it('returns nochange for an empty prompt without touching the model', async () => {
		expect((await generateFinish('')).status).toBe('nochange');
		expect((await generateFinish('   ')).status).toBe('nochange');
	});

	it('returns offline when the model is on the floor (no model connected)', async () => {
		state.generation = 'floor';
		const out = await generateFinish('a calm blueprint grid');
		expect(out.status).toBe('offline');
	});

	it('returns ok with a coerced recipe when a connected model proposes one', async () => {
		state.generation = 'webllm';
		state.reply = '{"name":"calm-grid","wash":{"type":"corner-glow","intensity":9},"texture":{"type":"grid","intensity":7,"scale":30},"mark":{"type":"none","placement":"center"},"edge":{"type":"none","intensity":6}}';
		const out = await generateFinish('a calm blueprint grid with a soft corner glow');
		expect(out.status).toBe('ok');
		if (out.status === 'ok') {
			expect(out.recipe.wash.type).toBe('corner-glow');
			expect(out.name).toBe('calm-grid');
		}
	});

	it('returns nochange when a connected model returns an unusable (non-JSON) reply', async () => {
		state.generation = 'webllm';
		state.reply = 'Sorry, I have no finish for that.';
		const out = await generateFinish('something');
		expect(out.status).toBe('nochange');
	});
});
