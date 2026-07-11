/** A domain pack name. BASE is always applied; a pack is opt-in per deck/domain. */
export type LexDomain = 'legal' | 'finance';
/**
 * Resolve one whole token against the lexicon: BASE first (BASE always wins, to
 * keep the always-on tokens stable), then the opted-in domain packs in the order
 * given — the FIRST opted-in pack with the key wins. Returns null when nothing
 * matches — the caller
 * (normalize.ts) then tries its number/currency/percent branches, and finally
 * passes the token through unchanged. Case-insensitive.
 */
export declare function lookupLexicon(token: string, domains?: readonly LexDomain[]): string | null;
/** The set of domain pack names, for validation / docs. */
export declare const LEX_DOMAINS: readonly LexDomain[];
