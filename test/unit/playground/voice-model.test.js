// Unit coverage for the VoiceModel adapter (the read-aloud voice ladder). Like
// architect-model.test.js, this exercises the ladder + sequencing with a scripted
// rung and no real audio device or model — the parts that must be correct without
// hardware: sentence segmentation, WAV framing, rung selection, and that speak()
// always resolves (the silent floor) and drives synth() per sentence.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const url = require('node:url').pathToFileURL(
  require('node:path').join(__dirname, '../../../docs/src/playground/voice-model.js')
).href;

async function load() { return import(url); }

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

test('ladder: floors to silent when nothing is connected, and speak() still resolves', async () => {
  const { createVoiceModel } = await load();
  const v = createVoiceModel({ getOpenRouterKey: () => null });
  assert.equal(v.availability().rung, 'silent');
  // No rung, no audio device — must resolve, never throw.
  await v.speak({ text: 'This should be silent. It must not throw.' });
  assert.equal(v.speaking(), false);
});

test('ladder: a connected OpenRouter key selects the openrouter-tts rung', async () => {
  const { createVoiceModel } = await load();
  const v = createVoiceModel({ getOpenRouterKey: () => 'sk-test' });
  assert.equal(v.availability().rung, 'openrouter-tts');
  assert.equal(v.availability().openRouterReady, true);
});

test('openrouter synth: POSTs the OpenAI-compatible /audio/speech route and returns the raw blob', async () => {
  const { createVoiceModel } = await load();
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = { url, method: opts.method, body: JSON.parse(opts.body) };
    // The real route returns a raw mp3 byte stream, not JSON — mimic a Blob.
    return { ok: true, status: 200, blob: async () => ({ size: 256, type: 'audio/mpeg' }) };
  };
  const v = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl });
  // speak() drives the rung's synth (no audio device in node → playback is a no-op).
  await v.speak({ text: 'Revenue grew to $4.2M.', speed: 1.25 });
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
  await v.speak({ text: 'Plain.', speed: 1 });
  assert.equal(body.speed, undefined, 'speed:1 is the default and is not sent');
});

test('speak(): drives the active rung once per sentence, in order', async () => {
  const { createVoiceModel, MockRung } = await load();
  const rung = MockRung();
  const v = createVoiceModel({});
  v.__setRung(rung);
  const seen = [];
  await v.speak({ text: 'First sentence. Second one! Third?', onSentence: (s) => seen.push(s) });
  assert.deepEqual(rung.calls, ['First sentence.', 'Second one!', 'Third?']);
  assert.deepEqual(seen, ['First sentence.', 'Second one!', 'Third?']);
});

test('pause()/resume(): suspends narration between sentences, then continues', async () => {
  const { createVoiceModel, MockRung } = await load();
  const rung = MockRung();
  const v = createVoiceModel({});
  v.__setRung(rung);
  const seen = [];
  let pausedOnce = false;
  const p = v.speak({
    text: 'One. Two. Three.',
    onSentence: (s) => { seen.push(s); if (!pausedOnce) { pausedOnce = true; v.pause(); } },
  });
  // The loop parks at the paused gate before the second sentence is announced.
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(seen.length, 1, 'narration is held after the first sentence');
  assert.equal(v.paused(), true);
  v.resume();
  await p;
  assert.equal(v.paused(), false);
  assert.deepEqual(seen, ['One.', 'Two.', 'Three.']);
});

test('stop(): aborting before synth resolves leaves nothing speaking', async () => {
  const { createVoiceModel } = await load();
  let aborted = false;
  const slowRung = {
    name: 'slow', ready() { return true; },
    synth({ signal }) {
      return new Promise((resolve) => {
        signal?.addEventListener('abort', () => { aborted = true; resolve(null); }, { once: true });
      });
    },
  };
  const v = createVoiceModel({});
  v.__setRung(slowRung);
  const p = v.speak({ text: 'A long note that never finishes synthesizing.' });
  v.stop();
  await p;
  assert.equal(aborted, true);
  assert.equal(v.speaking(), false);
});
