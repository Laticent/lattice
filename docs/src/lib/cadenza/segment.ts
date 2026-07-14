// Cadenza — the CANONICAL segmenter. Text → sentences (cues) → words.
//
// This is the single source of truth for "how narration is split," retiring the
// three hand-copied splitters in the tree (voice-model's splitSentences, the
// studio read-aloud's splitForCaption). It is pure + deterministic → unit-tested,
// and imports nothing (the spin-off invariant).
//
// One cue == one sentence in v1 (the re-anchor unit, see track.ts). We break AFTER a
// terminator (`.!?…`) that is followed by whitespace — so a mid-token dot ("$4.2M",
// "3.5x") never splits, which the prior naive splitters got wrong. Over-splitting an
// abbreviation ("Acme Inc. was…") costs a tiny extra gap, never a correctness bug —
// this is the canonical segmenter the tree's hand-copied splitters collapse into.

/**
 * Split text into sentences. Whitespace is collapsed first so a sentence never
 * carries stray newlines. Splits on whitespace that FOLLOWS a sentence terminator
 * (a lookbehind), leaving decimals/version numbers/currency intact; a trailing
 * fragment with no terminator is its own sentence.
 */
export function splitSentences(text: string): string[] {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  return s
    .split(/(?<=[.!?…])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
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
    // Ends "clean" iff the chunk's last non-space char is a terminator — exactly when
    // `splitSentences` would break here after collapsing the blank line to a space. `trimEnd()`
    // (linear) strips trailing whitespace; a `/[ \t\r\n]+$/` replace would retry at every position
    // (polynomial on a long whitespace run — a ReDoS on untrusted deck text).
    const endsClean = /[.!?…]$/.test(merged.trimEnd());
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
