// Cadenza — the CaptionTrack data model + buildTrack (the estimate baseline).
//
// A CaptionTrack is pure data: cues (caption lines, one per sentence in v1), each a
// list of words carrying BOTH a display glyph-group and its spoken expansion, with
// estimated start/end ms and a char offset back into the source text. This is the
// timeline the cursor scans and vtt serializes; it owns no audio and no DOM.

import { estimateWordMs, FINAL_LENGTHEN_MS, type Pace, pauseAfter } from './cadence';
import { type AcronymRegistry, toSpoken } from './normalize';
import { splitSentences, splitWords } from './segment';
import type { SymbolOverrides } from './symbols';

export interface Word {
  /** The glyph group shown in the caption (e.g. "$4.2M"). The highlight unit. */
  display: string;
  /** The spoken expansion timing is computed on (e.g. "four point two million dollars"). */
  spoken: string;
  startMs: number;
  endMs: number;
  /** Index into the source text where `display` begins (best-effort forward scan). */
  charOffset: number;
}

export interface Cue {
  /** The caption line as shown (the display words joined). */
  display: string;
  words: Word[];
  startMs: number;
  endMs: number;
  charOffset: number;
}

export interface CaptionTrack {
  cues: Cue[];
  /** Total estimated duration (end of the last cue), ms. */
  durationMs: number;
}

export interface BuildOptions {
  pace?: Pace;
  /** The deck's author-supplied acronym registry (term → spoken expansion). Author wins. */
  acronyms?: AcronymRegistry;
  /** The deck's language tag (Marp `lang:`). A non-English deck bypasses the English
   *  lexicon + number/period expansion (the author registry still applies) — #919. */
  lang?: string;
  /** Per-voice pace calibration multiplier (default 1); scales the syllable estimate to a
   *  measured voice rate. See `calibrate.ts` and the per-voice-calibration decision doc. */
  rateScale?: number;
  /** The deck's per-glyph symbol overrides (`symbols:` front-matter): display glyph → spoken form,
   *  beating the built-in Speech Symbol Commons. Author wins — see symbols.ts. */
  symbols?: SymbolOverrides;
}

/**
 * Build the estimate-baseline timeline from text. Deterministic and offline: this
 * is the silent read-along and the caption clock before TTS re-anchors it
 * (cursor.align). One cue == one sentence; words lay end-to-end with punctuation
 * pauses as the silence between them.
 */
export function buildTrack(text: string, opts: BuildOptions = {}): CaptionTrack {
  const pace = opts.pace ?? 'moderate';
  const rateScale = opts.rateScale ?? 1;
  const source = String(text ?? '');
  const sentences = splitSentences(source);

  const cues: Cue[] = [];
  let clock = 0;
  let scan = 0; // running index into `source` for charOffset resolution

  for (const sentence of sentences) {
    const displays = splitWords(sentence);
    if (!displays.length) continue;

    const words: Word[] = [];
    const cueStart = clock;
    let cueCharOffset = -1;

    for (let i = 0; i < displays.length; i++) {
      const display = displays[i];
      const found = source.indexOf(display, scan);
      const charOffset = found >= 0 ? found : scan;
      if (found >= 0) scan = found + display.length;
      if (cueCharOffset < 0) cueCharOffset = charOffset;

      const spoken = toSpoken(display, { acronyms: opts.acronyms, lang: opts.lang, symbols: opts.symbols });
      const pause = pauseAfter(display);
      // Phrase-final lengthening: a word before a boundary (it carries trailing punctuation)
      // stretches, so its highlight holds a beat longer instead of the cursor running ahead.
      const dur = estimateWordMs(spoken, pace, rateScale) + (pause > 0 ? FINAL_LENGTHEN_MS : 0);
      const startMs = clock;
      const endMs = startMs + dur;
      words.push({ display, spoken, startMs, endMs, charOffset });

      // Advance the clock past this word, plus the pause its punctuation implies
      // (the silence BEFORE the next word / cue). The trailing pause after the last
      // word becomes the gap before the next cue, so cues read with a beat between.
      clock = endMs + pause;
    }

    const cueEnd = words[words.length - 1].endMs;
    cues.push({
      display: displays.join(' '),
      words,
      startMs: cueStart,
      endMs: cueEnd,
      charOffset: cueCharOffset < 0 ? 0 : cueCharOffset,
    });
  }

  return { cues, durationMs: cues.length ? cues[cues.length - 1].endMs : 0 };
}
