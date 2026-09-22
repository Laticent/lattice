// Cadenza — the CANONICAL segmenter. Text → sentences (cues) → words.
//
// This is the single source of truth for "how narration is split," retiring the
// three hand-copied splitters in the tree (voice-model's splitSentences, the
// studio read-aloud's splitForCaption). It is pure + deterministic → unit-tested,
// and imports nothing (the spin-off invariant).
//
// One cue == one sentence in v1 (the re-anchor unit, see track.ts). We break AFTER a
// terminator (`.!?…`) that is followed by whitespace — so a mid-token dot ("$4.2M",
// "3.5x") never splits, which the prior naive splitters got wrong.
//
// A CUE IS THREE THINGS AT ONCE, which is why the break rule has to be right: a caption
// LINE, the re-anchor unit (track.ts), and — since read-aloud.ts:684 — ONE synthesized
// TTS clip. This file used to say an over-split "costs a tiny extra gap, never a
// correctness bug". That stopped being true when one cue became one clip: the voice says
// "Doctor." — full stop, a real inserted silence — and then "Chen approved it." It is in
// shipped bytes (`gallery.vtt` carried `Cal.` and `Civ.` as standalone cues), and it is
// also a TIMING error, because track.ts prices a word from its spoken string. So both
// halves are handled here:
//
//   OVER-split  — an abbreviation's period is not a sentence end (ABBREV_* below).
//   UNDER-split — a terminator followed by a CLOSING quote or bracket IS one, so
//                 `He said "Go now." Then he left.` is two cues, not one run-on clip.
//
// Both are measured in engineering/decisions/2026-09-20-narration-audit.md § Finding 3.

/**
 * Closing punctuation that may sit BETWEEN a terminator and the sentence break —
 * the straight and curly quotes, the guillemet, and the two brackets. A deck's
 * quoted line ends `…now."`, and the break belongs after the quote, not before it.
 */
const CLOSERS = '"\'”’»)\\]';

/** Break after a terminator plus at most one closer, when whitespace follows. */
const SENTENCE_BREAK = new RegExp(`(?<=[.!?…][${CLOSERS}]?)\\s+`);

/** Does this text end in a terminator (plus an optional closer)? */
const ENDS_TERMINATED = new RegExp(`[.!?…][${CLOSERS}]?$`);

/** Does this text end in a terminator that is INSIDE a closer? */
const ENDS_CLOSED = new RegExp(`[.!?…][${CLOSERS}]$`);

/**
 * Abbreviations whose period is NEVER a sentence end, because each one LABELS the
 * thing that follows it — a title needs its name, `No.` needs its number, `e.g.`
 * needs its example. Keys are lowercase with wrapping punctuation and the trailing
 * period peeled (see `abbrevKey`).
 */
const ABBREV_ALWAYS = new Set([
  // Titles — always attached to a name. (`St.` is deliberately absent: "Main St."
  // ends a sentence as readily as "St. Louis" opens one.)
  'dr', 'mr', 'mrs', 'ms', 'prof', 'rev', 'hon',
  // Legal codes and reporters, which always precede the section or part they cite:
  // "Cal. Civ. Code §1798.140(o)", "15 U.S.C. §6501", "16 C.F.R. Part 312". Only
  // `c.f.r` needs to be here — the rest are followed by a §, which
  // `CONTINUATION_START` already catches — but a citation's own elements are worth
  // naming rather than leaving to a downstream glyph.
  'cal', 'civ', 'u.s.c', 'c.f.r',
  // Latin connectives, which introduce rather than close.
  'e.g', 'i.e', 'cf', 'viz', 'vs',
]);

// WHAT IS DELIBERATELY NOT ABOVE, and why the distinction is the whole design. An entry
// here merges whatever follows, so any word that is ALSO ordinary English silently
// swallows a real sentence. Measured on examples/system-design-foundations.md: with `no`
// and `art` in this set, "She said no. That refusal is the boundary…" and "No. Thirty
// tables…" each collapsed into one cue — a worse defect than the over-split this whole
// change is about. Both are label-then-number abbreviations, so they moved to
// ABBREV_BEFORE_DIGIT, where "No. 4" still merges and "She said no." cannot.
// `pub`, `stat`, `const`, `tit` and `supp` were dropped outright: each is either an
// ordinary word or a code keyword, none appears in the 186 shipped decks, and the
// citations that use them ("Colo. Rev. Stat. §6-1-1301") are carried by the §.

/**
 * Abbreviations that CAN legitimately end a sentence ("…a subsidiary of Acme Inc."),
 * so the period alone does not decide. Merge only when what follows starts with a
 * lowercase letter — a real next sentence starts with a capital.
 */
const ABBREV_BEFORE_LOWER = new Set([
  'inc', 'ltd', 'corp', 'co', 'llc', 'llp', 'plc', 'gmbh',
  'etc', 'al', 'approx', 'est', 'dept', 'govt',
]);

