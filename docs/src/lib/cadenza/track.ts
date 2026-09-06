// Cadenza — the CaptionTrack data model + buildTrack (the estimate baseline).
//
// A CaptionTrack is pure data: cues (caption lines, one per sentence in v1), each a
// list of words carrying BOTH a display glyph-group and its spoken expansion, with
// estimated start/end ms and a char offset back into the source text. This is the
// timeline the cursor scans and vtt serializes; it owns no audio and no DOM.

import { clipTrailingMs, estimateWordMs, FINAL_LENGTHEN_MS, interCueGapMs, type Pace, pauseAfter } from './cadence';
import { type AcronymRegistry, toSpoken } from './normalize';
import { splitParagraphs, splitWords } from './segment';
import type { LexiconMap } from './symbols';

export interface Word {
  /** The glyph group shown in the caption (e.g. "$4.2M"). The highlight unit. */
  display: string;
  /** The spoken expansion timing is computed on (e.g. "four point two million dollars"). */
  spoken: string;
  startMs: number;
  endMs: number;
  /** Index into the source text where `display` begins (best-effort forward scan). */
  charOffset: number;
  /** Emphasis weight, 1 = ordinary. ABSENT for an ordinary word — an unweighted deck therefore
   *  serializes exactly as it did before emphasis existed, so no golden or manifest moves. */
  weight?: number;
}

export interface Cue {
  /** The caption line as shown (the display words joined). */
  display: string;
  words: Word[];
  startMs: number;
  endMs: number;
  charOffset: number;
  /** True when a PARAGRAPH / topic boundary (a blank line) follows this cue — so the gap before the
   *  next cue is the deeper `PARAGRAPH_PAUSE_MS` beat, not the sentence pause. The clocked player reads
   *  this to widen the inter-clip breath (read-aloud.ts). Absent/false for an ordinary sentence break. */
  endsParagraph?: boolean;
  /** The cue's emphasis weight — the MAX over its words, absent when ordinary. This is what buys
   *  the extra breath AFTER the cue (`interCueGapMs`), and max is the right reducer because a
   *  sentence is as important as the most important thing in it; averaging would let a long
   *  sentence dilute its own key phrase into silence. Every consumer computing the inter-cue gap
   *  MUST read it from here so the estimate and the clocked player stay in step. */
  weight?: number;
}

export interface CaptionTrack {
  cues: Cue[];
  /** Total estimated duration (end of the last cue), ms. */
  durationMs: number;
}

/** A half-open `[start, end)` range of the source text that carries extra emphasis, and how much.
 *  Char offsets, because `Word.charOffset` already anchors every word back into the source — so a
 *  producer can mark a span it found in the DOM without Cadenza ever learning what a `<strong>` is.
 *  That keeps this engine's contract intact: it still takes TEXT and decides nothing about what to
 *  say. Deciding which words matter is the caller's job, exactly as deciding the words themselves
 *  already was. */
export interface EmphasisSpan {
  /** Inclusive start offset into the text passed to `buildTrack`. */
  start: number;
  /** Exclusive end offset. A span with `end <= start` is ignored rather than throwing — a producer
   *  walking a live DOM should not be able to crash a caption track with an off-by-one. */
  end: number;
  /** Weight for words overlapping this span; 1 (or less) means no emphasis. See `emphasisHoldMs`. */
  weight: number;
}

export interface BuildOptions {
  pace?: Pace;
  /** Optional emphasis map over `text`. Omitted (the default) reproduces the pre-emphasis timeline
   *  byte for byte. Overlapping spans resolve to the HIGHEST weight covering a word. */
  emphasis?: readonly EmphasisSpan[];
  /** The deck's author-supplied acronym registry (term → spoken expansion). Author wins. */
  acronyms?: AcronymRegistry;
  /** The deck's language tag (Marp `lang:`). A non-English deck bypasses the English
   *  lexicon + number/period expansion (the author registry still applies) — #919. */
  lang?: string;
  /** Per-voice pace calibration multiplier (default 1); scales the syllable estimate to a
   *  measured voice rate. See `calibrate.ts` and the per-voice-calibration decision doc. */
  rateScale?: number;
  /** The deck's read-aloud lexicon (`lexicon:` front-matter): token (glyph or whole word) → spoken
   *  form, beating the built-in Speech Symbol Commons. Author wins — see symbols.ts. */
  lexicon?: LexiconMap;
}

/**
 * Build the estimate-baseline timeline from text. Deterministic and offline: this
 * is the silent read-along and the caption clock before TTS re-anchors it
 * (cursor.align). One cue == one sentence; words lay end-to-end with punctuation
 * pauses as the silence between them.
 */
/** Drop the spans that cannot mean anything — a producer walking a live DOM computes these from
 *  node positions, and one bad offset must degrade to "no emphasis here", never to a thrown caption
 *  track. Order and overlap are both left alone deliberately: `weightOver` takes the max, so callers
 *  need not merge or sort what they emit. */
function usableSpans(spans: readonly EmphasisSpan[] | undefined): readonly EmphasisSpan[] {
  if (!spans?.length) return [];
  return spans.filter(
    (sp) =>
      sp &&
      Number.isFinite(sp.start) &&
      Number.isFinite(sp.end) &&
      Number.isFinite(sp.weight) &&
      sp.end > sp.start &&
      sp.weight > 1,
  );
}

/** The highest weight covering `[from, to)`, or 1 when nothing does. A word counts as emphasized if
 *  it OVERLAPS a span at all rather than sitting wholly inside one: a producer marking a `<strong>`
 *  reports the element's text range, and a word straddling that edge (a possessive, a trailing
 *  comma the markup excluded) is plainly part of the emphasized phrase to a listener. */
