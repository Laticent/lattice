// The cheapest-voice ranker (docs/src/playground/tts-cost.js) and the voice model's use of
// it. The ranking rules are the user's: lowest estimated cost wins, a model within 10% of
// the cheapest counts as the same price and the better voice wins, free models are skipped,
// and a model the author picked always wins over the setting.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '../../../docs/src/playground');
const load = (f) => import(pathToFileURL(path.join(root, f)).href);

// The live catalog's prices on 2026-09-27, in the shape listOpenRouterVoiceModels() yields.
const CATALOG = [
  { id: 'deepgram/flux-tts:free', promptPerM: 0, completionPerM: 0 },
  { id: 'bytedance-seed/seed-audio-1-0', promptPerM: 0, completionPerM: 2500 },
  { id: 'google/gemini-3.8-flash-lite-tts', promptPerM: 0.5, completionPerM: 6 },
  { id: 'google/gemini-3.8-flash-tts', promptPerM: 0.5, completionPerM: 9 },
  { id: 'google/gemini-3.1-flash-tts-preview', promptPerM: 1, completionPerM: 20 },
  { id: 'hexgrad/kokoro-82m', promptPerM: 4, completionPerM: 0 },
  { id: 'sesame/csm-1b', promptPerM: 7, completionPerM: 0 },
  { id: 'canopylabs/orpheus-3b-0.1-ft', promptPerM: 7, completionPerM: 0 },
  { id: 'microsoft/mai-voice-2', promptPerM: 22, completionPerM: 0 },
];

test('cost counts the audio-output line, so Gemini is not the cheapest voice', async () => {
  const { ttsCostPerMChars, pickCheapestTtsModel } = await load('tts-cost.js');
  // 0.5 + 9 × 2.04 ≈ 18.86 — the measured bill was $18.50/M chars; prompt-only would say 0.5.
  assert.ok(Math.abs(ttsCostPerMChars({ promptPerM: 0.5, completionPerM: 9 }) - 18.86) < 0.01);
  assert.equal(ttsCostPerMChars({ promptPerM: 4, completionPerM: 0 }), 4);
  assert.equal(ttsCostPerMChars({ promptPerM: null, completionPerM: null }), null);
  assert.equal(pickCheapestTtsModel(CATALOG), 'hexgrad/kokoro-82m');
});

test('free and unpriced models are never picked', async () => {
  const { pickCheapestTtsModel } = await load('tts-cost.js');
  assert.equal(pickCheapestTtsModel([{ id: 'x/free:free', promptPerM: 0, completionPerM: 0 }]), null);
  assert.equal(pickCheapestTtsModel([{ id: 'x/unpriced', promptPerM: null, completionPerM: null }]), null);
  assert.equal(pickCheapestTtsModel([]), null);
  assert.equal(pickCheapestTtsModel(null), null);
});

test('within 10% of the cheapest, the better-ranked voice wins', async () => {
  const { pickCheapestTtsModel } = await load('tts-cost.js');
  // csm and orpheus both cost 7: a tie → the better-ranked (orpheus) wins.
  const tie = CATALOG.filter((m) => /csm|orpheus/.test(m.id));
  assert.equal(pickCheapestTtsModel(tie), 'canopylabs/orpheus-3b-0.1-ft');
  // Kokoro at 4, mai-voice-2 at 4.39 (+9.75%) → inside the band, and mai ranks higher.
  assert.equal(pickCheapestTtsModel([
    { id: 'hexgrad/kokoro-82m', promptPerM: 4, completionPerM: 0 },
    { id: 'microsoft/mai-voice-2', promptPerM: 4.39, completionPerM: 0 },
  ]), 'microsoft/mai-voice-2');
  // At 4.41 (+10.25%) it is outside the band, so the cheaper one wins however good the other is.
  assert.equal(pickCheapestTtsModel([
    { id: 'hexgrad/kokoro-82m', promptPerM: 4, completionPerM: 0 },
    { id: 'microsoft/mai-voice-2', promptPerM: 4.41, completionPerM: 0 },
  ]), 'hexgrad/kokoro-82m');
});

