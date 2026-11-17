// Cadenza — the deck TERM matcher: which registry key, if any, a written token or run of words means.
//
// A deck's front matter declares how its terms are spoken (`terms:`, and the older `acronyms:` and
// `lexicon:` it absorbs — lib/core/resolve-narration.mjs parses all three into one map). This module
// answers ONE question for every narration producer: does this written token match a key? It used to
// be an exact, case-sensitive whole-token lookup, so `CROs`, `CRO's`, `CRO-led`, `derby` and any
// two-word name read as written. The forms it now matches, in order (engineering/decisions/
// 2026-11-16-terms-registry.md §4):
//
//   1. exact;
//   2. case — a Capitalized key (`Derby`) also matches its ALL-CAPS title form; a lower-case key
//      (`kubectl`) also matches its sentence-start Capitalized form, never ALL CAPS (`us` is not `US`);
//      a key with any other capital (`CRO`, `SaaS`) matches only as written, so `IT` never fires on "it";
//   3. endings — `'s`, `’s`, `s'`, `s` after a key keep the ending on the spoken form; never after a
//      lower-case key, where they would make ordinary words (`it` → `its`, `bu` → `bus`);
//   4. compounds — `CRO-led`, `CRO/CFO` (normalize.ts speaks the parts; this finds them), but never a
//      hyphen between two parts with digits in them: that is a range or a date (`FY24-FY26`);
//   5. phrases — a multi-word key over consecutive words (`St. Louis`, and `Twinkima G's`).
//
// Pure and dependency-free. It returns RAW registry values; normalize.ts normalizes them.

/** A deck's term registry: written key → what the voice says ("" silences). */
export type TermMap = ReadonlyMap<string, string>;

interface Phrase {
  readonly words: readonly string[];
  readonly value: string;
}

export interface TermIndex {
  /** Every key, exactly as written → raw value. */
  readonly exact: ReadonlyMap<string, string>;
  /** The SYMBOL keys only (no letter or digit in them) — what the glyph pass may substitute INSIDE a
   *  token ("red↔green"). A letter or digit key never does: `e: EEK` used to turn "revenue" into
   *  "r EEK v EEK nu EEK", and `A: alpha` would read "Area" as "alpha rea". */
  readonly glyphs: ReadonlyMap<string, string>;
  /** Lower-cased foldable single-word key → its key, for the case rule. */
  readonly folded: ReadonlyMap<string, string>;
  /** Multi-word keys, by their first word lower-cased. Longest first. */
  readonly phrases: ReadonlyMap<string, readonly Phrase[]>;
}

/** The three registries a caller may pass; later ones win (`terms` beats `acronyms` beats `lexicon`). */
export interface TermSources {
  lexicon?: TermMap;
  acronyms?: TermMap;
  terms?: TermMap;
}

const LETTER = /\p{L}/u;
const isLower = (s: string): boolean => LETTER.test(s) && s === s.toLowerCase();
const isAllCaps = (s: string): boolean => LETTER.test(s) && s === s.toUpperCase() && s !== s.toLowerCase();
const isCapitalized = (s: string): boolean => {
  const [first, ...rest] = [...s];
  if (first === undefined) return false;
  const tail = rest.join('');
  return first !== first.toLowerCase() && tail === tail.toLowerCase() && LETTER.test(tail);
};

/** May this key match other cases of itself? Only a lower-case or Capitalized key. */
const isFoldable = (key: string): boolean => isLower(key) || isCapitalized(key);

/** Does a written word match a FOLDABLE key under the case rule? */
function caseMatches(key: string, word: string): boolean {
  if (word === key) return true;
  if (word.toLowerCase() !== key.toLowerCase()) return false;
  if (isLower(key)) return isCapitalized(word); // a sentence start; ALL CAPS is another word (`us`/`US`)
  return isAllCaps(word); // a Capitalized key: its ALL-CAPS form (a title), never the lower-case word
}

const EMPTY: TermMap = new Map();
const cache = new WeakMap<TermMap, WeakMap<TermMap, WeakMap<TermMap, TermIndex>>>();

/** Build (or fetch) the index for a caller's registries. Null when there is nothing to match. */
export function termIndex(src: TermSources): TermIndex | null {
  const lexicon = src.lexicon ?? EMPTY;
  const acronyms = src.acronyms ?? EMPTY;
  const terms = src.terms ?? EMPTY;
  if (!lexicon.size && !acronyms.size && !terms.size) return null;
  let a = cache.get(lexicon);
  if (!a) cache.set(lexicon, (a = new WeakMap()));
  let b = a.get(acronyms);
  if (!b) a.set(acronyms, (b = new WeakMap()));
  let idx = b.get(terms);
  if (!idx) b.set(terms, (idx = build(lexicon, acronyms, terms)));
  return idx;
}

