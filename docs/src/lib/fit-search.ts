// Does this component FIT the described task? — measured, and mostly REFUTED.
//
// STATUS: an experiment with a negative result, kept because the result is worth
// keeping. Nothing in the app imports this module. It is exercised by
// `npm run intent:fit`, and it is the evidence behind the recommender section of
// engineering/decisions/2026-08-09-on-device-intent-routing.md.
//
// THE IDEA. #1440 asks for a recommender, not a search box: describe the task, get
// ranked components with confidence. The manifest looks perfectly set up for that —
// every component ships `whenToUse` (190 authored fit rules) and `antiPatterns`
// (190 authored anti-fit rules), plus `capacity` {min, sweet, soft, hard,
// escalateTo}. The argument wrote itself: a bag-of-words ranker cannot use negative
// evidence at all — `actors`' anti-pattern says "if the rows describe stages in
// order, use list-steps", so a lexical scorer reading that text BOOSTS actors for
// "stages in order", exactly backwards — therefore reading the facets structurally
// should beat term counting.
//
// WHAT THE MEASUREMENTS SAID. It doesn't. On the held-out fit benchmark
// (tools/intent-bakeoff/fit-corpus.mjs — the manifest's own notes as questions,
// leave-one-out so nothing leaks), every facet signal is flat or actively harmful,
// swept one at a time against the tuned remainder:
//
//   signal              top-1                  avoided-the-wrong-one
//   none                63.2%                  16.7%
//   anti  −5 / −20      57.9% / 52.6%          16.7% / 20.0%
//   when   5 /  20      61.1% / 55.8%          16.7% / 16.7%
//   fn     4 /  16      61.1% / 47.4%          16.7% / 23.3%
//   capacity 4 / 8      61.1% / 60.0%          23.3% / 26.7%   ← the only positive
//
// A coordinate-descent tuner over all nine weights (tools/intent-bakeoff/tune-fit.mjs,
// dev split only) independently drove `when`, `anti` and `fn` to exactly ZERO and
// pushed lexical BM25 to its ceiling. It preferred plain retrieval to the judgment
// layer.
//
// WHY. The authored notes hold real judgment, but extracting it is SEMANTIC work.
// Deciding whether "the audience scans top-to-bottom" describes a sequence is not a
// vocabulary question, and two ~25-word texts do not overlap enough for term
// counting to recover it: the whenToUse-minus-antiPattern margin has a median of
// 0.030 and a p90 of 0.084 — noise. This is the same wall the wink-nlp lemmatizer
// hit (see intent-search.ts), for the same reason, reached from the opposite
// direction.
//
// WHAT SURVIVES. `capacity` — the one signal with a positive sign, because it is a
// hard numeric fact rather than word overlap, and because it produces the reason
// strings worth putting on screen ("12 rows past its limit of 8 → split across
// slides"). And the note extraction itself, which is the right INPUT for a model:
// 25 words of authored reasoning is excellent prompt context and terrible index
// material. That is the corrected division of labor — BM25 retrieves and scores its
// own confidence, a model judges the shortlist.
//
import type { CatalogItem } from './component-search';
import { buildIntentIndex, contentWords, type IntentIndex, scoreIntent, stemsOf } from './intent-search';

export type ManifestNote = { title?: string; body?: string };
export type Capacity = { axis?: string; min?: number; sweet?: number; soft?: number; hard?: number; escalateTo?: string[]; note?: string };

/** A catalog row carrying the judgment fields, not just the searchable prose. */
export type FitCatalogItem = CatalogItem & {
	whenToUse?: ManifestNote[];
	antiPatterns?: ManifestNote[];
	capacity?: Capacity | null;
	slots?: Record<string, { required?: boolean; description?: string }>;
};

/** Task words → the `function` axis they imply. Curated, small, and readable on
 *  purpose: this is the vocabulary a person uses for what they are trying to DO,
 *  which is exactly the mapping the manifest cannot supply for itself. */
const FUNCTION_CUES: Record<string, string[]> = {
	comparison: 'compare comparison versus vs against tradeoff option options alternative choose choice decide decision recommend recommendation verdict pick evaluate score criteria pros cons better worse rank'.split(' '),
	progression: 'step steps stage stages phase phases sequence order ordered timeline roadmap process workflow milestone journey chronology then next after before evolve change'.split(' '),
	evidence: 'prove proof evidence data metric metrics number numbers chart measure measurement percent percentage rate result results dashboard scorecard statistic trend'.split(' '),
	inventory: 'list set roster catalog inventory collection group items several parallel each every bunch'.split(' '),
	statement: 'claim point headline statement assert message takeaway single one hero emphasize'.split(' '),
	imagery: 'photo photograph image picture video visual screenshot illustration footage clip'.split(' '),
	anchor: 'title opening closing section divider cover intro introduction end ending start finish'.split(' '),
};

