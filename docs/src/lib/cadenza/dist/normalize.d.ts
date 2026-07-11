import { type LexDomain } from './lexicon';
/** Read a non-negative integer as words (up to trillions). */
export declare function integerToWords(n: number): string;
/** Read a number (possibly decimal) as words: 4.2 → "four point two". */
export declare function numberToWords(value: number): string;
/**
 * Map one displayed token to its spoken form. Recognizes money ($4.2M, £3,200),
 * percentages (18.5%), signed deltas (+9% → "up nine percent"), units
 * (2pp, 25bps, 4.2×, 18d), section refs (§1798.140(o)), plain numbers (1,024 /
 * 3.5), and the lexicon (abbreviations/symbols/initialisms); anything else passes
 * through unchanged. `opts.domains` opts in domain lexicon packs (legal/finance)
 * for tokens that only resolve inside a domain (e.g. legal `v.` → "versus").
 */
export declare function toSpoken(display: string, opts?: {
    domains?: readonly LexDomain[];
}): string;
/**
 * Expand every token in a passage to its spoken form — the whole-sentence version of
 * `toSpoken`, for feeding a TTS the words to SAY rather than the glyphs to show
 * ("Revenue grew to $4.2M." → "Revenue grew to four point two million dollars.").
 * A caller that speaks raw display text gets the TTS's own (often wrong) number
 * parsing; this gives it Cadenza's instead. `opts.domains` opts in domain lexicon
 * packs. Pure.
 */
export declare function toSpokenText(text: string, opts?: {
    domains?: readonly LexDomain[];
}): string;
/** Count spoken sub-words in an expansion ("four point two million dollars" → 5). */
export declare function spokenWordCount(spoken: string): number;
