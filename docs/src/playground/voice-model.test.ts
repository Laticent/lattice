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
  decodeAudioData(_ab: ArrayBuffer, ok: (buf: { duration: number }) => void) {
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
