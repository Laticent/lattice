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
