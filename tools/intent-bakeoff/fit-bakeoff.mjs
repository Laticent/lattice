// Score the recommender against the FIT benchmark (fit-corpus.mjs).
//
// Unlike bakeoff.mjs — which asks "can you find the component" — this asks the
// question #1440 actually poses: given a described task, does the right
// component come FIRST, and does the wrong one stay behind? The second half is
// the precision test, and it is why this file exists separately.
//
// Usage: npm run intent:fit            (test split)
//        npm run intent:fit -- --dev   (tuning split + misses)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildFitCorpus, scoreFit } from './fit-corpus.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DEV = process.argv.includes('--dev');

const raw = JSON.parse(readFileSync(join(ROOT, 'dist/docs/components.json'), 'utf8')).components;
const CATALOG = raw.map((c) => ({
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
	whenToUse: c.whenToUse ?? [],
	antiPatterns: c.antiPatterns ?? [],
	capacity: c.capacity ?? null,
	density: c.density ?? null,
	slots: c.slots ?? {},
}));

// Bundle the SHIPPED modules so this measures reality, never a copy.
const tmp = mkdtempSync(join(tmpdir(), 'fit-bakeoff-'));
async function load(rel) {
	const out = join(tmp, `${rel.replace(/[^a-z0-9]/gi, '_')}.mjs`);
	execFileSync('npx', ['esbuild', join(ROOT, rel), '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=error'], {
		cwd: join(ROOT, 'docs'),
		stdio: ['ignore', 'ignore', 'inherit'],
	});
	return import(pathToFileURL(out).href);
}

const intent = await load('docs/src/lib/intent-search.ts');
let fit = null;
try {
	fit = await load('docs/src/lib/fit-search.ts');
} catch {
	/* not built yet — baseline-only run */
}

const RANKERS = {};

// Baseline: today's lexical ranker. It indexes neither whenToUse nor
// antiPatterns, so excludeKey is a no-op and there is nothing it could leak.
const lexicalIndex = intent.buildIntentIndex(CATALOG);
RANKERS['intent-search (lexical)'] = (q) => intent.scoreIntent(lexicalIndex, q).map((h) => h.name);

if (fit?.buildFitIndex) {
	// Leave-one-out: the entry used as the query is dropped from the index.
	RANKERS['fit-search (facets)'] = (q, excludeKey) => fit.scoreFit(fit.buildFitIndex(CATALOG, { excludeKey }), q).map((h) => h.name);
}

const cases = buildFitCorpus(CATALOG).filter((c) => (DEV ? c.split === 'dev' : c.split === 'test'));
const slice = (kind, note) => cases.filter((c) => c.kind === kind && c.note === note);
const SLICES = [
	['selection · positive', slice('positive', 'selection')],
	['selection · redirect', slice('redirect', 'selection')],
	['authoring · positive', slice('positive', 'authoring')],
	['authoring · redirect', slice('redirect', 'authoring')],
];

console.log(`fit benchmark · ${cases.length} cases · ${DEV ? 'DEV' : 'TEST'} split`);
console.log(`  selection = a described task a recommender can answer · authoring = how to write the markup (reported, never tuned on)\n`);

for (const [label, rank] of Object.entries(RANKERS)) {
	console.log(`── ${label}`);
	for (const [name, set] of SLICES) {
		if (!set.length) continue;
		const r = scoreFit(rank, set);
		const avoided = r.avoided == null ? '' : `   avoided-the-wrong-one ${(r.avoided * 100).toFixed(1)}%`;
		console.log(`   ${name.padEnd(22)} n=${String(set.length).padStart(3)}   top1 ${(r.top1 * 100).toFixed(1).padStart(5)}%   top3 ${(r.top3 * 100).toFixed(1).padStart(5)}%${avoided}`);
	}
	if (DEV) {
		console.log('   selection misses (the only ones tuning may read):');
		const misses = [...scoreFit(rank, slice('positive', 'selection')).misses, ...scoreFit(rank, slice('redirect', 'selection')).misses];
		for (const [q, got] of misses.slice(0, 16)) console.log(`     ${q.padEnd(64)} ${got}`);
	}
	console.log('');
}

rmSync(tmp, { recursive: true, force: true });
