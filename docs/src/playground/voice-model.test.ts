// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { splitSentences as cadenzaSplit } from '@/lib/cadenza';
import { createVoiceModel, splitSentences as voiceSplit } from './voice-model.js';

// A minimal fake WebAudio context: enough for playBlob to decode, start, fire
// onended, and expose a monotonic currentTime. Real audio timing is device-verified;
// this proves the INSTRUMENTATION WIRING (speak → playBlob → onSentenceTiming) only.
class FakeAudioContext {
  state = 'running';
  _t = 0;
  destination = {};
  get currentTime() {
    return this._t;
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
  createBuffer() {
    return {};
  }
  // Records the gain automation playBlob schedules, so a test can assert the
  // anti-click head/tail fade envelope (see "clip fade" test below).
  gainEvents: Array<{ kind: string; value: number; time: number }> = [];
  createGain() {
    const events = this.gainEvents;
    return {
      gain: {
        setValueAtTime(value: number, time: number) {
          events.push({ kind: 'set', value, time });
        },
        linearRampToValueAtTime(value: number, time: number) {
          events.push({ kind: 'ramp', value, time });
        },
      },
      connect() {},
    };
  }
  decodeAudioData(ab: ArrayBuffer, ok: (buf: { duration: number }) => void, err?: (e: unknown) => void) {
    // Mirrors a REAL browser's decodeAudioData: it DETACHES the ArrayBuffer it's
    // given (byteLength drops to 0) as a side effect of decoding. A caller that
    // hands back the SAME ArrayBuffer instance on a replay (a cached blob-like
    // object whose `arrayBuffer()` doesn't return a fresh copy) fails on the
    // second play with exactly the real error this simulates — a bug the OLD,
    // no-op fake here couldn't catch (see the PCM-wrap replay test below).
    if (ab.byteLength === 0) {
      err?.(new Error('Cannot decode detached ArrayBuffer'));
      return;
    }
    try {
      structuredClone(ab, { transfer: [ab] });
    } catch {
      /* structuredClone transfer unsupported in this environment — skip simulating detachment */
    }
    ok({ duration: 0.5 }); // every clip "lasts" 500ms
  }
  createBufferSource() {
    const self = this;
    const node: { buffer: unknown; onended: (() => void) | null; connect(): void; stop(): void; start(): void } = {
      buffer: null,
      onended: null,
      connect() {},
      stop() {},
      // Onset is read right after start(); the clip "ends" a tick later, advancing
      // the clock so the NEXT sentence's onset is later (monotonic).
      start() {
        setTimeout(() => {
          self._t += 0.5;
          node.onended?.();
        }, 0);
      },
    };
    return node;
  }
}

// A rung returning a minimal blob-like with arrayBuffer() — playBlob only reads that.
function fakeRung() {
  return {
    name: 'mock',
    ready: () => true,
    synth: async () => ({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) }),
  };
}

beforeEach(() => {
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext = FakeAudioContext;
});

