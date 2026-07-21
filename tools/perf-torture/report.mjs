// perf-torture REPORT — turn a run's result into consumable, standard-ish artifacts.
//
// The user-facing decision (2026-07-20): OWN a versioned JSON (the source of truth) + a
// Markdown-with-Mermaid human summary (renders natively on GitHub / the docs site), and ADOPT the
// V8 `.heapsnapshot` format for DevTools deep-dives (written by the engine, not here). JUnit XML is
// an OPT-IN projection for CI dashboards — a lossy view of the JSON, never the source of truth.
//
//   report.json        — schemaVersion-pinned; every number a consumer needs, incl. the raw series.
//   report.md          — a table per cycle + a Mermaid xychart per RISING metric.
//   report.junit.xml   — optional (--junit): one <testcase> per metric, RISING = <failure>.
//   <cycle>.heapsnapshot — V8/DevTools format, written by the engine under --snapshot/--retainers.
//
// This module is PURE (data in → strings out); the engine owns all fs writes so artifacts land in
// one place. Keep it fs-free so it stays trivially testable.

// Bump when the JSON shape changes in a way a consumer must notice. Additive fields don't bump.
export const SCHEMA_VERSION = 1;

const MB = 1e6;
const mb = (n) => (Number.isFinite(n) ? `${(n / MB).toFixed(2)}MB` : String(n));
// Make a value safe to drop into a GFM table cell: encode `|` as its HTML entity (renders as `|`), so a
// literal pipe in a listener key or add-site stack can't split the cell. Entity encoding, not backslash
// escaping — nothing to leave half-escaped.
const pipeSafe = (v) => String(v ?? '').replace(/\|/g, '&#124;');

/**
 * Assemble the versioned report object (the source of truth) from a completed run.
 * @param {{
 *   scenario: {name:string, distDir?:string},
 *   opts: object,                              // parsed CLI options
 *   cycles: Array<{name:string, isControl:boolean, rows:object[], series:object[], snapDiff:?object, retReport:?object, heapSnapshotFile:?string, listenerReport:?object}>,
 *   calibrated: boolean,
 *   floorBasis: string,
 *   durationMs: number,
 *   generatedAt: string,                       // ISO timestamp, stamped by the caller
 * }} run
 */
export function buildReport(run) {
	const { scenario, opts, cycles, calibrated, floorBasis, durationMs, generatedAt } = run;
	const risingCycles = cycles.filter((c) => c.rows.some((r) => r.trend === 'RISING')).map((c) => c.name);
	return {
		schemaVersion: SCHEMA_VERSION,
		tool: 'perf-torture',
		scenario: scenario.name,
		generatedAt,
		durationMs,
		options: { mode: opts.mode, k: opts.k, cpu: opts.cpu, cycles: cycles.map((c) => c.name), snapshot: !!opts.snapshot, retainers: !!opts.retainers, realm: !!opts.realm, listeners: !!opts.listeners },
		calibrated,
		floorBasis,
		verdict: { anyRising: risingCycles.length > 0, risingCycles, listenerLeakCycles: cycles.filter((c) => c.listenerReport?.leak).map((c) => c.name) },
		cycles: cycles.map((c) => ({
			name: c.name,
			isControl: c.isControl,
			// A RISING verdict whose growth is detached-realm scaffolding is a KNOWN HeapProfiler over-count —
			// UNCONFIRMED until re-measured without a heap client (see engine.mjs realmClassGrowth).
			realmUnconfirmed: !!c.realmUnconfirmed,
			// The verdict rows, plus the raw series each metric was judged on (charting + reproducibility).
			metrics: c.rows.map((r) => ({ ...r, series: seriesFor(c.series, r.metric) })),
			heapDiff: c.snapDiff
				? {
						totalDeltaBytes: c.snapDiff.totalDelta,
						detachedDeltaBytes: c.snapDiff.detachedDelta,
						detachedCountDelta: c.snapDiff.detachedCountDelta,
						top: c.snapDiff.top.map((r) => ({ key: r.k, deltaBytes: r.dSelf, deltaCount: r.dCount })),
					}
				: null,
			retainers: c.retReport
				? { targetsFound: c.retReport.targetsFound, sampleWalked: c.retReport.sampleWalked, inspectorContaminated: c.retReport.inspectorContaminated || 0, chains: c.retReport.chains.map(([sig, n]) => ({ sig, count: n })), example: c.retReport.example }
				: null,
			// --listeners: net-live growth split persistent (document/window → real leak) vs transient (GC churn),
			// with the add-SITE that named each persistent grower (the #1139 web-vitals discriminator).
			listeners: c.listenerReport
				? {
						persistentDelta: c.listenerReport.totalPersistentDelta,
						persistentPerCyc: c.listenerReport.persistentPerCyc,
						leak: !!c.listenerReport.leak,
						floor: c.listenerReport.floor ?? null,
						persistentGrowth: c.listenerReport.persistentGrowth.map((g) => ({ key: g.key, delta: g.delta, addSite: g.stack })),
						transientGrowth: c.listenerReport.grown.filter((g) => !g.persistent).slice(0, 5).map((g) => ({ key: g.key, delta: g.delta })),
					}
				: null,
			heapSnapshotFile: c.heapSnapshotFile || null,
		})),
	};
}

