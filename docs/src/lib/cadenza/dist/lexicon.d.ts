/** A domain pack name. BASE is always applied; a pack is opt-in per deck/domain. */
export type LexDomain = 'legal' | 'finance';
/**
 * Resolve one whole token against the lexicon: BASE_CASED (exact case) first — so an
 * uppercase acronym wins before it is lower-cased and possibly mistaken for a word —
 * then the always-on lower-cased BASE, then the opted-in domain packs in order (the
 * FIRST opted-in pack with the key wins). Returns null when nothing matches — the
 * caller (normalize.ts) then tries its number / period / currency branches, and
 * finally passes the token through unchanged.
 */
export declare function lookupLexicon(token: string, domains?: readonly LexDomain[]): string | null;
/** The set of domain pack names, for validation / docs. */
export declare const LEX_DOMAINS: readonly LexDomain[];
