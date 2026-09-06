// Relative perf-regression detector for the docs site — the gate behind the
// NIGHTLY perf watch (.github/workflows/perf-nightly.yml). It does NOT measure
// or build; it PARSES two directories of Lighthouse runs (a `base` and a `head`)
// and flags any metric that regressed by more than its tolerance.
//
// WHY relative, not absolute: absolute Lighthouse budgets rot as the site grows
// and flap on CI runner variance (the perf job is the only gate whose verdict
// depends on the runner — CPU speed + whether the CDN web fonts loaded — not
// just the code). A delta-vs-base check removes the GROWTH axis entirely: the
// bar is "where main was last night", measured on the SAME runner back-to-back,
// so systematic runner differences cancel and only a real regression trips it.
// See engineering/decisions/2026-06-15-docs-perf-gating-policy.md.
//
// Input layout (produced by scripts/perf-collect.mjs):
//   <dir>/desktop/lhr-*.json   <dir>/mobile/lhr-*.json   (one LHR per run)
//
// Usage:
//   node scripts/perf-regression.mjs --base <dir> --head <dir> [--md out.md] [--json out.json]
//   node scripts/perf-regression.mjs --report <dir> [--md out.md]   # measure-only, no gate
//
// Exit code: 0 = no regression (or report-only); 1 = at least one regression
// (or a head score under the catastrophe floor). Other errors exit 2.

import fs from 'node:fs';
import path from 'node:path';

// Per-metric policy. EVERY metric here is ENVIRONMENT-COUPLED (LCP/CLS/TBT/score;
// runner + font-load variance), so each carries a wide band PLUS an absolute noise
// floor, and a sub-noise wobble never trips.
// A metric regresses when the head is worse than the base by MORE than BOTH its
// tolerance (relative %, or absolute) AND its noise floor. `floor` (score only)
// is an absolute catastrophe backstop independent of the delta.
//
// THERE IS DELIBERATELY NO DETERMINISTIC CLASS HERE ANY MORE. `script-size` used to
// be one, on the claim "bundle bytes; no runner/network noise", and it was not: it
// summed Lighthouse network records, so it measured what happened to LOAD during a
// visit, not what the build produced. Measured across 140 (commit, URL, form-factor)
// triples read two or more times on IDENTICAL commits, 35% moved further than its own
// 3% tolerance and the worst moved 104KB on a ~200KB page — through a median of three
// runs. Deterministic bytes are now gated per-PR off the built artifact by
// `check-route-budget.mjs`, which reads them off disk. Do not re-add a bytes metric
// here; add a route to `docs/route-budget.json` instead.
// See engineering/decisions/2026-09-02-alarm-channel-saturation.md.
const METRICS = {
	'performance-score': {
		label: 'Perf score',
		unit: 'score',
		higherIsBetter: true,
		tolAbs: 0.05, // a drop > 0.05 from base is a regression
		noiseAbs: 0.02, // ignore sub-0.02 wobble
		floor: 0.5, // head below this is a regression regardless of delta
	},
	'largest-contentful-paint': {
		label: 'LCP',
		unit: 'ms',
		higherIsBetter: false,
		tolPct: 0.15, // > 15% slower than base
		noiseAbs: 150, // …and at least 150ms worse
	},
	'cumulative-layout-shift': {
		label: 'CLS',
		unit: '',
		higherIsBetter: false,
		tolAbs: 0.05, // > 0.05 worse than base (absolute — CLS is unitless small)
		noiseAbs: 0.01,
	},
	'total-blocking-time': {
		label: 'TBT',
		unit: 'ms',
		higherIsBetter: false,
		tolPct: 0.2, // > 20% slower
		noiseAbs: 100,
	},
};

const FORM_FACTORS = ['desktop', 'mobile'];

function parseArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--base') out.base = argv[++i];
		else if (a === '--head') out.head = argv[++i];
		else if (a === '--report') out.report = argv[++i];
		else if (a === '--md') out.md = argv[++i];
		else if (a === '--json') out.json = argv[++i];
		else throw new Error(`unknown arg: ${a}`);
	}
	return out;
}

