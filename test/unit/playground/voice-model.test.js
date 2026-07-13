// Unit coverage for the VoiceModel adapter (the read-aloud voice ladder). Like
// architect-model.test.js, this exercises the ladder + byte source with a scripted
// rung and no real audio device or model — the parts that must be correct without
// hardware: sentence segmentation, WAV framing, rung selection, and that the byte
// source (synthOne / synthSample) always resolves (the silent floor) and drives
// synth() with the right request. voice-model no longer plays audio (the Suono
// consumer owns playback), so there is nothing to drive an AudioContext here.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const url = require('node:url').pathToFileURL(
  require('node:path').join(__dirname, '../../../docs/src/playground/voice-model.js')
).href;

async function load() { return import(url); }

// Red-team finding (2026-07-11): voice-model.js's PCM_ONLY_MODELS is a SECOND,
// independently-hardcoded source of truth for "this model needs pcm, not mp3" —
// tts-voice-catalog.json already declares the same fact via `audioFormat:"wav"`
// per engine (consumed by tools/generate-voice-samples.mjs, which correctly
// DERIVES its format choice from that field). Unlike the voice roster, this
// isn't live-sourced from OpenRouter, so nothing else catches the two drifting
// apart — a future engine marked audioFormat:"wav" in the catalog without also
// being added to PCM_ONLY_MODELS would silently reproduce the exact "Gemini
// 400s on every real playback" bug this file just fixed, just for a different
// model. This is the enforcement red team's finding asked for.
test('PCM_ONLY_MODELS stays in sync with tts-voice-catalog.json\'s audioFormat:"wav" entries', async () => {
  const { PCM_ONLY_MODELS } = await load();
  const catalog = require('../../../docs/src/playground/tts-voice-catalog.json');
  const wavModelIds = new Set(
    Object.values(catalog.engines)
      .filter((def) => def.audioFormat === 'wav')
      .map((def) => def.modelId),
  );
  assert.deepEqual(new Set(PCM_ONLY_MODELS), wavModelIds);
});

test('splitSentences: segments on terminators, collapses whitespace, drops empties', async () => {
  const { splitSentences } = await load();
  assert.deepEqual(splitSentences('Hello world. Foo bar! Done?'), ['Hello world.', 'Foo bar!', 'Done?']);
  assert.deepEqual(splitSentences('  one\n\n  two  '), ['one two']); // no terminator → one chunk
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences(null), []);
  assert.deepEqual(splitSentences('Trailing no punct'), ['Trailing no punct']);
});

test('wavBlob: writes a valid 16-bit PCM WAV header', async () => {
  const { wavBlob } = await load();
  const n = 16;
  const blob = wavBlob(new Float32Array(n), 24000);
  assert.equal(blob.type, 'audio/wav');
  assert.equal(blob.size, 44 + n * 2);
  const dv = new DataView(await blob.arrayBuffer());
  const str = (o, l) => String.fromCharCode(...Array.from({ length: l }, (_, i) => dv.getUint8(o + i)));
  assert.equal(str(0, 4), 'RIFF');
  assert.equal(str(8, 4), 'WAVE');
  assert.equal(str(36, 4), 'data');
  assert.equal(dv.getUint16(22, true), 1); // mono
  assert.equal(dv.getUint32(24, true), 24000); // sample rate
  assert.equal(dv.getUint16(34, true), 16); // bits per sample
});

test('ladder: floors to silent when nothing is connected, and synthOne still resolves (null bytes, never throws)', async () => {
  const { createVoiceModel } = await load();
  const v = createVoiceModel({ getOpenRouterKey: () => null });
  assert.equal(v.availability().rung, 'silent');
  // No rung, no audio device — must resolve to a null byte source, never throw.
  const r = await v.synthOne({ text: 'This should be silent. It must not throw.' });
  assert.equal(r.rung, 'silent');
  assert.equal(r.bytes, null);
});

test('ladder: a connected OpenRouter key selects the openrouter-tts rung', async () => {
  const { createVoiceModel } = await load();
  const v = createVoiceModel({ getOpenRouterKey: () => 'sk-test' });
  assert.equal(v.availability().rung, 'openrouter-tts');
  assert.equal(v.availability().openRouterReady, true);
});

