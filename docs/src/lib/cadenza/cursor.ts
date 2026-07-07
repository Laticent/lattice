// Cadenza — the cursor: map a clock time to the active word, and re-anchor a cue
// to measured audio. Pure over the timeline; it reads a clock the consumer injects
// (WebAudio currentTime during TTS, a plain timer for a silent read-along, or a
// scrub bar) and never touches audio itself.

import type { CaptionTrack, Word } from './track';

export interface Active {
  cueIndex: number;
  wordIndex: number;
}

interface FlatWord {
  cueIndex: number;
  wordIndex: number;
  startMs: number;
  endMs: number;
}

/** Deep-clone a track so the cursor can re-anchor without mutating the caller's. */
function cloneTrack(track: CaptionTrack): CaptionTrack {
  return {
    durationMs: track.durationMs,
    cues: track.cues.map((c) => ({ ...c, words: c.words.map((w) => ({ ...w })) })),
  };
}

export interface Cursor {
  /** The active `{ cueIndex, wordIndex }` at `timeMs`, or null in a gap / out of range. */
  at(timeMs: number): Active | null;
  /**
   * Re-anchor one cue's words to the MEASURED audio span `[onsetMs, onsetMs+durationMs]`,
   * preserving the estimate's internal rhythm (§ the hybrid timing model). Called per
   * sentence as TTS reports it; mutates the cursor's own copy. Returns the cursor.
   */
  align(cueIndex: number, onsetMs: number, durationMs: number): Cursor;
  /** The current (possibly re-anchored) timeline. */
  track(): CaptionTrack;
}

export function makeCursor(input: CaptionTrack): Cursor {
  const track = cloneTrack(input);
  let flat: FlatWord[] = [];

  const reindex = () => {
    flat = [];
    track.cues.forEach((cue, cueIndex) => {
      cue.words.forEach((w: Word, wordIndex) => {
        flat.push({ cueIndex, wordIndex, startMs: w.startMs, endMs: w.endMs });
      });
    });
  };
  reindex();

  const cursor: Cursor = {
    at(timeMs) {
      if (!flat.length || timeMs < flat[0].startMs) return null;
      // Binary search for the last word whose startMs <= timeMs.
      let lo = 0;
      let hi = flat.length - 1;
      let idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (flat[mid].startMs <= timeMs) {
          idx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (idx < 0) return null;
      const w = flat[idx];
      // Active only while inside the word; a gap between words has no active word.
      if (timeMs >= w.endMs) return null;
      return { cueIndex: w.cueIndex, wordIndex: w.wordIndex };
    },

    align(cueIndex, onsetMs, durationMs) {
      const cue = track.cues[cueIndex];
      if (!cue?.words.length) return cursor;
      const dur = Math.max(0, durationMs);
      const estStart = cue.startMs;
      const estDur = Math.max(1, cue.endMs - cue.startMs);
      const oldEnd = cue.endMs;
      const scale = dur / estDur;
      for (const w of cue.words) {
        w.startMs = onsetMs + (w.startMs - estStart) * scale;
        w.endMs = onsetMs + (w.endMs - estStart) * scale;
      }
      cue.startMs = onsetMs;
      cue.endMs = onsetMs + dur;

      // Shift the still-estimated tail so the timeline stays monotonic: once this
      // cue's measured span is known, the following (un-anchored) cues follow it.
      const delta = cue.endMs - oldEnd;
      if (delta !== 0) {
        for (let i = cueIndex + 1; i < track.cues.length; i++) {
          const c = track.cues[i];
          c.startMs += delta;
          c.endMs += delta;
          for (const w of c.words) {
            w.startMs += delta;
            w.endMs += delta;
          }
        }
      }
      track.durationMs = track.cues.length ? track.cues[track.cues.length - 1].endMs : 0;
      reindex();
      return cursor;
    },

    track() {
      return track;
    },
  };

  return cursor;
}