describe('voice-model instrumentation (additive)', () => {
  it('forwards measured onset/duration + the sentence index to onSentenceTiming', async () => {
    const model = createVoiceModel({});
    model.__setRung(fakeRung());

    const onSentence = vi.fn();
    const onSentenceTiming = vi.fn();
    await model.speak({ text: 'One sentence. Two sentence.', onSentence, onSentenceTiming });

    // Backward-compatible callback still fires with plain strings.
    expect(onSentence).toHaveBeenCalledWith('One sentence.');
    expect(onSentence).toHaveBeenCalledWith('Two sentence.');

    // The new callback carries index + text + the measured span, monotonic in onset.
    expect(onSentenceTiming).toHaveBeenCalledTimes(2);
    expect(onSentenceTiming).toHaveBeenNthCalledWith(1, {
      index: 0,
      text: 'One sentence.',
      onsetMs: 0,
      durationMs: 500,
    });
    expect(onSentenceTiming).toHaveBeenNthCalledWith(2, {
      index: 1,
      text: 'Two sentence.',
      onsetMs: 500,
      durationMs: 500,
    });
  });

  it('does not require onSentenceTiming — omitting it changes nothing (additive)', async () => {
    const model = createVoiceModel({});
    model.__setRung(fakeRung());
    const onSentence = vi.fn();
    await expect(model.speak({ text: 'Just one.', onSentence })).resolves.toBeUndefined();
    expect(onSentence).toHaveBeenCalledWith('Just one.');
  });

  it('speaks caller-supplied `sentences` verbatim instead of its own split', async () => {
    const model = createVoiceModel({});
    model.__setRung(fakeRung());
    const onSentenceTiming = vi.fn();
    // `text` would split into ONE sentence ("$4.2M this."); the explicit boundaries win.
    await model.speak({ text: '$4.2M this.', sentences: ['$4.2M', 'this.'], onSentenceTiming });
    expect(onSentenceTiming).toHaveBeenCalledTimes(2);
    expect(onSentenceTiming.mock.calls[0][0]).toMatchObject({ index: 0, text: '$4.2M' });
    expect(onSentenceTiming.mock.calls[1][0]).toMatchObject({ index: 1, text: 'this.' });
  });

  it('forwards a synth failure reason through onState.error (no more silent swallow)', async () => {
    const model = createVoiceModel({});
    model.__setRung({
      name: 'mock',
      ready: () => true,
      synth: async () => {
        throw new Error('OpenRouter TTS error 402: insufficient credits');
      },
    });
    const states: Array<{ error?: string }> = [];
    await model.speak({ text: 'Hello there.', onState: (s: { error?: string }) => states.push(s) });
    const errState = states.find((s) => s?.error);
    expect(errState).toBeTruthy();
    expect(errState?.error).toContain('402');
  });

  it('audioTimeMs() reports the owned clock (0 before any audio)', async () => {
    const model = createVoiceModel({});
    expect(model.audioTimeMs()).toBe(0);
    model.__setRung(fakeRung());
    await model.speak({ text: 'One. Two.' });
    expect(model.audioTimeMs()).toBeGreaterThan(0);
  });
});

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
  it('defaults to 1, round-trips, and a speak() call forwards the effective speed to the rung', async () => {
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
    await model.speak({ text: 'One.' });
    expect(seen).toEqual([1.25]); // no explicit per-call speed → falls to the persisted pref
    await model.speak({ text: 'Two.', speed: 0.9 });
    expect(seen).toEqual([1.25, 0.9]); // an explicit per-call speed wins over the pref
  });
});

