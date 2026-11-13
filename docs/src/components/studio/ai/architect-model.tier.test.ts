import { describe, expect, it } from 'vitest';
import { createArchitectModel, MockBackend } from './architect-model.js';

// The chat selection (who answers) is covered in architect-model.spine.test.ts; the 2026-06-29
// tier-precedence ladder these tests used to pin is superseded by the model spine.

// The bge-small embedder runs WORKER-ONLY — never on the main thread — because a
// main-thread WASM pipeline init froze generation and could OOM-crash the tab
// (2026-07-19-dedup-embedder-hot-load.md, 2026-07-20-embedder-web-worker.md). These
// lock the contract a future refactor can't silently break: the injected test hook
// precedes the guard, the hot path never blocks, and there is NO main-thread
// fallback — where module workers are unavailable (jsdom here), embed degrades to
// null → the caller's lexical ranker, never an inline transformers.js load.
describe('architect-model — embed is worker-only (allowLoad + no main-thread fallback)', () => {
	type EmbedModel = { embed: (t: string | string[], o?: { allowLoad?: boolean }) => Promise<number[][] | null>; __setBackend: (b: unknown) => void };
	const makeModel = () => createArchitectModel({ getSettings: () => ({}) }) as unknown as EmbedModel;

	it('an injected backend embeds regardless of allowLoad — the injected check precedes the guard', async () => {
		// A MockBackend needs no cold load, so it must be reached BEFORE the allowLoad
		// short-circuit (else every injected-mock dedup test would silently get null).
		const m = makeModel();
		m.__setBackend(MockBackend());
		const warmDefault = await m.embed(['a', 'b']);
		expect(warmDefault?.length).toBe(2);
		const withGuard = await m.embed(['a', 'b'], { allowLoad: false });
		expect(withGuard?.length).toBe(2); // allowLoad:false does NOT block the injected path
	});

	it('a COLD embedder with allowLoad:false returns null — the hot path never blocks', async () => {
		// No injected backend and the worker not warm: allowLoad:false must return null
		// immediately (dedupComponents then ranks lexically) — it only kicks a background
		// worker warm, never an awaited/main-thread load.
		const m = makeModel();
		expect(await m.embed(['a', 'b'], { allowLoad: false })).toBe(null);
	});

	it('a COLD embedder with allowLoad:true degrades to null where module workers are absent — never a main-thread load', async () => {
		// jsdom has no Worker, so the worker load fails; embed must resolve null WITHOUT
		// throwing, hanging, or falling back to an inline transformers.js import. This is
		// the whole safety guarantee: the embedder is worker-only.
		const m = makeModel();
		expect(await m.embed(['a', 'b'])).toBe(null); // default allowLoad:true
	});
});
