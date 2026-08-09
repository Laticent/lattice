// Natural-language intent → component, ranked, on this device.
//
// WHY THIS EXISTS. The shipped catalog search (component-search.ts) is lexical:
// a precise substring pass, then Fuse for misspellings. That is exactly right
// for "I know the name" ("legal", "radar", "compare-table") and it is why the
// substring pass stays in front of this one. It is useless for "I know what I
// want to SAY": measured over 61 components, the shipped ranker answers a
// natural-language query correctly 0.4–14.7% of the time, because a sentence
// never appears as a substring of a manifest and Fuse's fuzzy pass just returns
// noise. This module answers that second question.
//
// WHY NO MODEL. #1440 proposed wink-nlp + wink-eng-lite-web-model, self-hosted
// and lazily downloaded, with a naive Bayes classifier for confidence. That was
// measured against this implementation on three corpora and rejected: the
// 1.03 MB (gzipped) English model never scored better than a 1.7 KB Porter2
// stemmer, and the naive Bayes variant scored worst of every NLP option tried —
// one training document per class is a degenerate classifier. 61 short manifest
// documents do not need a lemmatizer. The whole bake-off, its numbers, and the
// reproducible harness live in
// `engineering/decisions/2026-08-09-on-device-intent-routing.md`.
//
// WHAT IT IS. Okapi BM25 over the component manifest, with the fields weighted
// by how much intent signal each was measured to carry, plus two repairs for
// the ways a real query misses: a typo (edit-distance repair against the index
// vocabulary) and a word the manifest simply never says (a small, hand-held
// synonym lexicon). Pure, dependency-light, ~4 KB gzipped, no download, no
// network, works on first paint and offline.
//
// WHAT IT IS NOT. It is not a classifier and its scores are not probabilities.
// Top-1 accuracy on real slide prose is about 30%, top-5 about 45% — good
// enough to put the right component in a shortlist, not good enough to pick for
// the author. Surfaces must present a RANKED SET with relative match strength,
// never a single confident answer. `confidenceFor` exists to keep that honest.
import stem from 'wink-porter2-stemmer';
import type { CatalogItem } from './component-search';

/** How much each manifest field counts toward a match. Measured by ablation:
 *  `description` is load-bearing (removing it costs ~15 points of top-1 accuracy),
 *  `purpose` is second (~7 points of recall on real prose), and `tags`/`facets`
 *  contribute within noise — they are kept at low weight because they cost nothing
 *  and they are the only signal for a component whose prose is terse. */
const WEIGHTS = { name: 3, tags: 2.2, facets: 1, description: 1.4, purpose: 1 } as const;
type Field = keyof typeof WEIGHTS;

/** Words that carry no intent. Deliberately includes the verbs an author wraps a
 *  query in ("show me a…", "I want to use a…") — they match everything, so they
 *  are noise, not signal. */
const STOP = new Set(
	`a an the and or but if then than that this these those of in on at to for from by with without into onto over under across as
	 is are was were be been being am do does did doing have has had having i me my we us our you your he she it its they them their
	 what which who whom when where why how all any both each few more most other some such no nor not only own same so too very
	 can will just should now show shows showing want need make makes made use uses used using slide deck put get give like per`.split(/\s+/),
);

/** Words a boardroom author reaches for that the manifest prose never says.
 *  Hand-held on purpose — every entry earned its place by fixing a real miss on
 *  the tuning split, and the list is meant to stay short enough to read. A
 *  synonym is weaker evidence than the author's own word, so it scores lower. */
const SYNONYMS: Record<string, string> = {
	photo: 'image picture',
	photograph: 'image visual',
	picture: 'image visual',
	animated: 'scene motion anima',
	animation: 'scene motion anima',
	moving: 'scene motion',
	org: 'organization',
	organisation: 'organization',
	waterfall: 'funnel conversion',
	choropleth: 'map region',
	testimonial: 'quote quotation',
	faq: 'question answer',
	swimlane: 'workstream lane',
	accountable: 'ownership owner responsibility',
	jargon: 'term definition glossary',
	circle: 'donut pie',
	qr: 'code scan',
};