describe('audio cache (replay reuses synthesized audio; voice/model/speed changes invalidate it)', () => {
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
    await model.speak({ text: 'Same sentence.' });
    await model.speak({ text: 'Same sentence.' });
    expect(calls).toEqual(['Same sentence.']); // the second speak() replayed the cached blob
  });

  it('an explicit voice change forces a fresh synth even for the same text/speed', async () => {
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
    await model.speak({ text: 'Hi.', voice: 'voice-a' });
    await model.speak({ text: 'Hi.', voice: 'voice-a' }); // same voice → cache hit
    expect(calls).toEqual(['Hi.']);
    await model.speak({ text: 'Hi.', voice: 'voice-b' }); // different voice → must NOT reuse voice-a's audio
    expect(calls).toEqual(['Hi.', 'Hi.']);
  });

  it('an OpenRouter MODEL change forces a fresh synth even for the same text/voice/speed', async () => {
    // OpenRouter serves multiple TTS models through one rung — the model id
    // must be part of the cache key too, not just voice, or switching models
    // would silently replay the PREVIOUS model's audio.
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
    await model.speak({ text: 'Hi.' });
    await model.speak({ text: 'Hi.' }); // same model (+ default voice/speed) → cache hit
    expect(calls).toEqual(['Hi.']);
    model.setOrModel('model-b');
    await model.speak({ text: 'Hi.' }); // different model → must NOT reuse model-a's audio
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
    await model.speak({ text: 'Hi.', speed: 1.25 });
    await model.speak({ text: 'Hi.', speed: 1.25 }); // same speed → cache hit
    expect(calls).toEqual(['Hi.']);
    await model.speak({ text: 'Hi.', speed: 0.9 }); // different speed → must NOT reuse the 1.25x audio
    expect(calls).toEqual(['Hi.', 'Hi.']);
  });

  it('previewVoice reuses a cached sample for the same rung/voice/speed instead of re-fetching', async () => {
    let fetchCalls = 0;
    const model = createVoiceModel({
      getOpenRouterKey: () => 'sk-test',
      fetchImpl: async () => {
        fetchCalls++;
        return { ok: true, status: 200, blob: async () => ({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) }) };
      },
    });
    expect((await model.previewVoice({ rung: 'openrouter' })).ok).toBe(true);
    expect((await model.previewVoice({ rung: 'openrouter' })).ok).toBe(true);
    expect(fetchCalls).toBe(1); // the second preview replayed the cached sample, no re-fetch
  });

  it('previewVoice: a different voice forces a fresh fetch', async () => {
    let fetchCalls = 0;
    const model = createVoiceModel({
      getOpenRouterKey: () => 'sk-test',
      fetchImpl: async () => {
        fetchCalls++;
        return { ok: true, status: 200, blob: async () => ({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) }) };
      },
    });
    await model.previewVoice({ rung: 'openrouter', voice: 'voice-a' });
    await model.previewVoice({ rung: 'openrouter', voice: 'voice-b' });
    expect(fetchCalls).toBe(2);
  });

  // Bug fix (2026-07-09-studio-cloud-ondevice-config-split.md's "model-row-preview"
  // follow-up): the Workspace model picker's ▶ row-preview button passes the id of
  // the model being AUDITIONED, which may not be the currently ACTIVE model at all.
  // Before this fix, previewVoice's live fallback ignored that id entirely and
  // always synthesized through the persisted active model instead — clicking ▶ on
  // an unselected, uncached row silently played the WRONG model's voice.
  describe("previewVoice — a `model` override previews that model, not the persisted active one", () => {
    it("uses the override model in the live request, even though a DIFFERENT model is active", async () => {
      const requests: Array<{ model?: string }> = [];
      const model = createVoiceModel({
        getOpenRouterKey: () => 'sk-test',
        fetchImpl: async (_url: string, opts: { body: string }) => {
          const body = JSON.parse(opts.body);
          requests.push(body);
          return { ok: true, status: 200, blob: async () => ({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) }) };
        },
      });
      model.setOrModel('the-currently-active-model'); // simulates a different model already selected
      await model.previewVoice({ rung: 'openrouter', model: 'the-row-being-previewed', voice: 'v' });
      expect(requests[0].model).toBe('the-row-being-previewed');
    });

    it('falls back to the persisted active model when no override is given (backward compatible — "Play sample" always passes its own active model explicitly)', async () => {
      const requests: Array<{ model?: string }> = [];
      const model = createVoiceModel({
        getOpenRouterKey: () => 'sk-test',
        fetchImpl: async (_url: string, opts: { body: string }) => {
          requests.push(JSON.parse(opts.body));
          return { ok: true, status: 200, blob: async () => ({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) }) };
        },
      });
      model.setOrModel('the-only-active-model');
      await model.previewVoice({ rung: 'openrouter', voice: 'v' }); // no `model` field at all
      expect(requests[0].model).toBe('the-only-active-model');
    });

    it("a model override forces a fresh fetch — doesn't collide with a differently-modeled cache entry", async () => {
      let fetchCalls = 0;
      const model = createVoiceModel({
        getOpenRouterKey: () => 'sk-test',
        fetchImpl: async () => {
          fetchCalls++;
          return { ok: true, status: 200, blob: async () => ({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) }) };
        },
      });
      await model.previewVoice({ rung: 'openrouter', model: 'model-a', voice: 'same-voice' });
      await model.previewVoice({ rung: 'openrouter', model: 'model-b', voice: 'same-voice' });
      expect(fetchCalls).toBe(2); // same voice/speed/text, different model → NOT a cache hit
    });
  });

  it("does not freeze the cache key on a falsy voice ('') — mirrors the real rung's `||` fallback, not `??` (independent-checker + Munger-inversion finding)", async () => {
    // `'' ?? orVoice()` would stay `''` forever (nullish coalescing only
    // falls through on null/undefined); `'' || orVoice()` correctly falls
    // through to the LIVE preference, matching what the real rung actually
    // synthesizes. A `??` mirror here would let a voice-preference CHANGE
    // silently hit a stale cache entry recorded under the frozen `''` key.
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
    await model.speak({ text: 'Hi.', voice: '' });
    model.setOrVoice('voice-b'); // the user changes their voice preference
    await model.speak({ text: 'Hi.', voice: '' }); // must NOT replay voice-a's cached audio
    expect(calls).toEqual(['Hi.', 'Hi.']);
  });
});

