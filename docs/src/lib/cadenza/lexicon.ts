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
  // Only the PLURAL section mark stays here — "§§" is two glyphs the per-glyph commons would read
  // "section section", so it needs a whole-token entry. The single-glyph symbols (`§ ¶ © ® ™ & @`
  // and the arrows) now live in the Speech Symbol Commons (symbols.ts), which also handles them
  // EMBEDDED ("§5" → "section five") — one source of truth. Decorative separators (·|•) are the
  // whole-token PAUSE rule in normalize.ts. Keeping single-glyph copies here would be a dead,
  // contradicting duplicate.
  '§§': 'sections',
  // DOTTED abbreviations with ONE meaning in any deck. The period is part of the key, so the whole
  // token matches before the terminator peel. Left out because each has two readings a deck really
  // writes: `Dr.` (Doctor · Drive), `St.` (Saint · Street), `No.` (number · the word), `Fig.` (figure ·
  // the fruit), `est.` (estimated · established), `Inc.`/`Ltd.` (said several ways). A deck that means
  // one declares it in `terms:`. Capital letters joined by dots (`U.S.`, `D.C.`) are spelled by a rule
  // in normalize.ts, not listed here.
  'e.g.': 'for example', 'i.e.': 'that is', 'etc.': 'et cetera', 'vs.': 'versus', 'approx.': 'approximately',
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
  // Duration abbreviation: "11 mo" / "18 mos" → "months" (metrics shorthand read as the word
  // "mo" otherwise). Exact-LOWERCASE so the name "Mo", the state "MO", and all-caps titles never
  // fire. Plural default (metrics cite spans > 1); a rare "1 mo" reads "one months" — accepted.
  mo: 'months', mos: 'months',
  // A release stage, the house domain's reading ("GA, a milestone at Q4" was spoken as the
  // two letters). Exact-case, so "ga" in prose never fires. The collision is a MAP region
  // authored by code (Georgia on `map us`, Gabon on the world map): chart narration spells a
  // code-only region ("G A"), so this entry never sees it there. Prose elsewhere that means
  // Georgia declares `acronyms: GA: Georgia`, which the registry lets beat this entry.
  GA: 'general availability',
  // Sales regions, as a board deck writes them (#2393's test deck had to spell all five out by
  // hand). Said the way a sales team says them rather than expanded: "Europe, the Middle East
  // and Africa" is a mouthful where a region is one word in a list. Exact case, so the
  // lower-case run never fires. `NA` is deliberately absent: it is also "n/a", not applicable,
  // in the same tables. `DACH` / `MENA` have no settled spoken form; a deck declares them.
  EMEA: 'E M E A', APAC: 'A P A C', LATAM: 'la tam', LatAm: 'la tam',
  AMER: 'the Americas', ANZ: 'A N Z',
  // Short months that are not also a word or a common name: always on, exact case, so an
  // all-caps "DEC" (a decimal, a label) never fires. `May` needs no entry. `Jan`, `Mar` and
  // `Jun` are also a name or a verb ("Jan leads EMEA", "Mar the result"), so they expand only
  // beside a date — `contextualMonth` in normalize.ts owns them.
  Feb: 'February', Apr: 'April', Jul: 'July', Aug: 'August', Sep: 'September',
  Sept: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
  // Clock and degree abbreviations, exact case (a bare `PM` is also "product manager"; only the
  // dotted forms are the clock), and the courtesy titles, exact case so an all-caps `MS.` (a product,
  // a disease) never reads "miz".
  'a.m.': 'A M', 'p.m.': 'P M', 'A.M.': 'A M', 'P.M.': 'P M',
  'Ph.D.': 'P H D', PhD: 'P H D',
  'Mr.': 'mister', 'Mrs.': 'missus', 'Ms.': 'miz', 'Prof.': 'professor',
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

/** The short months that are also a name or a word ("Jan", "Mar", "Jun"). They expand only
 *  beside a date or another month — see `contextualMonth` in normalize.ts. */
export const CONTEXT_MONTHS: Readonly<Record<string, string>> = { Jan: 'January', Mar: 'March', Jun: 'June' };