const SYNONYM_BOOST = 0.85;
const REPAIR_BOOST = 0.6;
const K1 = 1.2;
const B = 0.75;

/** Fold the common British forms onto the American ones, so the house dialect
 *  (HARD RULE #21) is also the SEARCH dialect: an author who types the -ise/-our
 *  spelling of a word finds what the -ize/-or spelling indexes.
 *
 *  (Written without spelling the British forms out, deliberately — the US-English
 *  ratchet counts prose, and a comment about the fold should not consume budget the
 *  fold's own data needs. The remaining British strings in this feature are all
 *  functional: the SYNONYMS keys and the adversarial test fixtures.) */
const americanize = (w: string) =>
	w.replace(/isation$/, 'ization').replace(/ising$/, 'izing').replace(/ise$/, 'ize').replace(/our$/, 'or');

/** Text → the content words a match can turn on, un-stemmed.
 *  Exported as `contentWords` so fit-search.ts shares one tokenizer with this
 *  module — two tokenizers over the same manifest would drift, and the two
 *  scorers' terms have to be comparable for their scores to combine. */
/** No real word is longer than this. Anything past it is a base64 blob, a JWT, a data URI
 *  or a minified paste — and `stem()` is QUADRATIC in token length, so an uncapped one
 *  blocks the main thread for seconds: a 20,000-char space-free token measured 15.2s in a
 *  real browser, 40,000 measured 25.9s. Truncating costs nothing (nothing that long is in
 *  the index) and turns the worst case into a constant. */
const MAX_TOKEN = 40;

