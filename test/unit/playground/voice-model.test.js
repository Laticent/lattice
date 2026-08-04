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

test('warm(): DOES prefetch on kokoro — the hazard is handled by that rung\'s scheduler, not by a ban', async () => {
  // Kokoro was excluded from prefetch because its synthesis is serial on one worker, so a
  // warm pass could queue ahead of the sentence the room is waiting to hear. That was right
  // about the hazard and wrong about the remedy: it cost the rung recommended for a LIVE
  // ROOM the whole benefit of prefetch, and left the rail's prefetch edge permanently unable
  // to lead the playhead there. The hazard now lives in the rung's own scheduler (one job at
  // a time, playback jumps the prefetch backlog), so warming is safe.
  const { createVoiceModel, MockRung } = await load();
  const rung = MockRung({ name: 'kokoro' });
  const v = createVoiceModel({});
  v.__setRung(rung);
  v.warm(['Would-be next slide sentence.']);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(rung.calls.length, 1, 'the sentence was prefetched');
});

test('warm(): still no-ops for a rung that produces no cacheable blob (speechSynthesis/silent)', async () => {
  const { createVoiceModel, MockRung } = await load();
  const rung = MockRung({ name: 'speechSynthesis' });
  const v = createVoiceModel({});
  v.__setRung(rung);
  v.warm(['Nothing to cache here.']);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(rung.calls, []);
});

// ── The serial scheduler that let Kokoro prefetch at all ─────────────────────────────
// Kokoro synthesis is one model in one worker, so requests are serial however many are
// posted. Prefetch used to be banned there because a warm pass would queue ahead of the
// sentence the room was waiting to hear. This queue is the remedy that replaced the ban:
// one job in flight, the rest reorderable on the main thread (a message already posted to
// the worker is not). It is exported and tested directly — the rung it lives in needs a
// real worker and an 80 MB model, so an injected test rung bypasses it entirely.

test('serial queue: runs one job at a time, in order, when nothing is prioritized', async () => {
  const { createSerialQueue } = await load();
  const q = createSerialQueue();
  const order = [];
  let live = 0;
  let peak = 0;
  const job = (n) => async () => {
    peak = Math.max(peak, ++live);
    await new Promise((r) => setTimeout(r, 5));
    order.push(n);
    live--;
  };
  await Promise.all([q.enqueue(job(1)), q.enqueue(job(2)), q.enqueue(job(3))]);
  assert.deepEqual(order, [1, 2, 3]);
  assert.equal(peak, 1, 'never more than one job in flight');
});

test('serial queue: a playback job JUMPS a queued prefetch backlog', async () => {
  const { createSerialQueue } = await load();
  const q = createSerialQueue();
  const order = [];
  let release = () => {};
  const gate = new Promise((r) => { release = r; });
  const job = (n, held) => async () => { if (held) await gate; order.push(n); };

  const warm = { warm: true };
  const first = q.enqueue(job('w1', true), undefined, warm); // takes the slot, holds it
  const rest = [q.enqueue(job('w2'), undefined, { warm: true }), q.enqueue(job('w3'), undefined, { warm: true })];
  const play = q.enqueue(job('PLAY'), undefined, { warm: false }); // arrives last, must run second
  release();
  await Promise.all([first, play, ...rest]);

  assert.deepEqual(order, ['w1', 'PLAY', 'w2', 'w3']);
});

test('serial queue: promoting a QUEUED job by mutating its priority moves it to the front', async () => {
  // This is what a playback caller joining an already-queued prefetch does. The priority
  // object is shared with the model's request entry, and selection reads it at DEQUEUE
  // time — so the promotion lands even though the job was enqueued as prefetch.
  const { createSerialQueue } = await load();
  const q = createSerialQueue();
  const order = [];
  let release = () => {};
  const gate = new Promise((r) => { release = r; });
  const job = (n, held) => async () => { if (held) await gate; order.push(n); };

  const first = q.enqueue(job('w1', true), undefined, { warm: true });
  const joined = { warm: true };
  const rest = [q.enqueue(job('w2'), undefined, { warm: true }), q.enqueue(job('JOINED'), undefined, joined)];
  joined.warm = false; // a playback caller joined this one while it sat in the queue
  release();
  await Promise.all([first, ...rest]);

  assert.deepEqual(order, ['w1', 'JOINED', 'w2']);
});

