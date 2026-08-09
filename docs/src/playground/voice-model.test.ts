// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { splitSentences as cadenzaSplit } from '@/lib/cadenza';
import { createVoiceModel, splitSentences as voiceSplit } from './voice-model.js';

// voice-model is now a BYTE SOURCE only — it synthesizes audio bytes (synthOne /
// synthSample) and NEVER plays them (the Suono library, a Studio/cadenza consumer,
// owns playback). So these tests exercise rung selection, the shared byte cache +
// in-flight dedup, warm() prefetch, and speechSynthesis-only stop/pause/resume —
// there is no WebAudio context to fake anymore.

describe('splitSentences mirrors Cadenza exactly (node-loadable local copy, HARD RULE #15)', () => {
  // voice-model can't import the TS caption engine (it must load under plain node),
  // so it keeps a local copy. This pins the copy byte-identical to Cadenza's so the
  // sentence a voice SPEAKS never diverges from the cue a caption HIGHLIGHTS.
  const corpus = [
    'Revenue grew to $4.2M this quarter, up 18.5% from Q3. That is our best.',
    'We shipped 3.5x faster. Margins held at 30%.',
    'Acme Inc. beat plan. Done?',
    'One\n\ntwo three',
    'Trailing no punct',
    'A finished one. And an unfinished one',
    '',
    '   ',
  ];
  for (const text of corpus) {
    it(`agrees on: ${JSON.stringify(text).slice(0, 40)}`, () => {
      expect(voiceSplit(text)).toEqual(cadenzaSplit(text));
    });
  }
  it('keeps a mid-token decimal intact (the bug the old regex had)', () => {
    expect(voiceSplit('Revenue grew to $4.2M.')).toEqual(['Revenue grew to $4.2M.']);
  });
});

describe('keyPrefix isolation (2026-07-09-studio-cloud-ondevice-config-split.md)', () => {
  it('two instances with different keyPrefix never share voice/speed prefs', () => {
    const a = createVoiceModel({ keyPrefix: 'a' });
    const b = createVoiceModel({ keyPrefix: 'b' });
    a.setOrVoice('af_bella');
    a.setSpeed(1.4);
    expect(b.orVoice()).toBe('af_heart'); // b's default, unaffected by a's pick
    expect(b.speedPref()).toBe(1);
    expect(a.orVoice()).toBe('af_bella');
    expect(a.speedPref()).toBe(1.4);
    // Distinct localStorage keys, not just distinct in-memory instances.
    expect(localStorage.getItem('lattice-a-voice-or')).toBe('af_bella');
    expect(localStorage.getItem('lattice-b-voice-or')).toBeNull();
  });

  it('omitting keyPrefix keeps the Drawing Board\'s original db-* keys byte-identical', () => {
    const model = createVoiceModel({});
    model.setKokoroVoice('am_adam');
    expect(localStorage.getItem('lattice-db-voice-kokoro')).toBe('am_adam');
  });
});

describe('speed prefs', () => {
  it('defaults to 1, round-trips, and synthOne forwards the effective speed to the rung', async () => {
    const model = createVoiceModel({});
    expect(model.speedPref()).toBe(1);
    model.setSpeed(1.25);
    expect(model.speedPref()).toBe(1.25);
    const seen: (number | undefined)[] = [];
    model.__setRung({
      name: 'mock',
      ready: () => true,
      synth: async ({ speed }: { speed?: number }) => {
        seen.push(speed);
        return { size: 8, arrayBuffer: async () => new ArrayBuffer(8) };
      },
    });
    await model.synthOne({ text: 'One.' });
    expect(seen).toEqual([1.25]); // no explicit per-call speed → falls to the persisted pref
    await model.synthOne({ text: 'Two.', speed: 0.9 });
    expect(seen).toEqual([1.25, 0.9]); // an explicit per-call speed wins over the pref
  });
});

