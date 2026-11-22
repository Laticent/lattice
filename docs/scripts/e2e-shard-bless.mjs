#!/usr/bin/env node
/**
 * Re-bless e2e/shard-weights.json from scheduled Studio E2E nightly runs.
 *
 * Each nightly leg uploads `studio-e2e-text-K` (report.txt, the `list` reporter's output).
 * Unzip those into one folder per run and leg, then:
 *
 *   node scripts/e2e-shard-bless.mjs <run-dir>...            print the plan these weights would give
 *   node scripts/e2e-shard-bless.mjs --write <run-dir>...    also rewrite e2e/shard-weights.json
 *
 * A <run-dir> holds report.txt directly, or holds one sub-folder per leg that does. Folders that
 * share a run id (the digits after a leading `r`, as in `r43872709328-7`) are one run.
 *
 * Weight = seconds per (project, spec file): the sum of that pair's test durations in a run, then
 * the median over runs, so one slow night does not set the plan. Use three or more recent
 * SCHEDULED runs, not a dispatch: a dispatch can run a subset, and its pairs would read as cheap.
 * Prints each run's measured per-leg minutes beside the new plan's (test seconds / 2 workers).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planLegs } from '../e2e/shard-plan.mjs';

const WORKERS = 2; // playwright.config.ts: `workers: isCI ? 2 : undefined`
const LINE = /^\s*[✓✘]\s+\d+\s+\[([^\]]+)\] › (e2e\/[^:]+):\d+:\d+ › .* \(([\d.]+)(ms|m|s)\)\s*$/;

/** Sum test seconds per "project|e2e/file" from one leg's report text. */
export function parseReport(text) {
	const out = {};
	for (const line of text.split('\n')) {
		const m = LINE.exec(line);
		if (!m) continue;
		const v = Number(m[3]);
		const s = m[4] === 'm' ? v * 60 : m[4] === 'ms' ? v / 1000 : v;
		const k = `${m[1]}|${m[2]}`;
		out[k] = (out[k] ?? 0) + s;
	}
	return out;
}

/** Median per key across runs (runs: [{key: seconds}]), rounded to 0.1 s. */
export function medianWeights(runs) {
	const keys = new Set(runs.flatMap((r) => Object.keys(r)));
	const out = {};
	for (const k of [...keys].sort()) {
		const v = runs.map((r) => r[k]).filter((x) => x != null).sort((a, b) => a - b);
		out[k] = Math.round(v[Math.floor(v.length / 2)] * 10) / 10;
	}
	return out;
}

function collect(dirs) {
	const runs = new Map(); // run id -> { key: seconds, legs: [seconds per leg] }
	const legsOf = (dir) =>
		fs.existsSync(path.join(dir, 'report.txt'))
			? [dir]
			: fs.readdirSync(dir).map((d) => path.join(dir, d)).filter((d) => fs.existsSync(path.join(d, 'report.txt')));
	for (const d of dirs) {
		for (const leg of legsOf(d)) {
			const id = /^r(\d+)/.exec(path.basename(leg))?.[1] ?? path.basename(d);
			const got = parseReport(fs.readFileSync(path.join(leg, 'report.txt'), 'utf8'));
			const run = runs.get(id) ?? { sums: {}, legs: [] };
			for (const [k, v] of Object.entries(got)) run.sums[k] = (run.sums[k] ?? 0) + v;
			run.legs.push(Object.values(got).reduce((a, b) => a + b, 0));
			runs.set(id, run);
		}
	}
	return runs;
}

const fmt = (secs) => secs.map((s) => (s / WORKERS / 60).toFixed(1)).join(' / ');
const ratio = (secs) => (Math.max(...secs) / (secs.reduce((a, b) => a + b, 0) / secs.length)).toFixed(2);

function main(argv) {
	const write = argv.includes('--write');
	const dirs = argv.filter((a) => a !== '--write');
	if (!dirs.length) {
		console.error('usage: e2e-shard-bless.mjs [--write] <run-dir>...');
		return 2;
	}
	const runs = collect(dirs);
	for (const [id, r] of runs) console.log(`measured  run ${id}: ${fmt(r.legs)} min (max/mean ${ratio(r.legs)})`);
	const weights = medianWeights([...runs.values()].map((r) => r.sums));
	// Project and spec lists come from the weights themselves, so the prediction covers measured pairs.
	const projects = [...new Set(Object.keys(weights).map((k) => k.split('|')[0]))].map((name) => ({ name }));
	const specs = [...new Set(Object.keys(weights).map((k) => k.split('|')[1].slice('e2e/'.length)))].sort();
	const n = Math.max(...[...runs.values()].map((r) => r.legs.length));
	const legs = planLegs({ projects, specs, weights, n }).map((l) => l.load);
	console.log(`planned   ${Object.keys(weights).length} pairs, ${n} legs: ${fmt(legs)} min (max/mean ${ratio(legs)})`);
	if (write) {
		const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'e2e', 'shard-weights.json');
		fs.writeFileSync(file, `${JSON.stringify(weights, null, '\t')}\n`);
		console.log(`wrote ${file}`);
	}
	return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exit(main(process.argv.slice(2)));
