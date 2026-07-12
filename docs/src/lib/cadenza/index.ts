// Cadenza — the public surface. Framework-free, zero-dependency: give it text, get
// a timed caption track + a pure clock→word cursor + WebVTT/SRT out. It owns no
// audio and no DOM. See the design ADR: engineering/decisions/2026-07-07-cadenza-caption-timeline.md
//
// The one authoring/serialization boundary a consumer needs; everything else
// (playback, highlighting, deciding WHAT to say) is the consumer's job.

export type { Pace } from './cadence';
export { estimateWordMs, FINAL_LENGTHEN_MS, PACE_WPM, pauseAfter, readMs, SYLLABLE_MS, syllableCount } from './cadence';
export type { Active, Cursor } from './cursor';
export { makeCursor } from './cursor';
export type { LexDomain } from './lexicon';
export { LEX_DOMAINS, lookupLexicon } from './lexicon';
export { integerToWords, isEnglishLang, numberToWords, spokenWordCount, toSpoken, toSpokenText, unmatchedAcronyms } from './normalize';
export type { Reader, ReaderOptions } from './reader';
export { makeReader } from './reader';

export { splitSentences, splitWords } from './segment';
export type { BuildOptions, CaptionTrack, Cue, Word } from './track';
export { buildTrack } from './track';
export { formatTimestamp, toSrt, toVtt } from './vtt';
