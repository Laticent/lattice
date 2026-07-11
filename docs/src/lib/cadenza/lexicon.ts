// Cadenza — the pronunciation lexicon (DATA, not code).
//
// display→spoken for whole-token abbreviations, symbols, and initialisms that a
// generic number/currency/percent normalizer (normalize.ts) can't derive. This is
// the layered, extensible successor to the fixed inline ABBREV table: a BASE layer
// of domain-UNAMBIGUOUS tokens that are always on (a `§` is always "section", `bps`
// is always "basis points", regardless of deck), plus optional DOMAIN packs for
// tokens that only resolve inside a domain (legal `v.`→"versus" would be wrong in a
// software release note, so it is NOT in BASE).
//
// Each entry maps a lower-cased token → its spoken form. The spoken form itself
// encodes the phonetic treatment: a space-separated run of single letters spells an
// initialism ("A P I"); a plain word is said as a word ("sass"); an expansion is the
// full phrase ("section"). No IPA here — Kokoro's misaki accepts inline IPA only via
// a per-term override, a future escape hatch, not this table.
//
// Pure + dependency-free (the Cadenza spin-off invariant). Adding a term is a data
// edit here, never an engine change — the extensibility the census (2026-07-11
// manifest-speech-contract §13, finding F-E) requires.

/** A domain pack name. BASE is always applied; a pack is opt-in per deck/domain. */
export type LexDomain = 'legal' | 'finance';

// ── BASE — domain-unambiguous, always on ────────────────────────────────────
// Keys are lower-cased; lookup lower-cases the token before matching.
const BASE: Record<string, string> = {
  // Fiscal periods (kept from the original ABBREV). NOTE: `h1`/`h2` are deliberately
  // NOT here — they read far more often as a heading level or chemical formula than
  // "first/second half", so the half-year reading lives in the `finance` pack.
  q1: 'Q one', q2: 'Q two', q3: 'Q three', q4: 'Q four',
  fy: 'fiscal year', yoy: 'year over year', qoq: 'quarter over quarter',
  eod: 'end of day', eoy: 'end of year',
  // Roles / metrics initialisms (spelled). Real-word / proper-noun collisions are
  // kept OUT of always-on BASE: `coo` (a verb), `tam` (a name) were dropped.
  ceo: 'C E O', cfo: 'C F O', cto: 'C T O', kpi: 'K P I',
  arr: 'A R R', mrr: 'M R R', roi: 'R O I', nps: 'N P S',
  cac: 'C A C', ltv: 'L T V', sla: 'S L A', slo: 'S L O',
  sdk: 'S D K', api: 'A P I', ux: 'U X',
  // Acronyms said as words (well-established single-word pronunciations).
  saas: 'sass',
  // Symbols with a single unambiguous reading.
  '§': 'section', '§§': 'sections', '¶': 'paragraph', '&': 'and',
  // A decorative separator (eyebrows: "Financial · Q4 2026") — dropped, never
  // spoken as "middle dot". An empty spoken form means "say nothing".
  '·': '',
};

// ── DOMAIN packs — opt-in (a token that is wrong outside its domain) ─────────
const DOMAINS: Record<LexDomain, Record<string, string>> = {
  legal: {
    'v.': 'versus',
    'u.s.c.': 'U S C', 'c.f.r.': 'C F R', 'cal.': 'California',
    'art.': 'Article', 'para.': 'paragraph',
    ccpa: 'C C P A', cpra: 'C P R A', gdpr: 'G D P R',
  },
  finance: {
    wow: 'week over week', mom: 'month over month',
  },
};

/**
 * Resolve one whole token against the lexicon: BASE first (BASE always wins, to
 * keep the always-on tokens stable), then the opted-in domain packs in the order
 * given — the FIRST opted-in pack with the key wins. Returns null when nothing
 * matches — the caller
 * (normalize.ts) then tries its number/currency/percent branches, and finally
 * passes the token through unchanged. Case-insensitive.
 */
export function lookupLexicon(token: string, domains: readonly LexDomain[] = []): string | null {
  const key = String(token ?? '').toLowerCase();
  if (!key) return null;
  if (Object.hasOwn(BASE, key)) return BASE[key];
  for (const d of domains) {
    const pack = DOMAINS[d];
    if (pack && Object.hasOwn(pack, key)) return pack[key];
  }
  return null;
}

/** The set of domain pack names, for validation / docs. */
export const LEX_DOMAINS: readonly LexDomain[] = ['legal', 'finance'];
