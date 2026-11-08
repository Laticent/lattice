import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_SELECTION_KEY, readChatSelection, readVoiceSelection, selectChat, selectVoice } from '../../../lib/model-selection.js';
import { __resetOpenRouterKeyForTests, openRouterKeySettled } from '../../../lib/openrouter-key.js';
import { createArchitectModel } from './architect-model.js';

// The model spine, chat half: the stored selection answers, or it says why it cannot. It never
// falls down a ladder to another backend or provider, and one chat turn runs on one pinned
// backend + model (engineering/decisions/2026-11-07-studio-model-spine.md).

type Opts = { pinnedModel?: string; onModel?: (id: string) => void; messages?: unknown };
type Model = {
	availability: () => { generation: string; readiness: { state: string; source: string; provider: string; model: string } };
	complete: (o: Record<string, unknown>) => Promise<string>;
	pin: () => Promise<Model>;
	openRouterModel: () => string;
	openRouterModelPrice: (id?: string) => unknown;
	setOpenRouterModel: (id: string) => void;
	saveProviderKey: (p: string, k: string) => void;
	__setOpenRouter: (b: unknown) => void;
	__setPromptAvailability: (a: string) => void;
};

/** A fake OpenRouter backend that records which model each call ran on. */
function fakeOpenRouter(calls: string[], { heal }: { heal?: string } = {}) {
	return {
		name: 'openrouter',
		provider: 'openrouter',
		ready: () => true,
		keyInvalid: () => false,
		getModel: () => readChatSelection().model || '~anthropic/claude-sonnet-latest',
		modelName() {
			return this.getModel();
		},
		modelPrice: (id: string) => ({ promptPerM: id.length, completionPerM: 1 }),
		setModel: (id: string) => selectChat({ provider: 'openrouter', model: id }),
		async complete(o: Opts) {
			const id = o.pinnedModel || this.getModel();
			if (heal) {
				o.onModel?.(heal);
				calls.push(heal);
				return 'healed';
			}
			calls.push(id);
			return `answered by ${id}`;
		},
	};
}

function make(): Model {
	return createArchitectModel({ getSettings: () => ({}) }) as unknown as Model;
}

beforeEach(() => {
	localStorage.clear();
	__resetOpenRouterKeyForTests();
	vi.unstubAllGlobals();
});

describe('model spine — chat', () => {
	it('an on-device pick survives a reload', () => {
		selectChat({ provider: 'prompt-api' });
		const before = make();
		before.__setPromptAvailability('available');
		expect(before.availability().generation).toBe('prompt-api');
		// A reload is a fresh adapter over the same storage.
		const after = make();
		after.__setPromptAvailability('available');
		expect(after.availability().generation).toBe('prompt-api');
		expect(after.availability().readiness).toMatchObject({ state: 'ready', source: 'device', provider: 'prompt-api' });
	});

	it('a selected model that is not ready says so; it never substitutes a ready one', () => {
		selectChat({ provider: 'webllm' }); // not downloaded in this browser
		const m = make();
		m.__setOpenRouter(fakeOpenRouter([])); // a READY cloud: the old ladder would have used it
		m.__setPromptAvailability('available'); // and so would the built-in model
		expect(m.availability().generation).toBe('floor');
		expect(m.availability().readiness).toMatchObject({ state: 'unavailable', provider: 'webllm' });
	});

	it('the unseal race: a chosen direct key still opening reads warming, never OpenRouter or the built-in model', () => {
		localStorage.setItem('lattice-db-anthropic-key', 'v1:AAAA:BBBB'); // sealed, not open yet
		selectChat({ provider: 'anthropic' });
		const m = make();
		m.__setOpenRouter(fakeOpenRouter([]));
		m.__setPromptAvailability('available');
		expect(m.availability().generation).toBe('floor');
		expect(m.availability().readiness).toMatchObject({ state: 'warming', source: 'cloud', provider: 'anthropic' });
	});

	it('a cloud selection with no key reads needs-key', () => {
		selectChat({ provider: 'gemini' });
		const m = make();
		m.__setPromptAvailability('available');
		expect(m.availability().readiness).toMatchObject({ state: 'needs-key', provider: 'gemini' });
		expect(m.availability().generation).toBe('floor');
	});

	it('a mid-turn switch does not change who answers the rest of the turn', async () => {
		const calls: string[] = [];
		selectChat({ provider: 'openrouter', model: 'vendor/first' });
		const m = make();
		m.__setOpenRouter(fakeOpenRouter(calls));
		m.__setPromptAvailability('available');
		const turn = await m.pin();
		await turn.complete({ messages: [] }); // round 1
		// The author switches model, then to on-device, while the turn is still running.
		m.setOpenRouterModel('vendor/second');
		selectChat({ provider: 'prompt-api' });
		await turn.complete({ messages: [] }); // round 2
		expect(calls).toEqual(['vendor/first', 'vendor/first']);
		expect(turn.openRouterModel()).toBe('vendor/first');
		expect(turn.availability().generation).toBe('openrouter');
		// The next turn runs on the new selection.
		expect(m.availability().generation).toBe('prompt-api');
	});

	it('a switch while the turn loads its catalog does not change what the pinned turn reports', async () => {
		const calls: string[] = [];
		selectChat({ provider: 'openrouter' });
		const m = make();
		let derived = '';
		m.__setOpenRouter({
			...fakeOpenRouter(calls),
			getModel: () => derived,
			// The author picks the built-in model while the default is being derived from the list.
			listModels: async () => {
				selectChat({ provider: 'prompt-api' });
				derived = 'vendor/default';
				return [];
			},
		});
		m.__setPromptAvailability('available');
		const turn = await m.pin();
		expect(turn.availability().generation).toBe('openrouter');
		expect(turn.openRouterModel()).toBe('vendor/default');
		expect(m.availability().generation).toBe('prompt-api');
	});

	it('the chip and the cost are credited to the model that answered', async () => {
		const calls: string[] = [];
		selectChat({ provider: 'openrouter', model: 'vendor/retired' });
		const m = make();
		m.__setOpenRouter(fakeOpenRouter(calls, { heal: '~anthropic/claude-sonnet-latest' }));
		const turn = await m.pin();
		await turn.complete({ messages: [] });
		expect(calls).toEqual(['~anthropic/claude-sonnet-latest']);
		expect(turn.openRouterModel()).toBe('~anthropic/claude-sonnet-latest');
		expect(turn.openRouterModelPrice()).toEqual({ promptPerM: '~anthropic/claude-sonnet-latest'.length, completionPerM: 1 });
	});

	it('another tab’s selection change reaches this tab: an event for the UI, the record for the next call', () => {
		const m = make();
		m.__setPromptAvailability('available');
		m.__setOpenRouter(fakeOpenRouter([]));
		expect(m.availability().generation).toBe('openrouter');
		const spy = vi.fn();
		window.addEventListener('db-model-changed', spy);
		// Another tab writes the record; this tab only sees the storage event.
		const rec = JSON.stringify({ v: 1, source: 'device', provider: 'prompt-api', model: '', last: {} });
		localStorage.setItem(CHAT_SELECTION_KEY, rec);
		window.dispatchEvent(new StorageEvent('storage', { key: CHAT_SELECTION_KEY, newValue: rec }));
		window.removeEventListener('db-model-changed', spy);
		expect(spy).toHaveBeenCalled();
		expect(m.availability().generation).toBe('prompt-api');
	});

	it('saving a key makes that provider’s chat model active at once, restoring the last pick (owner decision 3)', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [] })));
		selectChat({ provider: 'gemini', model: 'gemini-3.8-pro' });
		selectChat({ provider: 'prompt-api' }); // on-device now
		const m = make();
		m.saveProviderKey('gemini', 'AIzaTestKey000000000000000');
		await openRouterKeySettled();
		expect(readChatSelection()).toMatchObject({ source: 'cloud', provider: 'gemini', model: 'gemini-3.8-pro' });
		expect(m.availability()).toMatchObject({ generation: 'openrouter', readiness: { state: 'ready', provider: 'gemini', model: 'gemini-3.8-pro' } });
	});
});

