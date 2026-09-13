import stem from 'wink-porter2-stemmer';
import { americanize, withinDistance } from './intent-search';

// settings-search.ts — RECALL for a filter that has to stay PRECISE.
//
// The Inspector's search decides show/hide per control. That is a different job from the
// component picker's (`component-search.ts` + `intent-search.ts`), and the difference sets
// what we borrow and what we refuse:
//
//   THE PICKER RANKS. It answers "which of 69 components did you mean" with an ordered
//   list, so a wrong guess costs a scroll — and its three-pass cascade (exact substring,
//   then Fuse fuzzy, then BM25 intent) is tuned to always have SOMETHING at the top.
//
//   SETTINGS FILTER. There is no order to be wrong about: a row is on screen or it is not.
//   A ranker's tail here is not a worse answer further down, it is six unrelated rows drawn
//   beside the right one with nothing saying which is which. So NO RANKING, and the
//   precision-first substring rule stays exactly as it was.
//
// What we do borrow is the part of the picker that is about RECALL, because that is the
// half a boolean substring test has no answer for. Three additions, each an OR — none of
// them can hide a row the old rule showed:
//
//   MORPHOLOGY  A term matches a haystack word with the same Porter2 stem. "numbers" finds
//               "Hide page number", "captions" finds "Caption what this slide reads aloud",
//               "aligned" finds "Headline alignment". Substring already covered the other
//               direction (a query SHORTER than the label), never this one.
//   VOCABULARY  A small table of words an author reaches for that no row says: "font" for
//               Type scale, "pagination" for the slide's page-number row, "margin" for
//               Claim. Per-row `find=` props stay — they carry what is specific to ONE row;
//               this carries what is not worth writing on twenty.
//   TYPO        A term is a near-miss of a word in THIS row: "numbre" finds "Page numbers".
//
// TWO THINGS DELIBERATELY NOT BORROWED, and both would be regressions:
//
//   `contentWords` (intent-search's tokenizer). It drops STOP WORDS, and this panel has
//   rows called "Says something" and "Says nothing" — a stop list eats the only word that
//   tells them apart. It also does not fold diacritics, which `settingsMatch` has always
//   done. And `tools/intent-bakeoff/fit-search.ts` imports it, so every weight in the
//   bake-off was tuned against its exact output: widening it there to suit this module
//   would silently invalidate those numbers. Hence a separate tokenizer here, and the
//   shared pieces are the ones with no policy in them — `stem`, `americanize`,
//   `withinDistance`.
//
//   A GLOBAL VOCABULARY for the typo repair. intent-search only repairs a term that
//   matched NOTHING in the index, which is what stops "mark" being repaired to "dark". We
//   have no index: a control decides for itself, one row at a time, with no registry of
//   what the other sixty say (that registry is the second render pass the panel's `:has()`
//   rules exist to avoid). So the repair is ANCHORED instead: the first two characters must
//   agree. "numbre"→"number" passes; "mark"→"dark", "tint"→"hint" and "accent"→"ascent" do
//   not, because a real typo is almost never in the first two keystrokes of a word.

/** Longest token we will stem. `stem()` is quadratic in token length — a 20,000-char
 *  paste measured 15.2s on the main thread in the picker's own note — and nothing in a
 *  settings label is close to this. Truncating makes the worst case a constant. */
const MAX_TOKEN = 40;
/** A pasted paragraph is not a query. This is a COST cap, not a semantic one, and nothing
 *  can pin it: terms are ANDed, so the tail past it could only ever remove more rows from a
 *  result that is already empty — deleting the cap changes no answer, only the size of the
 *  terms x rows x words product the typo scan walks. `settings-search.test.ts` asserts that
 *  non-effect rather than pretending to catch the removal. */
const MAX_TERMS = 12;

/**
 * Words an author types that no settings row says, keyed by the word they type.
 *
 * Hand-held, like the picker's. Each entry earned its place against the LIVE panel — the
 * 65 rows of the two scopes, read off the running Studio — and each is checked by
 * `settings-search.test.ts` to still reach a row and to not drag the panel open.
 *
 * An expansion is matched as a SUBSTRING of the row's words, and `|` separates
 * alternatives — so a multi-word alternative is a phrase. That precision is the point:
 * `font: 'type'` would also match "Flag unknown components as you type", while
 * `font: 'type scale'` reaches the row actually called Type scale.
 *
 * Keys are matched against the typed word AND its stem, so one entry covers "subtitle"
 * and "subtitles".
 *
 * `centre` is DATA, not prose — a spelling we must keep ACCEPTING from an author's
 * keyboard, the same way `intent-search.ts` keeps `organisation`. A US-English pass
 * (HARD RULE #21) that rewrites it makes the key unreachable and deletes the entry's whole
 * reason for existing.
 */
