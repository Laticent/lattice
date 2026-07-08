/**
 * Split text into sentences. Whitespace is collapsed first so a sentence never
 * carries stray newlines. Splits on whitespace that FOLLOWS a sentence terminator
 * (a lookbehind), leaving decimals/version numbers/currency intact; a trailing
 * fragment with no terminator is its own sentence.
 */
export declare function splitSentences(text: string): string[];
/**
 * Split a sentence into display words (whitespace-delimited). A "word" here is the
 * caption/highlight unit — the glyph group a reader sees and the cursor lands on.
 * (Its SPOKEN expansion may be several spoken sub-words; see normalize.ts.)
 */
export declare function splitWords(sentence: string): string[];