test('openrouter synth: POSTs the OpenAI-compatible /audio/speech route and returns the raw blob (via synthOne)', async () => {
  const { createVoiceModel } = await load();
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = { url, method: opts.method, body: JSON.parse(opts.body) };
    // The real route returns a raw mp3 byte stream, not JSON — mimic a Blob.
    return { ok: true, status: 200, blob: async () => ({ size: 256, type: 'audio/mpeg' }) };
  };
  const v = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl });
  // synthOne drives the active rung's synth (no audio device in node → no playback).
  await v.synthOne({ text: 'Revenue grew to $4.2M.', speed: 1.25 });
  assert.ok(captured, 'the rung called fetch');
  assert.equal(captured.method, 'POST');
  assert.equal(captured.url, 'https://openrouter.ai/api/v1/audio/speech');
  // The dedicated route takes `input` (not chat `messages`) + a `response_format`.
  assert.equal(captured.body.input, 'Revenue grew to $4.2M.');
  assert.equal(captured.body.response_format, 'mp3');
  assert.ok(captured.body.model, 'sends a model slug');
  assert.ok(captured.body.voice, 'sends a voice');
  assert.equal(captured.body.speed, 1.25, 'forwards the pace → speed multiplier');
  assert.equal(captured.body.messages, undefined, 'not the chat-completions shape');
});

test('openrouter synth: omits speed when it is 1 (default), keeping the request minimal', async () => {
  const { createVoiceModel } = await load();
  let body = null;
  const fetchImpl = async (_url, opts) => {
    body = JSON.parse(opts.body);
    return { ok: true, status: 200, blob: async () => ({ size: 256, type: 'audio/mpeg' }) };
  };
  const v = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl });
  await v.synthOne({ text: 'Plain.', speed: 1 });
  assert.equal(body.speed, undefined, 'speed:1 is the default and is not sent');
});

test('synthOne(): returns bytes + rung + key for a blob rung, and caches (no second synth)', async () => {
  const { createVoiceModel, MockRung } = await load();
  const rung = MockRung({ name: 'openrouter-tts' });
  const v = createVoiceModel({});
  v.__setRung(rung);
  const a = await v.synthOne({ text: 'Revenue grew to $4.2M.' });
  assert.equal(a.rung, 'openrouter-tts');
  assert.ok(a.bytes && a.bytes.size > 0, 'returns audio bytes for a blob rung');
  assert.equal(typeof a.key, 'string');
  assert.deepEqual(rung.calls, ['Revenue grew to $4.2M.']);
  // Second call for the SAME text is a cache hit — no new synth, same key.
  const b = await v.synthOne({ text: 'Revenue grew to $4.2M.' });
  assert.deepEqual(rung.calls, ['Revenue grew to $4.2M.'], 'cache hit — no second synth');
  assert.equal(b.key, a.key);
  assert.equal(b.bytes, a.bytes);
});

test('synthOne(): silent floor returns null bytes (no player work), never throws', async () => {
  const { createVoiceModel } = await load();
  const v = createVoiceModel({ getOpenRouterKey: () => null }); // nothing connected → ladder floors to silent
  const r = await v.synthOne({ text: 'This has no voice attached.' });
  assert.equal(r.rung, 'silent');
  assert.equal(r.bytes, null);
});

test('synthOne(): empty text returns null bytes without calling the rung', async () => {
  const { createVoiceModel, MockRung } = await load();
  const rung = MockRung({ name: 'openrouter-tts' });
  const v = createVoiceModel({});
  v.__setRung(rung);
  const r = await v.synthOne({ text: '' });
  assert.equal(r.bytes, null);
  assert.deepEqual(rung.calls, []);
});