describe('synthOne — byte source (replay reuses synthesized bytes; voice/model/speed changes invalidate the cache)', () => {
  it('returns bytes + a stable cache key for the active rung', async () => {
    const model = createVoiceModel({});
    model.__setRung({
      name: 'mock',
      ready: () => true,
      synth: async () => ({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) }),
    });
    const res = await model.synthOne({ text: 'Hello there.' });
    expect(res.rung).toBe('mock');
    expect(res.bytes).toBeTruthy();
    expect(res.key).toContain('Hello there.'); // the text is part of the JSON-stringified tuple key
  });

  it('returns null bytes (no synth) for the silent floor', async () => {
    const silent = createVoiceModel({});
    silent.setRungPref('off');
    const res = await silent.synthOne({ text: 'Hi.' });
    expect(res.rung).toBe('silent');
    expect(res.bytes).toBeNull();
  });

  it('returns null bytes for speechSynthesis (that rung plays itself — no bytes to hand a byte player)', async () => {
    (window as unknown as { speechSynthesis: unknown }).speechSynthesis = { speak() {}, cancel() {}, pause() {}, resume() {} };
    try {
      const speech = createVoiceModel({ allowBrowserVoice: true }); // no cloud/kokoro → auto ladder lands on speechSynthesis
      const res = await speech.synthOne({ text: 'Hi.' });
      expect(res.rung).toBe('speechSynthesis');
      expect(res.bytes).toBeNull();
    } finally {
      delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    }
  });

  it('reuses a cached blob for an identical (rung, voice, speed, text) call — no second synth', async () => {
    const model = createVoiceModel({});
    const calls: string[] = [];
    model.__setRung({
      name: 'mock',
      ready: () => true,
      synth: async ({ text }: { text: string }) => {
        calls.push(text);
        return { size: 8, arrayBuffer: async () => new ArrayBuffer(8) };
      },
    });
    await model.synthOne({ text: 'Same sentence.' });
    await model.synthOne({ text: 'Same sentence.' });
    expect(calls).toEqual(['Same sentence.']); // the second call replayed the cached blob
  });

  it('an explicit voice change forces a fresh synth even for the same text/speed', async () => {
    const model = createVoiceModel({});
    const calls: string[] = [];
    model.__setRung({
      name: 'openrouter-tts',
      ready: () => true,
      synth: async ({ text }: { text: string }) => {
        calls.push(text);
        return { size: 8, arrayBuffer: async () => new ArrayBuffer(8) };
      },
    });
    await model.synthOne({ text: 'Hi.', voice: 'voice-a' });
    await model.synthOne({ text: 'Hi.', voice: 'voice-a' }); // same voice → cache hit
    expect(calls).toEqual(['Hi.']);
    await model.synthOne({ text: 'Hi.', voice: 'voice-b' }); // different voice → must NOT reuse voice-a's audio
    expect(calls).toEqual(['Hi.', 'Hi.']);
  });

  it('an OpenRouter MODEL change forces a fresh synth even for the same text/voice/speed', async () => {
    // OpenRouter serves multiple TTS models through one rung — the model id must be
    // part of the cache key too, or switching models would silently replay the
    // PREVIOUS model's audio.
    const model = createVoiceModel({});
    const calls: string[] = [];
    model.__setRung({
      name: 'openrouter-tts',
      ready: () => true,
      synth: async ({ text }: { text: string }) => {
        calls.push(text);
        return { size: 8, arrayBuffer: async () => new ArrayBuffer(8) };
      },
    });
    model.setOrModel('model-a');
    await model.synthOne({ text: 'Hi.' });
    await model.synthOne({ text: 'Hi.' }); // same model (+ default voice/speed) → cache hit
    expect(calls).toEqual(['Hi.']);
    model.setOrModel('model-b');
    await model.synthOne({ text: 'Hi.' }); // different model → must NOT reuse model-a's audio
    expect(calls).toEqual(['Hi.', 'Hi.']);
  });

  it('a speed change forces a fresh synth even for the same text/voice/model', async () => {
    const model = createVoiceModel({});
    const calls: string[] = [];
    model.__setRung({
      name: 'mock',
      ready: () => true,
      synth: async ({ text }: { text: string }) => {
        calls.push(text);
        return { size: 8, arrayBuffer: async () => new ArrayBuffer(8) };
      },
    });
    await model.synthOne({ text: 'Hi.', speed: 1.25 });
    await model.synthOne({ text: 'Hi.', speed: 1.25 }); // same speed → cache hit
    expect(calls).toEqual(['Hi.']);
    await model.synthOne({ text: 'Hi.', speed: 0.9 }); // different speed → must NOT reuse the 1.25x audio
    expect(calls).toEqual(['Hi.', 'Hi.']);
  });

  it("does not freeze the cache key on a falsy voice ('') — mirrors the real rung's `||` fallback, not `??` (independent-checker + Munger-inversion finding)", async () => {
    // `'' ?? orVoice()` would stay `''` forever (nullish coalescing only falls
    // through on null/undefined); `'' || orVoice()` correctly falls through to the
    // LIVE preference, matching what the real rung actually synthesizes. A `??` mirror
    // here would let a voice-preference CHANGE silently hit a stale cache entry
    // recorded under the frozen `''` key.
    const model = createVoiceModel({});
    const calls: string[] = [];
    model.__setRung({
      name: 'openrouter-tts',
      ready: () => true,
      synth: async ({ text }: { text: string }) => {
        calls.push(text);
        return { size: 8, arrayBuffer: async () => new ArrayBuffer(8) };
      },
    });
    model.setOrVoice('voice-a');
    await model.synthOne({ text: 'Hi.', voice: '' });
    model.setOrVoice('voice-b'); // the user changes their voice preference
    await model.synthOne({ text: 'Hi.', voice: '' }); // must NOT replay voice-a's cached audio
    expect(calls).toEqual(['Hi.', 'Hi.']);
  });
});

