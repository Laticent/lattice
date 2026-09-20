// Cadenza — display → spoken normalization.
//
// A caption word carries TWO forms: what's DISPLAYED ("$4.2M", "Q3", "18.5%") and
// what's SPOKEN ("four point two million dollars", "third quarter", "eighteen point
// five percent"). They diverge in length — one displayed token can be several spoken
// words — so timing (cadence.ts) is computed on the SPOKEN form while the caption
// renders the DISPLAY glyphs. This module maps one display token → its spoken form.
//
// Deterministic and pure. It never invents content: an unrecognized token passes
// through unchanged (its display IS its spoken form). No locale libs — a compact,
// dependency-free English expansion covering the boardroom cases (money, percent,
// plain numbers, a small abbreviation set).

import { type LexDomain, lookupLexicon } from './lexicon';
import { splitWords } from './segment';
import { type LexiconMap, resolveSymbols, SEPARATOR_GLYPHS } from './symbols';

// Whole-token decorative-separator test, built from the commons' separator set (data lives once
// in symbols.ts). Applied WHOLE-token only — an embedded "·" is a voice id / URL, left alone.
const SEPARATOR_ONLY = new RegExp(`^[${SEPARATOR_GLYPHS.replace(/[\\\]]/g, '\\$&')}]+$`);

// Hostile-input ceiling for a SINGLE spoken token. A real narration token (post-`splitWords`) is a
// word / number / abbreviation — never hundreds of characters. Deck front-matter and prose are
// untrusted (a shared / AI-generated deck, HARD RULE #22), so an absurdly long single token is
// abuse: it would otherwise drive quadratic backtracking in the trailing-punctuation peel and deep
// recursion in `spokenCore`'s sign-strip — a reader / caption-export DoS. Bounding the token keeps
// both linear; over the bound the token is spoken verbatim (no real word is this long). Generous so
// it never clips legitimate content (a long URL, a hyphenated compound).
const MAX_SPOKEN_TOKEN = 512;

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
// Through QUADRILLION, which covers every integer JavaScript can represent exactly
// (`Number.MAX_SAFE_INTEGER` is ~9.007e15). The list used to stop at trillion while the
// group loop indexed past its end and string-concatenated `undefined` — see `integerToWords`.
const SCALES = ['', ' thousand', ' million', ' billion', ' trillion', ' quadrillion', ' quintillion'];

// Single-letter magnitudes, plus the two multi-letter spellings finance actually writes.
// `bn` is the standard UK/EU form and `mm` the US banking one, and both were passing through
// raw — `$4.2bn` reached the voice as "$4.2bn" while `$4.2B` read correctly.
const MAGNITUDE: Record<string, string> = {
  k: 'thousand', m: 'million', b: 'billion', t: 'trillion',
  bn: 'billion', mm: 'million', tn: 'trillion',
};
/** The magnitude suffixes, longest-first, as a regex alternation — so `bn` wins over `b`. */
const MAG_RE = 'bn|mm|tn|[kmbt]';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const ORDINAL_ONES = [
  'zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth',
  'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth',
  'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth',
];
const ORDINAL_TENS = ['', '', 'twentieth', 'thirtieth', 'fortieth', 'fiftieth', 'sixtieth', 'seventieth', 'eightieth', 'ninetieth'];

/** Read 0..99 as an ORDINAL ("21st" → "twenty-first"). Beyond that, the cardinal plus "th"
 *  is worse than just reading the cardinal, so the caller falls back. */
function ordinalWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) return '';
  if (n < 20) return ORDINAL_ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? ORDINAL_TENS[tens] : `${TENS[tens]}-${ORDINAL_ONES[ones]}`;
}

/** Read an integer 0..999 as words. */
function tripletToWords(n: number): string {
  let out = '';
  if (n >= 100) {
    out += `${ONES[Math.floor(n / 100)]} hundred`;
    n %= 100;
    if (n) out += ' ';
  }
  if (n >= 20) {
    out += TENS[Math.floor(n / 10)];
    if (n % 10) out += `-${ONES[n % 10]}`;
  } else if (n > 0) {
    out += ONES[n];
  }
  return out;
}

/**
 * Read a non-negative integer as words (up to trillions).
 *
 * BEYOND TRILLIONS, the digits are read one at a time rather than named. `SCALES` stops at
 * trillion, and the group loop used to index past it and STRING-CONCATENATE `undefined`:
 * `1000000000000000` spoke as "oneundefined", and `9007199254740991` as "nineundefined seven
 * trillion …". `Number.isFinite` passed all of them, so the literal word "undefined" reached
 * the voice. Reading the digits is the honest fallback — a quadrillion is not a quantity a
 * deck means to say aloud, and it is far more often an id, a hash or a timestamp that wandered
 * into a number slot.
 */