function words(text: string): string[] {
	return (text.toLowerCase().match(/[a-z][a-z0-9+#]*/g) ?? [])
		.filter((w) => w.length > 1 && !STOP.has(w))
		.map((w) => (w.length > MAX_TOKEN ? w.slice(0, MAX_TOKEN) : w))
		.map(americanize);
}

export { words as contentWords };

/** Content words → their Porter2 stems. */
export function stemsOf(words_: string[]): string[] {
	return words_.map((w) => stem(w));
}

/** The indexable text of one component, split by field so each can be weighted. */
function fieldsOf(it: CatalogItem): Record<Field, string> {
	return {
		name: it.name.replace(/-/g, ' '),
		tags: [...(it.tags ?? []), ...(it.variants ?? [])].join(' ').replace(/-/g, ' '),
		facets: `${it.function} ${it.bucket} ${it.form} ${it.substance} ${it.familyLabel}`,
		description: it.description ?? '',
		purpose: it.purpose ?? '',
	};
}

type IndexedDoc = { name: string; tf: Map<string, number>; len: number };
export type IntentIndex = {
	docs: IndexedDoc[];
	df: Map<string, number>;
	vocab: string[];
	avgLen: number;
};

/** Build the BM25 index once per catalog; reused across keystrokes. 61 documents
 *  of a few dozen terms each — a couple of milliseconds, so no need to defer it. */
export function buildIntentIndex(items: CatalogItem[]): IntentIndex {
	const docs: IndexedDoc[] = items.map((it) => {
		const f = fieldsOf(it);
		const tf = new Map<string, number>();
		let len = 0;
		for (const field of Object.keys(WEIGHTS) as Field[]) {
			const weight = WEIGHTS[field];
			for (const w of words(f[field])) {
				const t = stem(w);
				tf.set(t, (tf.get(t) ?? 0) + weight);
				len += weight;
			}
		}
		return { name: it.name, tf, len };
	});
	const df = new Map<string, number>();
	for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
	const avgLen = docs.length ? docs.reduce((s, d) => s + d.len, 0) / docs.length : 0;
	return { docs, df, vocab: [...df.keys()], avgLen };
}

/** Levenshtein distance ≤ max, with a row-minimum early exit so a long vocabulary
 *  scan stays cheap. Returns false as soon as no completion can come in under max. */
function withinDistance(a: string, b: string, max: number): boolean {
	if (Math.abs(a.length - b.length) > max) return false;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		let best = i;
		for (let j = 1; j <= b.length; j++) {
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
			best = Math.min(best, cur[j]);
		}
		if (best > max) return false;
		prev = cur;
	}
	return prev[b.length] <= max;
}

/** The nearest vocabulary term to a stem that matched nothing — a typo repair.
 *  Only attempted for words long enough that an edit is more likely a slip than a
 *  different word, and it prefers the candidate closest in length. */
function repair(term: string, vocab: string[]): string | null {
	const max = term.length >= 7 ? 2 : term.length >= 5 ? 1 : 0;
	if (!max) return null;
	let best: string | null = null;
	for (const v of vocab) {
		if (!withinDistance(term, v, max)) continue;
		if (!best || Math.abs(v.length - term.length) < Math.abs(best.length - term.length)) best = v;
	}
	return best;
}

type QueryTerm = { term: string; boost: number };

/** A query → the weighted stems to score it by: the author's own words first,
 *  then synonym expansions, then a typo repair for anything still unmatched. */
function queryTerms(query: string, index: IntentIndex): QueryTerm[] {
	const out: QueryTerm[] = [];
	for (const raw of words(query)) {
		const own = stem(raw);
		if (index.df.has(own)) out.push({ term: own, boost: 1 });
		else {
			const fixed = repair(own, index.vocab);
			if (fixed) out.push({ term: fixed, boost: REPAIR_BOOST });
		}
		for (const syn of SYNONYMS[raw]?.split(' ') ?? []) {
			const t = stem(syn);
			if (index.df.has(t)) out.push({ term: t, boost: SYNONYM_BOOST });
		}
	}
	return out;
}

/**
 * True when a query reads like a DESCRIBED INTENT rather than a remembered name.
 *
 * Two content words is the threshold, and it decides pass ORDER in component-search.ts.
 * A single token is overwhelmingly a name someone half-remembers, and the fuzzy pass is
 * far better at that than this module is: measured over every single-character deletion
 * of every component name (n=520), putting the intent pass first scored 82.1% top-1
 * against the fuzzy pass's 96.0% — `tabel` returned `compare-code` instead of
 * `compare-table`, 73 names regressed. BM25 happily matches one mangled token against
 * some unrelated component's prose; Levenshtein over the name list does not.
 */
export function looksLikeIntent(query: string): boolean {
	// Counted on WHITESPACE, not on the content tokenizer — `words()` splits hyphens, so
	// `cards-rid` looked like two words and routed a misspelled hyphenated NAME down the
	// intent path (that alone was 60 of the 73 regressions). What a person typed as one
	// token is one token, however many pieces the indexer later cuts it into.
	return query.trim().split(/\s+/).filter((w) => /[a-z]/i.test(w)).length >= 2;
}

export type IntentHit = { name: string; score: number };

/** Rank the catalog against a natural-language query. Components that match
 *  nothing are omitted entirely, so an empty array means "no lexical purchase" —
 *  the caller should fall through to its fuzzy pass rather than show a random tail. */
export function scoreIntent(index: IntentIndex, query: string): IntentHit[] {
	const terms = queryTerms(query, index);
	if (!terms.length) return [];
	const { avgLen, df, docs } = index;
	const n = docs.length;
	const hits: IntentHit[] = [];
	for (const d of docs) {
		let score = 0;
		for (const { term, boost } of terms) {
			const f = d.tf.get(term);
			if (!f) continue;
			const n_t = df.get(term) ?? 0;
			const idf = Math.log(1 + (n - n_t + 0.5) / (n_t + 0.5));
			score += boost * idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / (avgLen || 1))));
		}
		if (score > 0) hits.push({ name: d.name, score });
	}
	return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/**
 * A hit's match strength RELATIVE TO THE BEST HIT, 0–1.
 *
 * Deliberately relative. A BM25 score has no absolute meaning — it is not a
 * probability and cannot be shown as one without lying — but the ratio between
 * the top hit and its runners-up answers the question the author actually has:
 * is this a clear winner, or a toss-up worth reading? Every surface that renders
 * a number must render THIS one, and must label it as a relative match.
 */
export function confidenceFor(hit: IntentHit, best: number): number {
	if (!(best > 0)) return 0;
	return Math.max(0, Math.min(1, hit.score / best));
}
