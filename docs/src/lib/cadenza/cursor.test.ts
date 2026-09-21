// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { clipTrailingMs } from './cadence';
import { makeCursor } from './cursor';
import { buildTrack, validateTrack } from './track';

const NOTE = 'Revenue grew to $4.2M. We beat plan by eight points.';

describe('cursor.at', () => {
  it('lands on the word whose span contains the time', () => {
    const track = buildTrack(NOTE);
    const cursor = makeCursor(track);
    const w = track.cues[0].words[1];
    const mid = (w.startMs + w.endMs) / 2;
    expect(cursor.at(mid)).toEqual({ cueIndex: 0, wordIndex: 1 });
  });

  it('is null before the first word and after the last', () => {
    const track = buildTrack(NOTE);
    const cursor = makeCursor(track);
    expect(cursor.at(-1)).toBeNull();
    expect(cursor.at(track.durationMs + 1000)).toBeNull();
  });

  it('HOLDS the last-spoken word through an inter-cue gap instead of going dark', () => {
    // The dark-void fix: during the silence between two cues the highlight stays on the last word of
    // the finished cue (no "resting on nothing" that reads as lag), releasing when the next cue starts.
    const track = buildTrack('Alpha beta. Gamma delta.');
    const cursor = makeCursor(track);
    const lastOf0 = track.cues[0].words[track.cues[0].words.length - 1]; // "beta."
    const firstOf1 = track.cues[1].words[0]; // "Gamma"
    const gapMid = (lastOf0.endMs + firstOf1.startMs) / 2;
    expect(gapMid).toBeGreaterThan(lastOf0.endMs); // there IS a gap
    // Mid-gap: held on the last word of cue 0, NOT null.
    expect(cursor.at(gapMid)).toEqual({ cueIndex: 0, wordIndex: track.cues[0].words.length - 1 });
    // Releases exactly when the next cue's first word starts.
    expect(cursor.at(firstOf1.startMs)).toEqual({ cueIndex: 1, wordIndex: 0 });
  });
});

describe('cursor.align (hybrid re-anchor)', () => {
  it('rescales a cue to the measured span and preserves internal rhythm', () => {
    const track = buildTrack(NOTE);
    const cursor = makeCursor(track);
    const cue = track.cues[0];
    // Estimated ratio of the first word's share of the cue.
    const estDur = cue.endMs - cue.startMs;
    const firstShare = (cue.words[0].endMs - cue.words[0].startMs) / estDur;

    cursor.align(0, 10_000, 4_000); // measured: starts at 10s, lasts 4s

    const aligned = cursor.track().cues[0];
    expect(aligned.startMs).toBe(10_000);
    // The cue SPAN still covers the whole measured clip (start → measured end).
    expect(aligned.endMs).toBe(14_000);
    expect(aligned.words[0].startMs).toBe(10_000);
    // The last WORD now releases into the clip's own trailing silence rather than being dragged to
    // the final sample: its highlight ends before the measured end by the (scaled) clip-internal
    // silence, so it rests during the sentence-final pause (the forgivable "highlight ahead", not a
    // lag). Expected end = onset + (last word's estimate end − cue start) × measured/estimate scale.
    const lastEst = cue.words[cue.words.length - 1];
    const scale = 4_000 / estDur;
    const expectedLastEnd = 10_000 + (lastEst.endMs - cue.startMs) * scale;
    expect(aligned.words[aligned.words.length - 1].endMs).toBeCloseTo(expectedLastEnd, 5);
    expect(expectedLastEnd).toBeLessThan(14_000); // released before the clip's silent tail
    expect(14_000 - expectedLastEnd).toBeCloseTo(clipTrailingMs(lastEst.display) * scale, 5);
    // Internal rhythm preserved: first word still holds ~the same share of the span.
    const newShare = (aligned.words[0].endMs - aligned.words[0].startMs) / 4_000;
    expect(newShare).toBeCloseTo(firstShare, 5);
  });

  it('does not mutate the caller-supplied track', () => {
    const track = buildTrack(NOTE);
    const before = track.cues[0].startMs;
    makeCursor(track).align(0, 99_000, 3_000);
    expect(track.cues[0].startMs).toBe(before);
  });

  it('at() reflects the re-anchored timeline', () => {
    const cursor = makeCursor(buildTrack(NOTE));
    cursor.align(0, 10_000, 4_000);
    expect(cursor.at(10_050)).toEqual({ cueIndex: 0, wordIndex: 0 });
  });
});