export function integerToWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n === 0) return 'zero';
  const groups: number[] = [];
  let x = Math.floor(n);
  while (x > 0) {
    groups.push(x % 1000);
    x = Math.floor(x / 1000);
  }
  if (groups.length > SCALES.length) {
    return String(Math.floor(n))
      .split('')
      .map((d) => ONES[Number(d)] ?? d)
      .join(' ');
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    parts.push(tripletToWords(groups[i]) + SCALES[i]);
  }
  return parts.join(' ');
}

/** Read a number (possibly decimal) as words: 4.2 → "four point two". */
export function numberToWords(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const neg = value < 0;
  const abs = Math.abs(value);
  // `String(abs)` switches to EXPONENTIAL notation outside roughly 1e-7..1e21, and the
  // split below then found no '.' and handed `integerToWords` a value its loop exited
  // immediately on — so the whole number came back as the empty string and `toSpokenText`'s
  // `.filter(Boolean)` dropped it from the utterance entirely. Measured: "Rate is 0.0000001
  // today." narrated as "Rate is  today." — the caption showed the number, the voice never
  // said it, and the word occupied 0 ms. Silent content loss is the worst failure this file
  // can have, so an exponential value falls back to its own digits rather than vanishing.
  let asString = String(abs);
  if (asString.includes('e') || asString.includes('E')) {
    // A SMALL value expands cleanly to its decimal digits, which is what a person says.
    // `toFixed` caps at 100 places and is exact enough for anything a deck writes.
    if (abs < 1 && abs > 0) asString = abs.toFixed(20).replace(/0+$/, '');
    // A value too LARGE for exact representation has no honest word form; its own digits
    // are the least-wrong reading, and never the literal string "1e+21".
    else return (neg ? 'negative ' : '') + abs.toFixed(0).split('').map((d) => ONES[Number(d)] ?? d).join(' ');
  }
  const [intPart, decPart] = asString.split('.');
  let out = integerToWords(Number(intPart));
  if (decPart) {
    out += ' point ' + decPart.split('').map((d) => ONES[Number(d)]).join(' ');
  }
  return (neg ? 'negative ' : '') + out;
}

/**
 * Read a citation/reference number preserving EVERY digit — the fraction is read
 * from the raw string, digit by digit, so `§1798.100` keeps its trailing zeros
 * ("… point one zero zero") instead of collapsing to `.1`. `numberToWords` can't
 * do this: it coerces through `Number()`, which drops trailing decimal zeros and
 * would speak a different, wrong statute subsection.
 */
function citationNumber(str: string): string {
  const [intPart, decPart] = String(str).split('.');
  let out = integerToWords(Number(intPart.replace(/,/g, '')));
  if (decPart !== undefined) {
    out += ' point ' + decPart.split('').map((d) => ONES[Number(d)] ?? d).join(' ');
  }
  return out;
}

/** "N unit(s)" with singular/plural agreement on the numeric value (1 → singular). */
function unitWords(numStr: string, singular: string): string {
  const n = Number(numStr.replace(/,/g, ''));
  return `${numberToWords(n)} ${singular}${n === 1 ? '' : 's'}`;
}

const ORDINALS = ['', 'first', 'second', 'third', 'fourth'];

/**
 * Read a fiscal/calendar year figure — a two-digit `26` stays "twenty-six" (no century
 * inference: the house choice is the short year, §14); a leading-zero pair reads as a
 * year, not a bare cardinal (`05`→"oh five", `00`→"two thousand" — `Number("05")`
 * would drop the zero and speak "five", wrong for FY2005/FY2009); a four-digit `2026`
 * reads "two thousand twenty-six". Never a spelled "two six".
 */
function yearWords(digits: string): string {
  if (digits.length === 2 && digits[0] === '0') {
    return digits === '00' ? 'two thousand' : `oh ${ONES[Number(digits[1])]}`;
  }
  return numberToWords(Number(digits));
}

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
  /** The deck's read-aloud lexicon (`lexicon:` front-matter → the Lexicon drawer): a token (glyph or
   *  whole word) → spoken form ("" silences it), beating the built-in Speech Symbol Commons. See
   *  symbols.ts. */
  lexicon?: LexiconMap;
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
export function isEnglishLang(lang?: string): boolean {
  const t = String(lang ?? '').trim().toLowerCase();
  return t === '' || t === 'en' || t.startsWith('en-');
}

/**
 * Normalize a LEXICON entry's spoken value (a glyph/number inside it still expands — "$5" →
 * "five dollars" in an English deck; a non-English deck keeps it verbatim, per #919) but with the
 * lexicon REMOVED, so a self-referential entry (`lexicon: {"→":"→"}`, reachable from untrusted
 * front-matter) falls through to the acyclic built-in commons instead of looping. An empty value
 * stays empty (the silence form).
 */