describe('synthSample — the "play sample" byte source (explicit rung/voice/model, bypassing the auto ladder)', () => {
  const okFetch = () => async () => ({ ok: true, status: 200, blob: async () => ({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) }) });

  it('returns bytes + a key (containing the fixed PREVIEW_TEXT) for a ready rung', async () => {
    const model = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl: okFetch() });
    const res = await model.synthSample({ rung: 'openrouter' });
    expect(res.ok).toBe(true);
    expect(res.bytes).toBeTruthy();
    expect(res.key).toContain('This is how your slides will sound.');
  });

  it('caches the sample — a second call for the same rung/voice/speed does not re-fetch', async () => {
    let fetchCalls = 0;
    const model = createVoiceModel({
      getOpenRouterKey: () => 'sk-test',
      fetchImpl: async () => {
        fetchCalls++;
        return { ok: true, status: 200, blob: async () => ({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) }) };
      },
    });
    expect((await model.synthSample({ rung: 'openrouter' })).ok).toBe(true);
    expect((await model.synthSample({ rung: 'openrouter' })).ok).toBe(true);
    expect(fetchCalls).toBe(1); // the second sample replayed the cached bytes, no re-fetch
  });

  it('a different voice forces a fresh fetch', async () => {
    let fetchCalls = 0;
    const model = createVoiceModel({
      getOpenRouterKey: () => 'sk-test',
      fetchImpl: async () => {
        fetchCalls++;
        return { ok: true, status: 200, blob: async () => ({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) }) };
      },
    });
    await model.synthSample({ rung: 'openrouter', voice: 'voice-a' });
    await model.synthSample({ rung: 'openrouter', voice: 'voice-b' });
    expect(fetchCalls).toBe(2);
  });

  it('returns { ok:false } for an unknown rung name', async () => {
    const model = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl: okFetch() });
    const res = await model.synthSample({ rung: 'nope' as unknown as 'openrouter' });
    expect(res.ok).toBe(false);
    expect(res.bytes).toBeNull();
    expect(res.error).toBe('unknown voice');
  });

  it('returns { ok:false } when the rung is not ready (cloud not connected)', async () => {
    const model = createVoiceModel({ getOpenRouterKey: () => null }); // no key → openrouter not ready
    const res = await model.synthSample({ rung: 'openrouter' });
    expect(res.ok).toBe(false);
    expect(res.bytes).toBeNull();
    expect(res.error).toContain('not connected');
  });

  // Bug fix (2026-07-09-studio-cloud-ondevice-config-split.md's "model-row-preview"
  // follow-up): the Workspace model picker's ▶ row-preview passes the id of the model
  // being AUDITIONED, which may not be the currently ACTIVE model at all.
  it('uses a `model` override in the live request, even though a DIFFERENT model is active', async () => {
    const requests: Array<{ model?: string }> = [];
    const model = createVoiceModel({
      getOpenRouterKey: () => 'sk-test',
      fetchImpl: async (_url: string, opts: { body: string }) => {
        requests.push(JSON.parse(opts.body));
        return { ok: true, status: 200, blob: async () => ({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) }) };
      },
    });
    model.setOrModel('the-currently-active-model');
    await model.synthSample({ rung: 'openrouter', model: 'the-row-being-previewed', voice: 'v' });
    expect(requests[0].model).toBe('the-row-being-previewed');
  });

  it('a model override forces a fresh fetch — does not collide with a differently-modeled cache entry', async () => {
    let fetchCalls = 0;
    const model = createVoiceModel({
      getOpenRouterKey: () => 'sk-test',
      fetchImpl: async () => {
        fetchCalls++;
        return { ok: true, status: 200, blob: async () => ({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) }) };
      },
    });
    await model.synthSample({ rung: 'openrouter', model: 'model-a', voice: 'same-voice' });
    await model.synthSample({ rung: 'openrouter', model: 'model-b', voice: 'same-voice' });
    expect(fetchCalls).toBe(2); // same voice/speed/text, different model → NOT a cache hit
  });

  // Regression: a hung SYNTH-phase call (network never responds) must not leave the
  // sample awaiting forever — synthSample races an internal 20s timeout.
  it('resolves with a timeout error instead of hanging when the fetch never settles', async () => {
    vi.useFakeTimers();
    try {
      const model = createVoiceModel({
        getOpenRouterKey: () => 'sk-test',
        fetchImpl: () => new Promise(() => {}), // never resolves or rejects
      });
      const resultP = model.synthSample({ rung: 'openrouter' });
      await vi.advanceTimersByTimeAsync(20000);
      await expect(resultP).resolves.toMatchObject({ ok: false, bytes: null, error: expect.stringContaining('timed out') });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a preview and a real sentence with the same text share one cache entry (synthSample ⇄ synthOne)', async () => {
    // synthSample keys on the rung's real `.name`, effModel, effVoice, effSpeed and
    // PREVIEW_TEXT — the SAME derivation synthOne uses — so a later synthOne for the
    // identical text hits the sample's cache entry rather than re-synthesizing.
    let fetchCalls = 0;
    const model = createVoiceModel({
      getOpenRouterKey: () => 'sk-test',
      fetchImpl: async () => {
        fetchCalls++;
        return { ok: true, status: 200, blob: async () => ({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) }) };
      },
    });
    const sample = await model.synthSample({ rung: 'openrouter' });
    expect(sample.ok).toBe(true);
    const spoken = await model.synthOne({ text: 'This is how your slides will sound.' });
    expect(spoken.key).toBe(sample.key); // identical cache identity
    expect(fetchCalls).toBe(1); // synthOne replayed the sample's cached bytes
  });
});

