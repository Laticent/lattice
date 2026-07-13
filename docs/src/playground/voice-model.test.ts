// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
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

  it("is a no-op for the kokoro rung — this prefetch only hides NETWORK latency (openrouter-tts); Kokoro's synthesis shares ONE compute resource (its worker), so prefetching there would compete for it instead of hiding anything (Munger-inversion finding)", async () => {
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
    expect(calls).toEqual([]);
  });

  it('caps concurrent prefetch requests at WARM_CONCURRENCY (1)', async () => {
    const model = createVoiceModel({});
    const started: string[] = [];
    const mock = abortAwareMockRung((t) => started.push(t), 'openrouter-tts');
    model.__setRung(mock.rung);

    model.warm(['One.', 'Two.', 'Three.']);
    await vi.waitFor(() => expect(started).toEqual(['One.']));
    expect(started).not.toContain('Two.'); // capped at 1 — nothing has resolved yet

    mock.resolve('One.');
    await vi.waitFor(() => expect(started).toContain('Two.'));
    expect(started).not.toContain('Three.');

    mock.resolve('Two.');
    await vi.waitFor(() => expect(started).toContain('Three.'));
    mock.resolve('Three.');
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
    await vi.waitFor(() => expect(started).toEqual(['Slide 2.']));
    expect(started).toHaveLength(1); // only ONE real request in flight, across all 5 calls

    mock.resolve('Slide 2.');
    await vi.waitFor(() => expect(started).toContain('Slide 3.'));
    expect(started).toHaveLength(2);

    mock.resolve('Slide 3.');
    await vi.waitFor(() => expect(started).toContain('Slide 4.'));
    mock.resolve('Slide 4.');
    await vi.waitFor(() => expect(started).toContain('Slide 5.'));
    mock.resolve('Slide 5.');
    await vi.waitFor(() => expect(started).toContain('Slide 6.'));
    mock.resolve('Slide 6.');
    await vi.waitFor(() => expect(started).toEqual(['Slide 2.', 'Slide 3.', 'Slide 4.', 'Slide 5.', 'Slide 6.']));
  });

  it("stops firing FURTHER requests once its signal aborts, but doesn't cancel one already in flight", async () => {
    const model = createVoiceModel({});
    const started: string[] = [];
    const mock = abortAwareMockRung((t) => started.push(t), 'openrouter-tts');
    model.__setRung(mock.rung);
    const ctl = new AbortController();

    model.warm(['One.', 'Two.', 'Three.'], { signal: ctl.signal });
    await vi.waitFor(() => expect(started).toEqual(['One.']));

    ctl.abort();
    mock.resolve('One.'); // frees the one active slot
    await new Promise((r) => setTimeout(r, 20)); // let any (incorrect) refill happen
    expect(started).toEqual(['One.']); // 'Two.' never started — pump() stopped once aborted
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

  it('wraps the PCM response in a 44-byte-header WAV blob, reading sample rate/channels off Content-Type', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'audio/pcm;rate=24000;channels=1' : null) },
      arrayBuffer: async () => new Uint8Array([10, 20, 30, 40]).buffer,
    });
    const model = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl });
    model.setOrModel('google/gemini-3.1-flash-tts-preview');

    const res = await model.synthOne({ text: 'Gemini line.' });
    // The wrapped WAV is 44 header bytes + the 4 raw PCM bytes, tagged audio/wav — the
    // exact blob-like the caller (Suono) will decode + play.
    expect(res.bytes?.type).toBe('audio/wav');
    expect(res.bytes?.size).toBe(44 + 4);
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
