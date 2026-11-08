import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRetiredForTests } from '../../../lib/model-retired.js';
import { __resetSelectionForTests, CHAT_SELECTION_KEY, readChatSelection, readVoiceSelection, selectChat, selectVoice } from '../../../lib/model-selection.js';
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
		selectChat({ provider: 'openrouter' });
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

	it('saving a key never changes a set chat model (connecting adds models; rule 1)', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [] })));
		selectChat({ provider: 'prompt-api' }); // the author picked on-device
		const m = make();
		m.saveProviderKey('gemini', 'AIzaTestKey000000000000000');
		await openRouterKeySettled();
		expect(readChatSelection()).toMatchObject({ source: 'device', provider: 'prompt-api' });
	});

	it('saving a key fills a Not-set chat model, and says what it filled', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [] })));
		const m = make();
		expect(m.availability().readiness).toMatchObject({ state: 'unset' });
		const filled = m.saveProviderKey('gemini', 'AIzaTestKey000000000000000');
		await openRouterKeySettled();
		expect(filled).toContainEqual({ kind: 'chat', provider: 'gemini' });
		expect(readChatSelection()).toMatchObject({ source: 'cloud', provider: 'gemini' });
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

describe('model spine — saving a key and the voice (rule 1)', () => {
	// On a phone, so the voice migration leaves voice Not set and each fill is visible.
	beforeEach(() => vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse') })));
	it('fills a Not-set voice from a provider that speaks', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [] })));
		const m = make();
		m.saveProviderKey('gemini', 'AIzaTestKey000000000000000');
		await openRouterKeySettled();
		expect(readVoiceSelection()).toMatchObject({ source: 'cloud', provider: 'gemini' });
	});

	it('never changes a set voice, even one whose key is missing (it reads needs its connection)', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [] })));
		selectVoice({ provider: 'openrouter', model: 'x-ai/grok', voice: 'eve' }); // no OpenRouter key
		const m = make();
		m.saveProviderKey('gemini', 'AIzaTestKey000000000000000');
		await openRouterKeySettled();
		expect(readVoiceSelection()).toMatchObject({ provider: 'openrouter', voice: 'eve' });
	});

	it('a provider without a voice (Anthropic) leaves a Not-set voice Not set', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [] })));
		make().saveProviderKey('anthropic', 'sk-ant-test-key-0000000000');
		await openRouterKeySettled();
		expect(readVoiceSelection().provider).toBe('');
		expect(readChatSelection().provider).toBe('anthropic');
	});
});