describe('synthFor / clipKeyFor — an identity the CALLER names (what the webpage export bakes with)', () => {
  const okFetch = (sink?: Array<{ model?: string; input?: string; voice?: string }>) => async (_url: string, opts: { body: string }) => {
    sink?.push(JSON.parse(opts.body));
    return { ok: true, status: 200, blob: async () => ({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) }) };
  };

  it('synthesizes ARBITRARY text in an explicitly named model + voice', async () => {
    const requests: Array<{ model?: string; input?: string; voice?: string }> = [];
    const model = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl: okFetch(requests) });
    model.setOrModel('the-workspace-model');
    model.setOrVoice('the-workspace-voice');
    const res = await model.synthFor({ rung: 'openrouter', text: 'A sentence from the deck.', model: 'the-export-model', voice: 'the-export-voice' });
    expect(res.ok).toBe(true);
    expect(requests[0]).toMatchObject({ model: 'the-export-model', voice: 'the-export-voice', input: 'A sentence from the deck.' });
  });

  it('sends the SAME resolved voice it keys on, when the caller names no voice', async () => {
    // A clip must never be banked under a key naming a voice it was not spoken in. The
    // fallback to the stored pref used to be resolved twice — once for the key here, once
    // inside the rung's own `voice || getVoice()` — and two expressions that agree by
    // coincidence are how the latency key silently missed every lookup forever (#1352).
    const requests: Array<{ model?: string; voice?: string }> = [];
    const model = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl: okFetch(requests) });
    model.setOrModel('the-workspace-model');
    model.setOrVoice('the-workspace-voice');
    const res = await model.synthFor({ rung: 'openrouter', text: 'No voice named.' });
    expect(requests[0].voice, 'the voice that was actually spoken').toBe('the-workspace-voice');
    expect(res.key, 'the voice the bytes are banked under').toContain('the-workspace-voice');
    expect(res.key).toBe(model.clipKeyFor({ rung: 'openrouter', text: 'No voice named.' }));
  });

  it('does NOT write the chosen voice back to the workspace prefs', async () => {
    // Picking a different narrator for one board deck is not a decision to re-record every
    // future rehearsal in that voice. The export panel's choice is per-export, full stop.
    const model = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl: okFetch() });
    model.setOrModel('the-workspace-model');
    model.setOrVoice('the-workspace-voice');
    await model.synthFor({ rung: 'openrouter', text: 'Anything.', model: 'other-model', voice: 'other-voice' });
    expect(model.orModel()).toBe('the-workspace-model');
    expect(model.orVoice()).toBe('the-workspace-voice');
  });

  it('clipKeyFor predicts EXACTLY the key synthFor stores under', async () => {
    // The whole cache-first bake rests on this. A key the export rebuilt by hand would match
    // nothing, read as "nothing prepared", and re-bill a deck that was already paid for — so
    // the predicted key and the produced key must be the same string, not merely similar.
    const model = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl: okFetch() });
    const id = { rung: 'openrouter' as const, text: 'A sentence from the deck.', model: 'm', voice: 'v', speed: 1.25 };
    const predicted = model.clipKeyFor(id);
    const produced = await model.synthFor(id);
    expect(produced.key).toBe(predicted);
    expect(predicted).toContain('A sentence from the deck.');
  });

  it("clipKeyFor agrees with the ACTIVE-rung clipKey when the identity it names IS the active one", async () => {
    // The bake looks up clips the LIVE reader synthesized. If these two builders disagreed,
    // a fully rehearsed deck would report nothing cached and re-synthesize every sentence.
    const model = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl: okFetch() });
    model.setOrModel('active-model');
    model.setOrVoice('active-voice');
    model.setSpeed(1.1);
    expect(model.clipKeyFor({ rung: 'openrouter', text: 'Same sentence.', model: 'active-model', voice: 'active-voice', speed: 1.1 })).toBe(model.clipKey('Same sentence.'));
  });

  it('each part of the identity changes the key — none of them can be dropped', () => {
    const model = createVoiceModel({ getOpenRouterKey: () => 'sk-test' });
    const base = { rung: 'openrouter' as const, text: 't', model: 'm', voice: 'v', speed: 1 };
    const k = model.clipKeyFor(base);
    for (const change of [{ text: 'u' }, { model: 'n' }, { voice: 'w' }, { speed: 1.25 }]) {
      expect(model.clipKeyFor({ ...base, ...change }), JSON.stringify(change)).not.toBe(k);
    }
    expect(model.clipKeyFor({ ...base, rung: 'kokoro' })).not.toBe(k);
  });

  it('returns an empty key rather than a plausible one for an unknown tier', () => {
    // '' is the honest answer — there is no key — and it can never collide with a real entry.
    const model = createVoiceModel({ getOpenRouterKey: () => 'sk-test' });
    expect(model.clipKeyFor({ rung: 'nope' as unknown as 'openrouter', text: 't' })).toBe('');
  });

  it('reports an unready rung instead of throwing, so the bake can name the reason', async () => {
    const model = createVoiceModel({ getOpenRouterKey: () => null });
    const res = await model.synthFor({ rung: 'openrouter', text: 'Anything.' });
    expect(res).toMatchObject({ ok: false, bytes: null });
    expect(res.error).toContain('not connected');
  });

  it('makes ONE attempt — the retry policy belongs to the caller', async () => {
    // A bake backs off and retries; an audition should fail at once. Two opposite policies, so
    // this layer reports the outcome and neither one is baked in here.
    let fetchCalls = 0;
    const model = createVoiceModel({
      getOpenRouterKey: () => 'sk-test',
      fetchImpl: async () => {
        fetchCalls++;
        return { ok: false, status: 429, text: async () => 'rate limited' };
      },
    });
    expect((await model.synthFor({ rung: 'openrouter', text: 'Anything.' })).ok).toBe(false);
    expect(fetchCalls).toBe(1);
  });

  it('honors a caller-set timeout rather than the sample path\'s fixed 20s', async () => {
    vi.useFakeTimers();
    try {
      const model = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl: () => new Promise(() => {}) });
      const p = model.synthFor({ rung: 'openrouter', text: 'Anything.', timeoutMs: 45000 });
      await vi.advanceTimersByTimeAsync(20000);
      await vi.advanceTimersByTimeAsync(25000);
      await expect(p).resolves.toMatchObject({ ok: false, error: expect.stringContaining('45s') });
    } finally {
      vi.useRealTimers();
    }
  });

  it('BANKS a clip that lands after the timeout — it was already paid for', async () => {
    // A TTS request is billed when it is issued. Canceling the read does not refund it, so a
    // sentence this call gave up on is already paid for and letting it finish costs nothing.
    // Aborting instead threw away the money AND the audio: on a slow link the bake paid three
    // times per sentence (once per attempt), banked nothing, and then refused the export.
    vi.useFakeTimers();
    try {
      let land: (b: unknown) => void = () => {};
      let fetches = 0;
      const model = createVoiceModel({
        getOpenRouterKey: () => 'sk-test',
        // ABORT-AWARE, like the real fetch: it rejects the moment its signal aborts. A mock that
        // ignored abort would let this test pass against the very code it exists to reject.
        fetchImpl: (_u: string, opts: { signal?: AbortSignal }) => {
          fetches++;
          return new Promise((res, rej) => {
            land = res;
            opts.signal?.addEventListener('abort', () => rej(new Error('aborted')), { once: true });
          });
        },
      });
      const p = model.synthFor({ rung: 'openrouter', text: 'A slow sentence.', timeoutMs: 45000 });
      await vi.advanceTimersByTimeAsync(45000);
      await expect(p).resolves.toMatchObject({ ok: false, error: expect.stringContaining('45s') });
      expect(fetches).toBe(1);

      // The response arrives late — during what would have been the retry's backoff.
      land({ ok: true, status: 200, blob: async () => ({ size: 8, type: 'audio/mpeg', arrayBuffer: async () => new ArrayBuffer(8) }) });
      await vi.advanceTimersByTimeAsync(0);

      // The retry is now a CACHE HIT, not a second charge. This is also why letting the request
      // run cannot re-open the "three billed requests for one sentence" defect: the second
      // request is never ISSUED.
      const retry = await model.synthFor({ rung: 'openrouter', text: 'A slow sentence.', timeoutMs: 45000 });
      expect(retry.ok, 'the late clip was banked and served').toBe(true);
      expect(fetches, 'the retry must not re-bill a sentence already paid for').toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ON-DEVICE, a timeout aborts AT ONCE — the scarce thing there is the inference slot, not money', async () => {
    // The grace window exists to salvage audio that was already paid for. On the on-device rung
    // nothing is paid for, and Kokoro runs ONE generation at a time: the serial queue only drops
    // a superseded job when its signal aborts, so holding the abort for 60 s keeps a dead
    // sentence in the slot the retry needs (measured at 105 s of blockage instead of 45, with
    // the abandoned job and its retry both eventually running). The rung this PR just opened up
    // for baking is exactly the one the delay hurts.
    vi.useFakeTimers();
    try {
      let aborted = false;
      const model = createVoiceModel({});
      model.__setKokoroInference(({ signal }: { signal?: AbortSignal }) =>
        new Promise((_res, rej) => {
          signal?.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); }, { once: true });
        }),
      );
      const p = model.synthFor({ rung: 'kokoro', text: 'A slow sentence.', timeoutMs: 45000 });
      await vi.advanceTimersByTimeAsync(45000);
      await p;
      expect(aborted, 'the slot is freed the moment we stop waiting').toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still aborts for real when the CALLER cancels — patience is dropped, cancellation is not', async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const model = createVoiceModel({
        getOpenRouterKey: () => 'sk-test',
        fetchImpl: (_u: string, opts: { signal?: AbortSignal }) =>
          new Promise((_res, rej) => {
            opts.signal?.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); }, { once: true });
          }),
      });
      const ctl = new AbortController();
      const p = model.synthFor({ rung: 'openrouter', text: 'Anything.', signal: ctl.signal });
      ctl.abort();
      await p;
      expect(aborted, 'a canceled export must stop spending immediately').toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// Abort-aware mock: rejects the moment its signal aborts, exactly like the real