/** The set of domain pack names, for validation / docs. */
export const LEX_DOMAINS: readonly LexDomain[] = ['legal', 'finance'];

// ── HOUSE TERMS — the built-in list in the `terms:` shape ─────────────────────
// The tables above hold ONE value per token: what the voice says. For most that is the expansion
// (`arr` → "annual recurring revenue"); for a WORD or SPELL entry it is a pronunciation, and the
// meaning is nowhere (`ebitda` → "ee bit dah"). `terms:` keeps the two apart
// (engineering/decisions/2026-11-16-terms-registry.md), and a glossary, a term picker or the Studio
// can only use this list if it does too. So the meaning of every WORD / SPELL entry lives here, and
// `houseTerms()` joins the two. Speech is unchanged: `lookupLexicon` still reads the tables above.
const HOUSE_EXPANSIONS: Record<string, string> = {
  ebitda: 'earnings before interest, taxes, depreciation and amortization',
  cagr: 'compound annual growth rate',
  gaap: 'generally accepted accounting principles',
  saas: 'software as a service',
  sku: 'stock keeping unit',
  ui: 'user interface',
  ux: 'user experience',
  EMEA: 'Europe, the Middle East and Africa',
  APAC: 'Asia-Pacific',
  LATAM: 'Latin America',
  LatAm: 'Latin America',
  ANZ: 'Australia and New Zealand',
};

// How each lower-cased BASE key is WRITTEN on a slide, where it is not simply upper case.
const HOUSE_DISPLAY: Record<string, string> = { saas: 'SaaS', capex: 'CapEx', opex: 'OpEx' };

// Entries in the tables that are not terms an author defines: quarters, durations, months, glyphs.
// A key with a period in it is an abbreviation (`e.g.`, `a.m.`, `Mr.`), not a term an author defines.
const NOT_A_TERM = /^(?:q[1-4]|mos?|§§|Feb|Apr|Jul|Aug|Sept?|Oct|Nov|Dec|PhD|.*\..*)$/;

/**
 * Every always-on built-in term as WRITTEN on a slide → what the voice SAYS (BASE + BASE_CASED, the
 * same rows `houseTerms` lists). normalize.ts builds a terms.ts index from it, so a built-in term gets
 * the same endings and compounds an author's `terms:` entry gets (`APIs`, `CEO’s`, `KPI-driven`) from
 * the ONE matcher, rather than a second copy of its rules. Exact whole-token matches still go through
 * `lookupLexicon`, which is also case-insensitive for BASE; this map only adds what that lookup cannot.
 */
export function houseSpokenMap(): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const [key, spoken] of Object.entries(BASE)) if (!NOT_A_TERM.test(key)) out.set(HOUSE_DISPLAY[key] ?? key.toUpperCase(), spoken);
  for (const [key, spoken] of Object.entries(BASE_CASED)) if (!NOT_A_TERM.test(key)) out.set(key, spoken);
  return out;
}

/** One built-in term: how it is written, what it stands for, and how it is said when that differs. */
export interface HouseTerm {
  readonly term: string;
  readonly expansion: string;
  readonly pronounce?: string;
}

/**
 * The always-on built-in terms (BASE + BASE_CASED), in the `terms:` shape: `expansion` is what the
 * term stands for, `pronounce` how the voice says it when that is not the expansion. The data a
 * glossary or a term picker can offer an author. Domain packs are opt-in, so they are not listed.
 */
export function houseTerms(): readonly HouseTerm[] {
  const out: HouseTerm[] = [];
  const add = (key: string, spoken: string, written: string) => {
    if (NOT_A_TERM.test(key)) return;
    const expansion = HOUSE_EXPANSIONS[key] ?? spoken;
    out.push(expansion === spoken ? { term: written, expansion } : { term: written, expansion, pronounce: spoken });
  };
  for (const [key, spoken] of Object.entries(BASE)) add(key, spoken, HOUSE_DISPLAY[key] ?? key.toUpperCase());
  for (const [key, spoken] of Object.entries(BASE_CASED)) add(key, spoken, key);
  return out;
}