// Version healing (2026-11-08-studio-ai-routes-ux.md rule 1): within the family, on the same
// route, announced; never another family, never backward, never on a guess.
describe('model spine — a retired version heals within its family', () => {
	/** A route that answers 404 for every model but the live ones, and lists `live`. */
	function retiringRoute(calls: string[], live: string[], { answer }: { answer?: (id: string) => string } = {}) {
		return {
			name: 'openrouter',
			provider: 'openrouter',
			ready: () => true,
			keyInvalid: () => false,
			getModel: () => readChatSelection().model || '~anthropic/claude-sonnet-latest',
			invalidateCatalog: vi.fn(),
			listModels: async () => live.map((id) => ({ id })),
			async complete(o: Opts & { model?: string; onAnsweredBy?: (id: string) => void }) {
				const id = o.model || o.pinnedModel || this.getModel();
				calls.push(id);
				if (!live.includes(id)) throw new Error(`OpenRouter error 404: {"error":{"message":"No endpoints found for ${id}."}}`);
				o.onAnsweredBy?.(answer ? answer(id) : id);
				return `answered by ${id}`;
			},
		};
	}
	const events: { provider: string; model: string; to: string | null; kinds: string[]; answeredBy?: string }[] = [];
	const onRetired = (e: Event) => events.push((e as CustomEvent).detail);
	beforeEach(() => {
		events.length = 0;
		__resetSelectionForTests();
		__resetRetiredForTests(); // the retired list lasts a page; each case is a fresh page
		window.addEventListener('lattice:model-retired', onRetired);
		return () => window.removeEventListener('lattice:model-retired', onRetired);
	});

	it('moves Sonnet 5 to the newest live Sonnet on the same route, stores it, and says so', async () => {
		selectChat({ provider: 'openrouter', model: 'anthropic/claude-sonnet-5' });
		const m = make();
		const calls: string[] = [];
		m.__setOpenRouter(retiringRoute(calls, ['anthropic/claude-sonnet-5.5', 'anthropic/claude-opus-6', 'openai/gpt-6.1']));
		expect(await m.complete({ messages: [{ role: 'user', content: 'hi' }] })).toBe('answered by anthropic/claude-sonnet-5.5');
		expect(calls).toEqual(['anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-5.5']);
		expect(readChatSelection()).toMatchObject({ provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5' });
		expect(events).toMatchObject([{ provider: 'openrouter', model: 'anthropic/claude-sonnet-5', to: 'anthropic/claude-sonnet-5.5', kinds: ['chat'], route: 'OpenRouter' }]);
	});

	it('with nothing newer in the family, reads Model retired and never answers on Opus or GPT', async () => {
		selectChat({ provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5' });
		const m = make();
		const calls: string[] = [];
		m.__setOpenRouter(retiringRoute(calls, ['anthropic/claude-sonnet-5', 'anthropic/claude-opus-6', 'openai/gpt-6.1']));
		await m.complete({ messages: [{ role: 'user', content: 'hi' }] });
		expect(calls).toEqual(['anthropic/claude-sonnet-5.5']);
		expect(readChatSelection().model).toBe('anthropic/claude-sonnet-5.5');
		expect(m.availability().readiness.state).toBe('retired');
		expect(events[0]).toMatchObject({ model: 'anthropic/claude-sonnet-5.5', to: null, kinds: ['chat'] });
	});

	it('does not call a model retired while the route still lists it (a refused parameter is not a retirement)', async () => {
		selectChat({ provider: 'openrouter', model: 'anthropic/claude-sonnet-5' });
		const m = make();
		const calls: string[] = [];
		const route = retiringRoute(calls, ['anthropic/claude-sonnet-5.5']);
		route.listModels = async () => [{ id: 'anthropic/claude-sonnet-5' }, { id: 'anthropic/claude-sonnet-5.5' }];
		m.__setOpenRouter(route);
		await m.complete({ messages: [{ role: 'user', content: 'hi' }] });
		expect(calls).toEqual(['anthropic/claude-sonnet-5']);
		expect(readChatSelection().model).toBe('anthropic/claude-sonnet-5');
		expect(events).toEqual([]);
	});

	it('a silent reroute to another family stops the selection and names who answered', async () => {
		selectChat({ provider: 'openrouter', model: 'anthropic/claude-sonnet-5' });
		const m = make();
		m.__setOpenRouter(retiringRoute([], ['anthropic/claude-sonnet-5'], { answer: () => 'openai/gpt-6.1' }));
		await m.complete({ messages: [{ role: 'user', content: 'hi' }] });
		expect(events[0]).toMatchObject({ model: 'anthropic/claude-sonnet-5', to: null, answeredBy: 'openai/gpt-6.1' });
		expect(m.availability().readiness.state).toBe('retired');
	});

	it('a reroute heal inside a pinned turn moves the pin, so the next round asks for the healed model', async () => {
		selectChat({ provider: 'openrouter', model: 'anthropic/claude-sonnet-5' });
		const m = make();
		const calls: string[] = [];
		m.__setOpenRouter(retiringRoute(calls, ['anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-5.5'], { answer: () => 'anthropic/claude-sonnet-5.5' }));
		const turn = await m.pin();
		await turn.complete({ messages: [{ role: 'user', content: 'one' }] });
		await turn.complete({ messages: [{ role: 'user', content: 'two' }] });
		expect(calls).toEqual(['anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-5.5']);
		expect(events).toHaveLength(1);
	});

	it('a silent reroute to a newer version of the same family is a heal', async () => {
		selectChat({ provider: 'openrouter', model: 'anthropic/claude-sonnet-5' });
		const m = make();
		m.__setOpenRouter(retiringRoute([], ['anthropic/claude-sonnet-5'], { answer: () => 'anthropic/claude-sonnet-5.5' }));
		await m.complete({ messages: [{ role: 'user', content: 'hi' }] });
		expect(readChatSelection().model).toBe('anthropic/claude-sonnet-5.5');
		expect(events[0]).toMatchObject({ to: 'anthropic/claude-sonnet-5.5' });
	});
});

// The AI-off switch wins over an explicit route: the image reader must not spend while AI is off.
describe('model spine — AI off stops a call on its own route', () => {
	it('a route call answers from the floor and the image reader reads off', async () => {
		selectChat({ provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5' });
		const m = createArchitectModel({ getSettings: () => ({ modelEnabled: false }) }) as unknown as Model & { imageReader: () => { state: string } };
		const calls: string[] = [];
		m.__setOpenRouter(fakeOpenRouter(calls));
		await m.complete({ messages: [{ role: 'user', content: 'hi' }], route: 'openrouter', model: 'anthropic/claude-sonnet-5.5' });
		expect(calls, 'nothing reached a paid route').toEqual([]);
		expect(m.imageReader().state).toBe('off');
	});
});

// A key OpenRouter minted seconds ago can answer 401 on /auth/key before it is live everywhere
// (owner report, 2026-11-08: "Key rejected" right after signing in). It is asked again before the
// Studio calls it rejected; a key that keeps answering 401 is still marked.
describe('model spine — a fresh key is re-asked before it is called rejected', () => {
	type Acct = Model & { restoreOpenRouter: (k: string) => void; openRouterAccount: () => Promise<unknown> };
	async function run(statuses: number[]) {
		const { openRouterKeyRejected } = await import('../../../lib/openrouter-key.js');
		vi.useFakeTimers();
		let n = 0;
		const auth = vi.fn(async () => {
			const status = statuses[Math.min(n++, statuses.length - 1)];
			return new Response(JSON.stringify(status === 401 ? { error: { message: 'User not found.', code: 401 } } : { data: { usage: 0, limit: null } }), { status });
		});
		vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).includes('/auth/key') ? auth() : Response.json({ data: [] }))));
		const m = make() as unknown as Acct;
		m.restoreOpenRouter('sk-or-v1-fresh-oauth-key-0a0a');
		await openRouterKeySettled();
		const out = m.openRouterAccount();
		await vi.advanceTimersByTimeAsync(10_000);
		const info = await out;
		vi.useRealTimers();
		return { info, calls: auth.mock.calls.length, rejected: openRouterKeyRejected() };
	}
	it('a 401 then a 200 reads the account and leaves the key ready', async () => {
		const r = await run([401, 200]);
		expect(r.calls).toBe(2);
		expect(r.info).not.toBeNull();
		expect(r.rejected).toBe(false);
	});
	it('a key that keeps answering 401 is still marked rejected, after two more asks', async () => {
		const r = await run([401]);
		expect(r.calls).toBe(3);
		expect(r.rejected).toBe(true);
		// What OpenRouter said is kept, so Connections can name the cause (never the key).
		const { lastKeyRefusal } = await import('../../../lib/model-retired.js');
		expect(lastKeyRefusal('openrouter')).toMatchObject({ status: 401, message: 'User not found.', asks: 3 });
	});
});