const SYNONYMS: Record<string, string> = {
	a11y: 'accessibility|screen reader',
	aria: 'accessibility|screen reader',
	background: 'backdrop|finish',
	centre: 'center',
	font: 'type scale',
	hidden: 'hide',
	margin: 'frame',
	narrate: 'read aloud|caption|pronunciation',
	narration: 'read aloud|caption|pronunciation',
	padding: 'frame',
	pagination: 'page number',
	presenter: 'speaker note',
	subtitle: 'caption',
	transition: 'motion|animate|moves in',
	tts: 'read aloud|caption',
	typography: 'type scale',
	voice: 'read aloud|pronunciation',
	wallpaper: 'backdrop|finish',
	watermark: 'stamp',
};

/** The same table, reached by the STEM of the key — so "subtitles" finds `subtitle`. Built
 *  once; a stem collision keeps the first (alphabetically earlier) entry, which is why the
 *  table above has no two keys that stem alike. */
const SYNONYM_STEMS: Map<string, string> = new Map();
for (const [word, expansion] of Object.entries(SYNONYMS)) {
	const key = stemOf(word);
	if (!SYNONYM_STEMS.has(key)) SYNONYM_STEMS.set(key, expansion);
}

/** Fold case AND diacritics, so an author who types "eyebrow" finds it whatever their
 *  keyboard did, and a label carrying an accent is still reachable from a bare ASCII word. */
