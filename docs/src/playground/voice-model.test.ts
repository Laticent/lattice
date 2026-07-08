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