function weightOver(spans: readonly EmphasisSpan[], from: number, to: number): number {
  let max = 1;
  for (const sp of spans) {
    if (from < sp.end && to > sp.start && sp.weight > max) max = sp.weight;
  }
  return max;
}

/** The highest weight of a span ENDING inside `(from, to]` — which is what buys the hold, and it is
 *  a different question from "is this word emphasized".
 *
 *  A cue holds a beat because an emphasized passage FINISHED in it, not because it contained part of
 *  one. Measured on `examples/radar-narration.md`, whose key-insight codas run three and four
 *  sentences: weighting every cue the passage touches spent four holds inside one insight — 1000 ms
 *  dripped through the very passage it was supposed to set apart. That is not emphasis, it is just
 *  slower, and it contradicts the contrast argument `MAX_EMPHASIS_STEPS` is built on. Holding only
 *  where the passage ENDS gives a long coda one beat after it lands and leaves a short bolded phrase
 *  behaving exactly as it did — the single-cue case is unchanged, because a span inside one cue both
 *  starts and ends there. */
function weightEndingIn(spans: readonly EmphasisSpan[], from: number, to: number): number {
  let max = 1;
  for (const sp of spans) {
    if (sp.end > from && sp.end <= to && sp.weight > max) max = sp.weight;
  }
  return max;
}

export function buildTrack(text: string, opts: BuildOptions = {}): CaptionTrack {
  const pace = opts.pace ?? 'moderate';
  const rateScale = opts.rateScale ?? 1;
  const source = String(text ?? '');
  const spans = usableSpans(opts.emphasis);
  // Paragraph-aware split: the same sentence list `splitSentences` gives (so cues still map 1:1 to
  // the audio clips), plus which sentences END a paragraph (a blank line follows). A paragraph beat
  // is the deeper `PARAGRAPH_PAUSE_MS` gap; the speech projection emits blank lines between a slide's
  // structural blocks, and an author's multi-paragraph note carries them natively.
  const { sentences, paragraphEnd } = splitParagraphs(source);

  const cues: Cue[] = [];
  let clock = 0;
  let scan = 0; // running index into `source` for charOffset resolution

  for (let si = 0; si < sentences.length; si++) {
    const sentence = sentences[si];
    const displays = splitWords(sentence);
    if (!displays.length) continue;
    const endsParagraph = paragraphEnd.has(si);

    const words: Word[] = [];
    const cueStart = clock;
    let cueCharOffset = -1;

    for (let i = 0; i < displays.length; i++) {
      const display = displays[i];
      const found = source.indexOf(display, scan);
      const charOffset = found >= 0 ? found : scan;
      if (found >= 0) scan = found + display.length;
      if (cueCharOffset < 0) cueCharOffset = charOffset;

      const spoken = toSpoken(display, { acronyms: opts.acronyms, lang: opts.lang, lexicon: opts.lexicon });
      const pause = pauseAfter(display);
      // Phrase-final lengthening: a word before a boundary (it carries trailing punctuation)
      // stretches, so its highlight holds a beat longer instead of the cursor running ahead.
      const dur = estimateWordMs(spoken, pace, rateScale) + (pause > 0 ? FINAL_LENGTHEN_MS : 0);
      const startMs = clock;
      const endMs = startMs + dur;
      const weight = spans.length ? weightOver(spans, charOffset, charOffset + display.length) : 1;
      words.push({ display, spoken, startMs, endMs, charOffset, ...(weight > 1 ? { weight } : {}) });

      // Advance the clock past this word, plus the pause its punctuation implies
      // (the silence BEFORE the next word / cue). For the LAST word, this pause splits:
      // its clip-internal portion (clipTrailingMs, below) lands INSIDE the cue's span,
      // and the remainder is the inter-cue BREATH the next cue starts after.
      clock = endMs + pause;
    }

    // The cue spans the whole TTS clip, not just up to the last phoneme: a synthesized
    // sentence clip carries its own trailing silence, so the last word's boundary pause
    // contributes its clip-internal share (CLIP_TRAILING_FRACTION) to the cue's end. The
    // complementary breath stays the inter-cue gap (clock advanced by the FULL pause above,
    // so the next cue still starts at endMs + pause and the gap is exactly the breath).
    // Without this the whole pause fell into the gap and the calibration residual — measured
    // clip ÷ (cue.endMs − cue.startMs) — tracked punctuation depth, not the voice's difficulty.
    const lastWord = words[words.length - 1];
    const cueEnd = lastWord.endMs + clipTrailingMs(lastWord.display);
    // The cue's own char range, used to ask which emphasized passages FINISH here.
    const cueWeight = spans.length
      ? weightEndingIn(spans, cueCharOffset < 0 ? 0 : cueCharOffset, lastWord.charOffset + lastWord.display.length)
      : 1;

    // The next cue starts after the inter-cue breath — the boundary pause (the deeper PARAGRAPH tier
    // when a blank line follows this cue, else the sentence pause) minus the clip's own trailing
    // silence, which already lives inside cueEnd. `interCueGapMs` is the ONE formula the clocked
    // player (read-aloud.ts) shares, so the silent estimate and the audio space cues identically.
    // This overrides the word loop's provisional last-word advance.
    clock = cueEnd + interCueGapMs(lastWord.display, endsParagraph, cueWeight);

    cues.push({
      display: displays.join(' '),
      words,
      startMs: cueStart,
      endMs: cueEnd,
      charOffset: cueCharOffset < 0 ? 0 : cueCharOffset,
      ...(endsParagraph ? { endsParagraph: true } : {}),
      ...(cueWeight > 1 ? { weight: cueWeight } : {}),
    });
  }

  return { cues, durationMs: cues.length ? cues[cues.length - 1].endMs : 0 };
}
