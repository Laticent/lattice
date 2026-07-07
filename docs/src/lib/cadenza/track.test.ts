import { describe, expect, it } from 'vitest';
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
});