// Abort-aware mock: rejects the moment its signal aborts, exactly like the
// real openRouterRung (fetch) / kokoroRung (worker) do — a mock that ignores
// abort would make a stop()-mid-synth test hang for the real 20s internal
// timeout instead of resolving promptly.
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

describe('concurrent synth scheduling (fire-ahead, not one-ahead)', () => {
  it('keeps up to SYNTH_CONCURRENCY (3) sentences synthesizing at once, independent of playback progress', async () => {
    const model = createVoiceModel({});
    const started: string[] = [];
    const mock = abortAwareMockRung((t) => started.push(t));
    model.__setRung(mock.rung);

    const speakP = model.speak({ text: 'One. Two. Three. Four. Five.' });

    await vi.waitFor(() => expect(started).toEqual(['One.', 'Two.', 'Three.']));
    // The 4th/5th sentences must NOT have started yet — the cap is 3, and
    // nothing has resolved to free a slot.
    expect(started).not.toContain('Four.');

    // Resolving the FIRST sentence's synth frees a slot for the FOURTH to
    // start — even though nothing has PLAYED yet (Two./Three. are still
    // mid-synth) — proving synth concurrency is gated by the cap, not by how
    // far playback has gotten.
    mock.resolve('One.');
    await vi.waitFor(() => expect(started).toContain('Four.'));
    expect(started).not.toContain('Five.'); // still capped at 3 in flight

    mock.resolve('Two.');
    mock.resolve('Three.');
    mock.resolve('Four.');
    await vi.waitFor(() => expect(started).toContain('Five.'));
    mock.resolve('Five.');

    await speakP;
    expect(started).toEqual(['One.', 'Two.', 'Three.', 'Four.', 'Five.']);
  });

  it("plays sentences in original order even when a later one's synth resolves first", async () => {
    const model = createVoiceModel({});
    const started: string[] = [];
    const played: string[] = [];
    const mock = abortAwareMockRung((t) => started.push(t));
    model.__setRung(mock.rung);

    const speakP = model.speak({ text: 'One. Two. Three.', onSentence: (s: string) => played.push(s) });

    // All 3 fit under the cap (3), so all 3 fire immediately.
    await vi.waitFor(() => expect(started).toEqual(['One.', 'Two.', 'Three.']));

    // Resolve OUT OF ORDER — last sentence first.
    mock.resolve('Three.');
    mock.resolve('Two.');
    mock.resolve('One.');

    await speakP;
    // Despite resolving out of order, playback (and onSentence) still fires
    // in the ORIGINAL sentence order — the schedule never reorders playback.
    expect(played).toEqual(['One.', 'Two.', 'Three.']);
  });

  it('stop() prevents any not-yet-started sentence from ever synthesizing', async () => {
    const model = createVoiceModel({});
    const started: string[] = [];
    const mock = abortAwareMockRung((t) => started.push(t));
    model.__setRung(mock.rung);

    const speakP = model.speak({ text: 'One. Two. Three. Four. Five.' });
    await vi.waitFor(() => expect(started).toEqual(['One.', 'Two.', 'Three.']));

    model.stop();
    await speakP;

    // Four./Five. must never have started once stopped — no wasted synth
    // requests for sentences that will never play.
    expect(started).toEqual(['One.', 'Two.', 'Three.']);
  });

  it('pause() halts NEW background synthesis; resume() lets scheduling continue (red-team + Munger-inversion finding)', async () => {
    // Without this gate, every already-in-flight request completing just
    // refilled the next queued sentence regardless of pause state — a
    // single pause-to-think could silently synthesize the ENTIRE REST of
    // the deck in the background (unbounded, not just "a few extra" —
    // real cost on a BYO OpenRouter key).
    const model = createVoiceModel({});
    const started: string[] = [];
    const mock = abortAwareMockRung((t) => started.push(t));
    model.__setRung(mock.rung);

    const speakP = model.speak({ text: 'One. Two. Three. Four. Five. Six. Seven.' });
    await vi.waitFor(() => expect(started).toEqual(['One.', 'Two.', 'Three.']));

    model.pause();
    // Resolving the in-flight batch WHILE PAUSED must not trigger any new
    // sentence to start synthesizing.
    mock.resolve('One.');
    mock.resolve('Two.');
    mock.resolve('Three.');
    await new Promise((r) => setTimeout(r, 20)); // let any (incorrect) refill happen
    expect(started).toEqual(['One.', 'Two.', 'Three.']);

    model.resume();
    await vi.waitFor(() => expect(started).toContain('Four.'));

    // Drain the rest so speak() resolves cleanly.
    mock.resolve('Four.');
    await vi.waitFor(() => expect(started).toContain('Five.'));
    mock.resolve('Five.');
    await vi.waitFor(() => expect(started).toContain('Six.'));
    mock.resolve('Six.');
    await vi.waitFor(() => expect(started).toContain('Seven.'));
    mock.resolve('Seven.');

    await speakP;
    expect(started).toEqual(['One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.', 'Seven.']);
  });

  it('joins an in-flight request for an identical (rung, voice, speed, text) sentence scheduled in the same batch — one real synth call, both occurrences still get audio', async () => {
    // The previously-logged, non-blocking gap: two identical sentences
    // scheduled together used to both miss `audioCache` (only populated once
    // a request RESOLVES) and fire independent real requests. Fixed via
    // `inFlightSynths` joining.
    const model = createVoiceModel({});
    const calls: string[] = [];
    const played: string[] = [];
    const mock = abortAwareMockRung((t) => calls.push(t));
    model.__setRung(mock.rung);

    const speakP = model.speak({ text: 'Same phrase. Same phrase. Different.', onSentence: (s: string) => played.push(s) });
    await vi.waitFor(() => expect(calls).toEqual(['Same phrase.', 'Different.']));

    mock.resolve('Same phrase.');
    mock.resolve('Different.');
    await speakP;

    // Both occurrences of the duplicate sentence still play, in order —
    // deduping the SYNTH REQUEST never means dropping the SECOND playback.
    expect(played).toEqual(['Same phrase.', 'Same phrase.', 'Different.']);
  });

  it("a barge-in (stop() then immediately re-request the SAME text) does not join the stopped call's stale in-flight entry", async () => {
    // Guards the subtlety inFlightSynths's own comment calls out: stop()
    // aborts synchronously, but the aborted promise's cleanup only runs on a
    // later microtask — a naive "just check the map" join could hand the new
    // call a promise that's about to resolve to null.
    const model = createVoiceModel({});
    const calls: string[] = [];
    const mock = abortAwareMockRung((t) => calls.push(t));
    model.__setRung(mock.rung);

    const firstSpeakP = model.speak({ text: 'Hello.' });
    await vi.waitFor(() => expect(calls).toEqual(['Hello.']));

    // speak() calls stop() on itself first thing, aborting the first call —
    // the second call must fire its OWN fresh request, not join the first's
    // now-doomed in-flight promise.
    const secondSpeakP = model.speak({ text: 'Hello.' });
    await vi.waitFor(() => expect(calls).toEqual(['Hello.', 'Hello.']));

    mock.resolve('Hello.'); // resolves the second (still-live) request
    await Promise.allSettled([firstSpeakP, secondSpeakP]);
  });
});

