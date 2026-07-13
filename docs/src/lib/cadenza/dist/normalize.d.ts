import { type LexDomain } from './lexicon';
import { type SymbolOverrides } from './symbols';
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
    /** A deck's per-glyph symbol overrides (`symbols:` front-matter → the drawer UI): display glyph
     *  → spoken form ("" silences it), beating the built-in Speech Symbol Commons. See symbols.ts. */
    symbols?: SymbolOverrides;
    /** The deck's language tag (the Marp `lang:` directive). The built-in lexicon, the
     *  number-to-words, and the fiscal/period parser are all US-English, so for a
     *  non-English deck they are BYPASSED (the token passes through unchanged) to avoid
     *  injecting English into a non-English deck's narration — see `isEnglishLang`, #919.
     *  Absent → English (the default; today's behavior, byte-identical). The author's own
     *  `acronyms:` registry is HONORED regardless of language (the author owns it). */
    lang?: string;
}
/** Is Cadenza's English say-as machinery applicable to this language tag? Absent, `en`, or
 *  any `en-*` region → yes (English is the default). Anything else → no, so the caller
 *  bypasses the English lexicon + number/period expansion (#919). A pure language-tag test —
 *  Cadenza's own policy about which decks it can normalize, owned here so both caption
 *  producers get it identically by passing the raw `lang` through `buildTrack`. */
export declare function isEnglishLang(lang?: string): boolean;
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
export declare function unmatchedAcronyms(text: string, opts?: SpokenOpts): string[];