function normalize(s: string): string {
	return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Normalized text → its words. No stop list (see the header: "Says nothing" is a row) and
 *  no hyphen splitting beyond what the character class does. */
function wordsOf(normalized: string): string[] {
	return (normalized.match(/[a-z0-9][a-z0-9+#]*/g) ?? []).map((w) => americanize(w.length > MAX_TOKEN ? w.slice(0, MAX_TOKEN) : w));
}

/**
 * A word → the stem two spellings of it can meet on.
 *
 * `americanize` runs on BOTH SIDES of the stemmer, and the second pass is the one that is
 * easy to leave out: its rules are anchored to the end of the word, so `colour` folds to
 * `color` and `colours` does not — the `s` is in the way. Stemming first strips the `s`,
 * and folding after lands the plural on the same stem as the singular. Without it,
 * "colours" only reached the Theme row by accident, through the typo repair (one deletion
 * away from "colors"), which is a rescue that would evaporate the moment the row's wording
 * moved. Folding before the stemmer still earns its place: `organisation` has to become
 * `organization` before Porter2 sees it.
 */
function stemOf(word: string): string {
	return americanize(stem(americanize(word)));
}

type QueryTerm = { raw: string; stem: string; synonyms: string[] };

function parseQuery(query: string): QueryTerm[] {
	const normalized = normalize(query);
	// Split on WHITESPACE, not on `wordsOf`: a term keeps whatever punctuation the author
	// typed for the substring test, because "16:9" and "⌘↵" are things rows actually say.
	return normalized
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, MAX_TERMS)
		.map((raw) => {
			const clipped = raw.length > MAX_TOKEN ? raw.slice(0, MAX_TOKEN) : raw;
			const word = americanize(clipped);
			const s = stemOf(clipped);
			const expansion = SYNONYMS[word] ?? SYNONYM_STEMS.get(s);
			return { raw: clipped, stem: s, synonyms: expansion ? expansion.split('|') : [] };
		});
}

// ── Two one-shot caches, because a keystroke re-asks the same questions ──────────────
//
// Every row re-runs this on every keystroke: ~65 rows x the query. Parsing the query is
// identical across all of them (one entry is enough), and a row's own words never change
// (a small bounded map). Without these, each keystroke re-stems every label and
// description in the panel.
let parsedQuery = '';
let parsedTerms: QueryTerm[] = [];
function termsFor(query: string): QueryTerm[] {
	if (query !== parsedQuery) {
		parsedQuery = query;
		parsedTerms = parseQuery(query);
	}
	return parsedTerms;
}

type Haystack = { text: string; words: string[]; stems: Set<string> };
const HAY_CACHE = new Map<string, Haystack>();
/** The panel has ~65 rows; this is sized to hold both scopes several times over and to
 *  drop everything rather than grow without bound if some caller feeds it novel text. */
const HAY_CACHE_MAX = 512;
function haystackFor(text: string): Haystack {
	const cached = HAY_CACHE.get(text);
	if (cached) return cached;
	const normalized = normalize(text);
	const words = wordsOf(normalized);
	const hay: Haystack = { text: normalized, words, stems: new Set(words.map(stemOf)) };
	if (HAY_CACHE.size >= HAY_CACHE_MAX) HAY_CACHE.clear();
	HAY_CACHE.set(text, hay);
	return hay;
}

/**
 * Is `term` a plausible TYPO of `word`?
 *
 * ONE EDIT, ANCHORED ON TWO CHARACTERS — and every part of that was measured, on the live
 * 65-row corpus of both scopes, against the substring-only rule it replaces.
 *
 * THE ANCHOR is what makes a PER-ROW repair safe. intent-search can be generous because it
 * only repairs a term that matched nothing in its whole index, which is what stops "mark"
 * becoming "dark". A control here decides alone, with no registry of what the other sixty
 * rows say — that registry is the second render pass the panel's `:has()` rules exist to
 * avoid, and a best-effort one filled as rows render would make a row's visibility depend
 * on what was drawn before it. So the first two characters must agree instead: a real typo
 * is almost never in the first two keystrokes of a word. "mark"→"dark", "tint"→"hint" and
 * "accent"→"ascent" are all refused by the anchor alone.
 *
 * ONE EDIT, not the picker's two-at-seven-characters ladder, and this is the measurement
 * that decided it: at two edits, "comment" reached the row about frame CONTENT and
 * "connect" reached both — two edits on a seven-letter word is most of the word, and the
 * anchor cannot save a pair that genuinely shares a prefix. Dropping to one edit put 7
 * queries back to their exact pre-change result sets and cost none of the typos below.
 *
 * THE SWAP ARM IS NOT DECORATION. Levenshtein — what `withinDistance` measures, and what
 * the picker repairs against — scores a transposition as TWO edits, so the commonest way a
 * fast typist misses is exactly the one a one-edit budget refuses. "numbre" returned
 * nothing. Trying each adjacent swap first (and then requiring an EXACT hit, `max - 1` = 0)
 * buys the transposition class without buying a second free edit: "numbre" and "nubmer"
 * both reach "Number every slide", "capiton" reaches Caption, "algnment" reaches Headline
 * alignment.
 *
 * `withinDistance` itself is intent-search's, unchanged: widening it there would silently
 * re-tune every weight `tools/intent-bakeoff/fit-search.ts` was measured against.
 */
function nearMiss(term: string, word: string): boolean {
	if (term.length < 5 || word.length < 4) return false;
	if (term[0] !== word[0] || term[1] !== word[1]) return false;
	if (withinDistance(term, word, 1)) return true;
	for (let i = 0; i < term.length - 1; i++) {
		if (term[i] === term[i + 1]) continue;
		const swapped = `${term.slice(0, i)}${term[i + 1]}${term[i]}${term.slice(i + 2)}`;
		// The swap SPENDS the one edit, so what is left has to be exact — and the anchor
		// still has to hold after it.
		if (swapped[0] === word[0] && swapped[1] === word[1] && swapped === word) return true;
	}
	return false;
}

/**
 * Does `haystack` satisfy `query`? Every whitespace-separated term must be satisfied,
 * in any order — so "page number" finds "Hide page number" and "number page" finds it too.
 * Case- and accent-insensitive; an empty query matches everything.
 *
 * A term is satisfied by any ONE of four tests, tried cheapest first:
 *
 *   1. it is a SUBSTRING of the row's text — the original rule, which also gives prefix
 *      matching for free ("pag" reaches "Page numbers" on the third keystroke);
 *   2. it STEMS to a word the row carries — "numbers" reaches "number";
 *   3. one of its SYNONYMS is in the row's text — "font" reaches "Type scale";
 *   4. it is an anchored NEAR-MISS of one of the row's words — "numbre" reaches "number".
 *
 * Pure, and exported for its unit test: this is the whole search semantics.
 */
export function settingsMatch(query: string, ...haystack: (string | undefined | null | false)[]): boolean {
	const terms = termsFor(query);
	if (terms.length === 0) return true;
	const hay = haystackFor(haystack.filter(Boolean).join(' '));
	return terms.every(
		(t) =>
			hay.text.includes(t.raw) ||
			hay.stems.has(t.stem) ||
			t.synonyms.some((s) => hay.text.includes(s)) ||
			hay.words.some((w) => nearMiss(t.raw, w)),
	);
}

/** The synonym table, for the test that keeps every entry reaching a real row. */
export const SETTINGS_SYNONYMS: Readonly<Record<string, string>> = SYNONYMS;
