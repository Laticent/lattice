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
/**
 * A deck's author-supplied acronym registry: display token → spoken expansion, already
 * parsed from `acronyms:` front-matter (lib/core/resolve-captions). Consulted BEFORE the
 * built-in dictionary and every derivational pattern, so the author always wins — a
 * whole-token, case-sensitive match, the same shape the built-in lexicon uses.
 */
export type AcronymRegistry = ReadonlyMap<string, string>;
export interface SpokenOpts {
    domains?: readonly LexDomain[];
    acronyms?: AcronymRegistry;
}
export declare function toSpoken(display: string, opts?: SpokenOpts): string;
/**
 * Expand every token in a passage to its spoken form — the whole-sentence version of
 * `toSpoken`, for feeding a TTS the words to SAY rather than the glyphs to show
 * ("Revenue grew to $4.2M." → "Revenue grew to four point two million dollars.").
 * A caller that speaks raw display text gets the TTS's own (often wrong) number
 * parsing; this gives it Cadenza's instead. `opts.domains` opts in domain lexicon
 * packs. Pure.
 */
export declare function toSpokenText(text: string, opts?: SpokenOpts): string;
/** Count spoken sub-words in an expansion ("four point two million dollars" → 5). */
export declare function spokenWordCount(spoken: string): number;
/**
 * The multi-letter ALL-CAPS tokens in `text` that pass through `toSpoken` UNCHANGED —
 * i.e. neither the author registry (`opts.acronyms`) nor the built-in lexicon expands
 * them, so a TTS spells them letter-by-letter (`ROI` → "arr oh eye"). This is the
 * discovery signal behind the deck lint's "did you mean to add these to `acronyms:`?"
 * hint. Each token is edge-trimmed of non-alphanumerics (so `**ROI**`, `(API)` still
 * register), tested as a pure A–Z run of length ≥ 2 (digit-bearing shorthand like `FY26`
 * is left to the fiscal parser), and returned unique in first-seen order. Pure.
 */
export declare function unmatchedAcronyms(text: string, opts?: SpokenOpts): string[];