// openRouterRung (fetch) / kokoroRung (worker) do — a mock that ignores abort would
// make a stop-mid-synth test hang for the real 20s internal timeout.
function abortAwareMockRung(onStart: (text: string) => void, name = 'mock') {
  const resolvers = new Map<string, (b: { size: number; arrayBuffer: () => Promise<ArrayBuffer> }) => void>();
  return {
    rung: {
      name,
      ready: () => true,
      synth: ({ text, signal }: { text: string; signal?: AbortSignal }) => {
        onStart(text);
        return new Promise<{ size: number; arrayBuffer: () => Promise<ArrayBuffer> }>((resolve, reject) => {
          resolvers.set(text, resolve);
          signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      },
    },
    resolve(text: string) {
      resolvers.get(text)?.({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) });
    },
  };
}

describe('warm() — background prefetch across a slide boundary (autoplay warm-ahead)', () => {
  it('populates the cache so a later synthOne for the same sentence does not re-synth', async () => {
    const model = createVoiceModel({});
    const calls: string[] = [];
    model.__setRung({
      name: 'openrouter-tts',
      ready: () => true,
      synth: async ({ text }: { text: string }) => {
        calls.push(text);
        return { size: 8, arrayBuffer: async () => new ArrayBuffer(8) };
      },
    });
    model.warm(['Next slide sentence.']);
    await vi.waitFor(() => expect(calls).toEqual(['Next slide sentence.']));
    await model.synthOne({ text: 'Next slide sentence.' });
    expect(calls).toEqual(['Next slide sentence.']); // synthOne replayed the warmed cache entry, no second synth
  });

  it('is a no-op when the resolved rung is silent — no synth call, nothing to cache', async () => {
    const model = createVoiceModel({});
    const calls: string[] = [];
    model.__setRung({
      name: 'openrouter-tts',
      ready: () => true,
      synth: async ({ text }: { text: string }) => {
        calls.push(text);
        return { size: 8, arrayBuffer: async () => new ArrayBuffer(8) };
      },
    });
    model.setRungPref('off'); // pickRung() resolves to the silent rung regardless of the injected mock
    model.warm(['Would-be next slide sentence.']);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual([]);
  });

  // Kokoro was excluded from prefetch because its synthesis is serial on one worker, so a
  // warm pass could queue ahead of the sentence the room is waiting to hear. Right about the
  // hazard, wrong about the remedy: it cost the rung recommended for a LIVE ROOM the whole
  // benefit of prefetch, and left the rail's prefetch edge permanently unable to lead the
  // playhead there. The hazard now lives in that rung's own scheduler (`createSerialQueue`:
  // one job at a time, playback jumps the prefetch backlog), so warming is safe.
  it('DOES prefetch on the kokoro rung — the serial hazard is handled by its scheduler, not by a ban', async () => {
    const model = createVoiceModel({});
    const calls: string[] = [];
    model.__setRung({
      name: 'kokoro',
      ready: () => true,
      synth: async ({ text }: { text: string }) => {
        calls.push(text);
        return { size: 8, arrayBuffer: async () => new ArrayBuffer(8) };
      },
    });
    model.warm(['Would-be next slide sentence.']);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual(['Would-be next slide sentence.']);
  });

  it('marks prefetch traffic as prefetch, so a serial rung can order it behind playback', async () => {
    const model = createVoiceModel({});
    let seen: { warm: boolean } | undefined;
    model.__setRung({
      name: 'kokoro',
      ready: () => true,
      synth: async ({ priority }: { priority?: { warm: boolean } }) => {
        seen = priority;
        return { size: 8, arrayBuffer: async () => new ArrayBuffer(8) };
      },
    });
    model.warm(['Prefetched.']);
    await new Promise((r) => setTimeout(r, 20));
    // Field-wise, not shape-wise: the priority object also carries the DROP channel (#1391),
    // and a whole-object compare would break every time it learns something new.
    expect(seen?.warm).toBe(true);
  });

  it('caps concurrent prefetch requests at WARM_CONCURRENCY (3)', async () => {
    // The cap was RAISED 1 → 3 (2026-08-03). At 1 the prefetch fetched an upcoming
    // slide's sentences strictly one at a time, so a window deeper than a sentence or
    // two could never be filled before the transition arrived — the "long pause between
    // slides" report. What must stay true is that it is CAPPED at all: the 4th request
    // waits for a slot rather than piling onto a paid backend.
    const model = createVoiceModel({});
    const started: string[] = [];
    const mock = abortAwareMockRung((t) => started.push(t), 'openrouter-tts');
    model.__setRung(mock.rung);

    model.warm(['One.', 'Two.', 'Three.', 'Four.']);
    await vi.waitFor(() => expect(started).toEqual(['One.', 'Two.', 'Three.']));
    expect(started).not.toContain('Four.'); // capped at 3 — nothing has resolved yet

    mock.resolve('One.');
    await vi.waitFor(() => expect(started).toContain('Four.'));
    mock.resolve('Two.');
    mock.resolve('Three.');
    mock.resolve('Four.');
  });

  it('caps concurrency ACROSS separate warm() calls, not just within one (red-team finding)', async () => {
    // WARM_CONCURRENCY must be a budget for the whole voice-model instance, not a
    // fresh per-call allowance — Present's autoplay effect re-fires warm() on every
    // navigation step. Before the shared-queue fix, each of N such calls fired its own
    // request immediately — N rapid steps meant N concurrent real, billed requests.
    const model = createVoiceModel({});
    const started: string[] = [];
    const mock = abortAwareMockRung((t) => started.push(t), 'openrouter-tts');
    model.__setRung(mock.rung);

    model.warm(['Slide 2.']);
    model.warm(['Slide 3.']);
    model.warm(['Slide 4.']);
    model.warm(['Slide 5.']);
    model.warm(['Slide 6.']);
    // Three in flight (the shared cap), NOT five — the budget belongs to the instance,
    // not to each call. That property is what this test exists for; only the number moved.
    await vi.waitFor(() => expect(started).toEqual(['Slide 2.', 'Slide 3.', 'Slide 4.']));
    expect(started).toHaveLength(3);

    mock.resolve('Slide 2.');
    await vi.waitFor(() => expect(started).toContain('Slide 5.'));
    expect(started).toHaveLength(4);

    mock.resolve('Slide 3.');
    await vi.waitFor(() => expect(started).toContain('Slide 6.'));
    mock.resolve('Slide 4.');
    mock.resolve('Slide 5.');
    mock.resolve('Slide 6.');
    await vi.waitFor(() => expect(started).toEqual(['Slide 2.', 'Slide 3.', 'Slide 4.', 'Slide 5.', 'Slide 6.']));
  });

  it("stops firing FURTHER requests once its signal aborts, but doesn't cancel one already in flight", async () => {
    const model = createVoiceModel({});
    const started: string[] = [];
    const mock = abortAwareMockRung((t) => started.push(t), 'openrouter-tts');
    model.__setRung(mock.rung);
    const ctl = new AbortController();

    // Four items against a cap of 3: the first three start, the fourth is queued — which
    // is exactly the state an abort must be able to cancel.
    model.warm(['One.', 'Two.', 'Three.', 'Four.'], { signal: ctl.signal });
    await vi.waitFor(() => expect(started).toEqual(['One.', 'Two.', 'Three.']));

    ctl.abort();
    mock.resolve('One.'); // frees a slot the queued 'Four.' would otherwise take
    await new Promise((r) => setTimeout(r, 20)); // let any (incorrect) refill happen
    expect(started).toEqual(['One.', 'Two.', 'Three.']); // 'Four.' never started — the pump stopped once aborted
    mock.resolve('Two.');
    mock.resolve('Three.');
  });

  it("a joiner's own in-flight request is unaffected when a DIFFERENT caller's warm() signal aborts", async () => {
    // If warm() tore down the SHARED inFlightSynths entry on its own signal's abort, a
    // different still-live caller (synthOne, another warm()) that joined the same key
    // would be handed a false failure it never asked for.
    const model = createVoiceModel({});
    const calls: string[] = [];
    const mock = abortAwareMockRung((t) => calls.push(t), 'openrouter-tts');
    model.__setRung(mock.rung);
    const ctlA = new AbortController();

    model.warm(['Shared sentence.'], { signal: ctlA.signal }); // caller A fires the real request
    await vi.waitFor(() => expect(calls).toEqual(['Shared sentence.']));

    const bytesP = model.synthOne({ text: 'Shared sentence.' }); // caller B joins A's in-flight entry
    await new Promise((r) => setTimeout(r, 10));

    ctlA.abort(); // A walks away — must NOT cancel B's shared request
    mock.resolve('Shared sentence.');
    const res = await bytesP; // resolves cleanly — B still got its bytes
    expect(res.bytes).toBeTruthy();
    expect(calls).toEqual(['Shared sentence.']); // still just the one real call
  });

  it('joins an in-flight synthOne synth for the same sentence instead of firing a duplicate prefetch request', async () => {
    const model = createVoiceModel({});
    const calls: string[] = [];
    const mock = abortAwareMockRung((t) => calls.push(t), 'openrouter-tts');
    model.__setRung(mock.rung);

    const bytesP = model.synthOne({ text: 'Shared sentence.' });
    await vi.waitFor(() => expect(calls).toEqual(['Shared sentence.']));

    model.warm(['Shared sentence.']); // must join synthOne's in-flight request, not fire a second one
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual(['Shared sentence.']);

    mock.resolve('Shared sentence.');
    await bytesP;
  });

  it("a later synthOne joins warm()'s in-flight prefetch for the same sentence rather than firing a duplicate request", async () => {
    const model = createVoiceModel({});
    const calls: string[] = [];
    const mock = abortAwareMockRung((t) => calls.push(t), 'openrouter-tts');
    model.__setRung(mock.rung);

    model.warm(['Upcoming sentence.']);
    await vi.waitFor(() => expect(calls).toEqual(['Upcoming sentence.']));

    const bytesP = model.synthOne({ text: 'Upcoming sentence.' });
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual(['Upcoming sentence.']); // still one call — synthOne joined warm()'s in-flight promise

    mock.resolve('Upcoming sentence.');
    await bytesP;
  });

  it('is a no-op for an empty sentence list', async () => {
    const model = createVoiceModel({});
    const calls: string[] = [];
    model.__setRung({
      name: 'openrouter-tts',
      ready: () => true,
      synth: async ({ text }: { text: string }) => {
        calls.push(text);
        return { size: 8, arrayBuffer: async () => new ArrayBuffer(8) };
      },
    });
    model.warm([]);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual([]);
  });
});

describe('openrouter synth: PCM-only model quirk (Gemini 400s on mp3, only returns raw PCM)', () => {
  it('requests response_format:"pcm" for the one model that needs it, and mp3 for everything else', async () => {
    const requests: Array<{ response_format?: string }> = [];
    const fetchImpl = async (_url: string, opts: { body: string }) => {
      const body = JSON.parse(opts.body);
      requests.push(body);
      if (body.response_format === 'pcm') {
        return {
          ok: true,
          status: 200,
          headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'audio/pcm;rate=24000;channels=1' : null) },
          arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
        };
      }
      return { ok: true, status: 200, blob: async () => ({ size: 256, type: 'audio/mpeg', arrayBuffer: async () => new ArrayBuffer(256) }) };
    };
    const model = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl });

    model.setOrModel('google/gemini-3.1-flash-tts-preview');
    await model.synthOne({ text: 'Gemini line.' });
    expect(requests[0].response_format).toBe('pcm');

    model.setOrModel('x-ai/grok-voice-tts-1.0');
    await model.synthOne({ text: 'Grok line.' });
    expect(requests[1].response_format).toBe('mp3');
  });

  /** A PCM response of `samples` 16-bit samples at `rate`, as the Gemini route answers. */
  const pcmResponse = (samples: number, rate = 24000) => async () => ({
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? `audio/pcm;rate=${rate};channels=1` : null) },
    arrayBuffer: async () => {
      const pcm = new Int16Array(samples);
      for (let i = 0; i < samples; i++) pcm[i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 12000);
      return pcm.buffer;
    },
  });

  it('wraps the PCM response in a WAV blob and does NOT compress it on the live path', async () => {
    // Gemini is the one cloud model that answers in raw PCM. An earlier version encoded it to
    // mp3 right here — on the main thread, on the path a live read uses — which is exactly the
    // jank the Kokoro worker exists to avoid, and lamejs's missing gapless header added 56–70 ms
    // of silence to the front of every sentence. Compression is an EXPORT concern now; playback
    // gets exactly what the voice produced.
    const model = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl: pcmResponse(2) });
    model.setOrModel('google/gemini-3.1-flash-tts-preview');

    const res = await model.synthOne({ text: 'Gemini line.' });
    expect(res.bytes?.type).toBe('audio/wav');
    expect(res.bytes?.size).toBe(44 + 4); // 44-byte header + 2 samples
    expect((await res.bytes!.arrayBuffer()).byteLength).toBe(44 + 4);
  });
});