// Precomputed so the per-keystroke path is a Set lookup, not 7 array scans.
const CUE_TO_FUNCTION = new Map<string, string>();
for (const [fn, cues] of Object.entries(FUNCTION_CUES)) for (const cue of stemsOf(cues)) if (!CUE_TO_FUNCTION.has(cue)) CUE_TO_FUNCTION.set(cue, fn);

const NUMBER_WORDS: Record<string, number> = {
	two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12,
};

/** How much each kind of evidence is worth. Fitted against the DEV half of the fit
 *  benchmark only (`npm run intent:fit -- --dev`); the reported numbers are TEST. */
/** The weights the tuner chose on the DEV split (tools/intent-bakeoff/tune-fit.mjs).
 *  `when`, `anti` and `fn` are ZERO because it put them there — they are kept in the
 *  table, rather than deleted, so that a later change cannot quietly reintroduce them
 *  without re-running the tuner and seeing what it says. */
const W = {
	name: 4,
	tag: 2,
	when: 0,
	anti: 0,
	fn: 0,
	capacityFit: 1.4,
	capacitySoft: 0,
	capacityHard: -3,
	lexical: 9,
};

/** Saturating squash into (0,1). A fit is evidence accumulated, not a probability;
 *  this keeps the number bounded and monotonic without ever implying calibration. */
const squash = (raw: number) => (raw <= 0 ? 0 : 1 - Math.exp(-raw / 6));

export type FitReasonKind = 'name' | 'tag' | 'when' | 'anti' | 'function' | 'capacity' | 'lexical';
export type FitReason = { kind: FitReasonKind; text: string; delta: number };
export type FitHit = { name: string; fit: number; raw: number; reasons: FitReason[] };

/** The unweighted evidence for one component, each in its natural 0–1 units.
 *  Kept separate from the weights so the tuner can search weights over cached
 *  features instead of re-scoring the catalog thousands of times — and so the
 *  weights stay one readable table rather than being smeared through the scorer. */
export type FitFeatures = {
	name: number;
	tag: number;
	/** Positive margin of whenToUse over antiPatterns; 0 when the anti wins. */
	when: number;
	/** Positive margin of antiPatterns over whenToUse; 0 when the note wins. */
	anti: number;
	fn: number;
	capFit: number;
	capSoft: number;
	capHard: number;
	lexical: number;
	labels: { when: string; anti: string; cap: string; tag: string };
};
export type FitWeights = typeof W;

type FitDoc = {
	item: FitCatalogItem;
	nameWords: Set<string>;
	/** How distinctive this component's NAME is, 0–1. A name that is also an ordinary
	 *  English word ("list", "title", "code", "map") is weak evidence; "choropleth" or
	 *  "kanban" is strong. Without this the name bonus was flat, and "Right after the
	 *  title, before the first section" handed `title` a full name match and buried
	 *  `agenda` — the single largest source of wrong answers in the first cut. */
	nameStrength: number;
	tagWords: Set<string>;
	when: { stems: Set<string>; title: string }[];
	anti: { stems: Set<string>; title: string }[];
	/** Description/purpose stems — kept only to feed the shared IDF table. */
	lexical: Set<string>;
};

export type FitIndex = { docs: FitDoc[]; idf: Map<string, number>; lexical: IntentIndex };

/**
 * Build the fit index.
 *
 * `excludeKey` (`"<name>:whenToUse:<i>"` / `"<name>:antiPatterns:<i>"`) drops one
 * authored note. It exists for the benchmark: those notes are BOTH the evidence
 * and the test questions, so scoring a note against an index containing it
 * measures string equality and nothing else. Production never passes it.
 */