test('serial queue: a job whose caller aborted is dropped rather than run', async () => {
  const { createSerialQueue } = await load();
  const q = createSerialQueue();
  const ran = [];
  let release = () => {};
  const gate = new Promise((r) => { release = r; });
  const ctl = new AbortController();

  const first = q.enqueue(async () => { await gate; ran.push('first'); });
  const doomed = q.enqueue(async () => { ran.push('doomed'); }, ctl.signal, { warm: true }).catch((e) => e.message);
  const after = q.enqueue(async () => { ran.push('after'); });
  ctl.abort(); // walked away while queued
  release();
  await first;
  assert.equal(await doomed, 'aborted');
  await after;
  assert.deepEqual(ran, ['first', 'after'], 'the abandoned job never spent the serial slot');
});

test('warm traffic reaches the rung marked as prefetch, and a playback join promotes it', async () => {
  // The model's half of the contract: hand the rung a MUTABLE priority, and flip it when a
  // playback caller joins a request prefetch already started.
  const { createVoiceModel } = await load();
  let seen = null;
  let release = () => {};
  const gate = new Promise((r) => { release = r; });
  const rung = {
    name: 'kokoro',
    calls: [],
    ready: () => true,
    async synth({ text, priority }) {
      rung.calls.push(text);
      seen = priority;
      await gate;
      return { size: 8, type: 'audio/wav', arrayBuffer: async () => new ArrayBuffer(8) };
    },
  };
  const v = createVoiceModel({});
  v.__setRung(rung);

  v.warm(['Shared sentence.']);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(seen, { warm: true }, 'prefetch traffic is marked as prefetch');

  const playing = v.synthOne({ text: 'Shared sentence.' }); // JOINS the live warm request
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(seen.warm, false, 'the joining playback caller promoted it in place');
  release();
  await playing;
  assert.equal(rung.calls.length, 1, 'and no duplicate request was fired');
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

// ── fetchClip: the ONE synth body playback and prefetch now share ─────────────
// Was two near-copies (synthOne's and the warm queue's), each with its own flat
// 20s timeout and no retry — the timeout behind the "audio hangs" report. These
// pin the discipline that replaced it: bounded attempts, retry only what is
// plausibly transient, and never turn a slow model into a twice-as-long stall.

/** A rung whose synth() is scripted per call: each entry is 'ok' | 'error' | 'hang'. */
function ScriptedRung(script, { name = 'openrouter-tts' } = {}) {
  let i = 0;
  const calls = [];
  const aborts = []; // the signal handed to each attempt, so a test can assert it was cut
  return {
    name,
    ready() { return true; },
    calls,
    aborts,
    async synth({ text, signal }) {
      const step = script[Math.min(i++, script.length - 1)];
      calls.push(text);
      aborts.push(signal);
      if (step === 'error') throw new Error('429 rate limited');
      if (step === 'hang') return new Promise(() => {}); // never settles — the timeout must win
      return { size: 128, type: 'audio/mpeg', arrayBuffer: async () => new ArrayBuffer(128) };
    },
  };
}

test('fetchClip: retries ONCE after a fast failure, and the retry\'s bytes are returned', async () => {
  const { createVoiceModel } = await load();
  const rung = ScriptedRung(['error', 'ok']);
  const v = createVoiceModel({});
  v.__setRung(rung);
  const res = await v.synthOne({ text: 'A transient failure.' });
  assert.equal(rung.calls.length, 2, 'one retry after the fast failure');
  assert.ok(res.bytes, 'the retry\'s audio is what the caller gets');
});

test('fetchClip: gives up after the retry also fails — resolves null, never throws', async () => {
  const { createVoiceModel } = await load();
  const rung = ScriptedRung(['error', 'error']);
  const v = createVoiceModel({});
  v.__setRung(rung);
  const res = await v.synthOne({ text: 'Down hard.' });
  assert.equal(rung.calls.length, 2, 'exactly two attempts — never an unbounded retry loop');
  assert.equal(res.bytes, null);
});

test('fetchClip: a TIMED-OUT attempt is NOT retried — a stuck model must not cost two waits', async () => {
  const { createVoiceModel } = await load();
  const rung = ScriptedRung(['hang', 'ok']);
  // A SHORT patience, injected. The shipped 20s is a real wall-clock wait, and three cases
  // here have to cross it — at the constant this file took 86 seconds instead of 0.2, on
  // every push (HARD RULE #18). What is under test is the behavior AT the deadline, never
  // its duration.
  const v = createVoiceModel({ waitMs: 40, ceilingMs: 120 });
  v.__setRung(rung);
  const res = await v.synthOne({ text: 'Never returns.' });
  assert.equal(res.bytes, null, 'the hung request yields no audio to the caller');
  assert.equal(rung.calls.length, 1, 'one request — a wait that expires is terminal for THIS caller');
});

test('fetchClip: an aborted signal short-circuits before any request is made', async () => {
  const { createVoiceModel } = await load();
  const rung = ScriptedRung(['ok']);
  const v = createVoiceModel({});
  v.__setRung(rung);
  const ctl = new AbortController();
  ctl.abort();
  const res = await v.synthOne({ text: 'Already gone.', signal: ctl.signal });
  assert.equal(rung.calls.length, 0, 'no request for a caller that already walked away');
  assert.equal(res.bytes, null);
});

test('fetchClip: a second request for the same key is served from cache, not re-synthesized', async () => {
  const { createVoiceModel } = await load();
  const rung = ScriptedRung(['ok', 'ok']);
  const v = createVoiceModel({});
  v.__setRung(rung);
  await v.synthOne({ text: 'Say it once.' });
  await v.synthOne({ text: 'Say it once.' });
  assert.equal(rung.calls.length, 1, 'the in-memory tier still short-circuits before any attempt');
});

test('fetchClip: degrades cleanly with no IndexedDB and no localStorage (plain node / private mode)', async () => {
  // The persistent tier and the latency reservoir are both best-effort by contract.
  // This whole file runs with neither global defined, so every test above already
  // exercises the degraded path — this one states it, so a future change that makes
  // either a hard dependency fails here with a name that explains why.
  const { createVoiceModel } = await load();
  assert.equal(typeof indexedDB, 'undefined');
  assert.equal(typeof localStorage, 'undefined');
  const rung = ScriptedRung(['ok']);
  const v = createVoiceModel({});
  v.__setRung(rung);
  const res = await v.synthOne({ text: 'Still works.' });
  assert.ok(res.bytes, 'playback never depends on either store being present');
});

test('fetchClip: a request the caller gave up on KEEPS RUNNING and still caches — the self-healing property', async () => {
  // The regression this pins: cutting the wait to 6s AND aborting on it meant a link slower
  // than the deadline never landed a single sentence in cache, so the deck went permanently
  // silent where it had previously worked slowly. A request is already paid for — letting it
  // finish costs nothing extra and makes the next pass instant.
  const { createVoiceModel } = await load();
  let release;
  const rung = {
    name: 'openrouter-tts',
    calls: [],
    ready: () => true,
    synth({ text }) {
      rung.calls.push(text);
      return new Promise((res) => { release = () => res({ size: 64, type: 'audio/mpeg', arrayBuffer: async () => new ArrayBuffer(64) }); });
    },
  };
  const v = createVoiceModel({ waitMs: 40, ceilingMs: 5000 });
  v.__setRung(rung);

  const ctl = new AbortController();
  const first = v.synthOne({ text: 'Slow but coming.', signal: ctl.signal });
  await new Promise((r) => setTimeout(r, 10));
  ctl.abort();
  assert.equal((await first).bytes, null, 'the caller gets nothing — it stopped waiting');

  release();
  await new Promise((r) => setTimeout(r, 20));
  const second = await v.synthOne({ text: 'Slow but coming.' });
  assert.ok(second.bytes, 'the late arrival is served from cache');
  assert.equal(rung.calls.length, 1, 'and no second request was ever fired');
});

test('fetchClip: a concurrent call for the same sentence JOINS the live request, never duplicates it', async () => {
  // The property the review actually asked for. Keying dedup on the REQUEST rather than on a
  // caller's wait is what delivers it: the old version cleared its entry when the caller gave
  // up, leaving the request running and the next call free to fire a duplicate.
  const { createVoiceModel } = await load();
  let release;
  const rung = {
    name: 'openrouter-tts',
    calls: [],
    ready: () => true,
    synth({ text }) {
      rung.calls.push(text);
      return new Promise((res) => { release = () => res({ size: 32, type: 'audio/mpeg', arrayBuffer: async () => new ArrayBuffer(32) }); });
    },
  };
  const v = createVoiceModel({});
  v.__setRung(rung);
  const a = v.synthOne({ text: 'Same words.' });
  const b = v.synthOne({ text: 'Same words.' });
  await new Promise((r) => setTimeout(r, 10));
  release();
  assert.ok((await a).bytes);
  assert.ok((await b).bytes);
  assert.equal(rung.calls.length, 1, 'one request served both callers');
});

test("fetchClip: the caller's abort ENDS THE WAIT without killing the request, and earns no retry", async () => {
  // This test used to be named "the caller's abort cancels the in-flight request" and asserted
  // only the call count. It pinned the OPPOSITE of the shipped design — startRequest gives the
  // request its own controller precisely so a request the player walked away from keeps running
  // and still caches — and it passed only because the 20s patience eventually fired, which is
  // where 20 of this file's 86 seconds went (red team + independent checker, #1352).
  //
  // What actually has to hold: the CALLER returns promptly (a barge-in must not park Suono's
  // produce slot for the full patience window), the rung's own signal is NOT aborted, and the
  // abort does not count as a transient failure worth retrying.
  const { createVoiceModel } = await load();
  let sawAbort = false;
  let release;
  const rung = {
    name: 'openrouter-tts',
    calls: [],
    ready: () => true,
    synth({ text, signal }) {
      rung.calls.push(text);
      signal.addEventListener('abort', () => { sawAbort = true; }, { once: true });
      return new Promise((res) => { release = () => res({ size: 32, type: 'audio/mpeg', arrayBuffer: async () => new ArrayBuffer(32) }); });
    },
  };
  // A patience far longer than this test's own timing, so a prompt return can only come from
  // the abort — never from the deadline quietly expiring underneath it.
  const v = createVoiceModel({ waitMs: 10000, ceilingMs: 20000 });
  v.__setRung(rung);
  const ctl = new AbortController();
  const startedAt = Date.now();
  const p = v.synthOne({ text: 'Mid-flight barge-in.', signal: ctl.signal });
  await new Promise((r) => setTimeout(r, 10));
  ctl.abort();
  const res = await p;
  const elapsed = Date.now() - startedAt;

  assert.equal(res.bytes, null, 'the caller that walked away gets nothing');
  assert.ok(elapsed < 1000, `the abort ended the wait immediately (took ${elapsed}ms of a 10s patience)`);
  assert.equal(sawAbort, false, 'the REQUEST was not canceled — it is already paid for and still caches');
  assert.equal(rung.calls.length, 1, 'an abort is not a transient failure — it must not earn the retry');

  // And the self-healing half: the abandoned request still lands in cache for the next pass.
  release();
  await new Promise((r) => setTimeout(r, 20));
  const again = await v.synthOne({ text: 'Mid-flight barge-in.' });
  assert.ok(again.bytes, 'the late arrival is served from cache');
  assert.equal(rung.calls.length, 1, 'and no second request was ever fired');
});

test('latencyKey(): the ACTIVE rung\'s key, in the same shape fetchClip records under', async () => {
  // One builder for the writer and every reader. Present previously assembled its own
  // calibration-shaped key, so no lookup ever matched and `auto` lookahead could not adapt.
  const { createVoiceModel } = await load();
  const v = createVoiceModel({});
  v.__setRung({ name: 'openrouter-tts', ready: () => true, synth: async () => null });
  const key = v.latencyKey();
  assert.match(key, /^openrouter-tts\|[^|]+\|[^|]*$/, 'rung | modelId | voice');
  assert.ok(key.includes('|'), 'not a bare rung name');
});

// ── The latency reservoir `auto` lookahead is sized from ──────────────────────────────
//
// The reservoir lives in localStorage, which node does not have — every entry point guards
// it, so without a shim `recordLatency` silently no-ops and these tests would pass on an
// empty store while asserting nothing. Installed per test and removed after, so the rest of
// the file keeps running in its deliberate no-storage mode.
function withLocalStorage(fn) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      delete globalThis.localStorage;
    });
}