function build(lexicon: TermMap, acronyms: TermMap, terms: TermMap): TermIndex {
  const exact = new Map<string, string>();
  for (const map of [lexicon, acronyms, terms]) for (const [k, v] of map) if (k) exact.set(k, v);
  const folded = new Map<string, string>();
  const phrases = new Map<string, Phrase[]>();
  for (const [key, value] of exact) {
    const words = key.trim().split(/\s+/);
    if (words.length > 1) {
      const head = words[0].toLowerCase();
      const list = phrases.get(head) ?? [];
      list.push({ words, value });
      phrases.set(head, list);
    } else if (isFoldable(key) && !folded.has(key.toLowerCase())) {
      folded.set(key.toLowerCase(), key);
    }
  }
  for (const list of phrases.values()) list.sort((x, y) => y.words.length - x.words.length);
  const glyphs = new Map([...exact].filter(([k]) => !/[\p{L}\p{N}]/u.test(k)));
  return { exact, glyphs, folded, phrases };
}

/** Rules 1–2: the key a single written word matches, or undefined. */
function wordKey(idx: TermIndex, word: string): string | undefined {
  if (idx.exact.has(word)) return word;
  const key = idx.folded.get(word.toLowerCase());
  return key !== undefined && caseMatches(key, word) ? key : undefined;
}

// Rule 3's endings, longest first. A bare `'` and `es` are left out: both mostly end ordinary words.
const ENDINGS: readonly (readonly [string, string])[] = [
  ['’s', "'s"],
  ["'s", "'s"],
  ["s'", "s'"],
  ['s', 's'],
];

/** A matched token: the raw value, plus the ending the voice keeps after its normalized form. */
export interface TermHit {
  readonly value: string;
  readonly ending: string;
}

/** Rules 1–3 on one written token (already peeled of wrapping and trailing sentence punctuation). */
export function lookupTerm(idx: TermIndex | null, token: string): TermHit | undefined {
  if (!idx || !token) return undefined;
  const whole = wordKey(idx, token);
  if (whole !== undefined) return { value: idx.exact.get(whole) as string, ending: '' };
  const ending = endingOf(idx, token);
  return ending ? { value: idx.exact.get(ending.key) as string, ending: ending.spoken } : undefined;
}

/** Rule 3 on its own: the key a token is an ending of, and the spoken ending. Never after a lower-case
 *  key — `its`, `bus`, `it's` are words, not the plural or possessive of `it` / `bu`. */
function endingOf(idx: TermIndex, token: string): { key: string; spoken: string } | undefined {
  for (const [written, spoken] of ENDINGS) {
    if (!token.endsWith(written)) continue;
    const base = token.slice(0, -written.length);
    if (base.length < 2 || !LETTER.test(base)) continue;
    // A plain `s` only counts after a key that does not itself end in a lower-case s, and only in the
    // key's own register: `CROs` and `Derbys`, never `CROS` (a different all-caps word).
    if (written === 's' && (isAllCaps(token) || base.endsWith('s'))) continue;
    const key = wordKey(idx, base);
    if (key !== undefined && !isLower(key)) return { key, spoken };
  }
  return undefined;
}

/**
 * Rule 4: split a `-` / `/` compound when at least one part is a key. Returns the parts and the
 * separators between them, or null when no part matches (the token then reads as before).
 */
export function compoundParts(idx: TermIndex | null, token: string): { parts: string[]; seps: string[] } | null {
  if (!idx || !/[^-/][-/][^-/]/.test(token)) return null;
  const pieces = token.split(/([-/])/);
  const parts: string[] = [];
  const seps: string[] = [];
  for (let n = 0; n < pieces.length; n++) (n % 2 ? seps : parts).push(pieces[n]);
  if (parts.some((p) => !p)) return null;
  // A hyphen between two parts that both carry a digit is a range or a date (`FY24-FY26`, `Q1-Q2`,
  // `2026-11-16`), and splitting it would drop the "to" the reader hears. Leave it as it reads.
  if (seps.some((sep, n) => sep === '-' && /\d/.test(parts[n]) && /\d/.test(parts[n + 1]))) return null;
  return parts.some((p) => lookupTerm(idx, p) !== undefined) ? { parts, seps } : null;
}

