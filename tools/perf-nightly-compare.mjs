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
 * benchmark's own RME here runs from under 1% (render) to over 80% (a rasterize cycle at a handful
 * of iterations). A band that tries to resolve 15% will fire on noise, get ignored, and then the one
 * real regression lands in a muted channel. These catch a DOUBLING — and that is a guarantee, not
 * an aspiration. The effective band is `min(max(cliff, baseRME + headRME), 95)`: the same
 * variance-aware widening `bench:check` uses, so a noisy dataset raises its own bar, but CAPPED
 * below 100 so no amount of noise can let a 2x regression through. Uncapped it did exactly that —
 * the export tier's 58-slide deck read 82% RME, giving a ±164 band on which an exact doubling
 * reported `ok`.
 *
 * IT MUST NOT PASS WHEN IT COMPARED NOTHING. The first cut printed "No tier regressed past its
 * band" and exited 0 when head's summary was empty, and when every dataset had been renamed — both
 * of which look identical to a healthy run in the job summary. A comparison of zero datasets is now
 * a FAILURE, and so is dataset drift: those are the states where the alarm is blind, which is
 * exactly when it must speak up.
 *
 * Usage: node tools/perf-nightly-compare.mjs --base a.json --head b.json --md out.md
 * Exit 1 when something regressed past its band, when a tier drifted, or when nothing compared —
 * an alarm that compared nothing is BLIND, and being blind is worth saying out loud.
 * Exit 2 only when the tool was invoked wrong (missing paths), so a wiring bug is never filed as a
 * performance regression.
 */
import fs from 'node:fs';

/** Render is in-process and the most stable signal; export is a whole rasterize cycle over I/O. */
const BAND = { render: 60, export: 80 };

const arg = (k) => {
	const i = process.argv.indexOf(k);
	return i > 0 ? process.argv[i + 1] : undefined;
};
/**
 * TOLERANT, and deliberately anchored on the LAST balanced object rather than the first `{` in the
 * stream. `engine-bench --json` prints its tables and then the object and then a human "Done."
 * line, so a plain `> file` redirect does NOT produce parseable JSON — the first cut of this script
 * died on that. Scanning from the first brace also breaks the moment any earlier stdout line
 * happens to contain one, which would surface as a fake "perf regression"; so instead walk back
 * from the last `}` to the matching `{`.
 */
const read = (p) => {
	if (!p) throw new Error('missing --base/--head path');
	const raw = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
	const end = raw.lastIndexOf('}');
	if (end < 0) throw new Error(`no JSON object in ${p}`);
	let depth = 0;
	let inStr = false;
	for (let i = end; i >= 0; i--) {
		const c = raw[i];
		if (inStr) {
			if (c === '"' && raw[i - 1] !== '\\') inStr = false;
			continue;
		}
		if (c === '"') inStr = true;
		else if (c === '}') depth++;
		else if (c === '{' && --depth === 0) return JSON.parse(raw.slice(i, end + 1));
	}
	throw new Error(`no balanced JSON object in ${p}`);
};

if (!arg('--base') || !arg('--head')) {
	// EXIT 2 = the tool was wired wrong. Distinct from exit 1 so the workflow never files a
	// priority:high "perf regression" for what is really a broken invocation.
	console.error('perf-nightly-compare: --base and --head are both required');
	process.exit(2);
}
/**
 * An arm that produced no readable payload is an EMPTY RUN, not a crash. That distinction matters:
 * if the base bench died, the honest outcome is "this alarm compared nothing tonight" — reported
 * loudly, via the no-comparisons path below — rather than a stack trace the workflow would have to
 * guess the meaning of. Silence on a blind alarm is the one failure mode worth engineering against.
 */
const readOrEmpty = (p, label) => {
	try {
		return read(p);
	} catch (err) {
		console.error(`perf-nightly-compare: ${label} arm unreadable (${err.message}) — treating it as an empty run`);
		return {};
	}
};
const base = readOrEmpty(arg('--base'), 'base');
const head = readOrEmpty(arg('--head'), 'head');

const out = [];
let regressed = false;
let compared = 0;

/**
 * One tier's table. `rows` is the summary array from the run JSON; a dataset present in one run and
 * not the other FAILS rather than being noted in passing — the blessed-but-never-compared hole that
 * let four export timings rot unwatched started exactly there, as a row nobody read.
 */