// The raw per-cycle values for one metric, filtered to the finite ≥0 samples the trend test used.
function seriesFor(series, metric) {
	return series.map((s) => s[metric]).filter((v) => Number.isFinite(v) && v >= 0);
}

// ── Markdown (+ Mermaid) ─────────────────────────────────────────────────────────
export function renderMarkdown(report) {
	const L = [];
	const leakCycles = report.verdict.listenerLeakCycles || [];
	const bad = report.verdict.anyRising || leakCycles.length > 0;
	const verdictIcon = bad ? '🔴' : '🟢';
	const parts = [];
	if (report.verdict.anyRising) parts.push(`RISING in ${report.verdict.risingCycles.map((c) => `\`${c}\``).join(', ')}`);
	if (leakCycles.length) parts.push(`persistent listener leak in ${leakCycles.map((c) => `\`${c}\``).join(', ')}`);
	const verdictText = parts.length ? parts.join('; ') : 'all metrics flat';
	L.push(`# perf-torture — ${report.scenario}`, '');
	L.push(`**Verdict:** ${verdictIcon} ${verdictText}`, '');
	L.push('| | |', '|---|---|');
	L.push(`| Generated | ${report.generatedAt} |`);
	L.push(`| Duration | ${(report.durationMs / 1000).toFixed(1)}s |`);
	L.push(`| Options | k=${report.options.k}, cpu=${report.options.cpu}×, mode=${report.options.mode} |`);
	L.push(`| Cycles | ${report.options.cycles.join(', ')} |`);
	L.push(`| Calibration | ${report.calibrated ? 'idle control' : '**UNCALIBRATED** (no idle control)'} |`);
	L.push(`| Floor basis | ${report.floorBasis} |`);
	L.push('');
	L.push('> Diagnostic, not a gate. RISING = Mann-Kendall z≥1.96 **and** Sen slope over the floor.', '');

	for (const c of report.cycles) {
		L.push(`## ${c.name}${c.isControl ? ' _(control — floors calibrated from this)_' : ''}`, '');
		if (c.realmUnconfirmed) L.push('> ⚠ **Realm-class growth — UNCONFIRMED.** The heap growth here includes V8 realm-binding scaffolding. The retained-heap metric is a known blind spot: this **may** be a reclaimable `HeapProfiler` over-count (detached contexts a real GC frees) **or** a genuinely pinned realm leak — the two are indistinguishable from a heap dump. Re-measure without a heap client (`performance.measureUserAgentSpecificMemory()` / a real device) to decide, before dismissing **or** believing it. See `2026-07-20-playground-theme-toggle-not-a-leak.md`.', '');
		L.push('| metric | first → last | Δ | sen/cyc | floor | z | trend |', '|---|---|---|---|---|---|---|');
		for (const m of c.metrics) {
			const trend = m.trend === 'RISING' ? '**RISING**' : m.trend;
			L.push(`| ${m.metric} | ${m.first} → ${m.last} | ${m.delta} | ${m.sen} | ${m.floor} | ${m.z} | ${trend} |`);
		}
		L.push('');
		// A Mermaid xychart per RISING metric — renders natively on GitHub + the docs site.
		for (const m of c.metrics) {
			if (m.trend !== 'RISING' || !Array.isArray(m.series) || m.series.length < 2) continue;
			L.push(mermaidLineChart(`${c.name} · ${m.metric} per cycle`, m.series), '');
		}
		if (c.heapDiff) {
			L.push('### heap diff (baseline → final)', '');
			L.push(`total Δ **${mb(c.heapDiff.totalDeltaBytes)}** · detached-DOM Δ ${(c.heapDiff.detachedDeltaBytes / 1e3).toFixed(0)}KB (${c.heapDiff.detachedCountDelta} nodes)`, '');
			const growers = c.heapDiff.top.filter((r) => r.deltaBytes > 50000);
			if (growers.length) {
				L.push('| retained Δ | Δcount | constructor |', '|---|---|---|');
				for (const r of growers) L.push(`| ${mb(r.deltaBytes)} | ${r.deltaCount} | \`${r.key}\` |`);
				L.push('');
			}
		}
		if (c.listeners) {
			L.push('### listeners (net-live, post-GC)', '');
			const lk = c.listeners.leak;
			const state = lk ? '🔴 **persistent leak**' : c.listeners.persistentDelta ? 'below floor (one-time/steady, not a per-cycle leak)' : '🟢 flat';
			L.push(`persistent Δ **+${c.listeners.persistentDelta}** on document/window·html·body (${c.listeners.persistentPerCyc}/cyc) — ${state}`, '');
			L.push('> Persistent = a listener on a target that never GCs (a real leak). Transient growth is churn a real GC frees. The add-site names *where* the growth comes from — the discriminator that told web-vitals from a real Studio leak (`2026-07-21-studio-compose-listener-leak-is-a-perf-overlay-artifact.md`).', '');
			if (c.listeners.persistentGrowth.length) {
				L.push('| Δ | listener @ target | add-site |', '|---|---|---|');
				// Encode any `|` as its HTML entity so it can't break the GFM table cell. Entity-encoding
				// (not backslash-escaping) sidesteps the incomplete-escape trap — there is no escape char to
				// leave un-escaped, and `&#124;` renders as `|`. `addSite`/`key` are our own strings, never
				// user input, but a URL/regex in a stack can carry a literal pipe.
				for (const g of c.listeners.persistentGrowth) L.push(`| +${g.delta} | \`${pipeSafe(g.key)}\` | ${pipeSafe(g.addSite)} |`);
				L.push('');
			}
			if (c.listeners.transientGrowth.length) L.push(`_Transient churn (GCs, not a leak): ${c.listeners.transientGrowth.map((t) => `+${t.delta} \`${t.key}\``).join(', ')}._`, '');
		}
		if (c.retainers) {
			L.push('### retainer chains', '');
			L.push(`${c.retainers.targetsFound} large retained target(s); static snapshot (walked ${c.retainers.sampleWalked}) — names the holder, does **not** prove growth.`, '');
			if (c.retainers.inspectorContaminated) L.push(`> ⚠ **${c.retainers.inspectorContaminated}/${c.retainers.sampleWalked} chain(s) root at the DevTools inspector** (\`DevTools console\` / \`ScriptStateProtectingContext\`) — an artifact of the attached heap client, **not** an app holder. Re-measure without a heap client to name the real retainer.`, '');
			for (const ch of c.retainers.chains) L.push(`- ×${ch.count} — ${ch.sig}`);
			L.push('');
		}
		if (c.heapSnapshotFile) L.push(`_Heap snapshot: \`${c.heapSnapshotFile}\` — open in Chrome DevTools ▸ Memory ▸ Load._`, '');
	}
	return L.join('\n');
}

