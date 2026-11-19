// TERM REPORTS: which of a deck's terms fire in a text, and which odd words nothing covers. Built for the
// Studio chat's `preview_speech` (#3208 item 3), which loads this module on demand.
//
// WHY ITS OWN FILE, AND NOT IN index.ts. `normalize.ts` sits in a chunk that pages load up front, and
// the Studio loads the whole package with a dynamic `import('@/lib/cadenza')` (TermsEditor, the chat).
// A dynamic import of the package keeps every export of index.ts, so these two functions in
// normalize.ts or re-exported from index.ts rode in that eager chunk: the route budget measured +601
// gzip bytes on the Studio and the home page. The chat imports this file directly, so it lands in a
// lazy chunk of its own. Not part of the published package's API; the chat is its only consumer.

import { edgeTrim, type SpokenOpts, spokenAt, toSpoken, unmatchedAcronyms, unspokenTokens } from './normalize.js';
import { splitWords } from './segment.js';
import { compoundParts, lookupTerm, phraseCover, termIndex } from './terms.js';

/** Drop trailing sentence punctuation with a scan, not a `[…]+$` regex, which backtracks on a long run. */
function trimEndPunct(s: string): string {
  let end = s.length;
  while (end > 0 && ',.;:!?'.includes(s[end - 1])) end--;
  return s.slice(0, end);
}
/** One registry term as the voice meets it in a text: the word(s) as written, and what is said. */
export interface TermUse {
  readonly written: string;
  readonly spoken: string;
}

/**
 * The deck's TERMS that fire in `text` — each written form once, in first-seen order, with what the
 * voice says for it. The spoken side comes from `spokenAt`, the function `toSpokenText` reads every
 * word through, so this report cannot disagree with the voice. A possessive or plural is its own
 * written form (`Derby's` beside `Derby`) because it is said differently. A multi-word key is
 * reported as the whole phrase. Pure. Built for the Studio chat's `preview_speech` (#3208 item 3).
 */
export function termHits(text: string, opts: SpokenOpts = {}): TermUse[] {
  const idx = termIndex(opts);
  if (!idx) return [];
  const words = splitWords(text);
  const cover = idx.phrases.size ? phraseCover(idx, words) : [];
  const seen = new Set<string>();
  const out: TermUse[] = [];
  for (let i = 0; i < words.length; i++) {
    const slot = cover[i];
    if (slot?.value === null) continue; // a later word of a phrase already reported
    let written: string;
    if (slot) {
      let n = 1;
      while (cover[i + n]?.value === null) n++;
      written = words.slice(i, i + n).map(edgeTrim).join(' ');
    } else {
      const tok = edgeTrim(words[i]);
      if (!lookupTerm(idx, words[i].trim()) && !lookupTerm(idx, tok) && !compoundParts(idx, tok)) continue;
      written = tok || words[i].trim();
    }
    if (!written || seen.has(written)) continue;
    seen.add(written);
    out.push({ written, spoken: trimEndPunct(spokenAt(words, i, opts)) });
  }
  return out;
}

// A dot between two letters (`Twinkima.G`, `St.Louis`), or a capital after a lower-case letter
// (`McKinsey`, `iPhone`). Neither is wrong, but a voice reads both unpredictably.
const UNUSUAL_SHAPES: RegExp[] = [/\p{L}\.\p{L}/u, /\p{Ll}\p{Lu}/u];
// Single letters joined by dots (`e.g`, `i.e`, `U.S`, `a.m`, edge-trimmed): voices read these well.
const DOTTED_INITIALS = /^\p{L}(?:\.\p{L})+$/u;

/**
 * The words in `text` a voice is likely to stumble on and that NOTHING expands: the all-caps runs
 * `unmatchedAcronyms` finds, the value shapes `unspokenTokens` finds, and words with a dot inside or a
 * capital after a lower-case letter. On demand only — the deck lint keeps its narrower
 * `unspokenTokens`, because a lint that cries wolf gets switched off
 * (2026-09-21-token-passthrough-coaching.md); a preview the author asked for can afford the wider net.
 * Names from other languages look like any other word and are not found. Pure.
 */
export function unusualWords(text: string, opts: SpokenOpts = {}): string[] {
  const out = new Set<string>([...unmatchedAcronyms(text, opts), ...unspokenTokens(text, opts)]);
  for (const raw of splitWords(text)) {
    const tok = edgeTrim(raw);
    if (out.has(tok) || DOTTED_INITIALS.test(tok) || !UNUSUAL_SHAPES.some((re) => re.test(tok))) continue;
    if (toSpoken(tok, opts) === tok) out.add(tok); // passthrough ⇒ expanded by nothing
  }
  return [...out];
}
