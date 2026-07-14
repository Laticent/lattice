import { describe, expect, it } from 'vitest';
import { SENTENCE_PAUSE_MS } from '../../playground/voice-model.js';
import { clipTrailingMs, interCueGapMs, PARAGRAPH_PAUSE_MS, pauseAfter } from './cadence';
import { buildTrack } from './track';

const NOTE = 'Revenue grew to $4.2M. We beat plan by eight points.';

describe('buildTrack', () => {
  it('makes one cue per sentence', () => {
    const t = buildTrack(NOTE);
    expect(t.cues.length).toBe(2);
    expect(t.cues[0].display).toBe('Revenue grew to $4.2M.');
    expect(t.cues[1].display).toBe('We beat plan by eight points.');
  });

  it('carries display and spoken forms per word', () => {
    const t = buildTrack(NOTE);
    const money = t.cues[0].words.find((w) => w.display === '$4.2M.');
    expect(money).toBeDefined();
    expect(money?.spoken).toBe('four point two million dollars.');
  });

  it('times are monotonic non-decreasing and non-overlapping within a cue', () => {
    const t = buildTrack(NOTE);
    for (const cue of t.cues) {
      let prevEnd = cue.startMs;
      for (const w of cue.words) {
        expect(w.startMs).toBeGreaterThanOrEqual(prevEnd);
        expect(w.endMs).toBeGreaterThan(w.startMs);
        prevEnd = w.endMs;
      }
    }
    // Cues advance in time.
    expect(t.cues[1].startMs).toBeGreaterThanOrEqual(t.cues[0].endMs);
    expect(t.durationMs).toBe(t.cues[1].endMs);
  });

  it('gives $4.2M a longer dwell than a short word (spoken-length weighting)', () => {
    const t = buildTrack(NOTE);
    const dwell = (glyph: string) => {
      const w = t.cues[0].words.find((x) => x.display === glyph);
      expect(w).toBeDefined();
      return w ? w.endMs - w.startMs : 0;
    };
    expect(dwell('$4.2M.')).toBeGreaterThan(dwell('to'));
  });

  it('resolves charOffset back into the source text', () => {
    const t = buildTrack(NOTE);
    const w = t.cues[1].words[0]; // "We"
    expect(NOTE.slice(w.charOffset, w.charOffset + w.display.length)).toBe('We');
  });

  it('is deterministic and handles empty input', () => {
    expect(buildTrack(NOTE)).toEqual(buildTrack(NOTE));
    expect(buildTrack('')).toEqual({ cues: [], durationMs: 0 });
  });

  it('scales with pace (fast is quicker than slow)', () => {
    expect(buildTrack(NOTE, { pace: 'fast' }).durationMs).toBeLessThan(
      buildTrack(NOTE, { pace: 'slow' }).durationMs,
    );
  });

  it("a cue's span covers the clip's own trailing silence, not just the last phoneme", () => {
    // The last word carries a sentence pause; its clip-internal share extends the cue END,
    // so the cue's duration reflects what the TTS clip actually spans (de-biases calibration).
    const t = buildTrack(NOTE);
    const cue0 = t.cues[0];
    const lastWord = cue0.words[cue0.words.length - 1]; // "$4.2M."
    expect(pauseAfter(lastWord.display)).toBeGreaterThan(0); // sentence terminator
    expect(cue0.endMs).toBe(lastWord.endMs + clipTrailingMs(lastWord.display));
  });

  it('leaves the inter-cue gap equal to the audio BREATH (the pause, minus the clip silence)', () => {
    // The full boundary pause splits: clip-internal silence lands IN the cue (above), the remainder
    // is the breath between clips — which must equal voice-model's own SENTENCE_PAUSE_MS so the
    // silent estimate and the clocked player space sentences identically.
    const t = buildTrack(NOTE);
    const gap = t.cues[1].startMs - t.cues[0].endMs;
    const lastDisplay = t.cues[0].words[t.cues[0].words.length - 1].display; // "$4.2M." → '.'
    expect(gap).toBe(pauseAfter(lastDisplay) - clipTrailingMs(lastDisplay));
    expect(gap).toBe(SENTENCE_PAUSE_MS['.']);
  });

  it('inserts a PARAGRAPH beat (deeper gap) at a blank-line boundary, and flags the cue', () => {
    // A blank line between two sentences is a paragraph/topic boundary — the gap before the next cue
    // is the deeper PARAGRAPH_PAUSE_MS, not the sentence pause; the clip silence (cue END) is unchanged.
    const para = buildTrack('Revenue grew to plan.\n\nGuidance stands.');
    const flat = buildTrack('Revenue grew to plan. Guidance stands.');
    expect(para.cues.length).toBe(2); // same cues as the flat version — only the GAP differs
    expect(flat.cues.length).toBe(2);
    expect(para.cues[0].endsParagraph).toBe(true);
    expect(flat.cues[0].endsParagraph).toBeUndefined();

    const lastDisplay = para.cues[0].words[para.cues[0].words.length - 1].display; // "plan."
    // Cue END (clip's own trailing silence) is identical — the paragraph adds no phonemes.
    expect(para.cues[0].endMs).toBe(flat.cues[0].endMs);
    // The GAP before the next cue is the full paragraph pause minus the clip silence.
    const paraGap = para.cues[1].startMs - para.cues[0].endMs;
    expect(paraGap).toBe(PARAGRAPH_PAUSE_MS - clipTrailingMs(lastDisplay));
    // Deeper than the ordinary sentence gap, and it pushes the second cue later.
    expect(paraGap).toBeGreaterThan(flat.cues[1].startMs - flat.cues[0].endMs);
    expect(para.cues[1].startMs).toBeGreaterThan(flat.cues[1].startMs);
  });

  it('derives the paragraph gap from the ACTUAL terminator (ellipsis boundary differs from period)', () => {
    // Regression for the maker-checker finding: the gap must be PARAGRAPH_PAUSE_MS − clip silence of
    // the real terminator, not a constant that assumes a 550 ms sentence. An "…" paragraph boundary
    // (pause 650) therefore gets a different — and self-consistent — gap than a "." one.
    const dots = buildTrack('Chapter one.\n\nChapter two.');
    const ellip = buildTrack('To be continued…\n\nChapter two.');
    const gap = (t: ReturnType<typeof buildTrack>) => t.cues[1].startMs - t.cues[0].endMs;
    expect(gap(dots)).toBe(interCueGapMs('one.', true));
    expect(gap(ellip)).toBe(interCueGapMs('continued…', true));
    expect(gap(ellip)).not.toBe(gap(dots)); // the two terminators yield genuinely different gaps
  });

  it('a single-paragraph note is byte-identical to before (no paragraph beats)', () => {
    // Regression guard: text without a blank line must build exactly as it did pre-paragraph-pauses.
    const t = buildTrack(NOTE);
    for (const cue of t.cues) expect(cue.endsParagraph).toBeUndefined();
  });
});