// A Mermaid `xychart-beta` line chart. x-axis is the cycle index (0 = baseline); y is the value.
function mermaidLineChart(title, series) {
	const xs = series.map((_, i) => i);
	const safeTitle = String(title).replace(/"/g, "'");
	return ['```mermaid', 'xychart-beta', `  title "${safeTitle}"`, `  x-axis [${xs.join(', ')}]`, '  y-axis "value"', `  line [${series.map((v) => Math.round(v)).join(', ')}]`, '```'].join('\n');
}

// ── JUnit XML (opt-in CI projection) ──────────────────────────────────────────────
// One <testcase> per (cycle, metric); a RISING metric is a <failure>. Lossy on purpose — a CI
// dashboard wants pass/fail, the JSON keeps the full signal. The control (idle) cycle is reported
// too: an idle metric that reads RISING is itself a red flag (the control should stay flat).
export function renderJUnit(report) {
	const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	let tests = 0, failures = 0;
	const suites = [];
	for (const c of report.cycles) {
		const cases = [];
		let suiteFail = 0;
		for (const m of c.metrics) {
			if (m.trend === 'unavailable') continue; // never measured — not a pass or a fail
			tests++;
			const cls = `${report.scenario}.${c.name}`;
			if (m.trend === 'RISING') {
				failures++; suiteFail++;
				const msg = `RISING: sen ${m.sen}/cyc > floor ${m.floor} (z=${m.z}), ${m.first} → ${m.last}`;
				cases.push(`    <testcase name="${esc(m.metric)}" classname="${esc(cls)}"><failure message="${esc(msg)}">${esc(msg)}</failure></testcase>`);
			} else {
				cases.push(`    <testcase name="${esc(m.metric)}" classname="${esc(cls)}"/>`);
			}
		}
		suites.push(`  <testsuite name="${esc(c.name)}" tests="${cases.length}" failures="${suiteFail}">\n${cases.join('\n')}\n  </testsuite>`);
	}
	return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="perf-torture:${esc(report.scenario)}" tests="${tests}" failures="${failures}" time="${(report.durationMs / 1000).toFixed(3)}">\n${suites.join('\n')}\n</testsuites>\n`;
}