// Wrapping marks a phrase's first and last words may carry. The last word's sentence punctuation
// is returned so the caller keeps the pause.
// Linear index scans, never an end-anchored `[…]+$` regex: that backtracks polynomially on a long run
// of its class (a word of a thousand quotes or bangs, CodeQL js/polynomial-redos) — the reason
// normalize.ts peels with `trailingPunct` / `edgeTrim` too.
const OPEN_MARKS: ReadonlySet<string> = new Set(['(', '[', '"', "'", '“', '‘', '*', '_']);
const CLOSE_MARKS: ReadonlySet<string> = new Set([')', ']', '"', "'", '”', '’', '*', '_']);
const SENTENCE_END: ReadonlySet<string> = new Set(['.', ',', '!', '?', ';', ':', '…']);
const dropStart = (w: string, set: ReadonlySet<string>): string => {
  let a = 0;
  while (a < w.length && set.has(w[a])) a++;
  return w.slice(a);
};
const dropEnd = (w: string, set: ReadonlySet<string>): string => {
  let b = w.length;
  while (b > 0 && set.has(w[b - 1])) b--;
  return w.slice(0, b);
};
/** A word without its closing marks and sentence punctuation (`G.")` → `G`), and that punctuation. */
function peelEnd(w: string): { core: string; punct: string } {
  const closed = dropEnd(w, CLOSE_MARKS);
  const bare = dropEnd(closed, SENTENCE_END);
  return { core: dropEnd(bare, CLOSE_MARKS), punct: closed.slice(bare.length) };
}

/**
 * Rule 5: for each word of a sentence, the phrase it belongs to. A phrase's FIRST word gets
 * `{ value, punct }`; each later word gets `{ value: null }` (it speaks nothing); every other word
 * gets undefined. Left to right, longest phrase first; a comma or full stop inside a run ends it.
 */
export function phraseCover(idx: TermIndex | null, words: readonly string[]): readonly (PhraseSlot | undefined)[] {
  const out: (PhraseSlot | undefined)[] = new Array(words.length);
  if (!idx?.phrases.size) return out;
  for (let j = 0; j < words.length; ) {
    // The head as written (a key word may carry its own dot: `St.`) and with its punctuation peeled.
    const opened = dropStart(words[j], OPEN_MARKS);
    const heads = new Set([opened.toLowerCase(), peelEnd(opened).core.toLowerCase()]);
    let found: { ph: Phrase; tail: PhraseTail } | undefined;
    for (const head of heads) {
      for (const ph of idx.phrases.get(head) ?? []) {
        const tail = phraseAt(ph, words, j);
        if (tail) {
          found = { ph, tail };
          break;
        }
      }
      if (found) break;
    }
    if (!found) {
      j++;
      continue;
    }
    out[j] = { value: found.ph.value, ending: found.tail.ending, punct: found.tail.punct };
    for (let m = 1; m < found.ph.words.length; m++) out[j + m] = { value: null, ending: '', punct: '' };
    j += found.ph.words.length;
  }
  return out;
}

export interface PhraseSlot {
  readonly value: string | null;
  /** The ending the phrase's last word carried (`Twinkima G's` → "'s"). */
  readonly ending: string;
  readonly punct: string;
}

interface PhraseTail {
  readonly ending: string;
  readonly punct: string;
}

/** Does a written word match one word of a key? As written first (so `St.` matches `St.`), then by the case rule. */
const keyWordMatches = (key: string, w: string): boolean => w === key || (isFoldable(key) && caseMatches(key, w));

function phraseAt(ph: Phrase, words: readonly string[], j: number): PhraseTail | null {
  const n = ph.words.length;
  if (j + n > words.length) return null;
  for (let m = 0; m < n - 1; m++) {
    const w = m === 0 ? dropStart(words[j], OPEN_MARKS) : words[j + m];
    if (keyWordMatches(ph.words[m], w)) continue;
    return null; // "Twinkima, G" is two thoughts, not the name: a comma the key lacks breaks it
  }
  // The last word: as written, then with its closing marks and sentence punctuation peeled, then with
  // an ending off (`G's`) — the same ending rule a single-word key follows (never after a lower-case key).
  const key = ph.words[n - 1];
  let w = words[j + n - 1];
  if (n === 1) w = dropStart(w, OPEN_MARKS);
  if (keyWordMatches(key, w)) return { ending: '', punct: '' };
  const { core: peeled, punct } = peelEnd(w);
  if (keyWordMatches(key, peeled)) return { ending: '', punct };
  if (!isLower(ph.words.join(' '))) {
    for (const [written, spoken] of ENDINGS) {
      if (written === 's') continue; // a plural of a name is rare; `G's` and `Co.'s` are the cases that matter
      if (peeled.endsWith(written) && keyWordMatches(key, peeled.slice(0, -written.length))) return { ending: spoken, punct };
    }
  }
  return null;
}