describe('model spine — on-device warm at boot', () => {
	it('warms a selected on-device model whose weights are cached, with progress, and never fetches', async () => {
		selectChat({ provider: 'universal' });
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		vi.stubGlobal('caches', {
			keys: async () => ['transformers-cache'],
			open: async () => ({ keys: async () => [{ url: 'https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/resolve/main/onnx/model.onnx' }] }),
		});
		let ready = false;
		let finish: () => void = () => {};
		const m = make() as Model & { __setUniversal: (b: unknown) => void };
		m.__setUniversal({
			name: 'transformers',
			ready: () => ready,
			load: (onProgress: (p: { progress: number }) => void) =>
				new Promise<void>((res) => {
					onProgress({ progress: 0.5 });
					finish = () => {
						ready = true;
						res();
					};
				}),
			complete: async () => 'local',
		});
		await vi.waitFor(() => expect(m.availability().readiness).toMatchObject({ state: 'warming', provider: 'universal', progress: 0.5, cached: true }));
		finish();
		await vi.waitFor(() => expect(m.availability().readiness.state).toBe('ready'));
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('leaves an uncached on-device model unavailable: no download', async () => {
		selectChat({ provider: 'universal' });
		vi.stubGlobal('caches', { keys: async () => [], open: async () => ({ keys: async () => [] }) });
		const load = vi.fn();
		const m = make() as Model & { __setUniversal: (b: unknown) => void };
		m.__setUniversal({ name: 'transformers', ready: () => false, load, complete: async () => '' });
		await vi.waitFor(() => expect(m.availability().readiness).toMatchObject({ state: 'unavailable', cached: false }));
		expect(load).not.toHaveBeenCalled();
	});
});

describe('model spine — saving a key and the voice (owner decision 3)', () => {
	it('selects the provider’s voice when the current cloud voice has no key', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [] })));
		selectVoice({ provider: 'openrouter', model: 'x-ai/grok', voice: 'eve' }); // no OpenRouter key
		const m = make();
		m.saveProviderKey('gemini', 'AIzaTestKey000000000000000');
		await openRouterKeySettled();
		expect(readVoiceSelection()).toMatchObject({ source: 'cloud', provider: 'gemini' });
		expect(readChatSelection().provider).toBe('gemini');
	});

	it('leaves a working voice alone: on-device Kokoro, or a cloud voice whose key is there', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [] })));
		selectVoice({ provider: 'kokoro', voice: 'af_heart' });
		const m = make();
		m.saveProviderKey('gemini', 'AIzaTestKey000000000000000');
		await openRouterKeySettled();
		expect(readVoiceSelection().provider).toBe('kokoro');
		selectVoice({ provider: 'openrouter' });
		m.saveProviderKey('openrouter', 'sk-or-v1-test');
		await openRouterKeySettled();
		m.saveProviderKey('gemini', 'AIzaTestKey000000000000000');
		await openRouterKeySettled();
		expect(readVoiceSelection().provider).toBe('openrouter');
	});

	it('a provider without a voice (Anthropic) never touches the voice', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [] })));
		selectVoice({ provider: 'openrouter' });
		make().saveProviderKey('anthropic', 'sk-ant-test-key-0000000000');
		await openRouterKeySettled();
		expect(readVoiceSelection().provider).toBe('openrouter');
	});
});
