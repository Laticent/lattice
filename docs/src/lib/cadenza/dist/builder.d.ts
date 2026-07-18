import type { Pace } from './cadence';
import { type CalibrationState } from './calibrate';
import type { AcronymRegistry } from './normalize';
import { type Reader, type ReaderOptions } from './reader';
import type { LexiconMap } from './symbols';
import { type CaptionTrack } from './track';
export interface Narration {
    /** Reading pace (default `moderate`). */
    pace(p: Pace): this;
    /** The deck's author acronym registry (term → spoken expansion; author wins). */
    acronyms(reg: AcronymRegistry): this;
    /** The deck's language tag (a non-English deck bypasses the English lexicon + number expansion). */
    lang(tag: string): this;
    /** Raw per-voice pace multiplier scaling the syllable estimate (default 1). */
    rate(scale: number): this;
    /** Derive the pace multiplier from a measured `CalibrationState` — === `rateScale(state)`. */
    calibration(state: CalibrationState | null | undefined): this;
    /** The deck's read-aloud lexicon (token → spoken form, beating the built-in symbol commons). */
    lexicon(map: LexiconMap): this;
    /** The estimate-baseline timeline. === `buildTrack(text, options)`. */
    toTrack(): CaptionTrack;
    /** A read-along driver over a freshly built track. === `makeReader({track, ...handlers})`. */
    toReader(handlers?: Omit<ReaderOptions, 'track'>): Reader;
    /** WebVTT for the built track. === `toVtt(buildTrack(text, options))`. */
    toVtt(): string;
    /** SRT for the built track. === `toSrt(buildTrack(text, options))`. */
    toSrt(): string;
}
/** Open a fluent narration over `text`. Chain config verbs then emit — e.g.
 *  `narration('Revenue grew to $4.2M.').pace('moderate').lexicon(map).toVtt()`. Every terminal is
 *  the plain Cadenza function applied to the collected options, so the builder is a proven
 *  pass-through (guarded by builder.test.ts) and never lets you desync display/spoken/timing. */
export declare function narration(text: string): Narration;
