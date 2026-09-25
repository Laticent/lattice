// Cadenza — the public surface. Framework-free, one dependency (@laticent/ltt, the format its
// tracks are written in): give it text, get
// a timed caption track + a pure clock→word cursor + WebVTT/SRT out. It owns no
// audio and no DOM. See the design ADR: engineering/decisions/2026-07-07-cadenza-caption-timeline.md
//
// The one authoring/serialization boundary a consumer needs; everything else
// (playback, highlighting, deciding WHAT to say) is the consumer's job.

export type { Narration } from './builder.js';
// Fluent CONFIG front door — configure once (pace/acronyms/lang/rate/lexicon), emit many
// (toTrack/toReader/toVtt/toSrt). Pure sugar over buildTrack/makeReader/toVtt/toSrt.
export { narration } from './builder.js';
export type { Pace, PaceName } from './cadence.js';
export {
  CLIP_TRAILING_FRACTION,
  clipTrailingMs,
  EMPHASIS_HOLD_MS,
  emphasisHoldMs,
  estimateWordMs,
  FINAL_LENGTHEN_MS,
  interCueGapMs,
  MAX_EMPHASIS_STEPS,
  PACE_PRESETS,
  PACE_WPM,
  PARAGRAPH_PAUSE_MS,
  pauseAfter,
  readMs,
  SECTION_PAUSE_MS,
  SLIDE_PAUSE_MS,
  SYLLABLE_MS,
  slideBeatMs,
  syllableCount,
} from './cadence.js';
export type { CalibrationState } from './calibrate.js';
export {
  CALIBRATION_MAX_K,
  CALIBRATION_MIN_K,
  CALIBRATION_MIN_N,
  CALIBRATION_WINDOW,
  deserializeCalibration,
  emptyCalibration,
  observe,
  rateScale,
  serializeCalibration,
} from './calibrate.js';
export type { Active, Cursor } from './cursor.js';
export { makeCursor } from './cursor.js';
export { ENGINE_HASH } from './engine-hash.js';
export type { LexDomain } from './lexicon.js';
export { LEX_DOMAINS, lookupLexicon } from './lexicon.js';
export { integerToWords, isEnglishLang, numberToWords, spokenWordCount, toSpoken, toSpokenText, unmatchedAcronyms, unspokenTokens } from './normalize.js';
export type { Reader, ReaderOptions } from './reader.js';
export { makeReader } from './reader.js';

export { splitParagraphs, splitSentences, splitWords } from './segment.js';
export type { LexiconMap, ResolveSymbolsOptions } from './symbols.js';
export { resolveSymbols, SEPARATOR_GLYPHS, SYMBOL_SPEAK } from './symbols.js';
export type { BuildOptions, CaptionTrack, Cue, EmphasisSpan, Word } from './track.js';
export { buildTrack, validateTrack } from './track.js';
export { formatTimestamp, toSrt, toVtt } from './vtt.js';