/**
 * Abbreviations whose period separates a LABEL from the NUMBER it labels, so a digit
 * following is what says the fragment continues. "Sept. 20" is one date and "No. 4"
 * one reference; "We ship in Sept. Then we rest." and "She said no. That refusal…"
 * are two sentences each. Case cannot decide these — a year and a capital look the
 * same to a case test — and an unconditional merge swallows the sentence.
 */
const ABBREV_BEFORE_DIGIT = new Set([
  // Months. (May takes no period.)
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  // Reference prefixes, which label a number: "No. 4", "Art. 5", "Fig. 3", "p. 315".
  // Graded by the digit rather than listed as always-merging because four of them —
  // `no`, `art`, `ch`, `fig` — are ordinary English words that end real sentences.
  'no', 'art', 'fig', 'vol', 'ch', 'pp', 'p',
]);

/**
 * An initialism spelled with internal periods — `U.S.`, `U.K.`, `D.C.`, `a.m.`,
 * `Ph.D.` The generic shape covers the ones no list will remember, and it is
 * graded like ABBREV_BEFORE_LOWER because "He lives in the U.S." is a sentence.
 * Letters only between the dots, so a version (`v2.1`) and a price (`$4.2m`) miss.
 */
const INITIALISM = /^[a-z]+(?:\.[a-z]+)+$/;

/**
 * Punctuation that cannot OPEN a sentence, so a fragment starting with one CONTINUES
 * the fragment before it whatever the punctuation between them. An em or en dash
 * introducing an aside ("…the shape — \"A diamond.\" — then fan-in coalesces"), a
 * section symbol continuing a citation ("15 U.S.C. §6501"), an ampersand joining a
 * two-part code name ("Tex. Bus. & Com. §503.001"), a closing bracket that belongs to
 * something already open.
 *
 * This is the general form of the rule the citation codes below encode by name, and
 * it is what keeps the closing-quote break from stranding an aside as its own cue:
 * measured across the 186 shipped decks, the quote break alone produced six such
 * fragments. A plain hyphen is deliberately NOT here — "-18% was the swing." is a
 * real sentence, and an HTML comment's `-->`, the only other candidate, is blanked
 * long before narration sees it.
 */
const CONTINUATION_START = /^[—–§&)\]}]/;

/**
 * The last whitespace-delimited token of `left`, lowercased, with wrapping
 * punctuation and ANY terminator peeled — the key the sets above use. Peeling
 * every terminator, not just the period, keeps this function's job to "which WORD
 * ended the fragment" and leaves "was that punctuation ambiguous" wholly to
 * `isAbbreviationBreak`. While the period was peeled here too, that function's
 * terminator guard was UNREACHABLE — no key could match while still carrying its
 * `?` — so the guard read as load-bearing and no test could falsify it.
 */
