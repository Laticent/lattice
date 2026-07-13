// Cadenza — the read-along driver. Turns a CaptionTrack + an injected clock into
// live highlight events: the host ticks `sync(nowMs)` each frame with whatever clock
// it has (WebAudio currentTime during TTS, a plain wall-clock timer for a SILENT
// read-along, or a scrub position), and the reader emits `onWord` only when the
// active word changes and `onEnd` once when the clock passes the timeline.
//
// It owns no timer and no DOM — the host drives the loop (requestAnimationFrame or
// setInterval) and paints the highlight. This keeps the reader pure and testable
// with hand-fed times, and lets the SAME driver serve audio-synced and silent modes.

import { type Active, type Cursor, makeCursor } from './cursor';
import type { CaptionTrack } from './track';

export interface ReaderOptions {
  track: CaptionTrack;
  /** Fired when the active word changes (including to `null` in a gap / out of range). */
  onWord?: (active: Active | null) => void;
  /** Fired once when the clock first passes the end of the timeline. */
  onEnd?: () => void;
}

export interface Reader {
  /** Advance to `nowMs`: emits onWord on change + onEnd once past the end; returns the active word. */
  sync(nowMs: number): Active | null;
  /** Re-anchor a cue to measured audio (delegates to the cursor's hybrid align). */
  align(cueIndex: number, onsetMs: number, durationMs: number): void;
  /** The last emitted active word. */
  current(): Active | null;
  /** Total timeline duration (ms), reflecting any re-anchoring so far. */
  durationMs(): number;
  /** The current (possibly re-anchored) timeline — so a host resuming mid-read can read a cue's live
   *  start (e.g. to hold the highlight at the current sentence while audio spins back up). */
  trackNow(): CaptionTrack;
  /** Re-arm: forget the last active word and the end latch (e.g. on replay). */
  reset(): void;
}

function sameActive(a: Active | null, b: Active | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.cueIndex === b.cueIndex && a.wordIndex === b.wordIndex;
}

export function makeReader(opts: ReaderOptions): Reader {
  const cursor: Cursor = makeCursor(opts.track);
  let last: Active | null = null;
  let ended = false;

  const reader: Reader = {
    sync(nowMs) {
      const active = cursor.at(nowMs);
      if (!sameActive(active, last)) {
        last = active;
        opts.onWord?.(active);
      }
      const total = cursor.track().durationMs;
      if (!ended && total > 0 && nowMs >= total) {
        ended = true;
        opts.onEnd?.();
      }
      return active;
    },

    align(cueIndex, onsetMs, durationMs) {
      cursor.align(cueIndex, onsetMs, durationMs);
    },

    current() {
      return last;
    },

    durationMs() {
      return cursor.track().durationMs;
    },

    trackNow() {
      return cursor.track();
    },

    reset() {
      last = null;
      ended = false;
    },
  };

  return reader;
}
