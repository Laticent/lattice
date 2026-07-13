/** Author (or UI) per-glyph override: display glyph → spoken form ("" forces silence). */
export type SymbolOverrides = ReadonlyMap<string, string>;
/** Built-in SPEAK table — an UNAMBIGUOUS glyph → its spoken word(s). English (gated behind the
 *  deck language like the lexicon, so a non-English deck isn't anglicized — #919). Single code
 *  points; variation selectors are stripped before lookup. Additive — a new glyph is one line. */
export declare const SYMBOL_SPEAK: Record<string, string>;
/** Decorative-separator glyphs — spoken as a comma PAUSE, but only as a WHOLE token (an embedded
 *  "·" is a voice id / URL). Exported for normalize.ts's whole-token rule so the data lives once. */
export declare const SEPARATOR_GLYPHS = "\u00B7\u2022\u2219\u2016\u00A6\u2043\u30FB|";
export interface ResolveSymbolsOptions {
    /** Author/UI per-glyph overrides — checked before the built-in table, in every language. */
    overrides?: SymbolOverrides;
    /** Whether the deck is English (default true). Gates the built-in SPEAK table (#919); DROP and
     *  overrides stay active (silence and the author's own vocabulary are language-neutral). */
    english?: boolean;
}
/**
 * Resolve the symbols in one token to their spoken forms. Returns the token with each actionable
 * glyph swapped for ` <word> ` (SPEAK / override) or ` ` (DROP / emoji), for the caller to
 * re-tokenize and normalize — or `null` when the token carries no actionable symbol, so the
 * caller can continue its normal path. Handles standalone ("→"), embedded ("red↔green"), and
 * mixed ("3×4") tokens uniformly. Pure.
 */
export declare function resolveSymbols(token: string, opts?: ResolveSymbolsOptions): string | null;