describe('warm() — background prefetch across a slide boundary (autoplay warm-ahead)', () => {
  it('populates the cache so a later speak() for the same sentence does not re-synth', async () => {
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
    await model.speak({ text: 'Next slide sentence.' });
    expect(calls).toEqual(['Next slide sentence.']); // speak() replayed the warmed cache entry, no second synth
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

  it("is a no-op for the kokoro rung — this prefetch only hides NETWORK latency (openrouter-tts); Kokoro's synthesis shares ONE compute resource (its worker) with the CURRENT slide's own still-running speak() scheduler, so prefetching there would compete for it instead of hiding anything (Munger-inversion finding)", async () => {
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

  it('caps concurrent prefetch requests at WARM_CONCURRENCY (1) — a SEPARATE, smaller budget than speak()\'s SYNTH_CONCURRENCY (3)', async () => {
    // warm() runs WHILE the current slide's own speak() scheduler may still have
    // up to 3 requests of its own in flight (that's the point — prefetch during
    // the current slide's playback) — sharing one counter with speak() would let
    // a single autoplay transition burst to 3 + 3 = 6 simultaneous requests,
    // quietly doubling the "not a burst attack on the API" ceiling (independent-
    // checker finding). warm() gets its own, much smaller cap instead.
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
    // WARM_CONCURRENCY must be a budget for the whole voice-model instance,
    // not a fresh per-call allowance — Present's autoplay effect re-fires
    // warm() on every `clamped` change while autoplay is on, which includes
    // a presenter manually clicking Next/Prev a few times in a row, not just
    // autoplay's own advances. Before this fix, each of N such calls fired
    // its own request immediately regardless of how many earlier calls were
    // still in flight — N rapid navigation steps meant N concurrent real,
    // billed requests with no cap at all.
    const model = createVoiceModel({});
    const started: string[] = [];
    const mock = abortAwareMockRung((t) => started.push(t), 'openrouter-tts');
    model.__setRung(mock.rung);

    // Five SEPARATE warm() calls (distinct text — no cache-key collision to
    // hide behind), simulating five rapid navigation steps.
    model.warm(['Slide 2.']);
    model.warm(['Slide 3.']);
    model.warm(['Slide 4.']);
    model.warm(['Slide 5.']);
    model.warm(['Slide 6.']);
    await vi.waitFor(() => expect(started).toEqual(['Slide 2.']));
    expect(started).toHaveLength(1); // only ONE real request in flight, across all 5 calls

    // Resolve one at a time — with the cap at 1, each next request only
    // starts once the previous one actually resolves (a synchronous burst of
    // resolves would race ahead of dispatch, same pitfall as the sibling
    // SYNTH_CONCURRENCY tests' resolve ordering).
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

  it("does not spike combined concurrency: warm()'s 1 runs ALONGSIDE speak()'s own 3 in-flight requests, not sharing the cap", async () => {
    const model = createVoiceModel({});
    const started: string[] = [];
    const mock = abortAwareMockRung((t) => started.push(t), 'openrouter-tts');
    model.__setRung(mock.rung);

    // The current slide's own scheduler: 3 in flight, capped at SYNTH_CONCURRENCY.
    const speakP = model.speak({ text: 'A. B. C. D.' });
    await vi.waitFor(() => expect(started).toEqual(['A.', 'B.', 'C.']));

    // warm() for the NEXT slide fires concurrently — its own request lands
    // immediately despite speak()'s 3 already being live (different text, so
    // no cache-key collision; this proves the two schedulers don't share one
    // counter — if they did, warm()'s request would queue behind speak()'s
    // already-full cap instead of firing right away).
    model.warm(['Next slide sentence.']);
    expect(started).toContain('Next slide sentence.');
    mock.resolve('Next slide sentence.');

    // Drain speak()'s own scheduler to completion — 'D.' only fires once a
    // slot frees (a microtask after resolving 'A.'), so it must be waited for
    // before it can be resolved, same as the sibling SYNTH_CONCURRENCY test.
    mock.resolve('A.');
    await vi.waitFor(() => expect(started).toContain('D.'));
    mock.resolve('B.');
    mock.resolve('C.');
    mock.resolve('D.');
    await speakP;
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
    // The subtlety this design deliberately avoids: if warm() tore down the
    // SHARED inFlightSynths entry on its own signal's abort, a different
    // still-live caller (another warm(), or speak()) that joined the same key
    // would be handed a false failure it never asked for.
    const model = createVoiceModel({});
    const calls: string[] = [];
    const mock = abortAwareMockRung((t) => calls.push(t), 'openrouter-tts');
    model.__setRung(mock.rung);
    const ctlA = new AbortController();

    model.warm(['Shared sentence.'], { signal: ctlA.signal }); // caller A fires the real request
    await vi.waitFor(() => expect(calls).toEqual(['Shared sentence.']));

    // onSentenceTiming only fires once playBlob actually decodes + starts real
    // audio (FakeAudioContext, wired file-wide in this test's beforeEach) — a
    // silently-dropped null blob (the bug this test guards against: A's abort
    // wrongly tearing down the SHARED request) resolves speakP just as
    // cleanly but WITHOUT ever reaching real playback, so checking only
    // `await speakP` resolves — or that `calls` stayed at one — doesn't
    // distinguish "B got real audio" from "B silently got nothing."
    const onSentenceTiming = vi.fn();
    const speakP = model.speak({ text: 'Shared sentence.', onSentenceTiming }); // caller B joins A's in-flight entry
    await new Promise((r) => setTimeout(r, 10));

    ctlA.abort(); // A walks away — must NOT cancel B's (speak()'s) shared request
    mock.resolve('Shared sentence.');
    await speakP; // resolves cleanly — B still got its audio
    expect(calls).toEqual(['Shared sentence.']); // still just the one real call
    expect(onSentenceTiming).toHaveBeenCalledTimes(1); // …and B actually played it
  });

  it('joins an in-flight speak() synth for the same sentence instead of firing a duplicate prefetch request', async () => {
    const model = createVoiceModel({});
    const calls: string[] = [];
    const mock = abortAwareMockRung((t) => calls.push(t), 'openrouter-tts');
    model.__setRung(mock.rung);

    const speakP = model.speak({ text: 'Shared sentence.' });
    await vi.waitFor(() => expect(calls).toEqual(['Shared sentence.']));

    model.warm(['Shared sentence.']); // must join speak()'s in-flight request, not fire a second one
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual(['Shared sentence.']);

    mock.resolve('Shared sentence.');
    await speakP;
  });

  it("a later speak() joins warm()'s in-flight prefetch for the same sentence rather than firing a duplicate request", async () => {
    const model = createVoiceModel({});
    const calls: string[] = [];
    const mock = abortAwareMockRung((t) => calls.push(t), 'openrouter-tts');
    model.__setRung(mock.rung);

    model.warm(['Upcoming sentence.']);
    await vi.waitFor(() => expect(calls).toEqual(['Upcoming sentence.']));

    const speakP = model.speak({ text: 'Upcoming sentence.' });
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual(['Upcoming sentence.']); // still one call — speak() joined warm()'s in-flight promise

    mock.resolve('Upcoming sentence.');
    await speakP;
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

// Regression: a hung SYNTH-phase call (network never responds) previously left
// previewVoice()/speak() awaiting forever — the "Playing…" button stuck with no
// way out. Only the PLAYBACK phase had a watchdog before this fix.
describe('previewVoice — synth-phase timeout (regression: stuck "Playing…" button)', () => {
  it('resolves with a timeout error instead of hanging when the fetch never settles', async () => {
    vi.useFakeTimers();
    try {
      const model = createVoiceModel({
        getOpenRouterKey: () => 'sk-test',
        fetchImpl: () => new Promise(() => {}), // never resolves or rejects
      });
      const resultP = model.previewVoice({ rung: 'openrouter' });
      await vi.advanceTimersByTimeAsync(20000);
      await expect(resultP).resolves.toEqual({ ok: false, error: expect.stringContaining('timed out') });
    } finally {
      vi.useRealTimers();
    }
  });

  it('still resolves ok on a normal, fast synth (the timeout never fires for a healthy request)', async () => {
    const model = createVoiceModel({
      getOpenRouterKey: () => 'sk-test',
      fetchImpl: async () => ({ ok: true, status: 200, blob: async () => ({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) }) }),
    });
    const res = await model.previewVoice({ rung: 'openrouter' });
    expect(res.ok).toBe(true);
  });
});

describe('speak() — per-sentence synth timeout (same regression, narration path)', () => {
  it('a sentence whose synth never settles is skipped (not a permanent stall) and the timeout is surfaced', async () => {
    vi.useFakeTimers();
    try {
      const model = createVoiceModel({});
      model.__setRung({
        name: 'mock',
        ready: () => true,
        synth: () => new Promise(() => {}), // never resolves or rejects
      });
      const states: Array<{ error?: string; speaking?: boolean }> = [];
      const speakP = model.speak({ text: 'One.', onState: (s: { error?: string; speaking?: boolean }) => states.push(s) });
      await vi.advanceTimersByTimeAsync(20000);
      await speakP; // must resolve — never hang
      const errState = states.find((s) => s.speaking === false && s.error);
      expect(errState?.error).toContain('timed out');
    } finally {
      vi.useRealTimers();
    }
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
    await model.speak({ text: 'Gemini line.' });
    expect(requests[0].response_format).toBe('pcm');

    model.setOrModel('x-ai/grok-voice-tts-1.0');
    await model.speak({ text: 'Grok line.' });
    expect(requests[1].response_format).toBe('mp3');
  });

  it('wraps the PCM response in a playable 44-byte-header WAV blob, reading sample rate/channels off Content-Type', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'audio/pcm;rate=24000;channels=1' : null) },
      arrayBuffer: async () => new Uint8Array([10, 20, 30, 40]).buffer,
    });
    const model = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl });
    model.setOrModel('google/gemini-3.1-flash-tts-preview');

    // Capture the ArrayBuffer speak() actually hands to WebAudio's decodeAudioData
    // (FakeAudioContext, wired file-wide in beforeEach) — the concrete proof the
    // wrapped WAV is a real, decodable blob, not just that speak() didn't throw.
    let decodedByteLength = -1;
    (window as unknown as { AudioContext: unknown }).AudioContext = class extends FakeAudioContext {
      decodeAudioData(ab: ArrayBuffer, ok: (buf: { duration: number }) => void) {
        decodedByteLength = ab.byteLength;
        super.decodeAudioData(ab, ok);
      }
    };

    const onSentenceTiming = vi.fn();
    await model.speak({ text: 'Gemini line.', onSentenceTiming });
    expect(onSentenceTiming).toHaveBeenCalledTimes(1); // reached real playback, not a thrown/undecodable blob
    expect(decodedByteLength).toBe(44 + 4); // WAV header + our 4 raw PCM bytes
  });

  it("replays a CACHED pcm-wrapped blob a second time without throwing 'Cannot decode detached ArrayBuffer' (regression: live-caught in a real browser)", async () => {
    // decodeAudioData DETACHES the ArrayBuffer it decodes (real browser behavior,
    // simulated by FakeAudioContext above). The pcm-wrap helper's blob-like object
    // is cached and REPLAYED (identical text/voice/speed/model → same audioCache
    // entry) — "Play sample" clicked twice, or the same narration sentence spoken
    // again. An earlier version handed back the SAME ArrayBuffer instance on every
    // `.arrayBuffer()` call, so the first play decoded fine and the second threw
    // exactly this error — never caught by the sibling test above (single play) or
    // by jsdom's ORIGINAL no-op decodeAudioData mock (didn't detach anything).
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'audio/pcm;rate=24000;channels=1' : null) },
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    });
    const model = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl });
    model.setOrModel('google/gemini-3.1-flash-tts-preview');

    const onSentenceTiming = vi.fn();
    await model.speak({ text: 'Same line.', onSentenceTiming }); // first play — populates the cache
    await model.speak({ text: 'Same line.', onSentenceTiming }); // second play — must replay the SAME cached blob successfully
    expect(onSentenceTiming).toHaveBeenCalledTimes(2); // both plays reached real playback, neither threw
  });
});