function spokenLexiconValue(value: string, opts: SpokenOpts): string {
  if (!value) return '';
  return toSpokenText(value, { ...opts, lexicon: undefined });
}

export function toSpoken(display: string, opts: SpokenOpts = {}): string {
  const tok = String(display ?? '').trim();
  if (!tok) return '';
  // Hostile-input guard (see MAX_SPOKEN_TOKEN): an absurdly long single token is untrusted-deck
  // abuse — speak it verbatim rather than let the peel/sign paths below go super-linear.
  if (tok.length > MAX_SPOKEN_TOKEN) return tok;
  const domains = opts.domains ?? [];
  const acronyms = opts.acronyms;
  const english = isEnglishLang(opts.lang);

  // Author registry FIRST — the whole token, before anything else (a deck's `CRO` wins
  // over the built-in dictionary AND over the fiscal parser). Honored in EVERY language:
  // it's the author's own vocabulary, not English we chose to inject.
  if (acronyms?.has(tok)) return acronyms.get(tok) as string;

  // Author LEXICON — the whole token, a glyph OR a word ("Kubernetes" → "koober-net-eez", "→" →
  // "leads to"). Beats the built-in Speech Symbol Commons and the rules below; an empty value
  // SILENCES the token. Author-owned, so honored in EVERY language. An EMBEDDED glyph ("red↔green")
  // is not a whole-token match — the per-glyph symbol pass below applies the same lexicon to glyphs
  // inside a token.
  const lexicon = opts.lexicon;
  if (lexicon?.has(tok)) return spokenLexiconValue(lexicon.get(tok) as string, opts);

  // A standalone DECORATIVE SEPARATOR glyph — interpunct "·", pipe "|", bullet "•" and kin —
  // has no good reading: a TTS either voices it literally ("middle dot") or chokes, so an
  // eyebrow like "Lattice · A guided tour" or "Board | Q3 2026" narrates badly. Speak it as a
  // soft PAUSE (a comma, the same treatment a colon gets), so it reads "Lattice, A guided tour".
  // WHOLE-token only — a "·"/"|" INSIDE a token (a voice id "Heart·US", a URL) is left alone —
  // and language-independent (the glyph reads badly in any language). The DISPLAY word keeps the
  // glyph; only what's SPOKEN changes, so captions and the exported `.vtt` are unchanged.
  if (SEPARATOR_ONLY.test(tok)) return ',';

  // Whole-token lexicon next, before peeling punctuation — so a period-bearing
  // abbreviation (`v.`, `art.`, `U.S.C.`) matches its key rather than losing the
  // period to the terminator peel. The abbreviation's own period is part of it,
  // not a sentence end, and its spoken form ("versus") carries no terminator. The
  // built-in lexicon is US-English, so a non-English deck skips it (#919) — the
  // author registry above still applied. This runs BEFORE the symbol commons so a
  // multi-char lexicon key that contains a symbol ("r&d", "p&l") wins as a whole.
  if (english) {
    const whole = lookupLexicon(tok, domains);
    if (whole !== null) return whole;
  }

  // Preserve trailing sentence punctuation so cadence still sees the terminator. We peel it HERE,
  // BEFORE the symbol commons, so an author LEXICON key that itself contains a commons glyph
  // ("R&D", "Q&A", "→x") still wins whole when the token carries a terminator ("R&D.") — otherwise
  // the per-glyph pass below would speak the embedded "&"/"→" before the whole-key override matched.
  const punct = tok.match(/[.,!?;:…]+$/)?.[0] ?? '';
  const core = punct ? tok.slice(0, -punct.length) : tok;

  // A trailing COLON (or semicolon) is a TTS hard-stop hazard: many voices — Kokoro
  // among them — treat "word: " as a full stop and speak NOTHING after it, so a
  // component-aware "label: value" caption ("components: 53", "Total revenue: $1.2M")
  // is voiced as just "components" / "Total revenue" — the value is DROPPED, and because
  // the clip is then short the highlight crams the whole cue into it and races. This is
  // the live-narration regression #904 introduced (the old markdown flatten carried no
  // such colon). Soften it to a COMMA in the SPOKEN form only — a soft prosodic pause
  // the voice honors without dropping the value. The DISPLAY word keeps its colon (the
  // caption/`.vtt` glyphs are display-text, unchanged — see cadenza/vtt.ts), so only what
  // the voice SAYS changes. Mid-token colons (times `3:30`, ratios `16:9`) have no
  // TRAILING colon and are untouched. See engineering/decisions/2026-07-11-manifest-speech-contract.md.
  const spokenPunct = punct.replace(/[:;]/g, ',');

  // The author lexicon on the punctuation-peeled CORE, so a word OR a symbol-bearing key carrying a
  // terminator ("Kubernetes.", "R&D.") still matches its key. Runs BEFORE the symbol commons so the
  // whole-key override beats a glyph embedded in that key. Re-attach the softened punctuation; a
  // silenced token drops it too.
  if (lexicon?.has(core)) {
    const spoken = spokenLexiconValue(lexicon.get(core) as string, opts);
    return spoken ? spoken + spokenPunct : '';
  }

  // BRACKETING punctuation is VISUAL — the display word keeps it, the voice does not say it.
  // Peel it and re-run the whole pipeline on the value inside, so `($4.2M)` normalizes exactly
  // as `$4.2M` does. This runs AFTER both author registries so a deck can still override the
  // wrapped form verbatim (`lexicon: {"(12)": "negative twelve"}`), and before the symbol
  // commons so the operand inside is expanded rather than the brackets being glyph-spoken.
  //
  // NOTE ON `(12)`: peeling makes this "twelve", not "negative twelve". The accounting-negative
  // convention is real but domain-specific — the same shape is a footnote marker in prose — so
  // this does not guess. Reading it as a number beats reading it as glyphs; a deck that means
  // the accounting sense says so with `lexicon:`, and a `finance` domain pack is the right home
  // for making it automatic. See 2026-09-20-narration-audit.md Finding 3.
  const unwrapped = peelWrappers(core);
  if (unwrapped !== core) {
    if (!unwrapped) return ''; // brackets and nothing else — silence, like a dropped glyph
    const spoken = toSpoken(unwrapped, opts);
    return spoken ? spoken + spokenPunct : '';
  }

  // A TRAILING `×` on a bare number is a MULTIPLIER, not the multiplication operator, so hand it
  // to `spokenCore`'s multiplier rule as the ASCII form that rule can still see. `resolveSymbols`
  // below rewrites every `×` to the literal word "times" before `spokenCore` runs, which made the
  // `×` alternative in that rule's own character class dead code — and cost it the singular
  // agreement it exists to provide: `1x` read "one time" while `1×` read "one times", two
  // spellings an author treats as identical reading two different ways.
  const multCore = core.replace(/^([\d,]+(?:\.\d+)?)\s*×$/, '$1x');
  if (multCore !== core) return spokenCore(multCore, domains, acronyms, english) + spokenPunct;

  // Speech Symbol Commons — arrows, math operators, typographic marks, emoji. One glyph pass
  // handles standalone ("→"), embedded ("red↔green"), and mixed ("3×4"): each known glyph becomes
  // a spoken word (SPEAK), a silence (DROP / decorative emoji), or the author's lexicon override;
  // the pieces are re-normalized so operands ("Q1"/"Q2") still expand. Ambiguous glyphs
  // ("+ − = / #") aren't listed and pass through untouched. Spoken-form ONLY — display + `.vtt`
  // keep the glyph. See symbols.ts + the design ADR.
  const symbolic = resolveSymbols(tok, { overrides: opts.lexicon, english });
  if (symbolic !== null) {
    // Re-normalize the pieces WITHOUT the lexicon — the built-in SPEAK table is acyclic (its
    // values are plain words, no glyphs), so this terminates even for a cyclic/self-referential
    // author override (`lexicon: {"→":"→"}`, reachable from untrusted deck front-matter). A glyph
    // that survives inside an override value still resolves via the built-in table.
    const rest: SpokenOpts = { ...opts, lexicon: undefined };
    return splitWords(symbolic)
      .map((w) => toSpoken(w, rest))
      .filter(Boolean)
      .join(' ');
  }

  // Consult the author registry on the CORE even for a non-English deck (so `CRO,` still expands),
  // but the English lexicon/fiscal/number expansion below is bypassed there — `spokenCore` returns
  // the core unchanged when `english` is false.
  return spokenCore(core, domains, acronyms, english) + spokenPunct;
}