export function buildFitIndex(items: FitCatalogItem[], opts: { excludeKey?: string } = {}): FitIndex {
	const docs: FitDoc[] = items.map((item) => {
		const keep = (kind: 'whenToUse' | 'antiPatterns', i: number) => opts.excludeKey !== `${item.name}:${kind}:${i}`;
		const notes = (kind: 'whenToUse' | 'antiPatterns') =>
			(item[kind] ?? [])
				.map((n, i) => ({ n, i }))
				.filter(({ i }) => keep(kind, i))
				.map(({ n }) => ({ stems: new Set(stemsOf(contentWords(`${n.title ?? ''} ${n.body ?? ''}`))), title: n.title ?? '' }));
		return {
			item,
			nameWords: new Set(stemsOf(contentWords(item.name.replace(/-/g, ' ')))),
			nameStrength: 0, // filled below, once the IDF table exists
			tagWords: new Set(stemsOf(contentWords((item.tags ?? []).join(' ').replace(/-/g, ' ')))),
			when: notes('whenToUse'),
			anti: notes('antiPatterns'),
			lexical: new Set(stemsOf(contentWords(`${item.description ?? ''} ${item.purpose ?? ''} ${item.form} ${item.substance}`))),
		};
	});

	// One IDF table over every field, so a term common to half the catalog
	// ("slide", "row") cannot outvote a rare one ("choropleth", "accountability").
	const df = new Map<string, number>();
	for (const d of docs) {
		const seen = new Set<string>([...d.nameWords, ...d.tagWords, ...d.lexical, ...d.when.flatMap((w) => [...w.stems]), ...d.anti.flatMap((a) => [...a.stems])]);
		for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
	}
	const n = docs.length || 1;
	const idf = new Map<string, number>();
	for (const [t, c] of df) idf.set(t, Math.log(1 + (n - c + 0.5) / (c + 0.5)));
	// Name distinctiveness, normalized against the most distinctive term in the
	// catalog so it lands on 0–1 whatever the corpus size.
	const maxIdf = Math.max(1e-6, ...idf.values());
	for (const d of docs) {
		const ws = [...d.nameWords].map((t) => idf.get(t) ?? maxIdf);
		d.nameStrength = ws.length ? Math.min(1, ws.reduce((a, b) => a + b, 0) / ws.length / maxIdf) : 0;
	}
	// The lexical ranker is a STAGE of this one, not a rival: BM25 over the prose is
	// the best single predictor measured, and the facets are the judgment layered on
	// top of it. Scoring them separately and picking a winner throws away the stronger
	// half of the evidence.
	return { docs, idf, lexical: buildIntentIndex(items) };
}

export type TaskSignals = {
	stems: string[];
	/** Quantities the author stated — "12 vendors" is a hard constraint on layout. */
	quantities: { value: number; noun: string }[];
	/** `function` axes implied by the task verbs used. */
	functions: Set<string>;
};

/** Read the task out of the sentence: its words, its numbers, and what it asks to DO. */
export function readTask(query: string): TaskSignals {
	const words = contentWords(query);
	const stems = stemsOf(words);
	const functions = new Set<string>();
	for (const s of stems) {
		const fn = CUE_TO_FUNCTION.get(s);
		if (fn) functions.add(fn);
	}
	const quantities: { value: number; noun: string }[] = [];
	const lower = query.toLowerCase();
	for (const m of lower.matchAll(/(\d{1,3})\s*(?:\+|\s)?\s*([a-z][a-z-]*)?/g)) {
		const value = Number(m[1]);
		if (Number.isFinite(value) && value > 0 && value <= 200) quantities.push({ value, noun: m[2] ?? '' });
	}
	for (const [word, value] of Object.entries(NUMBER_WORDS)) {
		const m = lower.match(new RegExp(`\\b${word}\\s+([a-z][a-z-]*)`));
		if (m) quantities.push({ value, noun: m[1] });
	}
	return { stems, quantities, functions };
}

/**
 * How much of an authored note the task satisfies, IDF-weighted, 0–1.
 *
 * Measured in the NOTE's direction, not the query's. "How much of this fit rule
 * does the task meet?" is the question that matters, and normalizing by the query
 * instead diluted every long task description toward zero — the first cut of this
 * scored 28.7% against the lexical baseline's 76.6% for exactly that reason.
 */
function noteCoverage(queryStems: Set<string>, note: Set<string>, idf: Map<string, number>): number {
	if (!note.size) return 0;
	let hit = 0;
	let total = 0;
	for (const t of note) {
		const w = idf.get(t) ?? 0;
		total += w;
		if (queryStems.has(t)) hit += w;
	}
	return total ? hit / total : 0;
}

