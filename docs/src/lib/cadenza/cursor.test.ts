import { describe, expect, it } from 'vitest';
import { makeCursor } from './cursor';
import { buildTrack } from './track';

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
    expect(aligned.endMs).toBe(14_000);
    expect(aligned.words[0].startMs).toBe(10_000);
    // The last word ends at the measured end.
    expect(aligned.words[aligned.words.length - 1].endMs).toBeCloseTo(14_000, 5);
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