function tier(label, baseRows = [], headRows = [], band, scale = 1, unit = 'ms') {
	if (!headRows.length && !baseRows.length) return;
	out.push(`\n### ${label}\n`);
	out.push('| dataset | base | head | Δ% | band | verdict |');
	out.push('|---|---|---|---|---|---|');
	const fmt = (r) => (r ? `${(r.ms / scale).toFixed(1)}${unit}` : '—');
	const names = [...new Set([...baseRows.map((r) => r.dataset), ...headRows.map((r) => r.dataset)])];
	for (const name of names) {
		const b = baseRows.find((r) => r.dataset === name);
		const h = headRows.find((r) => r.dataset === name);
		if (!b || !h) {
			regressed = true;
			out.push(`| \`${name}\` | ${fmt(b)} | ${fmt(h)} | — | — | **DATASET DRIFT** — present in only one arm, so nothing was compared |`);
			continue;
		}
		if (b.slides !== h.slides) {
			regressed = true;
			out.push(`| \`${name}\` | ${b.slides} slides | ${h.slides} slides | — | — | **WORKLOAD CHANGED** — the two arms are not comparable |`);
			continue;
		}
		// Variance-aware, the way `bench:check` does it: a dataset whose own measurement is noisy
		// raises its own bar rather than false-firing every night — but CAPPED, and the cap is not
		// optional. Unbounded widening means the noisier the measurement, the weaker the gate, which
		// inverts the whole point. Measured: the export tier's 58-slide deck reads 82% RME at two
		// iterations, so `max(80, 82+82)` = ±164 and an exact 2x regression reported `ok` while this
		// file's own header promised "these catch a DOUBLING". The cap sits below 100 so a doubling
		// always trips, whatever the noise; when it binds, the row says so, because a measurement too
		// noisy to trust is itself worth seeing rather than silently swallowing.
		const CAP = 95;
		const raw = Math.max(band, (b.rmePct ?? 0) + (h.rmePct ?? 0));
		const eff = Math.min(raw, CAP);
		const capped = raw > CAP;
		const d = ((h.ms - b.ms) / b.ms) * 100;
		// A NON-FINITE delta means a zero or missing base — a dataset that measured nothing. And a
		// COLLAPSE (head far below base) is not a win to celebrate: a rasterize cycle that reads
		// -95% has almost certainly stopped rasterizing. `engine-bench` swallows page-load failures
		// (`setContent(...).catch(() => {})`) and then screenshots zero sections, which reports as a
		// very fast run. Both were reported as `ok` and exited 0.
		if (!Number.isFinite(d)) {
			regressed = true;
			out.push(`| \`${name}\` | ${fmt(b)} | ${fmt(h)} | — | — | **NOT MEASURED** — non-finite delta, a base of zero or a dataset that produced nothing |`);
			continue;
		}
		if (d < -90) {
			regressed = true;
			out.push(`| \`${name}\` | ${fmt(b)} | ${fmt(h)} | ${d.toFixed(1)} | ±${eff.toFixed(0)} | **WORKLOAD COLLAPSED** — too fast to be real; the tier likely stopped doing its work |`);
			continue;
		}
		const bad = d > eff;
		if (bad) regressed = true;
		compared += 1;
		out.push(
			`| \`${name}\` | ${fmt(b)} | ${fmt(h)} | ${d >= 0 ? '+' : ''}${d.toFixed(1)} | ±${eff.toFixed(0)}${capped ? ` (capped from ±${raw.toFixed(0)})` : ''} | ${bad ? '**REGRESSION**' : d < -eff ? 'win' : 'ok'} |`,
		);
	}
}

/**
 * EXIT 2 ON A CRASH, NOT 1. Exit 1 is the workflow's "a tier regressed" code, so an internal
 * TypeError — a future bench summary shape, an unexpected null — was filed as a `priority:high`
 * perf regression whose entire body was a run link, because the crash happened before the report
 * was ever written. A tool that fell over has learned nothing about performance.
 */
try {
out.push('# Engine / export perf — head vs base, same runner\n');
tier('Engine render (markdown → HTML+CSS)', base.render?.summary, head.render?.summary, BAND.render);
tier('Export / rasterize (screenshot every slide)', base.export?.summary, head.export?.summary, BAND.export, 1000, 's');
tier('Print re-place (rasterize + assemble)', base.print?.summary, head.print?.summary, BAND.export, 1000, 's');

/**
 * A TIER THAT VANISHED FROM BOTH ARMS IS NOT ABSENCE OF NEWS. `tier()` returns early when neither
 * arm has rows, which is right for `--print` (deliberately not run) and catastrophically wrong for
 * a tier that was supposed to run and broke. And the base arm runs HEAD'S harness by design (the
 * overlay fix), so a head-side breakage of `exportTier` — a renamed key, a throw, an empty dataset
 * filter — hits BOTH arms identically. DATASET DRIFT, the guard built for exactly this, can never
 * fire on it: drift compares names WITHIN a tier that has rows.
 *
 * That is the blessed-but-never-read hole recurring inside the mechanism built to close it. So the
 * tiers this run was ASKED to produce are named up front and their absence is an alarm.
 */
const EXPECTED = ['render', 'export'];
const missing = EXPECTED.filter((k) => !(head[k]?.summary?.length || base[k]?.summary?.length));
if (missing.length) {
	regressed = true;
	out.push(`\n**A TIER THAT SHOULD HAVE RUN PRODUCED NOTHING: \`${missing.join('`, `')}\`.** Both arms are empty, so no per-dataset drift row can appear — the tier did not silently regress, it silently stopped being measured. The base arm runs head's harness, so a head-side break shows up on both sides and looks like agreement.`);
}
out.push(`\n_Tiers measured: ${EXPECTED.filter((k) => !missing.includes(k)).join(', ') || 'none'}${head.print?.summary?.length ? ', print' : ' · print not run (on-demand, `bench --print`)'}._`);

if (!compared) {
	// The state the first cut reported as "No tier regressed": both arms produced nothing, or every
	// dataset drifted. Silence here reads exactly like health, which is the one thing an alarm may
	// never do.
	regressed = true;
	out.push('\n**NOTHING WAS COMPARED.** Neither arm produced a comparable dataset — the bench did not run, exited early, or every dataset drifted. This is a harness failure reported as an alarm on purpose: a green "no regression" on zero comparisons is indistinguishable from health.');
} else if (regressed) {
	out.push(`\n**A dataset regressed past its band, or the two arms stopped being comparable.** Both runs were measured on this same runner minutes apart, so machine drift is already controlled for — this is a code change. Bisect the commit range in the run link below.`);
} else {
	out.push(`\nNo tier regressed past its band (${compared} dataset${compared === 1 ? '' : 's'} compared).`);
}

	fs.writeFileSync(arg('--md') ?? 'engine-perf.md', `${out.join('\n')}\n`);
	console.log(out.join('\n'));
} catch (err) {
	console.error(`perf-nightly-compare: crashed while comparing — ${err?.stack || err}`);
	process.exit(2);
}
process.exit(regressed ? 1 : 0);
