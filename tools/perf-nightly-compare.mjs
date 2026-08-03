#!/usr/bin/env node
/**
 * Compare two `engine-bench --json` runs and report a markdown verdict.
 *
 * HEAD vs BASE, BOTH MEASURED ON THE SAME RUNNER — never against the committed
 * `test/benchmark/baseline.json`. That file is machine-relative and says so, and a cold runner
 * reads up to 2x high: in one session the same code measured 93.9 / 69.0 / 64.2 / 39.6 / 44.9 /
 * 43.1 ms, and `bench:check` reported a phantom +124% regression on a healthy tree. Comparing two
 * builds measured minutes apart on one machine cancels that drift; comparing against a stored
 * number cannot. (engineering/decisions/2026-08-03-performance-guard.md)
 *
 * CLIFF BANDS, not tight percentages. Even same-runner, two builds are minutes apart and a
 * benchmark's own RME here runs 3-17%. A band that tries to resolve 15% will fire on noise, get
 * ignored, and then the one real regression lands in a muted channel. These catch a DOUBLING.
 *
 * Usage: node tools/perf-nightly-compare.mjs --base a.json --head b.json --md out.md
 * Exit 1 when something regressed past its band — the workflow keys the issue off that.
 */
import fs from 'node:fs';

/** Render is in-process and the most stable signal; export is a whole rasterize cycle over I/O. */
const BAND = { render: 60, export: 80 };

const arg = (k) => {
	const i = process.argv.indexOf(k);
	return i > 0 ? process.argv[i + 1] : undefined;
};
/**
 * TOLERANT. `engine-bench --json` prints the object and then a human "Done." line, so a plain
 * `> file` redirect does NOT produce parseable JSON — the first cut of this script died on it.
 * Slice out the outermost balanced object rather than making the workflow massage the stream.
 */
const read = (p) => {
	const raw = fs.readFileSync(p, 'utf8');
	const a = raw.indexOf('{');
	const b = raw.lastIndexOf('}');
	if (a < 0 || b <= a) throw new Error(`no JSON object in ${p}`);
	return JSON.parse(raw.slice(a, b + 1));
};

const base = read(arg('--base'));
const head = read(arg('--head'));
const out = [];
let regressed = false;

/**
 * One tier's table. `rows` is the summary array from the run JSON; a dataset present in one run and
 * not the other is reported as drift rather than silently dropped — the blessed-but-never-compared
 * hole that let four export timings rot unwatched.
 */
function tier(label, baseRows = [], headRows = [], band, scale = 1, unit = 'ms') {
	if (!headRows.length && !baseRows.length) return;
	out.push(`\n### ${label}\n`);
	out.push('| dataset | base | head | Δ% | band | verdict |');
	out.push('|---|---|---|---|---|---|');
	const names = [...new Set([...baseRows.map((r) => r.dataset), ...headRows.map((r) => r.dataset)])];
	for (const name of names) {
		const b = baseRows.find((r) => r.dataset === name);
		const h = headRows.find((r) => r.dataset === name);
		if (!b || !h) {
			out.push(`| \`${name}\` | ${b ? (b.ms / scale).toFixed(1) : '—'} | ${h ? (h.ms / scale).toFixed(1) : '—'} | — | — | dataset drift (re-check) |`);
			continue;
		}
		if (b.slides !== h.slides) {
			out.push(`| \`${name}\` | ${b.slides} slides | ${h.slides} slides | — | — | workload changed |`);
			continue;
		}
		const d = ((h.ms - b.ms) / b.ms) * 100;
		const bad = d > band;
		if (bad) regressed = true;
		out.push(
			`| \`${name}\` | ${(b.ms / scale).toFixed(1)}${unit} | ${(h.ms / scale).toFixed(1)}${unit} | ${d >= 0 ? '+' : ''}${d.toFixed(1)} | ±${band} | ${bad ? '**REGRESSION**' : d < -band ? 'win' : 'ok'} |`,
		);
	}
}

out.push('# Engine / export perf — head vs base, same runner\n');
tier('Engine render (markdown → HTML+CSS)', base.render?.summary, head.render?.summary, BAND.render);
tier('Export / rasterize', base.print?.summary, head.print?.summary, BAND.export, 1000, 's');

if (regressed) {
	out.push(`\n**A dataset regressed past its band.** Both runs were measured on this same runner minutes apart, so machine drift is already controlled for — this is a code change. Bisect the commit range in the run link below.`);
} else {
	out.push('\nNo tier regressed past its band.');
}

fs.writeFileSync(arg('--md') ?? 'engine-perf.md', `${out.join('\n')}\n`);
console.log(out.join('\n'));
process.exit(regressed ? 1 : 0);