function abbrevKey(left: string): string {
  const tokens = left.trim().split(/\s+/);
  const last = tokens[tokens.length - 1] ?? '';
  return last
    .replace(/^[("'“‘«[]+/, '')
    .replace(new RegExp(`[${CLOSERS}]+$`), '')
    .replace(/[.!?…]$/, '')
    .toLowerCase();
}

/**
 * Is the break between `left` and `right` an ABBREVIATION's period rather than a
 * sentence end? Only a period is ever ambiguous — `!` and `?` and `…` always close.
 */
function isAbbreviationBreak(left: string, right: string): boolean {
  const l = left.trim();
  if (!new RegExp(`\\.[${CLOSERS}]*$`).test(l)) return false;
  const key = abbrevKey(l);
  if (!key) return false;
  if (ABBREV_ALWAYS.has(key)) return true;
  const r = right.trim();
  if (ABBREV_BEFORE_DIGIT.has(key)) return /^\d/.test(r);
  if (ABBREV_BEFORE_LOWER.has(key) || INITIALISM.test(key)) return /^[a-z]/.test(r);
  return false;
}

/**
 * Is the break between `left` and `right` spurious — not a sentence end at all? Two
 * independent reasons: what follows cannot open a sentence, or what precedes is an
 * abbreviation. `splitSentences` folds such a break back, and `splitParagraphs` must
 * consult the SAME predicate or the two disagree on a paragraph that ends this way.
 */
function isSpuriousBreak(left: string, right: string): boolean {
  const r = right.trim();
  if (CONTINUATION_START.test(r)) return true;
  // A run of exactly TWO periods is a RANGE separator, not a terminator: `gantt` spells
  // a span `2026 Q1 .. 2026 Q4`, and nine shipped decks use it. It broke there on `main`
  // too, so this is pre-existing rather than new — but it is the same defect in the same
  // function, so it is fixed here rather than logged. THREE periods are left alone: an
  // authored `...` can genuinely end a sentence, and the house ellipsis is `…` anyway.
  if (new RegExp(`(?:^|[^.])\\.\\.[${CLOSERS}]*$`).test(left.trim())) return true;
  // A terminator INSIDE a closer ends the sentence only if a sentence follows it. The
  // closer break is what makes `He said "Go now." Then he left.` two cues; the very same
  // shape mid-sentence is an aside — `A tone marker (tone-pass / …) sets a color.` — and
  // a lowercase continuation is what tells the two apart, exactly as it does for the
  // graded abbreviations above. Without this the under-split fix trades one defect for
  // another: measured, it split three shipped decks' parentheses mid-sentence.
  if (ENDS_CLOSED.test(left.trim()) && /^[a-z]/.test(r)) return true;
  return isAbbreviationBreak(left, right);
}

/**
 * Split text into sentences. Whitespace is collapsed first so a sentence never
 * carries stray newlines. Splits on whitespace that FOLLOWS a sentence terminator
 * (a lookbehind) and its optional closing quote, leaving decimals/version
 * numbers/currency intact; a trailing fragment with no terminator is its own
 * sentence. A break `isSpuriousBreak` rejects is then folded back.
 */
export function splitSentences(text: string): string[] {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  const parts = s
    .split(SENTENCE_BREAK)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const prev = out.length ? out[out.length - 1] : null;
    // Compare against the ACCUMULATED sentence, not the raw fragment, so a run of
    // abbreviations ("Cal. Civ. Code …") folds all the way back into one cue.
    if (prev !== null && isSpuriousBreak(prev, part)) out[out.length - 1] = `${prev} ${part}`;
    else out.push(part);
  }
  return out;
}

/**
 * Paragraph-aware split: the SAME sentence list `splitSentences` produces, PLUS the set of sentence
 * indices that END a paragraph (a blank line follows them). A paragraph boundary is a deeper prosodic
 * break than a sentence (`PARAGRAPH_PAUSE_MS`); the speech projection emits a blank line between a
 * slide's structural blocks (heading | body | each body block), and an author's multi-paragraph note
 * carries them natively.
 *
 * The `sentences` array is byte-identical to `splitSentences(text)` — critical, because the audio
 * path segments clips with the whitespace-collapsing `splitSentences` (mirrored in voice-model.js),
 * and a cue must map 1:1 to its clip. We reproduce that exactly: a blank line is only honored as a
 * paragraph boundary when the text before it ends with a sentence terminator (so it coincides with a
 * real sentence split); a blank line mid-sentence (a terminator-less block, or a hand-wrapped note)
 * MERGES across the break, matching what `splitSentences` does after it collapses the whitespace.
 */
export function splitParagraphs(text: string): { sentences: string[]; paragraphEnd: Set<number> } {
  // Split on a blank line: a newline run with only spaces/tabs between (collapses 3+ blank lines to
  // one boundary; `\r?\n` so a CRLF-authored note breaks too). Anything without a blank line stays
  // one chunk → identical to today's single split.
  const chunks = String(text ?? '').split(/\r?\n[ \t]*(?:\r?\n[ \t]*)+/);
  const sentences: string[] = [];
  const paragraphEnd = new Set<number>();
  let carry = ''; // a terminator-less chunk tail that merges into the next chunk (whitespace-collapse parity)
  for (let i = 0; i < chunks.length; i++) {
    const merged = carry ? `${carry} ${chunks[i]}` : chunks[i];
    carry = '';
    const sents = splitSentences(merged);
    if (!sents.length) continue;
    const isLast = i === chunks.length - 1;
    // Ends "clean" iff the chunk's last non-space char is a terminator (plus an optional closing
    // quote) AND that period is not an abbreviation's — exactly when `splitSentences` would break
    // here after collapsing the blank line to a space. Without the second half a paragraph ending
    // "…of Acme Inc." would split where the single-string splitter merges, desyncing cue↔clip.
    // `trimEnd()` (linear) strips trailing whitespace; a `/[ \t\r\n]+$/` replace would retry at
    // every position (polynomial on a long whitespace run — a ReDoS on untrusted deck text).
    const tail = merged.trimEnd();
    const endsClean = ENDS_TERMINATED.test(tail) && !isSpuriousBreak(tail, chunks[i + 1] ?? '');
    if (!isLast && !endsClean) {
      // Tail has no terminator → it fuses with the next chunk's first sentence under the collapse.
      // Emit all but the last, carry the last forward, and DON'T mark a paragraph beat here.
      for (let k = 0; k < sents.length - 1; k++) sentences.push(sents[k]);
      carry = sents[sents.length - 1];
    } else {
      for (const s of sents) sentences.push(s);
      if (!isLast) paragraphEnd.add(sentences.length - 1); // beat AFTER this cue
    }
  }
  if (carry) sentences.push(carry);
  // A beat "after the final cue" is meaningless (nothing follows) — a TRAILING blank line would
  // otherwise flag the last cue. Whenever real content follows a boundary it lands as a later
  // sentence, so the final index is never a genuine beat; drop it unconditionally.
  paragraphEnd.delete(sentences.length - 1);
  return { sentences, paragraphEnd };
}

/**
 * Split a sentence into display words (whitespace-delimited). A "word" here is the
 * caption/highlight unit — the glyph group a reader sees and the cursor lands on.
 * (Its SPOKEN expansion may be several spoken sub-words; see normalize.ts.)
 */
export function splitWords(sentence: string): string[] {
  return String(sentence ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}