/** Extract the unweighted evidence for every component. */
export function fitFeatures(index: FitIndex, query: string): Map<string, FitFeatures> {
	const out = new Map<string, FitFeatures>();
	const task = readTask(query);
	if (!task.stems.length) return out;
	const { idf } = index;
	const qSet = new Set(task.stems);
	const maxIdf = Math.max(1e-6, ...idf.values());

	// Real BM25, normalized against this query's own best hit so the lexical term
	// lands on 0–1 whatever the query's length.
	const bm25 = new Map<string, number>();
	const lexHits = scoreIntent(index.lexical, query);
	const lexTop = lexHits[0]?.score ?? 0;
	if (lexTop > 0) for (const h of lexHits) bm25.set(h.name, h.score / lexTop);

	for (const d of index.docs) {
		const nameHit = [...d.nameWords].filter((w) => qSet.has(w)).length;
		const name = nameHit ? (nameHit / Math.max(d.nameWords.size, 1)) * d.nameStrength : 0;

		const tagHit = [...d.tagWords].filter((w) => qSet.has(w));
		const tag = tagHit.length ? Math.min(2, tagHit.reduce((a, t) => a + (idf.get(t) ?? 0), 0) / maxIdf) : 0;

		// THE AUTHORED VERDICT — the component's own notes for and against itself,
		// resolved against EACH OTHER rather than scored independently.
		//
		// Independent scoring was wrong in a way that quietly penalized the right
		// answer: a component's anti-patterns are about the same subject as its use
		// cases (cards-grid's "More than 4 items" shares nearly all its vocabulary with
		// cards-grid's "Parallel items"), so an absolute penalty docked the correct
		// component on almost every query in its own domain. What matters is which note
		// the task matches BETTER.
		const best = (notes: { stems: Set<string>; title: string }[]) =>
			notes.reduce<{ score: number; title: string }>(
				(acc, n) => {
					const o = noteCoverage(qSet, n.stems, idf);
					return o > acc.score ? { score: o, title: n.title } : acc;
				},
				{ score: 0, title: '' },
			);
		const forIt = best(d.when);
		const against = best(d.anti);
		const margin = forIt.score - against.score;

		const fn = task.functions.size && d.item.function && task.functions.has(d.item.function) ? 1 : 0;

		let capFit = 0;
		let capSoft = 0;
		let capHard = 0;
		let capLabel = '';
		const cap = d.item.capacity;
		if (cap && task.quantities.length) {
			const q = task.quantities.reduce((a, b) => (b.value > a.value ? b : a));
			const axis = cap.axis ?? 'item';
			if (cap.hard != null && q.value > cap.hard) {
				capHard = 1;
				capLabel = `${q.value} ${axis}s past its limit of ${cap.hard}${cap.escalateTo?.length ? ` → ${cap.escalateTo[0]}` : ''}`;
			} else if (cap.soft != null && q.value > cap.soft) {
				capSoft = 1;
				capLabel = `${q.value} ${axis}s crowds it (comfortable to ${cap.soft})`;
			} else if (cap.min != null && q.value < cap.min) {
				capSoft = 1;
				capLabel = `needs at least ${cap.min} ${axis}s`;
			} else if (cap.sweet != null && q.value <= cap.sweet) {
				capFit = 1;
				capLabel = `${q.value} ${axis}s is its sweet spot`;
			} else {
				capFit = 0.6;
				capLabel = `${q.value} ${axis}s fits`;
			}
		}

		out.set(d.item.name, {
			name,
			tag,
			when: Math.max(0, margin),
			anti: Math.max(0, -margin),
			fn,
			capFit,
			capSoft,
			capHard,
			lexical: bm25.get(d.item.name) ?? 0,
			labels: {
				when: forIt.title ? `fits “${forIt.title}”` : 'fits its stated use',
				anti: against.title ? `anti-pattern: ${against.title}` : 'warned against for this',
				cap: capLabel,
				tag: tagHit.length ? `tagged ${tagHit.slice(0, 2).join(', ')}` : '',
			},
		});
	}
	return out;
}

/** Rank the catalog by how well each component fits the described task. */
export function scoreFit(index: FitIndex, query: string, weights: FitWeights = W): FitHit[] {
	const features = fitFeatures(index, query);
	const hits: FitHit[] = [];
	for (const d of index.docs) {
		const f = features.get(d.item.name);
		if (!f) continue;
		const reasons: FitReason[] = [];
		let raw = 0;
		const add = (kind: FitReasonKind, text: string, delta: number) => {
			if (!delta || !text) return;
			raw += delta;
			reasons.push({ kind, text, delta });
		};
		add('name', f.name === 1 ? `named “${d.item.name}”` : `partly named “${d.item.name}”`, weights.name * f.name);
		add('tag', f.labels.tag, weights.tag * f.tag);
		add('when', f.labels.when, weights.when * f.when);
		add('anti', f.labels.anti, weights.anti * f.anti);
		add('function', `${d.item.function} layout`, weights.fn * f.fn);
		add('capacity', f.labels.cap, weights.capacityFit * f.capFit + weights.capacitySoft * f.capSoft + weights.capacityHard * f.capHard);
		add('lexical', 'matches its description', weights.lexical * f.lexical);
		if (raw > 0) hits.push({ name: d.item.name, fit: squash(raw), raw, reasons: reasons.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) });
	}
	return hits.sort((a, b) => b.raw - a.raw || a.name.localeCompare(b.name));
}