// ── align preconditions — 2026-09-20-narration-audit.md Finding 3 ────────────────────
//
// `align` takes numbers a PLAYER measured, and used to accept all of them. Each bad value
// corrupted the timeline silently and differently. These pin the refusal — and, just as
// importantly, that a refused align leaves the cue's ESTIMATE intact rather than wrecking it.
describe('align refuses a measurement it cannot use, and keeps the estimate', () => {
  const threeCues = () => buildTrack('Aaa bbb ccc. Ddd eee fff. Ggg hhh iii.');

  it('refuses a NaN duration instead of poisoning the whole timeline', () => {
    const c = makeCursor(threeCues());
    const before = c.track().durationMs;
    c.align(0, 0, Number.NaN);
    expect(c.track().durationMs).toBe(before);
    expect(validateTrack(c.track())).toEqual([]);
    expect(c.at(100)).toEqual({ cueIndex: 0, wordIndex: 0 }); // still readable
  });

  it('refuses a zero duration — reachable from a failed decode, not theoretical', () => {
    // suono's stage computes `(buffer.duration || 0) * 1000`, so 0 arrives here for real.
    const c = makeCursor(threeCues());
    const before = c.track().cues[1].endMs - c.track().cues[1].startMs;
    c.align(1, 1200, 0);
    expect(c.track().cues[1].endMs - c.track().cues[1].startMs).toBe(before);
    expect(validateTrack(c.track())).toEqual([]);
  });

  it('refuses an onset that would put a cue before the one ahead of it', () => {
    // This is the sort-breaker: `at()` binary-searches by startMs, so an out-of-order
    // anchor made it return null at EVERY probe — a permanently dark read-along.
    const c = makeCursor(threeCues());
    c.align(0, 5000, 1000);
    c.align(1, 100, 500); // before cue 0 — refused
    expect(validateTrack(c.track())).toEqual([]);
    expect(c.at(5100)).toEqual({ cueIndex: 0, wordIndex: 0 });
  });

  it('still accepts a normal measurement, including one overlapping the previous cue’s end', () => {
    const c = makeCursor(threeCues());
    c.align(0, 0, 1000);
    c.align(1, 900, 1200); // starts before cue 0 ENDS, which is ordinary and allowed
    expect(c.track().cues[0].startMs).toBe(0);
    expect(c.track().cues[1].startMs).toBe(900);
    expect(validateTrack(c.track())).toEqual([]);
  });

  it('refuses a negative onset', () => {
    const c = makeCursor(threeCues());
    const before = c.track().cues[0].startMs;
    c.align(0, -5000, 1000);
    expect(c.track().cues[0].startMs).toBe(before);
  });
});

describe('validateTrack reports what a corrupt timeline would do', () => {
  it('passes a freshly built track', () => {
    expect(validateTrack(buildTrack('One two. Three four.'))).toEqual([]);
  });

  it('names a non-finite span, an inverted span, and an out-of-order cue', () => {
    const t = buildTrack('One two. Three four. Five six.');
    t.cues[0].endMs = Number.NaN;
    expect(validateTrack(t).join(' ')).toContain('non-finite');
    const u = buildTrack('One two. Three four.');
    u.cues[1].endMs = u.cues[1].startMs - 10;
    expect(validateTrack(u).join(' ')).toContain('ends before it starts');
    const v = buildTrack('One two. Three four.');
    v.cues[1].startMs = -1;
    expect(validateTrack(v).join(' ')).toContain('out of order');
  });
});
