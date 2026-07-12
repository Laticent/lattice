// Cadenza — the pronunciation lexicon (DATA, not code).
//
// display→spoken for whole-token abbreviations, symbols, and initialisms that a
// generic number/currency/percent normalizer (normalize.ts) can't derive. This is
// the layered, extensible successor to the fixed inline ABBREV table.
//
// Three say-as treatments, encoded IN the spoken value (no separate type field):
//   • EXPAND  — a full phrase: `arr`→"annual recurring revenue", `fy`→"fiscal year".
//               The house default for initialisms (a deck is read to be understood,
//               not decoded); chosen 2026-07-11 (§14).
//   • WORD    — an established single-word pronunciation: `saas`→"sass",
//               `ebitda`→"ee bit dah". Used where the expansion is absurd to say.
//   • SPELL   — a space-separated run of single letters: kept only for the few terms
//               with no natural expansion or word ("U I", "U X").
//
// Three layers, by ambiguity:
//   • BASE       — lower-cased keys, ALWAYS on. Only domain-unambiguous tokens that
//                  are NOT ordinary words (`arr`, `ebitda`, `§`). Lookup lower-cases.
//   • BASE_CASED — EXACT-CASE keys, always on, for tokens whose letters ALSO spell a
//                  common word: `IT`→"information technology" fires, but the word
//                  `it` never does. Matched before the lower-cased BASE.
//   • DOMAINS    — opt-in packs for tokens wrong outside a domain (legal `v.`).
//
// Pure + dependency-free (the Cadenza spin-off invariant). Adding a term is a data
// edit here, never an engine change — the extensibility the census (2026-07-11
// manifest-speech-contract §13, finding F-E; §14) requires.

/** A domain pack name. BASE is always applied; a pack is opt-in per deck/domain. */
export type LexDomain = 'legal' | 'finance';

// ── BASE — domain-unambiguous, always on, lower-cased keys ───────────────────
const BASE: Record<string, string> = {
  // Fiscal periods, no attached year (FY26 / 4Q24 / 1H26 carry a year and are parsed
  // in normalize.ts). Quarters read as ordinals ("third quarter"), the natural form.
  // `h1`/`h2` are NOT here — a bare half reads via a CASE-SENSITIVE `H1`/`H2` pattern
  // (normalize.ts), so lowercase prose and `H2O` never become "second half".
  fy: 'fiscal year', // `cy` is NOT here — the name "Cy" / ISO "CY" collide; it lives in BASE_CASED
  q1: 'first quarter', q2: 'second quarter', q3: 'third quarter', q4: 'fourth quarter',
  // Period-over-period + period-to-date.
  yoy: 'year over year', qoq: 'quarter over quarter',
  ytd: 'year to date', qtd: 'quarter to date', mtd: 'month to date',
  eod: 'end of day', eoq: 'end of quarter', eoy: 'end of year',
  // Roles (expanded). Real-word / proper-noun collisions (`coo`, `cmo`, `cro`) live in
  // BASE_CASED so the lowercase words never fire.
  ceo: 'chief executive officer', cfo: 'chief financial officer',
  cto: 'chief technology officer',
  // Metrics (expanded).
  kpi: 'key performance indicator', okr: 'objectives and key results',
  arr: 'annual recurring revenue', mrr: 'monthly recurring revenue',
  roi: 'return on investment', nps: 'net promoter score', // house-domain reading; residual: ROI=Republic of Ireland, NPS=Nat'l Park Service (§15)
  clv: 'customer lifetime value', // `ltv`/`cac`/`eps` DEMOTED (§15) — bimodal by industry (loan-to-value · Common Access Card · Encapsulated PostScript)
  arpu: 'average revenue per user', gmv: 'gross merchandise value',
  dau: 'daily active users', sku: 'skew', nda: 'non-disclosure agreement',
  capex: 'capital expenditure', opex: 'operating expense',
  'p&l': 'profit and loss', 'r&d': 'research and development',
  // Metrics said as WORDS (expansion would be absurd to speak).
  ebitda: 'ee bit dah', cagr: 'cagger', gaap: 'gap',
  // Product / go-to-market (expanded).
  gtm: 'go to market', b2b: 'business to business', b2c: 'business to consumer', // gtm kept; residual: Google Tag Manager (§15)
  faq: 'frequently asked questions', // `smb` DEMOTED (§15) — Server Message Block in an infra deck
  // Engineering / security (expanded).
  api: 'application programming interface', sdk: 'software development kit', // api residual: Active Pharmaceutical Ingredient (pharma) / API gravity (energy)
  sla: 'service level agreement', slo: 'service level objective',
  sso: 'single sign-on', '2fa': 'two-factor authentication', // `mfa` DEMOTED (§15) — Master of Fine Arts in an arts/edu deck
  // Established single-word pronunciations.
  saas: 'sass',
  // No natural expansion or word — spelled.
  ui: 'U I', ux: 'U X',
  // Symbols with a single unambiguous reading.
  '§': 'section', '§§': 'sections', '¶': 'paragraph', '&': 'and',
  // NOTE: decorative separators (interpunct "·", pipe "|", bullet "•" …) are handled in
  // normalize.ts's `toSpoken` — spoken as a soft PAUSE (a comma), not dropped, so an eyebrow
  // like "Financial · Q4 2026" reads "Financial, Q4 2026" instead of running together. One
  // rule there covers the whole family; keeping a `'·': ''` entry here would just be a dead,
  // contradicting duplicate.
};

