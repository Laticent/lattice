// Fit the recommender's weights against the DEV half of the fit benchmark.
//
// Hand-tuning these was going backwards — three rounds of "raise this, lower that"
// each moved one slice up and another down, which is what guessing looks like from
// the inside. This does it honestly instead: extract every case's features ONCE
// (the expensive part, a leave-one-out index per case), then coordinate-descend the
// weights over the cached vectors, which is free.
//
// DEV ONLY. The chosen weights are pasted into fit-search.ts and the TEST split is
// run once, afterwards, by fit-bakeoff.mjs. Tuning against the reported numbers
// would make them meaningless.
//
// Usage: node tools/intent-bakeoff/tune-fit.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildFitCorpus } from './fit-corpus.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'tune-fit-'));
const out = join(tmp, 'fit.mjs');
execFileSync('npx', ['esbuild', join(ROOT, 'tools/intent-bakeoff/fit-search.ts'), '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=error'], {
	cwd: join(ROOT, 'docs'),
	stdio: ['ignore', 'ignore', 'inherit'],
});
const fit = await import(pathToFileURL(out).href);

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
	slots: c.slots ?? {},
}));

const cases = buildFitCorpus(CATALOG).filter((c) => c.split === 'dev' && c.note === 'selection');
process.stdout.write(`caching features for ${cases.length} dev cases…`);
const cached = cases.map((c) => ({ c, f: fit.fitFeatures(fit.buildFitIndex(CATALOG, { excludeKey: c.excludeKey }), c.query) }));
console.log(' done');

const KEYS = ['name', 'tag', 'when', 'anti', 'fn', 'capacityFit', 'capacitySoft', 'capacityHard', 'lexical'];
const FEATURE_OF = { name: 'name', tag: 'tag', when: 'when', anti: 'anti', fn: 'fn', capacityFit: 'capFit', capacitySoft: 'capSoft', capacityHard: 'capHard', lexical: 'lexical' };

function rank(features, w) {
	const scored = [];
	for (const [name, f] of features) {
		let s = 0;
		for (const k of KEYS) s += w[k] * f[FEATURE_OF[k]];
		if (s > 0) scored.push([name, s]);
	}
	return scored.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((x) => x[0]);
}

/** Balanced objective: getting it right, having it in reach, and — the point of the
 *  whole exercise — keeping the warned-against component behind the right one. */
function objective(w) {
	let p1 = 0;
	let p3 = 0;
	let pos = 0;
	let avoided = 0;
	let avoidable = 0;
	for (const { c, f } of cached) {
		const got = rank(f, w);
		const i = got.findIndex((n) => c.expect.includes(n));
		if (c.kind === 'positive') {
			pos++;
			if (i === 0) p1++;
			if (i >= 0 && i < 3) p3++;
		} else {
			avoidable++;
			const bad = got.findIndex((n) => c.avoid.includes(n));
			if (bad === -1 || (i >= 0 && i < bad)) avoided++;
			if (i === 0) p1++;
			if (i >= 0 && i < 3) p3++;
			pos++;
		}
	}
	const top1 = p1 / Math.max(pos, 1);
	const top3 = p3 / Math.max(pos, 1);
	const avoid = avoidable ? avoided / avoidable : 0;
	return { score: 0.5 * top1 + 0.2 * top3 + 0.3 * avoid, top1, top3, avoid };
}

const w = { name: 6, tag: 2.2, when: 9, anti: -9, fn: 1.8, capacityFit: 1.4, capacitySoft: -1.2, capacityHard: -3, lexical: 3 };
const GRID = {
	name: [0, 1, 2, 3, 4, 6, 8],
	tag: [0, 0.5, 1, 2, 3],
	when: [0, 2, 4, 6, 9, 12, 16, 22],
	anti: [0, -2, -4, -6, -9, -14, -20],
	fn: [0, 0.5, 1, 1.8, 3, 4.5],
	capacityFit: [0, 0.5, 1.4, 3],
	capacitySoft: [0, -0.5, -1.2, -2.5],
	capacityHard: [0, -1.5, -3, -6],
	lexical: [0, 1, 2, 3, 4, 6, 9],
};

let best = objective(w);
console.log(`start  score ${best.score.toFixed(4)}  top1 ${(best.top1 * 100).toFixed(1)}%  top3 ${(best.top3 * 100).toFixed(1)}%  avoided ${(best.avoid * 100).toFixed(1)}%`);

for (let pass = 0; pass < 6; pass++) {
	let moved = false;
	for (const k of KEYS) {
		const start = w[k];
		let bestVal = start;
		for (const v of GRID[k]) {
			const trial = { ...w, [k]: v };
			const r = objective(trial);
			if (r.score > best.score + 1e-9) {
				best = r;
				bestVal = v;
			}
		}
		if (bestVal !== start) {
			w[k] = bestVal;
			moved = true;
		}
	}
	console.log(`pass ${pass + 1}  score ${best.score.toFixed(4)}  top1 ${(best.top1 * 100).toFixed(1)}%  top3 ${(best.top3 * 100).toFixed(1)}%  avoided ${(best.avoid * 100).toFixed(1)}%`);
	if (!moved) break;
}

console.log('\nweights (paste into fit-search.ts `W`):');
console.log(JSON.stringify(w, null, 2));
rmSync(tmp, { recursive: true, force: true });