test('synthSample(): synthesizes the fixed sample for an explicit rung and returns bytes + a key containing PREVIEW_TEXT', async () => {
  const { createVoiceModel } = await load();
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls++;
    return { ok: true, status: 200, blob: async () => ({ size: 8, type: 'audio/mpeg', arrayBuffer: async () => new ArrayBuffer(8) }) };
  };
  const v = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl });
  const res = await v.synthSample({ rung: 'openrouter' });
  assert.equal(res.ok, true);
  assert.ok(res.bytes && res.bytes.size > 0, 'returns sample bytes');
  assert.ok(res.key.includes('This is how your slides will sound.'), 'keys on the fixed PREVIEW_TEXT');
  // A second sample for the same rung/voice/speed is a cache hit — no re-fetch.
  const again = await v.synthSample({ rung: 'openrouter' });
  assert.equal(again.ok, true);
  assert.equal(fetchCalls, 1, 'the second sample replayed the cached bytes');
});

test('synthSample(): returns { ok:false } for an unknown rung and when the rung is not ready — never throws', async () => {
  const { createVoiceModel } = await load();
  const disconnected = createVoiceModel({ getOpenRouterKey: () => null });
  const unknown = await disconnected.synthSample({ rung: 'nope' });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.bytes, null);
  assert.equal(unknown.error, 'unknown voice');

  const notReady = await disconnected.synthSample({ rung: 'openrouter' }); // no key → cloud not connected
  assert.equal(notReady.ok, false);
  assert.equal(notReady.bytes, null);
  assert.match(notReady.error, /not connected/);
});

test('warm(): prefetches into the cache so a later synthOne for the same sentence does not re-synth', async () => {
  const { createVoiceModel, MockRung } = await load();
  const rung = MockRung({ name: 'openrouter-tts' }); // warm() only fires for openrouter-tts (Munger-inversion finding)
  const v = createVoiceModel({});
  v.__setRung(rung);
  v.warm(['Next slide sentence.']);
  await new Promise((r) => setTimeout(r, 20)); // let the background prefetch settle
  // The synth call must already have happened from warm() alone, BEFORE synthOne
  // ever runs — asserting only the count afterward wouldn't distinguish a real
  // prefetch from warm() doing nothing and synthOne synthesizing it fresh.
  assert.deepEqual(rung.calls, ['Next slide sentence.']);
  await v.synthOne({ text: 'Next slide sentence.' });
  assert.deepEqual(rung.calls, ['Next slide sentence.'], 'synthOne replayed the warmed cache entry, no second call');
});

test('warm(): no-ops when the resolved rung is silent (nothing connected) — never throws', async () => {
  // No localStorage in plain Node, so setRungPref('off') can't force silent here
  // the way the jsdom twin does — mirror the existing "floors to silent" test's
  // approach instead: nothing connected, no rung injected, ladder floors on its own.
  const { createVoiceModel } = await load();
  const v = createVoiceModel({ getOpenRouterKey: () => null });
  assert.equal(v.availability().rung, 'silent');
  v.warm(['Would-be next slide sentence.']); // best-effort — must not throw
  await new Promise((r) => setTimeout(r, 20));
});

test("warm(): no-ops for the kokoro rung — this prefetch only hides NETWORK latency (openrouter-tts); Kokoro shares ONE compute resource, so prefetching there competes instead of hiding anything (Munger-inversion finding)", async () => {
  const { createVoiceModel, MockRung } = await load();
  const rung = MockRung({ name: 'kokoro' });
  const v = createVoiceModel({});
  v.__setRung(rung);
  v.warm(['Would-be next slide sentence.']);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(rung.calls, []);
});

test('stop()/pause()/resume(): drive ONLY the speechSynthesis rung, and are safe no-ops when it is absent', async () => {
  const { createVoiceModel } = await load();
  const v = createVoiceModel({});
  // Absent speechSynthesis (plain node): every call is a guarded no-op, never throws.
  assert.doesNotThrow(() => { v.pause(); v.resume(); v.stop(); });

  // With a speechSynthesis present, each call delegates to the matching API only.
  const seen = [];
  globalThis.speechSynthesis = {
    speak() {}, cancel() { seen.push('cancel'); }, pause() { seen.push('pause'); }, resume() { seen.push('resume'); },
  };
  try {
    v.pause();
    v.resume();
    v.stop();
    assert.deepEqual(seen, ['pause', 'resume', 'cancel']);
  } finally {
    delete globalThis.speechSynthesis;
  }
});
