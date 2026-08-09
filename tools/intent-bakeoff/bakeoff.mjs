// Measure the component intent ranker against its alternatives — the harness behind
// engineering/decisions/2026-08-09-on-device-intent-routing.md (#1440).
//
// It measures WHAT SHIPS: `docs/src/lib/intent-search.ts` is bundled with esbuild and
// imported, so this can never drift from the implementation the way a copied ranker
// would. The shipped substring+Fuse core is the baseline. The wink-nlp candidates the
// issue proposed are OPTIONAL — install them to reproduce the rejection:
//
//   npm i --no-save wink-nlp wink-eng-lite-web-model wink-naive-bayes-text-classifier wink-bm25-text-search
//
// Without them the run still works and simply reports the rows it could measure.
//
// Usage: npm run intent:bakeoff            (test split — the reportable numbers)
//        npm run intent:bakeoff -- --dev   (dev split + misses — the only thing tuning may read)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCorpus } from './corpus.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DEV = process.argv.includes('--dev');

const catalogRaw = JSON.parse(readFileSync(join(ROOT, 'dist/docs/components.json'), 'utf8')).components;
const CATALOG = catalogRaw.map((c) => ({
	name: c.name,
	bucket: c.bucket,
	function: c.function || '',
	form: c.form || '',
	substance: c.substance || '',
	family: '',
	familyLabel: '',
	description: c.description || '',
	purpose: c.purpose || '',
	tags: Array.isArray(c.tags) ? c.tags : [],
}));
const NAMES = new Set(CATALOG.map((c) => c.name));

// ── the SHIPPED ranker, bundled from source so this measures reality ─────────
const tmp = mkdtempSync(join(tmpdir(), 'intent-bakeoff-'));
let shipped;
try {
	const out = join(tmp, 'intent.mjs');
	execFileSync(
		'npx',
		['esbuild', join(ROOT, 'docs/src/lib/intent-search.ts'), '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=error'],
		{ cwd: join(ROOT, 'docs'), stdio: ['ignore', 'ignore', 'inherit'] },
	);
	shipped = await import(pathToFileURL(out).href);
} catch (err) {
	console.error('Could not bundle docs/src/lib/intent-search.ts — run `npm --prefix docs install` first.');
	throw err;
}

const shippedIndex = shipped.buildIntentIndex(CATALOG);
const rankShipped = (q) => shipped.scoreIntent(shippedIndex, q).map((h) => h.name);

// The COMPOSED ladder the pickers actually call. This harness used to score `scoreIntent`
// in isolation and label it "the shipped ranker" — it is not; it is one pass of three, and
// measuring a pass instead of the composition is how a regression in the pass ORDER went
// unseen (lone-token name lookup fell 96.0% → 82.1% and no corpus could observe it).
const ladderOut = join(tmp, 'component-search.mjs');
execFileSync(
	'npx',
	['esbuild', join(ROOT, 'docs/src/lib/component-search.ts'), '--bundle', '--format=esm', `--outfile=${ladderOut}`, '--log-level=error'],
	{ cwd: join(ROOT, 'docs'), stdio: ['ignore', 'ignore', 'inherit'] },
);
const search = await import(pathToFileURL(ladderOut).href);
const searchIndex = search.makeSearchIndex(CATALOG);
const rankLadder = (q) => (search.rankedHitsFor(CATALOG, searchIndex, q) ?? []).map((h) => h.item.name);

// ── the baseline: today's substring + Fuse core ──────────────────────────────
const { default: Fuse } = await import(pathToFileURL(join(ROOT, 'docs/node_modules/fuse.js/dist/fuse.mjs')).href);
const hay = (c) => `${c.name} ${c.tags.join(' ')} ${c.bucket} ${c.function} ${c.substance} ${c.description}`.toLowerCase();
const fuse = new Fuse(CATALOG, {
	keys: [
		{ name: 'name', weight: 0.55 },
		{ name: 'tags', weight: 0.22 },
		{ name: 'description', weight: 0.05 },
	],
	threshold: 0.3,
	ignoreLocation: true,
	minMatchCharLength: 3,
});
const rankBaseline = (q) => {
	const query = q.trim().toLowerCase();
	const sub = CATALOG.filter((c) => hay(c).includes(query));
	return sub.length ? sub.map((c) => c.name) : fuse.search(query).map((r) => r.item.name);
};

const RANKERS = {
	'before this change': rankBaseline,
	'intent pass alone': rankShipped,
	'SHIPPED ladder': rankLadder,
};