// ── BASE_CASED — EXACT-CASE keys, always on (letters that also spell a word) ──
// Fires only on the acronym's canonical case, so the ordinary LOWER-CASE word never
// expands (`COGS`→"cost of goods sold" but `cogs` stays the machine part). The tier's
// hard limit: it still fires in the ALL-CAPS register of titles/eyebrows/CTAs, so a
// key that is also a common word THERE is unsafe. `IT`/`US` were tried and pulled —
// "ABOUT US"/"WHY IT MATTERS" would read "…United States"/"…information technology"
// (§14). Genuinely ambiguous even in caps (`IP`, `AR`, `OR`) are likewise EXCLUDED —
// a wrong expansion is worse than none. `TAM` is kept (no strong collision); `SAM`/`SOM`
// were pulled — bimodal even in caps (SAM = SAM.gov / surface-to-air missile; SOM =
// System-on-Module), the same class as CRO/CMO (§15).
const BASE_CASED: Record<string, string> = {
  CY: 'calendar year', // lower-case "cy" / name "Cy" must NOT fire → cased, not BASE
  COO: 'chief operating officer', // monosemic (lower-case "coo" is the verb → cased)
  COGS: 'cost of goods sold', // lower-case "cogs" is the machine part
  TAM: 'total addressable market', MAU: 'monthly active users', // MAU cased so the name "Mau" in prose never fires
  MoM: 'month over month', WoW: 'week over week', // canonical mixed case; "mom"/"wow" the words stay safe
  // `CRO`/`CMO`/`SAM`/`SOM` are NOT here — each is genuinely BIMODAL even in all-caps
  // within a real customer industry (revenue-officer vs conversion-rate-opt; SAM.gov /
  // surface-to-air missile; System-on-Module). A deck-blind global guess is a boardroom
  // faceplant, so they are demoted to the opt-in `finance` pack (vocabulary preserved)
  // and the author declares the meaning via `acronyms:` (§15). Only tokens UNAMBIGUOUS
  // in a SaaS/tech-growth boardroom (the house domain) stay always-on.
};

// ── DOMAIN packs — opt-in (a token that is wrong outside its domain) ─────────
// NOTE: not yet wired into the live read-aloud path (buildTrack calls toSpoken with
// no domains) — tracked as a follow-up. BASE + BASE_CASED are the always-on surface.
const DOMAINS: Record<LexDomain, Record<string, string>> = {
  legal: {
    'v.': 'versus',
    'u.s.c.': 'U S C', 'c.f.r.': 'C F R', 'cal.': 'California',
    'art.': 'Article', 'para.': 'paragraph',
    ccpa: 'C C P A', cpra: 'C P R A', gdpr: 'G D P R',
  },
  finance: {
    // WoW/MoM live in BASE_CASED (canonical case). These stay for the opt-in path.
    wow: 'week over week', mom: 'month over month',
    // Demoted from always-on (§15) — the SaaS/tech-growth-boardroom reading, preserved
    // here for the opt-in path; per-deck, the author declares the meaning via `acronyms:`.
    cro: 'chief revenue officer', cmo: 'chief marketing officer',
    cac: 'customer acquisition cost', eps: 'earnings per share',
    smb: 'small and medium business', mfa: 'multi-factor authentication',
    sam: 'serviceable addressable market', som: 'serviceable obtainable market',
    // `ltv` is deliberately NOT packed: bimodal even WITHIN finance (loan-to-value vs
    // lifetime value), so no single expansion is safe — the author must declare it.
  },
};

/**
 * Resolve one whole token against the lexicon: BASE_CASED (exact case) first — so an
 * uppercase acronym wins before it is lower-cased and possibly mistaken for a word —
 * then the always-on lower-cased BASE, then the opted-in domain packs in order (the
 * FIRST opted-in pack with the key wins). Returns null when nothing matches — the
 * caller (normalize.ts) then tries its number / period / currency branches, and
 * finally passes the token through unchanged.
 */
export function lookupLexicon(token: string, domains: readonly LexDomain[] = []): string | null {
  const raw = String(token ?? '').trim();
  if (!raw) return null;
  if (Object.hasOwn(BASE_CASED, raw)) return BASE_CASED[raw];
  const key = raw.toLowerCase();
  if (Object.hasOwn(BASE, key)) return BASE[key];
  for (const d of domains) {
    const pack = DOMAINS[d];
    if (pack && Object.hasOwn(pack, key)) return pack[key];
  }
  return null;
}

/** The set of domain pack names, for validation / docs. */
export const LEX_DOMAINS: readonly LexDomain[] = ['legal', 'finance'];
