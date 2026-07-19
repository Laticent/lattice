import { afterEach, describe, expect, it, vi } from 'vitest';

// AI motion-scene path (Director mode, Stage 7c). Two layers under test:
//   • parseSceneReply — pulls the FIRST JSON object out of a (possibly fenced) model reply
//     and runs it through `parseScene` (the closed-vocab validator, HARD RULE #22). A reply
//     that isn't valid JSON, or a scene that doesn't validate, is REPORTED — never forwarded.
//   • generateScene — the honest-degradation bridge: empty prompt → nochange, no model →
//     offline, a connected model → a validated Scene (the model emits DATA, never code).

// A controllable fake of the architect model module — same shape as finish-ai.test.ts.
const state: { generation: string; reply: string } = { generation: 'floor', reply: '' };

vi.mock('@/playground/architect-model.js', () => ({
	createArchitectModel: () => ({
		availability: () => ({ generation: state.generation, promptApi: 'unknown', webgpu: false, webllmReady: false, universalReady: false, openRouterReady: false, modelOn: true }),
		refreshAvailability: async () => {},
		// Mirror the REAL wrapper: complete({ json:true }) returns an already-PARSED object
		// (architect-model's extractJson), not the raw string. generateScene must handle that.
		complete: async ({ json }: { json?: boolean }) => {
			if (json && typeof state.reply === 'string') {
				const t = state.reply;
				const a = t.indexOf('{');
				const b = t.lastIndexOf('}');
				if (a < 0 || b <= a) return '';
				try {
					return JSON.parse(t.slice(a, b + 1));
				} catch {
					return '';
				}
			}
			return state.reply;
		},
		openRouterModelPrice: () => null,
		openRouterModelName: () => null,
		openRouterModel: () => '',
		openRouterKeySettingsUrl: () => '',
		openRouterAccount: () => null,
		openRouterCredits: () => null,
	}),
}));

const { generateScene, parseSceneReply } = await import('./architect');

const VALID = '{"source":"built","duration":3000,"hero":0.5,"elements":[{"id":"rig","shape":"group","motion":[{"verb":"spin","axis":"y","period":3000}],"children":[{"id":"rotor","shape":"cone","color":"var(--accent)"}]}]}';

afterEach(() => {
	state.generation = 'floor';
	state.reply = '';
});

describe('parseSceneReply — validates, never forwards an unvalidated scene', () => {
	it('accepts an already-parsed OBJECT (the real complete({json:true}) contract)', () => {
		const out = parseSceneReply(JSON.parse(VALID));
		expect(out.ok).toBe(true);
		if (out.ok) expect(out.scene.elements[0].id).toBe('rig');
	});

	it('pulls a valid scene out of a fenced STRING reply', () => {
		const out = parseSceneReply('Here you go:\n```json\n' + VALID + '\n```\nEnjoy!');
		expect(out.ok).toBe(true);
		if (out.ok) {
			expect(out.scene.source).toBe('built');
			expect(out.scene.elements[0].id).toBe('rig');
		}
	});

	it('REJECTS an already-parsed object that is not a valid scene', () => {
		expect(parseSceneReply({ source: 'built', duration: 3000, hero: 0.5, elements: [] }).ok).toBe(false);
	});

	it('reports (does not throw) on a reply with no JSON object', () => {
		expect(parseSceneReply('I cannot do that.').ok).toBe(false);
		expect(parseSceneReply('').ok).toBe(false);
		expect(parseSceneReply('{ not json').ok).toBe(false);
	});

	it('REJECTS a scene that fails the closed-vocab validator (HARD RULE #22)', () => {
		// A non-token color must never pass — parseScene (validateColor) gates it.
		const evil = '{"source":"built","duration":3000,"hero":0.5,"elements":[{"id":"x","shape":"box","color":"red; } body { color:red"}]}';
		const out = parseSceneReply(evil);
		expect(out.ok).toBe(false);
		if (!out.ok) expect(out.note).toMatch(/didn’t validate|validate/i);
	});

	it('REJECTS an unknown shape / bad structure', () => {
		expect(parseSceneReply('{"source":"built","duration":3000,"hero":0.5,"elements":[{"id":"y","shape":"banana"}]}').ok).toBe(false);
		expect(parseSceneReply('{"source":"built","duration":3000,"hero":0.5,"elements":[]}').ok).toBe(false); // empty elements
	});
});

describe('generateScene — honest degradation', () => {
	it('returns nochange for an empty prompt without touching the model', async () => {
		expect((await generateScene('')).status).toBe('nochange');
		expect((await generateScene('   ')).status).toBe('nochange');
	});

	it('returns offline when the model is on the floor (no model connected)', async () => {
		state.generation = 'floor';
		expect((await generateScene('a gear turning')).status).toBe('offline');
	});

	it('returns ok with a validated scene when a connected model proposes one', async () => {
		state.generation = 'webllm';
		state.reply = VALID;
		const out = await generateScene('a rotor spinning in a ring');
		expect(out.status).toBe('ok');
		if (out.status === 'ok') expect(out.scene.elements[0].id).toBe('rig');
	});

	it('returns nochange when a connected model returns an unusable (non-JSON) reply', async () => {
		state.generation = 'webllm';
		state.reply = 'Sorry, I have no scene for that.';
		expect((await generateScene('something')).status).toBe('nochange');
	});

	it('refines from a current scene (passes it back to the model) and validates the result', async () => {
		state.generation = 'webllm';
		state.reply = VALID;
		const current = JSON.parse(VALID);
		const out = await generateScene('slower', current);
		expect(out.status).toBe('ok');
	});
});