function median(nums) {
	if (nums.length === 0) return null;
	const s = [...nums].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Pull the four tracked metrics out of one Lighthouse result object.
function metricsFromLhr(lhr) {
	const audit = (id) => lhr.audits?.[id]?.numericValue;
	return {
		'performance-score': lhr.categories?.performance?.score ?? null,
		'largest-contentful-paint': audit('largest-contentful-paint') ?? null,
		'cumulative-layout-shift': audit('cumulative-layout-shift') ?? null,
		'total-blocking-time': audit('total-blocking-time') ?? null,
	};
}

// Read every lhr-*.json in <dir>/<formFactor>/, group runs by URL, and return
// { url: { metric: medianValue } } — the median run per metric, so one noisy
// run can't move the verdict (mirrors lhci's aggregationMethod: 'median-run').
function readFormFactor(dir, formFactor) {
	const ffDir = path.join(dir, formFactor);
	if (!fs.existsSync(ffDir)) return null;
	const files = fs.readdirSync(ffDir).filter((f) => f.startsWith('lhr-') && f.endsWith('.json'));
	if (files.length === 0) return null;

	const byUrl = new Map();
	for (const f of files) {
		let lhr;
		try {
			lhr = JSON.parse(fs.readFileSync(path.join(ffDir, f), 'utf8'));
		} catch (e) {
			throw new Error(`failed to parse ${path.join(ffDir, f)}: ${e.message}`);
		}
		const url = lhr.finalDisplayedUrl ?? lhr.finalUrl ?? lhr.requestedUrl ?? 'unknown';
		const m = metricsFromLhr(lhr);
		if (!byUrl.has(url)) byUrl.set(url, []);
		byUrl.get(url).push(m);
	}

	const result = {};
	for (const [url, runs] of byUrl) {
		const agg = {};
		for (const key of Object.keys(METRICS)) {
			const vals = runs.map((r) => r[key]).filter((v) => v != null);
			agg[key] = median(vals);
		}
		result[url] = agg;
	}
	return result;
}

// Normalize a URL to a path so base and head line up even if the host/port
// differ (they don't here, but be defensive).
function urlKey(u) {
	try {
		return new URL(u).pathname;
	} catch {
		return u;
	}
}

// Is `head` worse than `base` for this metric, beyond tolerance + noise?
function evaluate(metricId, base, head) {
	const cfg = METRICS[metricId];
	if (base == null || head == null) return { regressed: false, reason: 'missing' };

	// Worse-by amount, in the metric's native direction.
	const worseBy = cfg.higherIsBetter ? base - head : head - base;
	if (worseBy <= 0) return { regressed: false }; // same or better — never a regression

	// Catastrophe floor (score): head below the floor AND worse than base. Gated
	// on `worseBy > 0` so a site parked below the floor doesn't file an issue
	// every single night even on a no-op or improving day.
	if (cfg.floor != null && head < cfg.floor) {
		return { regressed: true, reason: `below floor ${cfg.floor}` };
	}

	const noise = cfg.noiseAbs ?? 0;
	const tol = cfg.tolAbs != null ? cfg.tolAbs : (cfg.tolPct ?? 0) * Math.abs(base);
	const threshold = Math.max(noise, tol);
	return { regressed: worseBy > threshold, worseBy, threshold };
}

function fmt(metricId, v) {
	if (v == null) return '—';
	const cfg = METRICS[metricId];
	if (cfg.unit === 'score') return v.toFixed(3);
	if (cfg.unit === 'ms') return `${Math.round(v)}ms`;
	return v.toFixed(3); // CLS
}

function compare(base, head) {
	const regressions = [];
	const rows = [];
	for (const ff of FORM_FACTORS) {
		const b = readFormFactor(base, ff);
		const h = readFormFactor(head, ff);
		if (!h) continue; // nothing measured for this form factor
		const urls = new Set(Object.keys(h).map(urlKey));
		const bByKey = b ? Object.fromEntries(Object.entries(b).map(([u, m]) => [urlKey(u), m])) : {};
		const hByKey = Object.fromEntries(Object.entries(h).map(([u, m]) => [urlKey(u), m]));
		for (const key of [...urls].sort()) {
			const bm = bByKey[key];
			const hm = hByKey[key];
			for (const metricId of Object.keys(METRICS)) {
				const baseV = bm?.[metricId] ?? null;
				const headV = hm?.[metricId] ?? null;
				const verdict = evaluate(metricId, baseV, headV);
				rows.push({ ff, url: key, metricId, baseV, headV, verdict });
				if (verdict.regressed) regressions.push({ ff, url: key, metricId, baseV, headV, verdict });
			}
		}
	}
	return { rows, regressions };
}

function reportOnly(dir) {
	const rows = [];
	for (const ff of FORM_FACTORS) {
		const h = readFormFactor(dir, ff);
		if (!h) continue;
		for (const [url, m] of Object.entries(h)) {
			for (const metricId of Object.keys(METRICS)) {
				rows.push({ ff, url: urlKey(url), metricId, headV: m[metricId] });
			}
		}
	}
	return rows;
}

function toMarkdown({ rows, regressions }, { reportMode } = {}) {
	const lines = [];
	if (reportMode) {
		lines.push('### Docs-site perf — current medians\n');
		lines.push('| Form factor | URL | Metric | Value |');
		lines.push('|---|---|---|---|');
		for (const r of rows) {
			lines.push(`| ${r.ff} | ${r.url} | ${METRICS[r.metricId].label} | ${fmt(r.metricId, r.headV)} |`);
		}
		return lines.join('\n') + '\n';
	}

	const status = regressions.length === 0 ? '✅ no regression' : `❌ ${regressions.length} regression(s)`;
	lines.push(`### Docs-site perf — nightly regression watch — ${status}\n`);
	lines.push('Δ vs the base build (both measured back-to-back on this runner). A row');
	lines.push('trips only if head is worse than base beyond the metric tolerance.\n');
	lines.push('| Form factor | URL | Metric | Base | Head | Δ | Status |');
	lines.push('|---|---|---|---|---|---|---|');
	for (const r of rows) {
		const cfg = METRICS[r.metricId];
		let delta = '—';
		if (r.baseV != null && r.headV != null) {
			const d = r.headV - r.baseV;
			delta = fmt(r.metricId, Math.abs(d));
			delta = (d > 0 ? '+' : d < 0 ? '−' : '±') + delta;
		}
		const flag = r.verdict.regressed ? '❌' : '✓';
		lines.push(
			`| ${r.ff} | ${r.url} | ${cfg.label} | ${fmt(r.metricId, r.baseV)} | ${fmt(r.metricId, r.headV)} | ${delta} | ${flag} |`,
		);
	}
	return lines.join('\n') + '\n';
}

function main() {
	const args = parseArgs(process.argv.slice(2));

	if (args.report) {
		const rows = reportOnly(args.report);
		const md = toMarkdown({ rows }, { reportMode: true });
		process.stdout.write(md);
		if (args.md) fs.writeFileSync(args.md, md);
		return 0;
	}

	if (!args.base || !args.head) {
		process.stderr.write('error: --base and --head are required (or --report <dir>)\n');
		return 2;
	}

	const result = compare(args.base, args.head);
	const md = toMarkdown(result);
	process.stdout.write(md);
	if (args.md) fs.writeFileSync(args.md, md);
	if (args.json) {
		fs.writeFileSync(args.json, JSON.stringify({ regressions: result.regressions, rows: result.rows }, null, 2));
	}

	if (result.regressions.length > 0) {
		process.stderr.write(`\nperf-regression: ${result.regressions.length} regression(s) detected.\n`);
		return 1;
	}
	process.stdout.write('\nperf-regression: clean.\n');
	return 0;
}

// Export pure helpers for unit tests; only run main() as a CLI.
export { compare, evaluate, METRICS, median, metricsFromLhr, readFormFactor, toMarkdown };

if (import.meta.url === `file://${process.argv[1]}`) {
	process.exit(main());
}