test('an unranked model inside the band loses to a ranked one; order never matters', async () => {
  const { pickCheapestTtsModel } = await load('tts-cost.js');
  const a = [
    { id: 'zz/unranked', promptPerM: 3.9, completionPerM: 0 },
    { id: 'hexgrad/kokoro-82m', promptPerM: 4, completionPerM: 0 },
  ];
  assert.equal(pickCheapestTtsModel(a), 'hexgrad/kokoro-82m');
  assert.equal(pickCheapestTtsModel(a.slice().reverse()), 'hexgrad/kokoro-82m');
});

// ── The voice model's use of the setting ─────────────────────────────────────
// One process per test file under `node --test`, so the voice model's memoized catalog
// fetch starts cold here and the mocked fetch below is the one it sees.

function withEnv(fn) {
  const store = new Map();
  const realFetch = globalThis.fetch;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: [
        { id: 'google/gemini-3.8-flash-tts', name: 'Gemini', pricing: { prompt: '0.0000005', completion: '0.000009' } },
        { id: 'sesame/csm-1b', name: 'CSM', pricing: { prompt: '0.000007', completion: '0' } },
        { id: 'canopylabs/orpheus-3b-0.1-ft', name: 'Orpheus', pricing: { prompt: '0.000007', completion: '0' }, supported_voices: ['tara', 'leo'] },
      ],
    }),
  });
  return Promise.resolve().then(() => fn(store)).finally(() => {
    delete globalThis.localStorage;
    globalThis.fetch = realFetch;
  });
}

test('cheapest-voice setting resolves at creation, before any read asks for a model', async () => withEnv(async () => {
  const { createVoiceModel } = await load('voice-model.js');
  const { setCheapestVoiceEnabled } = await load('narration-prefs.js');
  setCheapestVoiceEnabled(true);
  const v = createVoiceModel({ getOpenRouterKey: () => 'sk-test', keyPrefix: 'eager' });
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  // No orModel() call before this point: the pick is already there for the first sentence.
  assert.equal(v.orModel(), 'canopylabs/orpheus-3b-0.1-ft');
  setCheapestVoiceEnabled(false);
}));

test('cheapest-voice setting: off → default; on → the ranked pick; an explicit pick always wins', async () => withEnv(async () => {
  const { createVoiceModel } = await load('voice-model.js');
  const { setCheapestVoiceEnabled } = await load('narration-prefs.js');
  const v = createVoiceModel({ getOpenRouterKey: () => 'sk-test', keyPrefix: 'studio' });

  assert.equal(v.orModel(), 'hexgrad/kokoro-82m', 'setting off: the fixed default');

  setCheapestVoiceEnabled(true);
  v.orModel(); // first ask starts the catalog fetch; the default holds until it answers
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  // This mocked catalog has no Kokoro: csm and orpheus tie at 7, Gemini is ~18.9 → orpheus.
  assert.equal(v.orModel(), 'canopylabs/orpheus-3b-0.1-ft');
  // The default voice is a Kokoro id; orpheus would reject it, so a voice it publishes is used.
  assert.equal(v.orVoice(), 'tara');
  v.setOrVoice('leo');
  assert.equal(v.orVoice(), 'leo', 'a stored voice the picked model publishes is kept');
  v.setOrVoice('af_heart');
  assert.equal(v.orVoice(), 'tara', 'a stored voice it does not publish falls back');
  v.setOrVoice('');

  v.setOrModel('microsoft/mai-voice-2');
  assert.equal(v.orModel(), 'microsoft/mai-voice-2', 'the author\'s own pick beats the setting');
  assert.equal(v.orVoice(), 'af_heart', 'an explicit model keeps the stored/default voice (the picker owns it)');

  v.setOrModel('');
  setCheapestVoiceEnabled(false);
  assert.equal(v.orModel(), 'hexgrad/kokoro-82m', 'setting off again: back to the default');
}));
