import type { CaptionTrack } from './track';
/** ms → "HH:MM:SS.mmm" (VTT) or "HH:MM:SS,mmm" (SRT, comma decimal). */
export declare function formatTimestamp(ms: number, comma?: boolean): string;
/**
 * Serialize a track to WebVTT. Each cue is one caption line; word timings are
 * inline `<timestamp>` tags before each word after the first (karaoke).
 */
export declare function toVtt(track: CaptionTrack): string;
/** Serialize a track to SRT (line-level only — no word timing). */
export declare function toSrt(track: CaptionTrack): string;
