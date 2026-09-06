import { describe, expect, it } from 'vitest';
import { SENTENCE_PAUSE_MS } from '../../playground/voice-model.js';
import { clipTrailingMs, EMPHASIS_HOLD_MS, emphasisHoldMs, interCueGapMs, MAX_EMPHASIS_STEPS, PARAGRAPH_PAUSE_MS, pauseAfter } from './cadence';
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


// ── EMPHASIS spans → weighted cues → a beat after the thing that matters ──────────────────────
// NOTE is 'Revenue grew to $4.2M. We beat plan by eight points.' — '$4.2M' occupies [16, 21) and is
// the last word of cue 0, so a span over it weights cue 0 and pushes cue 1 out by exactly one hold.
const VALUE_SPAN = { start: 16, end: 21, weight: 2 };

describe('buildTrack + emphasis', () => {
  it('adds NOTHING when no emphasis is passed — no weight keys, identical timings', () => {
    // The whole back-compat promise in one assertion: an unweighted deck must serialize and time
    // exactly as it did before this feature, so no committed .vtt or manifest golden moves.
    const t = buildTrack(NOTE);
    expect(JSON.stringify(t)).toBe(JSON.stringify(buildTrack(NOTE, { emphasis: [] })));
    for (const cue of t.cues) {
      expect(cue.weight).toBeUndefined();
      for (const w of cue.words) expect(w.weight).toBeUndefined();
    }
  });

  it('weights the word the span covers, and only that word', () => {
    const t = buildTrack(NOTE, { emphasis: [VALUE_SPAN] });
    const cue0 = t.cues[0];
    const value = cue0.words.find((w) => w.display.startsWith('$4.2M'));
    expect(value?.weight).toBe(2);
    for (const w of cue0.words) if (w !== value) expect(w.weight).toBeUndefined();
    for (const w of t.cues[1].words) expect(w.weight).toBeUndefined();
  });

  it('lifts the weight onto the CUE, because the cue is what buys the breath', () => {
    const t = buildTrack(NOTE, { emphasis: [VALUE_SPAN] });
    expect(t.cues[0].weight).toBe(2);
    expect(t.cues[1].weight).toBeUndefined();
  });

  it('takes the MAX over a cue, so a long sentence cannot dilute its own key phrase', () => {
    const t = buildTrack(NOTE, {
      emphasis: [{ start: 0, end: 7, weight: 2 }, VALUE_SPAN, { start: 8, end: 12, weight: 3 }],
    });
    expect(t.cues[0].weight).toBe(3); // not an average, not the first, not the last
  });

  it('pushes the NEXT cue out by exactly the hold — the beat is real, and it is at the seam', () => {
    const plain = buildTrack(NOTE);
    const weighted = buildTrack(NOTE, { emphasis: [VALUE_SPAN] });
    expect(weighted.cues[1].startMs - plain.cues[1].startMs).toBe(EMPHASIS_HOLD_MS);
    // and the emphasized cue itself is NOT stretched — the silence lands after it, not inside it,
    // because the TTS clip for that sentence contains no such pause.
    expect(weighted.cues[0].endMs).toBe(plain.cues[0].endMs);
    expect(weighted.cues[0].startMs).toBe(plain.cues[0].startMs);
    for (let i = 0; i < plain.cues[0].words.length; i++) {
      expect(weighted.cues[0].words[i].endMs).toBe(plain.cues[0].words[i].endMs);
    }
  });

  it('agrees with the shared gap formula the clocked player uses', () => {
    // If these ever disagree the caption highlight drifts against the voice at the seam. This is the
    // same identity the paragraph tier is pinned on, extended to carry weight.
    const t = buildTrack(NOTE, { emphasis: [VALUE_SPAN] });
    const cue0 = t.cues[0];
    const last = cue0.words[cue0.words.length - 1];
    expect(t.cues[1].startMs - cue0.endMs).toBe(interCueGapMs(last.display, !!cue0.endsParagraph, cue0.weight));
  });

  it('counts a word that STRADDLES the span edge — a listener hears the whole phrase', () => {
    // A producer reports the <strong> element's range; a trailing possessive or comma the markup
    // excluded is still plainly part of the emphasized phrase.
    const t = buildTrack(NOTE, { emphasis: [{ start: 0, end: 3, weight: 2 }] }); // 'Rev' of 'Revenue'
    expect(t.cues[0].words[0].weight).toBe(2);
  });

  it('ignores spans that cannot mean anything instead of throwing', () => {
    // A producer computing offsets from a live DOM will emit a bad one eventually; a caption track
    // must degrade to "no emphasis here", never crash the export.
    const junk = [
      { start: 5, end: 5, weight: 2 }, // empty
      { start: 9, end: 4, weight: 2 }, // inverted
      { start: Number.NaN, end: 10, weight: 2 },
      { start: 0, end: Number.NaN, weight: 2 },
      { start: 0, end: 7, weight: Number.NaN },
      { start: 0, end: 7, weight: 1 }, // not emphasis
      { start: -50, end: -10, weight: 2 }, // wholly before the text
      { start: 9000, end: 9100, weight: 2 }, // wholly after
    ];
    const t = buildTrack(NOTE, { emphasis: junk });
    expect(JSON.stringify(t)).toBe(JSON.stringify(buildTrack(NOTE)));
  });

  it('survives a null/undefined entry from a producer', () => {
    const t = buildTrack(NOTE, {
      emphasis: [null as unknown as typeof VALUE_SPAN, undefined as unknown as typeof VALUE_SPAN, VALUE_SPAN],
    });
    expect(t.cues[0].weight).toBe(2);
  });

  it('caps the hold at the seam, not just in the pure function', () => {
    const plain = buildTrack(NOTE);
    const huge = buildTrack(NOTE, { emphasis: [{ ...VALUE_SPAN, weight: 99 }] });
    const ceiling = MAX_EMPHASIS_STEPS * EMPHASIS_HOLD_MS;
    expect(huge.cues[1].startMs - plain.cues[1].startMs).toBe(ceiling);
    expect(emphasisHoldMs(99)).toBe(ceiling);
  });

  it('does not extend the track when the LAST cue is emphasized — there is nothing to breathe into', () => {
    // durationMs is the last cue's end, and the hold lives in the gap AFTER a cue. Emphasis on the
    // final sentence must not invent trailing silence the player would sit through.
    const plain = buildTrack(NOTE);
    const t = buildTrack(NOTE, { emphasis: [{ start: 45, end: 51, weight: 2 }] }); // 'points' in cue 1
    expect(t.cues[1].weight).toBe(2);
    expect(t.durationMs).toBe(plain.durationMs);
  });
});