// resolveLookahead reads its p95: a slow link is supposed to warm DEEPER than a fast one.
// Two bugs inverted that, and both hid themselves by leaving the reservoir looking healthy
// (everything in it was fast). Found by the adversarial trio's red team, #1352.

test('latency: a timed-out attempt is recorded at the deadline, not dropped', async () => withLocalStorage(async () => {
  // Dropping it made the reservoir a p95 of the successes-under-patience ONLY — so the
  // slower the link, the more of its slow samples were discarded, and the shallowest
  // prefetch window went to the link that needed the deepest.
  const { createVoiceModel } = await load();
  const { latencyStats, clearLatency } = await import('../../../docs/src/playground/narration-latency.js');
  const rung = ScriptedRung(['hang']);
  const v = createVoiceModel({ waitMs: 40, ceilingMs: 200 });
  v.__setRung(rung);
  clearLatency(v.latencyKey());

  assert.equal((await v.synthOne({ text: 'Too slow to land.' })).bytes, null);
  const stats = latencyStats(v.latencyKey());
  assert.equal(stats.n, 1, 'the slowest observation is the one that most needs recording');
  assert.ok(stats.p95 >= 40, `censored at the deadline, not thrown away (p95=${stats.p95})`);
}));

test('latency: a JOINER records the request\'s age, not its own short wait', async () => withLocalStorage(async () => {
  // A second caller landing on an already-running request measured from ITS OWN start, so a
  // request five seconds old could contribute a five-millisecond sample. Warm-ahead makes
  // this the normal path: it starts the sentence, playback joins later.
  const { createVoiceModel } = await load();
  const { latencyStats, clearLatency } = await import('../../../docs/src/playground/narration-latency.js');
  let release;
  const rung = {
    name: 'openrouter-tts',
    calls: [],
    ready: () => true,
    synth({ text }) {
      rung.calls.push(text);
      return new Promise((res) => { release = () => res({ size: 32, type: 'audio/mpeg', arrayBuffer: async () => new ArrayBuffer(32) }); });
    },
  };
  const v = createVoiceModel({ waitMs: 5000, ceilingMs: 10000 });
  v.__setRung(rung);
  clearLatency(v.latencyKey());

  const first = v.synthOne({ text: 'Warmed ahead.' });        // the real request starts here
  await new Promise((r) => setTimeout(r, 120));
  const joiner = v.synthOne({ text: 'Warmed ahead.' });        // playback catches up much later
  await new Promise((r) => setTimeout(r, 10));
  release();
  await Promise.all([first, joiner]);

  assert.equal(rung.calls.length, 1, 'one request served both');
  const stats = latencyStats(v.latencyKey());
  assert.ok(stats.p95 >= 100, `the reservoir reflects the REQUEST's age, not the join (p95=${stats.p95})`);
}));