// ── the wink candidates #1440 proposed, if they are installed ────────────────
const FIELDS = (c) => ({
	name: c.name.replace(/-/g, ' '),
	tags: c.tags.join(' ').replace(/-/g, ' '),
	facets: `${c.function} ${c.bucket} ${c.form} ${c.substance}`,
	description: c.description,
	purpose: c.purpose,
});
const WEIGHTS = { name: 3, tags: 2.2, facets: 1, description: 1.4, purpose: 1 };
try {
	const [{ default: winkNLP }, { default: model }, { default: bayes }, { default: winkBm25 }] = await Promise.all([
		import('wink-nlp'),
		import('wink-eng-lite-web-model'),
		import('wink-naive-bayes-text-classifier'),
		import('wink-bm25-text-search'),
	]);
	const nlp = winkNLP(model, ['pos']);
	const its = nlp.its;
	const winkTerms = (t) =>
		nlp
			.readDoc(t)
			.tokens()
			.filter((tok) => tok.out(its.type) === 'word' && !tok.out(its.stopWordFlag))
			.out(its.lemma);

	const nb = bayes();
	nb.definePrepTasks([winkTerms]);
	nb.defineConfig({ considerOnlyPresence: true, smoothingFactor: 0.5 });
	for (const c of CATALOG) {
		const f = FIELDS(c);
		nb.learn(`${f.name} ${f.name} ${f.name} ${f.tags} ${f.tags} ${f.facets} ${f.description} ${f.purpose}`, c.name);
	}
	nb.consolidate();
	RANKERS['wink naive Bayes'] = (q) => {
		try {
			return nb.computeOdds(q).sort((a, b) => b[1] - a[1]).map((o) => o[0]);
		} catch {
			return [];
		}
	};

	const wbm = winkBm25();
	wbm.defineConfig({ fldWeights: WEIGHTS });
	wbm.definePrepTasks([winkTerms]);
	for (const c of CATALOG) wbm.addDoc(FIELDS(c), c.name);
	wbm.consolidate();
	RANKERS['wink BM25 (lib)'] = (q) => {
		try {
			return wbm.search(q).map((r) => r[0]);
		} catch {
			return [];
		}
	};
} catch {
	console.log('· wink candidates skipped (not installed — see this file’s header to reproduce them)\n');
}

// ── corpora ──────────────────────────────────────────────────────────────────
const corpus = buildCorpus(ROOT, NAMES);
const split = DEV ? 'dev' : 'test';
const authored = (f) => JSON.parse(readFileSync(join(HERE, f), 'utf8'));
const pick = (key) => corpus.filter((p) => p.split === split && p[key] && !p.file.includes('test/fixtures')).map((p) => [p[key], [p.component]]);
// Every single-character deletion of every component name. This corpus exists because its
// ABSENCE hid a real regression: all four original corpora phrase their typos inside
// multi-word sentences, so none of them could see that putting the intent pass ahead of
// Fuse took lone-token name lookup from 96.0% to 82.1%. A harness that cannot observe the
// behavior a change displaces will certify the change.
const misspellings = CATALOG.flatMap((c) =>
	Array.from({ length: c.name.length }, (_, i) => c.name.slice(0, i) + c.name.slice(i + 1))
		.filter((t) => t.length >= 3)
		.map((t) => [t, [c.name]]),
);

const CORPORA = {
	[`harvested-heading · ${split.toUpperCase()}`]: pick('heading'),
	[`harvested-full · ${split.toUpperCase()}`]: pick('full'),
	...(DEV ? {} : { 'misspelled-name': misspellings }),
	...(DEV ? {} : { 'authored-intent': authored('queries-intent.json'), 'authored-adversarial': authored('queries-adversarial.json') }),
};

function evaluate(rank, cases) {
	let h1 = 0;
	let h3 = 0;
	let h5 = 0;
	let mrr = 0;
	const misses = [];
	const t0 = process.hrtime.bigint();
	for (const [q, expected] of cases) {
		const got = rank(q);
		const i = got.findIndex((n) => expected.includes(n));
		if (i === 0) h1++;
		if (i >= 0 && i < 3) h3++;
		if (i >= 0 && i < 5) h5++;
		if (i >= 0) mrr += 1 / (i + 1);
		else misses.push([q, got.slice(0, 3)]);
	}
	const n = cases.length || 1;
	return { top1: h1 / n, top3: h3 / n, top5: h5 / n, mrr: mrr / n, ms: Number(process.hrtime.bigint() - t0) / 1e6 / n, misses };
}

const pct = (x) => `${(x * 100).toFixed(1)}%`.padStart(6);
console.log(`corpus: ${corpus.length} harvested pairs · ${CATALOG.length} candidate components · ${split} split\n`);
for (const [name, cases] of Object.entries(CORPORA)) {
	console.log(`━━ ${name}  (${cases.length} queries)`);
	console.log(`${'ranker'.padEnd(26)}  top1    top3    top5     MRR   ms/query`);
	let shippedMisses = [];
	for (const [label, rank] of Object.entries(RANKERS)) {
		const r = evaluate(rank, cases);
		if (label === 'intent-search.ts') shippedMisses = r.misses;
		console.log(`${label.padEnd(26)}${pct(r.top1)}  ${pct(r.top3)}  ${pct(r.top5)}   ${r.mrr.toFixed(3)}   ${r.ms.toFixed(2)}`);
	}
	if (DEV && shippedMisses.length) {
		console.log('\n  misses (tuning may read THESE and only these):');
		for (const [q, got] of shippedMisses.slice(0, 20)) console.log(`   ${q.slice(0, 68).padEnd(70)} → ${got.join(', ') || '(nothing)'}`);
	}
	console.log('');
}

writeFileSync(join(tmp, 'noop'), '');
rmSync(tmp, { recursive: true, force: true });
