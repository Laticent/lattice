// @vitest-environment node
// The Studio's lint worker (lint-worker.js) and its page side (lint-client.js). These pin what the editor and the Coach rely
// on: the worker answers exactly what the main thread answers, one pass serves both callers when their vocabularies agree, a
// lane keeps only the newest request waiting, a one-off lane is never replaced, and a worker that cannot run sends every
// caller back to the main thread. Counted and ordered, never timed (HARD RULE #32).
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildVocabSets } from '@/lib/editor-diagnostics.js';

const CORE = fileURLToPath(new URL('../../../playground/authoring-core.generated.js', import.meta.url));

vi.mock('@/playground/authoring-door.js', () => ({ lintCoreAddress: () => CORE }));
vi.mock('@/lib/plugin-admission', () => ({ deckPluginsOff: () => [] }));

const DECK = '<!-- _class: titel -->\n\n# One\n\n---\n\n<!-- _class: statement -->\n\n## Two\n\nA claim.';

/** The worker module's own handler, run in-process: same code, no thread. Each instance gets a fresh copy of the module. */
class InProcessWorker {
	static made = 0;
	static sent: Array<Record<string, unknown>> = [];
	static hold: Array<() => void> | null = null;
	onmessage: ((e: { data: unknown }) => void) | null = null;
	onerror: ((e: unknown) => void) | null = null;
	onmessageerror: (() => void) | null = null;
	private handler: Promise<(e: { data: unknown }) => Promise<void>>;
	constructor() {
		InProcessWorker.made++;
		this.handler = (async () => {
			const scope = { onmessage: null as never, postMessage: (data: unknown) => this.onmessage?.({ data }) };
			vi.stubGlobal('self', scope);
			vi.resetModules();
			await import('./lint-worker.js');
			return scope.onmessage as (e: { data: unknown }) => Promise<void>;
		})();
	}
	async postMessage(data: Record<string, unknown>) {
		InProcessWorker.sent.push(data);
		// A test that holds the worker decides when each pass may run, so it can queue requests behind a running one.
		if (InProcessWorker.hold) await new Promise<void>((go) => InProcessWorker.hold?.push(go));
		await (await this.handler)({ data });
	}
	terminate() {}
}

const release = () => InProcessWorker.hold?.shift()?.();

async function client() {
	vi.resetModules();
	return import('./lint-client.js');
}

beforeEach(() => {
	InProcessWorker.made = 0;
	InProcessWorker.sent = [];
	InProcessWorker.hold = null;
	vi.stubGlobal('Worker', InProcessWorker);
});
afterEach(() => vi.unstubAllGlobals());

describe('the lint worker', () => {
	it('answers exactly what lint-core answers on the main thread', async () => {
		const { lintOffThread } = await client();
		const core = await import('../../../playground/authoring-core.generated.js');
		const vocab = buildVocabSets({ names: ['title', 'statement'] });
		const out = await lintOffThread('editor', DECK, vocab);
		expect(out).toEqual({ id: expect.any(Number), findings: core.lintCore.lintTextWith(DECK, vocab) });
		expect((out as { findings: Array<{ rule: string }> }).findings.map((f) => f.rule)).toContain('unknown-class');
	});

	it('lints once for the editor and the Coach when their vocabularies agree', async () => {
		const { lintOffThread, assessOffThread } = await client();
		const vocab = buildVocabSets({ names: ['title', 'statement'] });
		const lint = (await lintOffThread('editor', DECK, vocab)) as { findings: unknown[] };
		const assessed = (await assessOffThread('coach', DECK, buildVocabSets({ names: ['title', 'statement'] }), [], undefined)) as { findings: unknown[]; scorecard: unknown };
		// The same finding OBJECTS: the assessment reused the editor's pass instead of linting again.
		expect(lint.findings.length).toBeGreaterThan(0);
		for (const [i, f] of lint.findings.entries()) expect(assessed.findings[i]).toBe(f);
		expect(assessed.scorecard).toBeTruthy();
		expect(InProcessWorker.made).toBe(1);
	});

	it('keeps only the newest request waiting on a lane', async () => {
		const { lintOffThread } = await client();
		InProcessWorker.hold = [];
		const vocab = buildVocabSets({ names: ['title'] });
		const a = lintOffThread('editor', 'a', vocab);
		await vi.waitFor(() => expect(InProcessWorker.hold).toHaveLength(1));
		const b = lintOffThread('editor', 'b', vocab);
		const c = lintOffThread('editor', 'c', vocab);
		expect(await b).toEqual({ superseded: true });
		release();
		expect(await a).toHaveProperty('findings');
		await vi.waitFor(() => expect(InProcessWorker.hold).toHaveLength(1));
		release();
		expect(await c).toHaveProperty('findings');
		expect(InProcessWorker.sent.map((m) => m.text)).toEqual(['a', 'c']);
	});

	it('never replaces a one-off request', async () => {
		const { assessOffThread } = await client();
		InProcessWorker.hold = [];
		const one = assessOffThread(null, DECK, null, [], undefined);
		const two = assessOffThread(null, `${DECK}\n\nMore.`, null, [], undefined);
		await vi.waitFor(() => expect(InProcessWorker.hold).toHaveLength(1));
		release();
		await vi.waitFor(() => expect(InProcessWorker.hold).toHaveLength(1));
		release();
		expect(await one).toHaveProperty('scorecard');
		expect(await two).toHaveProperty('scorecard');
	});

	it('says the lint threw, and stays in service', async () => {
		const { lintOffThread } = await client();
		const broken = { names: null }; // not a vocabulary lint-core can read: the pass throws
		expect(await lintOffThread('editor', DECK, broken)).toHaveProperty('threw');
		expect(await lintOffThread('editor', DECK, buildVocabSets({ names: ['title'] }))).toHaveProperty('findings');
		expect(InProcessWorker.made).toBe(1);
	});

	it('sends every caller to the main thread where no worker can run', async () => {
		vi.stubGlobal('Worker', undefined);
		const { lintOffThread, assessOffThread } = await client();
		expect(await lintOffThread('editor', DECK, null)).toEqual({ fallback: true });
		expect(await assessOffThread('coach', DECK, null, [], undefined)).toEqual({ fallback: true });
	});

	it('falls back for good when the lint core will not load in the worker', async () => {
		vi.doMock('@/playground/authoring-door.js', () => ({ lintCoreAddress: () => '/no/such/lint.js' }));
		const { lintOffThread } = await client();
		expect(await lintOffThread('editor', DECK, null)).toEqual({ fallback: true });
		expect(await lintOffThread('editor', DECK, null)).toEqual({ fallback: true });
		vi.doUnmock('@/playground/authoring-door.js');
	});
});