function spokenCore(core: string, domains: readonly LexDomain[], acronyms?: AcronymRegistry, english = true): string {
  if (!core) return core;

  // 0. Author registry (case-sensitive whole token) — beats the built-in dictionary and
  //    every pattern below, so a deck owns its own vocabulary. Applies in every language.
  if (acronyms?.has(core)) return acronyms.get(core) as string;

  // Non-English deck: the author registry (above) is the only expansion; the US-English
  // lexicon, fiscal/period parser, and number-to-words below are all bypassed so nothing
  // English is injected into a non-English deck's narration (#919).
  if (!english) return core;

  // 1. Lexicon (whole-token abbreviations, symbols, initialisms).
  const lex = lookupLexicon(core, domains);
  if (lex !== null) return lex;

  // 1b. Fiscal / calendar period shorthand carrying a year or a leading quarter/half
  //     digit (bare Q1–Q4 come through the lexicon above). CASE-SENSITIVE on the
  //     UPPERCASE letters, so lowercase prose and formulae never fire: `H2` → "second
  //     half" but `h2`/`H2O` are untouched (the anchored `$` also stops `H2O`). An
  //     optional apostrophe (`FY'26`) is absorbed; the year reads literally (§14).
  //       FY26 / FY2026 / CY24 → "fiscal|calendar year <year>"
  //       4Q24 / 3Q / Q3'26   → "<ordinal> quarter[ fiscal <year>]"
  //       1H26 / 2H / H1      → "<ordinal> half[ fiscal <year>]"
  const fyear = core.match(/^(FY|CY)['’]?(\d{2}|\d{4})$/);
  if (fyear) return `${fyear[1] === 'FY' ? 'fiscal' : 'calendar'} year ${yearWords(fyear[2])}`;
  const nQ = core.match(/^([1-4])Q['’]?(\d{2}|\d{4})?$/);
  if (nQ) return `${ORDINALS[Number(nQ[1])]} quarter${nQ[2] ? ` fiscal ${yearWords(nQ[2])}` : ''}`;
  // Q-first WITH a year requires the apostrophe (`Q3'26`) — a bare `Q324` is not a
  // period (the digit-first `4Q24` form and bare `Q3` cover the rest), so it stays put.
  const qY = core.match(/^Q([1-4])['’](\d{2}|\d{4})$/);
  if (qY) return `${ORDINALS[Number(qY[1])]} quarter fiscal ${yearWords(qY[2])}`;
  const nH = core.match(/^([12])H['’]?(\d{2}|\d{4})?$/);
  if (nH) return `${ORDINALS[Number(nH[1])]} half${nH[2] ? ` fiscal ${yearWords(nH[2])}` : ''}`;
  const hN = core.match(/^H([12])$/);
  if (hN) return `${ORDINALS[Number(hN[1])]} half`;

  // 2. Signed prefix. Before a DELTA-BEARING value (%, pp, bps, ×, day, currency,
  //    magnitude) a '+'/'−'(U+2212)/'-' reads as "up"/"down"; before a BARE number
  //    it is a plain sign ("negative two"), NOT a delta — a bare "+44"/"−40" is a
  //    phone code / temperature, not a rise/fall. Both minus glyphs (ASCII '-' and
  //    typographic '−') behave identically, so visually-indistinguishable source
  //    never narrates two different ways.
  const sign = core.match(/^([+−-])(.+)$/);
  if (sign) {
    const rest = sign[2];
    if (/^[\d,]+(?:\.\d+)?$/.test(rest)) {
      const n = numberToWords(Number(rest.replace(/,/g, '')));
      return sign[1] === '+' ? n : `negative ${n}`;
    }
    const restSpoken = spokenCore(rest, domains, acronyms);
    if (restSpoken !== rest) return `${sign[1] === '+' ? 'up' : 'down'} ${restSpoken}`;
  }

  // 3. Section reference: "§1798.140(o)" → "section … subsection o". The citation
  //    number preserves every digit (§1798.100 keeps its trailing zeros) — it is
  //    NOT routed through numberToWords/Number(), which would drop them and speak a
  //    different, wrong section. A digit-GROUPED reading ("seventeen ninety-eight")
  //    is a logged refinement; the subsection markers (a)/(1)/(B) are all read
  //    "subsection X".
  const section = core.match(/^(§+)\s*(.*)$/);
  if (section) {
    const word = section[1].length > 1 ? 'sections' : 'section';
    const subs = [...section[2].matchAll(/\(([a-z0-9]+)\)/gi)].map((m) => m[1]);
    const base = section[2].replace(/\([a-z0-9]+\)/gi, '').trim();
    const baseSpoken = /^[\d,]+(?:\.\d+)?$/.test(base) ? citationNumber(base) : spokenCore(base, domains, acronyms);
    let out = base ? `${word} ${baseSpoken}` : word;
    for (const s of subs) out += `, subsection ${spokenCore(s, domains, acronyms)}`;
    return out;
  }

  // Money: optional currency symbol, grouped number, optional magnitude suffix.
  const money = core.match(new RegExp(`^([$£€])([\\d,]+(?:\\.\\d+)?)(${MAG_RE})?$`, 'i'));
  if (money) {
    const value = Number(money[2].replace(/,/g, ''));
    // Agreement, like `unitWords` does for `1pp` / `1d` / `1bps`. Money was the one value path
    // that skipped it, so `$1` read "one dollars". A MAGNITUDE always pluralizes ("one million
    // dollars"), because the unit then agrees with the magnitude, not with the bare digit.
    const plural = money[3] ? true : value !== 1;
    const unit = money[1] === '$' ? 'dollar' : money[1] === '£' ? 'pound' : 'euro';
    const num = numberToWords(value);
    const mag = money[3] ? ` ${MAGNITUDE[money[3].toLowerCase()]}` : '';
    return `${num}${mag} ${unit}${plural ? 's' : ''}`;
  }

  // Percent.
  const pct = core.match(/^([\d,]+(?:\.\d+)?)%$/);
  if (pct) return `${numberToWords(Number(pct[1].replace(/,/g, '')))} percent`;

  // RANGES — "$1.2–1.4B", "50-60%", "2-3x", "12–15". The single most common shape in guidance,
  // and it used to pass through WHOLE, brackets and all, even though each side on its own
  // normalized perfectly: `$4.2M` worked, `$1.2–1.4B` did not. One separator only, and BOTH
  // sides must be numeric, which is what keeps `ID-4471` (no leading number) and `2026-09-20`
  // (two separators) out of here.
  //
  // A magnitude or unit written once, on the right, applies to the whole range — that is what
  // the notation means and how a person reads it aloud: "$1.2–1.4B" is "one point two to one
  // point four billion dollars", not "one point two dollars to one point four billion".
  const range = core.match(new RegExp(`^([$£€]?)([\\d,]+(?:\\.\\d+)?)(${MAG_RE})?\\s*[–—-]\\s*([$£€]?)([\\d,]+(?:\\.\\d+)?)(${MAG_RE})?([%]|[×x])?$`, 'i'));
  if (range) {
    const [, curL, numL, magL, curR, numR, magR, suffix] = range;
    const cur = curL || curR;
    const lo = numberToWords(Number(numL.replace(/,/g, '')));
    const hi = numberToWords(Number(numR.replace(/,/g, '')));
    const magWord = (m?: string) => (m ? ` ${MAGNITUDE[m.toLowerCase()]}` : '');
    let tail = '';
    if (suffix === '%') tail = ' percent';
    else if (suffix) tail = ' times';
    else if (cur) tail = cur === '$' ? ' dollars' : cur === '£' ? ' pounds' : ' euros';
    // The left side names its own magnitude only when it HAS one and it differs from the right's.
    const loMag = magL && magL.toLowerCase() !== (magR || '').toLowerCase() ? magWord(magL) : '';
    return `${lo}${loMag} to ${hi}${magWord(magR || magL)}${tail}`;
  }

  // ISO date — "2026-09-20" → "September twentieth, twenty twenty-six". Read as a DATE rather
  // than as three numbers, which is what the digits alone would have given if anything had
  // claimed them; nothing did, so the whole string reached the voice raw.
  const iso = core.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const month = MONTHS[Number(iso[2]) - 1];
    const day = ordinalWords(Number(iso[3]));
    if (month && day) return `${month} ${day}, ${yearWords(iso[1])}`;
  }

  // Clock time — "12:30" → "twelve thirty"; ":00" reads "o'clock". A mid-token colon is NOT
  // softened to a comma upstream (only a trailing one is), so this is reached intact.
  const time = core.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (time) {
    const h = integerToWords(Number(time[1]));
    const m = Number(time[2]);
    if (m === 0) return `${h} o'clock`;
    return `${h} ${m < 10 ? `oh ${integerToWords(m)}` : integerToWords(m)}`;
  }

  // Rank — "#1" → "number one". Unambiguous: a `#` before a bare number is a rank or an issue
  // reference in every register a deck uses.
  const rank = core.match(/^#([\d,]+)$/);
  if (rank) return `number ${numberToWords(Number(rank[1].replace(/,/g, '')))}`;

  // Version — "v2.1" → "version two point one". The `v` prefix is what disambiguates it from a
  // plain decimal, so this never fires on a bare number.
  const version = core.match(/^v(\d+(?:\.\d+)*)$/);
  if (version) {
    const parts = version[1].split('.').map((p) => integerToWords(Number(p)));
    return `version ${parts.join(' point ')}`;
  }

  // DELIBERATELY NOT HANDLED: `A/B`, `24/7`, `3.5/5`, `9/20`. A slash carries four unrelated
  // meanings a token cannot distinguish — a pairing, an idiom, an out-of score, a date — and
  // guessing wrong is worse than reading the glyph. A deck that needs one says so with
  // `lexicon:`. Same for `ID-4471`: an identifier's reading is house-specific.

  // Ordinals — "1st", "22nd", "99th". Only 0..99, where the word form is natural.
  const ord = core.match(/^(\d{1,2})(st|nd|rd|th)$/i);
  if (ord) {
    const word = ordinalWords(Number(ord[1]));
    if (word) return word;
  }

  // Decades — "1990s" → "nineteen nineties", "90s" → "nineties". `yearWords` already reads the
  // year; the plural is the decade. Deliberately AFTER the fiscal-period rules so `1H26` and
  // friends keep their meaning.
  const decade = core.match(/^(\d{2}|\d{4})s$/);
  if (decade) {
    const n = Number(decade[1].slice(-2));
    if (n % 10 === 0 && n >= 20) {
      const tensWord = TENS[n / 10];
      const spoken = `${tensWord.replace(/y$/, 'ies')}`;
      return decade[1].length === 4 ? `${yearWords(decade[1].slice(0, 2))} ${spoken}` : spoken;
    }
  }

  // Percentage points / basis points (finance deltas: 2pp, 25bps). Singular when
  // the value is exactly 1 ("1pp" → "one percentage point").
  const pp = core.match(/^([\d,]+(?:\.\d+)?)pp$/i);
  if (pp) return unitWords(pp[1], 'percentage point');
  const bps = core.match(/^([\d,]+(?:\.\d+)?)bps$/i);
  if (bps) return unitWords(bps[1], 'basis point');

  // Multiplier: "4.2×" / "4.2x" → "four point two times".
  const mult = core.match(/^([\d,]+(?:\.\d+)?)\s*[×x]$/);
  if (mult) return unitWords(mult[1], 'time');

  // Duration: "18d" → "eighteen days". Lower-case `d` only (so "3D" is untouched),
  // and NOT seconds — "1990s"/"90s" read as decades/plurals far more often than
  // "seconds", so that mapping is deliberately omitted (logged refinement).
  const dur = core.match(/^([\d,]+(?:\.\d+)?)d$/);
  if (dur) return unitWords(dur[1], 'day');

  // Bare number with a magnitude suffix (4.2M → "four point two million").
  const magNum = core.match(new RegExp(`^([\\d,]+(?:\\.\\d+)?)(${MAG_RE})$`, 'i'));
  if (magNum) {
    return `${numberToWords(Number(magNum[1].replace(/,/g, '')))} ${MAGNITUDE[magNum[2].toLowerCase()]}`;
  }

  // Plain number (with optional grouping commas).
  const num = core.match(/^-?[\d,]+(?:\.\d+)?$/);
  if (num) return numberToWords(Number(core.replace(/,/g, '')));

  return core;
}

/**
 * Expand every token in a passage to its spoken form — the whole-sentence version of
 * `toSpoken`, for feeding a TTS the words to SAY rather than the glyphs to show
 * ("Revenue grew to $4.2M." → "Revenue grew to four point two million dollars.").
 * A caller that speaks raw display text gets the TTS's own (often wrong) number
 * parsing; this gives it Cadenza's instead. `opts.domains` opts in domain lexicon
 * packs. Pure.
 */
/**
 * Drop a direction word the sentence ALREADY said.
 *
 * A leading `+`/`−` on a delta-bearing value reads as "up"/"down" — right on its own, and
 * doubled in the most common phrasing a commercial deck uses, because `toSpoken` sees one
 * token and cannot look left:
 *
 *   "We are up +18% YoY."          → "We are up UP eighteen percent year over year."
 *   "Churn is down -9% this quarter." → "Churn is down DOWN nine percent this quarter."
 *
 * The test is deliberately the strictest one available: the previous DISPLAY word must be
 * the very same word the sign is about to produce. That makes this a dedup, not an
 * inference — "Costs fell −12%" still reads "fell down twelve percent", because guessing
 * which verbs imply a direction is a different and much less safe problem.
 *
 * Lives here, and is called by every producer of a spoken sequence, so the rule cannot
 * drift between the caption track and a plain text render.
 */
export function dedupeDirection(prevDisplay: string | undefined, spoken: string): string {
  if (!prevDisplay || !spoken) return spoken;
  const prev = prevDisplay.toLowerCase().replace(/[^a-z]/g, '');
  if (prev !== 'up' && prev !== 'down') return spoken;
  const m = spoken.match(/^(up|down)\s+([\s\S]*)$/i);
  if (!m || m[1].toLowerCase() !== prev) return spoken;
  return m[2];
}

export function toSpokenText(text: string, opts: SpokenOpts = {}): string {
  const words = splitWords(text);
  return words
    .map((w, i) => dedupeDirection(words[i - 1], toSpoken(w, opts)))
    .filter(Boolean) // a DROPPED symbol (decorative emoji) contributes nothing — no double space
    .join(' ');
}

/** Count spoken sub-words in an expansion ("four point two million dollars" → 5). */
export function spokenWordCount(spoken: string): number {
  return String(spoken ?? '')
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean).length;
}

/**
 * The multi-letter ALL-CAPS tokens in `text` that pass through `toSpoken` UNCHANGED —
 * i.e. neither the author registry (`opts.acronyms`) nor the built-in lexicon expands
 * them, so a TTS spells them letter-by-letter (`ROI` → "arr oh eye"). This is the
 * discovery signal behind the deck lint's "did you mean to add these to `acronyms:`?"
 * hint. Each token is edge-trimmed of non-alphanumerics (so `**ROI**`, `(API)` still
 * register), tested as a pure A–Z run of length ≥ 2 (digit-bearing shorthand like `FY26`
 * is left to the fiscal parser), and returned unique in first-seen order. Pure.
 */
const isAlphaNum = (c: string): boolean =>
  (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');

// Wrapping punctuation — the marks that DELIMIT a token and are never part of its value.
// Deliberately NOT the same set as `edgeTrim`'s "anything non-alphanumeric": `$`, `€`, `§`,
// `+`, `−`, `#`, `~`, `≥` all LEAD a value and carry meaning the parsers below depend on, so
// peeling them would break money, sections and signed deltas. These only ever bracket.
const WRAP_PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '“': '”', // “ ”
  '‘': '’', // ‘ ’
  '«': '»', // « »
  '*': '*', // markdown emphasis that survived an upstream strip
  _: '_',
};
const WRAP_CLOSERS = new Set(Object.values(WRAP_PAIRS));

/**
 * Peel BRACKETING punctuation off a token so the rules below see the value inside it.
 *
 * Without this, any wrapped token skipped every rule the library has and reached the voice as
 * raw glyphs — `($4.2M)`, `"ARR"`, `[CEO]`, `(§5)`, `(12)` — while the BARE forms all normalized
 * correctly. The peel was already written (`edgeTrim`) and called only by `unmatchedAcronyms`,
 * the lint's discovery signal, so the lint trimmed the token, found it resolvable and reported
 * nothing, on exactly the tokens the voice would mangle.
 *
 * Two rules keep it from eating a value's own punctuation:
 *  • An opener is peeled only when the token CLOSES with its partner (`(12)`) or contains no
 *    partner at all (`(Reason` — a parenthetical broken across words). So `§1798.140(o)` keeps
 *    its `(o)`: it neither starts with `(` nor lacks a `)`.
 *  • A closer is peeled only when the token contains no matching opener, which is what lets
 *    `ARR)` through while `§1798.140(o)` is left alone.
 *
 * Loops rather than recursing so `((ARR))` resolves in one call, and each pass strips at least
 * one character, so it terminates. Linear index work only — no anchored `+` quantifier, for the
 * same ReDoS reason `edgeTrim` documents.
 */
function peelWrappers(raw: string): string {
  let s = raw;
  for (;;) {
    if (s.length < 2) return s;
    const first = s[0];
    const last = s[s.length - 1];
    const partner = WRAP_PAIRS[first];
    if (partner !== undefined && (last === partner || !s.includes(partner, 1))) {
      s = last === partner ? s.slice(1, -1) : s.slice(1);
      continue;
    }
    // A bare closer: peel only when its opener is genuinely absent from the token.
    if (WRAP_CLOSERS.has(last)) {
      const opener = Object.keys(WRAP_PAIRS).find((k) => WRAP_PAIRS[k] === last);
      if (opener !== undefined && !s.slice(0, -1).includes(opener)) {
        s = s.slice(0, -1);
        continue;
      }
    }
    return s;
  }
}

/** Trim leading/trailing non-alphanumerics via linear index scans — NOT a `[^…]+$`-anchored
 *  regex, whose `+`-quantifier backtracks polynomially on a run of many non-alphanumerics
 *  (a static-analyzer ReDoS flag). Both scans are single-pass and unambiguous. */
function edgeTrim(raw: string): string {
  let a = 0;
  let b = raw.length;
  while (a < b && !isAlphaNum(raw[a])) a++;
  while (b > a && !isAlphaNum(raw[b - 1])) b--;
  return raw.slice(a, b);
}

export function unmatchedAcronyms(text: string, opts: SpokenOpts = {}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of splitWords(text)) {
    const tok = edgeTrim(raw); // `**ROI**`, `(API)` → `ROI`/`API` (linear, ReDoS-safe)
    if (!/^[A-Z]{2,}$/.test(tok) || seen.has(tok)) continue; // multi-letter all-caps, once each
    seen.add(tok);
    if (toSpoken(tok, opts) === tok) out.push(tok); // passthrough ⇒ expanded by nothing
  }
  return out;
}
