import { type Active } from './cursor';
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
export declare function makeReader(opts: ReaderOptions): Reader;
