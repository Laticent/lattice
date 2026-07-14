/**
 * Split text into sentences. Whitespace is collapsed first so a sentence never
 * carries stray newlines. Splits on whitespace that FOLLOWS a sentence terminator
 * (a lookbehind), leaving decimals/version numbers/currency intact; a trailing
 * fragment with no terminator is its own sentence.
 */
export declare function splitSentences(text: string): string[];
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
export declare function splitParagraphs(text: string): {
    sentences: string[];
    paragraphEnd: Set<number>;
};
/**
 * Split a sentence into display words (whitespace-delimited). A "word" here is the
 * caption/highlight unit — the glyph group a reader sees and the cursor lands on.
 * (Its SPOKEN expansion may be several spoken sub-words; see normalize.ts.)
 */
export declare function splitWords(sentence: string): string[];