describe('clip playback: anti-click fade envelope', () => {
  it('fades each clip in from and out to silence, so a hard buffer edge cannot click at a sentence boundary', async () => {
    // A TTS clip rarely starts/ends on a zero-crossing; a hard start(0)/stop steps from
    // silence to a non-zero sample = an audible pop between sentences. playBlob wraps the
    // source in a GainNode with a short head/tail ramp. Assert that envelope is scheduled.
    let ctxInstance: FakeAudioContext | null = null;
    (window as unknown as { AudioContext: unknown }).AudioContext = class extends FakeAudioContext {
      constructor() {
        super();
        ctxInstance = this;
      }
    };
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      blob: async () => ({ size: 256, type: 'audio/mpeg', arrayBuffer: async () => new ArrayBuffer(256) }),
    });
    const model = createVoiceModel({ getOpenRouterKey: () => 'sk-test', fetchImpl });
    model.setOrModel('hexgrad/kokoro-82m'); // cloud Kokoro — the clocked openrouter-tts rung

    await model.speak({ text: 'One clip.' });

    const ev = ctxInstance!.gainEvents;
    expect(ev.length).toBeGreaterThan(0); // a gain envelope was scheduled at all
    expect(ev[0]).toMatchObject({ kind: 'set', value: 0 }); // starts from silence
    const rampUp = ev.find((e) => e.kind === 'ramp' && e.value === 1);
    expect(rampUp).toBeDefined(); // fades IN to full gain
    expect(ev[ev.length - 1]).toMatchObject({ kind: 'ramp', value: 0 }); // fades OUT to silence last
    expect(rampUp!.time).toBeLessThan(ev[ev.length - 1].time); // in before out
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
