// The FIT benchmark — the manifest grading itself.
//
// Every component ships `whenToUse` (190 entries across 61 components) and
// `antiPatterns` (190). Both are authored task descriptions with exact ground
// truth, written by whoever built the component and NOT written for this test.
// They give this project two things the harvested-deck corpora never could:
//
//   POSITIVE   a whenToUse body IS a described task → its own component should
//              rank first. This is the recommender's actual job.
//   REDIRECT   121 antiPatterns name a better component in their body ("If the
//              rows describe stages in order, use list-steps"). That is a
//              two-sided case: the named alternative must OUTRANK the component
//              whose anti-pattern it is. It is the first PRECISION test here —
//              everything before it could only measure recall.
//
// LEAKAGE IS THE WHOLE DANGER. The scorer indexes whenToUse and antiPatterns as
// evidence, so scoring a query against an index containing that very sentence
// measures nothing but string equality. `excludeKey` on each case tells the
// index builder which single entry to leave out — the eval rebuilds a
// leave-one-out index per query, and a run that forgets to pass it is expected
// to score ~100% and should be disbelieved on sight.
import { createHash } from 'node:crypto';

const split = (s) => (parseInt(createHash('sha1').update(s).digest('hex').slice(0, 8), 16) % 2 === 0 ? 'dev' : 'test');

/** `title — body`, the way an author would describe the task out loud. */
const phrase = (entry) => `${entry.title ?? ''} ${entry.body ?? ''}`.replace(/\s+/g, ' ').trim();

// `whenToUse` holds two different kinds of note, and only one of them is a
// question a recommender can answer:
//
//   SELECTION  "Who owns what — use when the audience needs to know
//              accountability, not process flow."  ← a described task
//   AUTHORING  "Language hint earns the highlight — always include the language
//              after the opening fence."           ← how to write the markup
//
// Nobody types the second kind into a picker; it presupposes you already chose the
// component. Scoring a recommender against it measures nothing and quietly drags
// every number down, so the two are separated and BOTH are reported — dropping the
// inconvenient half silently would be the same sin as tuning on the test split.
//
// The split is mechanical, not hand-picked: authoring notes talk about markup and
// tokens, and they are the only ones that do.
//
// A backticked COMPONENT NAME is stripped before the test. It is the manifest's way
// of saying "use this one instead" — the most selection-ish thing a note can do —
// and leaving it in filed all 34 redirect cases as authoring, since a backtick is
// itself the tell. The detector and the classifier were reading the same mark and
// drawing opposite conclusions.
const AUTHORING_TELL =
	/`|\beyebrow\b|\bh[1-6]\b|\bdirective\b|\btoken\b|\bclass\b|\bprefix\b|\bsyntax\b|\bmarkup\b|\bfence\b|\bsource\b|\brenders?\b|\bauthor(?:ing|ed)?\b|\bfront ?matter\b|\bvariant\b|\bmodifier\b|\bslot\b/i;
const classify = (entry, names) => {
	const body = (entry.body ?? '').replace(/`([a-z0-9-]+)`/g, (whole, n) => (names.includes(n) ? n : whole));
	return AUTHORING_TELL.test(body) ? 'authoring' : 'selection';
};

/**
 * @param {{name:string, whenToUse?:{title:string,body:string}[], antiPatterns?:{title:string,body:string}[]}[]} catalog
 * @returns {{kind:'positive'|'redirect', query:string, expect:string[], avoid:string[], excludeKey:string, split:'dev'|'test'}[]}
 */
export function buildFitCorpus(catalog) {
	const names = catalog.map((c) => c.name);
	const cases = [];

	for (const c of catalog) {
		for (const [i, entry] of (c.whenToUse ?? []).entries()) {
			const query = phrase(entry);
			if (query.length < 20) continue;
			cases.push({
				kind: 'positive',
				note: classify(entry, names),
				query,
				expect: [c.name],
				avoid: [],
				excludeKey: `${c.name}:whenToUse:${i}`,
				split: split(query),
			});
		}

		for (const [i, entry] of (c.antiPatterns ?? []).entries()) {
			const query = phrase(entry);
			if (query.length < 20) continue;
			// Which OTHER component does this anti-pattern point at? Read ONLY backticked
			// mentions — `list-criteria` — because that is the convention the manifest
			// authors actually use (102 of the mentions) and because a bare word cannot be
			// trusted: `\blist\b` matches inside `list-criteria` (a hyphen is a word
			// boundary), and "Unnumbered list" means a bulleted list, not the `list`
			// component. Bare matching produced 66 mentions, most of them wrong, which
			// would have put bad ground truth under every number this benchmark reports.
			const named = [...(entry.body ?? '').matchAll(/`([a-z0-9-]+)`/g)]
				.map((m) => m[1])
				.filter((n) => n !== c.name && names.includes(n));
			const unique = [...new Set(named)];
			if (!unique.length) continue;
			// Neutralize the answer — left in, the sentence literally contains it and a
			// name-matching scorer solves the case without reading a word.
			//
			// DETECTION is backtick-only (precision). NEUTRALIZATION covers every mention
			// however written, because several bodies name the alternative once in
			// backticks and again as plain prose, and one surviving mention hands over the
			// answer as completely as ten. But it covers only the EXPECTED names, never the
			// whole catalog: blanking every name turned "Flat list of citations" into "Flat
			// another layout of citations", which makes a case harder in a way that has
			// nothing to do with judgment. Longest first, so `list-steps` is consumed
			// before `list` can bite a piece out of it.
			const longestFirst = [...unique].sort((a, b) => b.length - a.length);
			const neutral = longestFirst
				.reduce(
					(q, n) => q.replace(new RegExp('`?\\b' + n.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b`?', 'g'), 'another layout'),
					query,
				)
				.replace(/(another layout)(?:[,.]?\s+(?:or|and)\s+another layout)+/g, '$1')
				.replace(/\s+/g, ' ')
				.trim();
			cases.push({
				kind: 'redirect',
				note: classify(entry, names),
				query: neutral,
				expect: unique,
				avoid: [c.name], // the component this is an anti-pattern OF must not win
				excludeKey: `${c.name}:antiPatterns:${i}`,
				split: split(neutral),
			});
		}
	}
	return cases;
}

/**
 * Score a ranker over fit cases.
 * `rank(query, excludeKey)` must return component names, best first, having
 * built its index WITHOUT the entry named by excludeKey.
 */
export function scoreFit(rank, cases) {
	let top1 = 0;
	let top3 = 0;
	let avoided = 0;
	let avoidable = 0;
	const misses = [];
	for (const c of cases) {
		const got = rank(c.query, c.excludeKey);
		const i = got.findIndex((n) => c.expect.includes(n));
		if (i === 0) top1++;
		if (i >= 0 && i < 3) top3++;
		// Precision: did the wrong component (the one this warns against) stay behind?
		if (c.avoid.length) {
			avoidable++;
			const bad = got.findIndex((n) => c.avoid.includes(n));
			if (bad === -1 || (i >= 0 && i < bad)) avoided++;
			else misses.push([c.query.slice(0, 62), `wanted ${c.expect.join('/')}, got ${got.slice(0, 3).join(', ')}`]);
		} else if (i !== 0) {
			misses.push([c.query.slice(0, 62), `wanted ${c.expect.join('/')}, got ${got.slice(0, 3).join(', ') || '(nothing)'}`]);
		}
	}
	const n = cases.length || 1;
	return { n, top1: top1 / n, top3: top3 / n, avoided: avoidable ? avoided / avoidable : null, avoidable, misses };
}
