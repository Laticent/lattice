/**
 * Unit: the ArchitectModel adapter + the pure retrieval math.
 *
 * The generative tiers (Prompt API, WebLLM) and the real embedder can't run in
 * CI — no browser API, no WebGPU, no HuggingFace CDN. So this suite proves the
 * parts that MUST be correct regardless of backend:
 *
 *   - the ladder floors when no model is present (the offline guarantee),
 *   - complete() never throws and honours `fallback` / `json` validation,
 *   - a MockBackend exercises the model-on path (streaming + JSON),
 *   - the model-off switch forces the floor,
 *   - cosine ranking orders items correctly with synthetic vectors.
 *
 * The docs modules are browser ESM; dynamic import() loads them from this CJS
 * test, and every browser global in architect-model.js is guarded so it loads
 * in Node (detection just returns 'unavailable' / false).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

async function load() {
  const model = await import('../../../docs/src/components/studio/ai/architect-model.js');
  const retrieval = await import('../../../docs/src/components/studio/ai/architect-retrieval.js');
  return { model, retrieval };
}

describe('ArchitectModel adapter', () => {
  test('floors when no model is present — returns the caller fallback', async () => {
    const { model } = await load();
    const m = model.createArchitectModel({ getSettings: () => ({}) });
    const out = await m.complete({ messages: [{ role: 'user', content: 'hi' }], fallback: 'DET' });
    assert.equal(out, 'DET');
    assert.equal(m.availability().generation, 'floor');
  });

  test('json mode floors to the fallback object when no model', async () => {
    const { model } = await load();
    const m = model.createArchitectModel({ getSettings: () => ({}) });
    const out = await m.complete({ messages: [], json: true, fallback: { overall: 87 } });
    assert.deepEqual(out, { overall: 87 });
  });

  test('the model-off switch forces the floor even with a backend ready', async () => {
    const { model } = await load();
    const m = model.createArchitectModel({ getSettings: () => ({ modelEnabled: false }) });
    m.__setBackend(model.MockBackend({ reply: 'FROM MODEL' }));
    // modelEnabled:false → pickBackend short-circuits to the floor.
    const out = await m.complete({ messages: [], fallback: 'DET' });
    assert.equal(out, 'DET');
  });

  test('a MockBackend drives the model-on path (text + streaming)', async () => {
    const { model } = await load();
    const m = model.createArchitectModel({ getSettings: () => ({}) });
    m.__setBackend(model.MockBackend({ reply: 'one two three' }));
    const toks = [];
    const out = await m.complete({ messages: [], fallback: 'DET', onToken: (t) => toks.push(t) });
    assert.equal(out, 'one two three');
    assert.ok(toks.join('').includes('three'), 'tokens streamed through onToken');
  });

  test('json mode validates model output and floors on garbage', async () => {
    const { model } = await load();
    const m = model.createArchitectModel({ getSettings: () => ({}) });
    // Backend returns prose around a JSON object — extractJson must recover it.
    m.__setBackend({ name: 'x', async complete() { return 'Sure! {"ask":"weak"} hope that helps'; } });
    const ok = await m.complete({ messages: [], json: true, fallback: {} });
    assert.deepEqual(ok, { ask: 'weak' });
    // Backend returns unparseable text → floor to the fallback object.
    m.__setBackend({ name: 'x', async complete() { return 'no json here'; } });
    const floored = await m.complete({ messages: [], json: true, fallback: { ask: 'det' } });
    assert.deepEqual(floored, { ask: 'det' });
  });

  test('a throwing backend never propagates — complete() floors', async () => {
    const { model } = await load();
    const m = model.createArchitectModel({ getSettings: () => ({}) });
    m.__setBackend({ name: 'boom', async complete() { throw new Error('kaboom'); } });
    const out = await m.complete({ messages: [], fallback: 'SAFE' });
    assert.equal(out, 'SAFE');
  });

  test('detection is Node-safe (no Prompt API, no WebGPU)', async () => {
    const { model } = await load();
    assert.equal(await model.detectPromptApi(), 'unavailable');
    assert.equal(model.detectWebGPU(), false);
  });

  test('extractJson tolerates fences and surrounding prose', async () => {
    const { model } = await load();
    assert.deepEqual(model.extractJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(model.extractJson('blah {"a":1,"b":2} blah'), { a: 1, b: 2 });
    assert.equal(model.extractJson('nope'), null);
  });
});

describe('orPricePerM (OpenRouter pricing parse)', () => {
  test('converts per-token USD strings to per-million, guarding sentinels', async () => {
    const { model } = await load();
    const { orPricePerM } = model;
    // normal per-token price → per-million
    assert.equal(orPricePerM('0.000003'), 3); // $3 / M
    assert.equal(orPricePerM('0.000015'), 15);
    // genuine free model
    assert.equal(orPricePerM('0'), 0);
    // the bug: variable/router models report a "-1" sentinel → null, never -1000000
    assert.equal(orPricePerM('-1'), null);
    assert.equal(orPricePerM('-0.5'), null);
    // missing / non-numeric → null (no fixed price)
    assert.equal(orPricePerM(undefined), null);
    assert.equal(orPricePerM(''), null);
    assert.equal(orPricePerM('n/a'), null);
  });
});

describe('orSupportsCache (per-model caching gate)', () => {
  test('caching-supported vendors return true; others false', async () => {
    const { model } = await load();
    const { orSupportsCache } = model;
    // documented prompt-caching providers
    assert.equal(orSupportsCache('anthropic/claude-sonnet-4'), true);
    assert.equal(orSupportsCache('openai/gpt-5'), true);
    assert.equal(orSupportsCache('google/gemini-2.5-pro'), true);
    assert.equal(orSupportsCache('deepseek/deepseek-r1'), true);
    assert.equal(orSupportsCache('x-ai/grok-4'), true);
    // not on the caching list, or junk input
    assert.equal(orSupportsCache('meta-llama/llama-3.3-70b-instruct'), false);
    assert.equal(orSupportsCache('mistralai/mistral-large'), false);
    assert.equal(orSupportsCache('openrouter/auto'), false);
    assert.equal(orSupportsCache(''), false);
    assert.equal(orSupportsCache(undefined), false);
  });
});

describe('retrieval (cosine ranking)', () => {
  test('cosine of identical vectors is 1, orthogonal is 0', async () => {
    const { retrieval } = await load();
    assert.ok(Math.abs(retrieval.cosine([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
    assert.equal(retrieval.cosine([1, 0], [0, 1]), 0);
    assert.equal(retrieval.cosine([0, 0], [1, 1]), 0); // degenerate → 0, no NaN
  });

  test('cosineRank orders the most-similar item first and is stable', async () => {
    const { retrieval } = await load();
    const query = [1, 0, 0];
    const items = [
      [0, 1, 0], // orthogonal
      [0.9, 0.1, 0], // close
      [0.2, 0.9, 0], // far
    ];
    const ranked = retrieval.cosineRank(query, items);
    assert.equal(ranked[0].index, 1, 'closest vector ranks first');
    assert.equal(ranked.length, 3);
    assert.ok(ranked[0].score >= ranked[1].score && ranked[1].score >= ranked[2].score);
  });

  test('cosineRank honours limit and handles empty input', async () => {
    const { retrieval } = await load();
    assert.deepEqual(retrieval.cosineRank([1], [], {}), []);
    assert.deepEqual(retrieval.cosineRank(null, [[1]]), []);
    const top = retrieval.cosineRank([1, 0], [[1, 0], [0, 1], [0.5, 0.5]], { limit: 2 });
    assert.equal(top.length, 2);
  });

  test('meanPool averages token vectors componentwise', async () => {
    const { retrieval } = await load();
    assert.deepEqual(retrieval.meanPool([[2, 4], [4, 8]]), [3, 6]);
    assert.deepEqual(retrieval.meanPool([]), []);
  });

  test('MockBackend embeddings are deterministic and rankable', async () => {
    const { model, retrieval } = await load();
    const mock = model.MockBackend({ embedDim: 8 });
    const [q] = await mock.embed(['board update']);
    const items = await mock.embed(['board update meeting', 'quarterly metrics', 'legal review']);
    const ranked = retrieval.cosineRank(q, items);
    // The lexically-overlapping item should rank at or near the top — proves the
    // pipeline (embed → cosineRank) composes, with reproducible vectors.
    assert.equal(ranked[0].index, 0);
  });
});

describe('generation ladder — universal Transformers.js tier', () => {
  const readyBackend = (name, reply) => ({ name, ready: () => true, async complete() { return reply; } });

  test('falls back to the universal tier when no Prompt API and it is loaded', async () => {
    const { model } = await load();
    const m = model.createArchitectModel({ getSettings: () => ({}) });
    m.__setUniversal(readyBackend('transformers', 'FROM UNIVERSAL'));
    m.__setPromptAvailability('unavailable');
    const out = await m.complete({ messages: [], fallback: 'DET' });
    assert.equal(out, 'FROM UNIVERSAL');
    assert.equal(m.availability().generation, 'transformers');
    assert.equal(m.availability().universalReady, true);
  });

  test('prefers the built-in Prompt API over the universal tier when both are ready', async () => {
    const { model } = await load();
    const m = model.createArchitectModel({ getSettings: () => ({}) });
    m.__setUniversal(readyBackend('transformers', 'U'));
    m.__setPromptAvailability('available');
    // Prompt API is free + instant (no download), so it wins in auto mode.
    assert.equal(m.availability().generation, 'prompt-api');
  });

  test('Puter is fully removed — no adapter surface, no tier, no cloud chooser', async () => {
    const { model } = await load();
    const m = model.createArchitectModel({ getSettings: () => ({}) });
    // the adapter no longer exposes any Puter affordance or the dual-cloud chooser
    assert.equal(typeof m.connectPuter, 'undefined');
    assert.equal(typeof m.setCloud, 'undefined');
    assert.equal(typeof m.__setPuter, 'undefined');
    // availability carries no Puter / active-cloud fields
    const a = m.availability();
    assert.ok(!('puterReady' in a), 'no puterReady in availability');
    assert.ok(!('cloud' in a), 'no active-cloud field in availability');
  });

  test('connected OpenRouter outranks every local tier', async () => {
    const { model } = await load();
    const m = model.createArchitectModel({ getSettings: () => ({}) });
    m.__setUniversal(readyBackend('transformers', 'U'));
    m.__setPromptAvailability('available');
    m.__setOpenRouter(readyBackend('openrouter', 'FROM OR'));
    assert.equal(m.availability().generation, 'openrouter');
    assert.equal(m.availability().openRouterReady, true);
    assert.equal(await m.complete({ messages: [], fallback: 'DET' }), 'FROM OR');
  });

  test('the model-off switch still forces the floor over connected OpenRouter', async () => {
    const { model } = await load();
    const m = model.createArchitectModel({ getSettings: () => ({ modelEnabled: false }) });
    m.__setOpenRouter(readyBackend('openrouter', 'OR'));
    assert.equal(m.availability().generation, 'floor');
    assert.equal(await m.complete({ messages: [], fallback: 'DET' }), 'DET');
  });

  test('the model-off switch still forces the floor over a ready universal tier', async () => {
    const { model } = await load();
    const m = model.createArchitectModel({ getSettings: () => ({ modelEnabled: false }) });
    m.__setUniversal(readyBackend('transformers', 'U'));
    assert.equal(m.availability().generation, 'floor');
    assert.equal(await m.complete({ messages: [], fallback: 'DET' }), 'DET');
  });
});

describe('model settings (Slice 8)', () => {
  test('probeWebGPU is Node-safe and returns false without an adapter', async () => {
    const s = await import('../../../docs/src/playground/drawing-board-settings.js');
    assert.equal(await s.probeWebGPU(), false);
  });
});
