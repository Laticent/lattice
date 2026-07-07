import { describe, expect, it, vi } from 'vitest';
import { makeReader } from './reader';
import { buildTrack } from './track';

const NOTE = 'Revenue grew to $4.2M. We beat plan by eight points.';

function midOf(track: ReturnType<typeof buildTrack>, cueIndex: number, wordIndex: number) {
  const w = track.cues[cueIndex].words[wordIndex];
  return (w.startMs + w.endMs) / 2;
}

describe('makeReader.sync', () => {
  it('emits onWord only when the active word changes', () => {
    const track = buildTrack(NOTE);
    const onWord = vi.fn();
    const reader = makeReader({ track, onWord });

    reader.sync(midOf(track, 0, 0)); // word 0
    reader.sync(midOf(track, 0, 0) + 1); // still word 0 — no new emit
    reader.sync(midOf(track, 0, 1)); // word 1

    expect(onWord).toHaveBeenCalledTimes(2);
    expect(onWord).toHaveBeenNthCalledWith(1, { cueIndex: 0, wordIndex: 0 });
    expect(onWord).toHaveBeenNthCalledWith(2, { cueIndex: 0, wordIndex: 1 });
    expect(reader.current()).toEqual({ cueIndex: 0, wordIndex: 1 });
  });

  it('emits null when the clock lands in a gap / before the start', () => {
    const track = buildTrack(NOTE);
    const onWord = vi.fn();
    const reader = makeReader({ track, onWord });

    reader.sync(midOf(track, 0, 0)); // a word → emit active
    reader.sync(track.durationMs + 5000); // past the end → emit null
    expect(onWord).toHaveBeenLastCalledWith(null);
  });

  it('fires onEnd exactly once when the clock passes the timeline', () => {
    const track = buildTrack(NOTE);
    const onEnd = vi.fn();
    const reader = makeReader({ track, onEnd });

    reader.sync(0);
    reader.sync(track.durationMs + 1);
    reader.sync(track.durationMs + 100);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('makeReader.align + reset', () => {
  it('reflects a re-anchored cue and updates durationMs', () => {
    const track = buildTrack(NOTE);
    const reader = makeReader({ track });
    reader.align(0, 10_000, 4_000);
    expect(reader.sync(10_050)).toEqual({ cueIndex: 0, wordIndex: 0 });
    // The tail shifted, so the whole timeline is now longer than the estimate.
    expect(reader.durationMs()).toBeGreaterThan(track.durationMs);
  });

  it('reset re-arms onWord and onEnd for replay', () => {
    const track = buildTrack(NOTE);
    const onWord = vi.fn();
    const onEnd = vi.fn();
    const reader = makeReader({ track, onWord, onEnd });

    reader.sync(midOf(track, 0, 0));
    reader.sync(track.durationMs + 1);
    reader.reset();
    reader.sync(midOf(track, 0, 0)); // same word again, but reset cleared `last`
    reader.sync(track.durationMs + 1);

    expect(onWord).toHaveBeenCalledWith({ cueIndex: 0, wordIndex: 0 });
    expect(onEnd).toHaveBeenCalledTimes(2);
  });
});