describe('listOpenRouterVoiceModels (the public, unauthenticated TTS catalog)', () => {
  it('maps the catalog to {id,name,promptPerM,completionPerM,voices}', async () => {
    vi.resetModules();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: 'hexgrad/kokoro-82m', name: 'Kokoro 82M', pricing: { prompt: '0.00000062', completion: '0' }, supported_voices: ['af_heart', 'af_bella'] },
          { id: 'openai/tts-1' }, // no name/pricing/voices at all — every field degrades gracefully
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchImpl);
    try {
      const fresh = await import('./voice-model.js');
      const models = await fresh.listOpenRouterVoiceModels();
      expect(models).toEqual([
        { id: 'hexgrad/kokoro-82m', name: 'Kokoro 82M', promptPerM: 0.62, completionPerM: 0, voices: ['af_heart', 'af_bella'] },
        { id: 'openai/tts-1', name: 'openai/tts-1', promptPerM: null, completionPerM: null, voices: [] }, // falls back to id when name is absent
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('never throws — resolves [] on a network failure or a non-ok response', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    try {
      const fresh = await import('./voice-model.js');
      await expect(fresh.listOpenRouterVoiceModels()).resolves.toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('stop/pause/resume — speechSynthesis-only (playback of every other rung is the caller\'s)', () => {
  it('drive only the speechSynthesis API and never throw', () => {
    const seen: string[] = [];
    (window as unknown as { speechSynthesis: unknown }).speechSynthesis = {
      speak() {}, cancel() { seen.push('cancel'); }, pause() { seen.push('pause'); }, resume() { seen.push('resume'); },
    };
    try {
      const model = createVoiceModel({});
      model.pause();
      model.resume();
      model.stop();
      expect(seen).toEqual(['pause', 'resume', 'cancel']);
    } finally {
      delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    }
  });

  it('are safe no-ops where speechSynthesis is absent', () => {
    const model = createVoiceModel({});
    expect(() => { model.pause(); model.resume(); model.stop(); }).not.toThrow();
  });
});

describe('allowBrowserVoice opt-in (production ban escape hatch)', () => {
  it('is off by default — the banned browser voice stays disallowed', () => {
    expect(createVoiceModel({}).availability().speechAllowed).toBe(false);
  });

  it('opts the caller into the browser voice without touching global dev flags', () => {
    expect(createVoiceModel({ allowBrowserVoice: true }).availability().speechAllowed).toBe(true);
  });

  it('with the opt-in, the auto ladder falls to speechSynthesis when nothing else is ready', () => {
    // No OpenRouter key, no Kokoro — only the (now-allowed) browser voice remains.
    (window as unknown as { speechSynthesis: unknown }).speechSynthesis = { speak() {}, cancel() {}, pause() {}, resume() {} };
    try {
      expect(createVoiceModel({ allowBrowserVoice: true }).rung()).toBe('speechSynthesis');
      expect(createVoiceModel({}).rung()).toBe('silent');
    } finally {
      delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    }
  });
});

describe('listOpenRouterVoiceCatalog — silence is not an empty answer', () => {
  // The distinction has to be made HERE, because here is the only place that knows why the
  // array is empty. A rejected fetch, a 503 and a malformed body all used to collapse into the
  // same bare `[]` a live-but-empty catalog returns, and the export panel — which has to
  // EXPLAIN the emptiness next to a spend button — then told authors their model had published
  // no voices and no price when their laptop simply had no network. Nothing downstream can
  // recover a distinction that was erased upstream.
  // `vi.stubGlobal` + `resetModules` so each case gets a FRESH module instance: the catalog
  // promise is memoized for the session by design, so a second case would otherwise replay the
  // first one's answer.
  const withFetch = async (impl: unknown) => {
    vi.stubGlobal('fetch', impl);
    vi.resetModules();
    return await import('./voice-model.js');
  };
  afterEach(() => vi.unstubAllGlobals());

  it('reports UNREACHABLE when the fetch rejects (offline, DNS, a blocked CORS preflight)', async () => {
    const m = await withFetch(async () => { throw new TypeError('Failed to fetch'); });
    expect(await m.listOpenRouterVoiceCatalog()).toEqual({ models: [], reachable: false });
  });

  it('reports UNREACHABLE on a non-OK status (503, rate limit)', async () => {
    const m = await withFetch(async () => ({ ok: false, status: 503 }));
    expect(await m.listOpenRouterVoiceCatalog()).toEqual({ models: [], reachable: false });
  });

  it('reports REACHABLE for a live answer that genuinely lists nothing', async () => {
    // The case that must NOT be explained away as a network problem.
    const m = await withFetch(async () => ({ ok: true, json: async () => ({ data: [] }) }));
    expect(await m.listOpenRouterVoiceCatalog()).toEqual({ models: [], reachable: true });
  });

  it('keeps the array-only export on its old contract — never throws, [] on any failure', async () => {
    const m = await withFetch(async () => { throw new TypeError('Failed to fetch'); });
    await expect(m.listOpenRouterVoiceModels()).resolves.toEqual([]);
  });
});
