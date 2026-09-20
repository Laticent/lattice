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
  // Deep-clone, so the cursor can re-anchor without mutating the caller's track.
  //
  // INLINED HERE ON PURPOSE rather than kept as a module-scope `cloneTrack` helper. This
  // function's SOURCE is embedded verbatim into the exported `.html` player's CSP-hashed
  // script via `.toString()` — the same idiom `lib/core/present-transport.mjs` uses, whose
  // header states the constraint: an inlined export may not reference a module-scope binding,
  // because the closure does not travel with the source. A `cloneTrack(...)` call would be
  // `cloneTrack is not defined` in the shipped file, at runtime, inside the player's
  // try/catch — so a shared deck would silently lose its caption highlight rather than fail
  // loudly. Keep every reference in here local.
  const track: CaptionTrack = {
    durationMs: input.durationMs,
    cues: input.cues.map((c) => ({ ...c, words: c.words.map((w) => ({ ...w })) })),
  };
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
      // HOLD the current word through any trailing silence — a comma/sentence/paragraph gap — until
      // the NEXT word begins, instead of going dark. The binary search already guarantees
      // `timeMs < flat[idx+1].startMs`, so returning `w` simply keeps the last-spoken word lit through
      // the pause rather than resting the highlight on nothing (which reads as the highlight lagging,
      // worst at the deep paragraph beat). Only the FINAL word clears at its own end, so the highlight
      // doesn't stick past the end of the timeline (letting `onEnd` fire).
      if (idx === flat.length - 1 && timeMs >= w.endMs) return null;
      return { cueIndex: w.cueIndex, wordIndex: w.wordIndex };
    },

    align(cueIndex, onsetMs, durationMs) {
      const cue = track.cues[cueIndex];
      if (!cue?.words.length) return cursor;
      // PRECONDITIONS. `align` takes numbers measured by a player — a decode that failed, a
      // clip that never loaded, a seek that ran backwards — and it used to accept all of them.
      // `Math.max(0, durationMs)` clamps a negative but NOT a NaN, and each bad value corrupts
      // the timeline in a different, silent way:
      //
      //  · NaN duration      — every word's span becomes NaN, so the highlight dies, `onEnd`
      //                        never fires (`x >= NaN` is always false, so the read hangs), and
      //                        `toVtt` emits `00:00:00.000 --> NaN:NaN:NaN.NaN` — a structurally
      //                        invalid caption file, shipped to a viewer.
      //  · zero duration     — REACHABLE, not theoretical: suono's stage computes
      //                        `(buffer.duration || 0) * 1000`, so a failed decode yields 0. The
      //                        cue collapses to a single point and drags the whole tail backwards.
      //  · out-of-order onset — `at()` binary-searches `flat` assuming it is sorted by startMs.
      //                        Anchoring a later cue before an earlier one breaks that sort, and
      //                        `at()` then returns null at EVERY probe: the read-along goes
      //                        permanently dark, with no exception and no recovery.
      //
      // Each one is REFUSED rather than repaired, so the cue keeps its estimate. A highlight
      // running on an estimate is a small, self-correcting error; a timeline that can never be
      // read again is not. `calibrate.observe` already guards the same measured value from the
      // same callback — this is that discipline on the other consumer.
      //
      // Every reference here is local, for the reason `makeCursor`'s header gives: this source
      // is inlined into the exported player via `.toString()` and a module-scope binding would
      // be undefined there.
      if (!Number.isFinite(onsetMs) || !Number.isFinite(durationMs)) return cursor;
      if (durationMs <= 0 || onsetMs < 0) return cursor;
      // Overlapping the previous cue's END is normal (a clip can start before the last one's
      // trailing silence is over). Starting before the previous cue BEGINS is the sort-breaker.
      if (cueIndex > 0 && onsetMs < track.cues[cueIndex - 1].startMs) return cursor;
      const dur = durationMs;
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
