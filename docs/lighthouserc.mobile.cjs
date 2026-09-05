// Lighthouse collection config — MOBILE form factor (companion to
// lighthouserc.cjs, DESKTOP). Used by scripts/perf-collect.mjs via
// `lhci collect` to MEASURE the docs site on a throttled mobile profile; the
// VERDICT lives in the nightly relative-regression watch, not here.
//
// History: the shadcn migration regressed mobile (4× CPU throttle): components
// 95→73 (LCP 2.4→5.0s), workbench LCP 2.7→13s — all from the ~554KB-gz engine
// bundle loading EAGERLY in <head>. The on-demand engine loader
// (src/lib/load-engine.ts) + deferred island hydration fixed it. This file used
// to carry absolute mobile budgets enforced per-PR; those flapped on CI runner
// variance (issue #327), so the gate moved to the NIGHTLY relative-regression
// watch (.github/workflows/perf-nightly.yml + scripts/perf-regression.mjs),
// which diffs HEAD vs the ~24h-ago base measured back-to-back on the same
// runner. See engineering/decisions/2026-06-15-docs-perf-gating-policy.md.
//
// `lhci collect` ignores any `assert` block, so this file is COLLECTION-ONLY:
// the url list, run count, and the mobile profile (Moto-G4-class CPU 4×,
// Slow-4G). Edit the tolerances/metrics in scripts/perf-regression.mjs.
//
// URLs mirror lighthouserc.cjs: ROOT-based ('/…', the /lattice base was retired
// 2026-06-28) and including the interactive app surface (studio), which stresses
// the mobile profile hardest. The two OTHER app surfaces this list used to carry,
// `/drawing-board/` and `/workbench/`, were dropped 2026-09-05 — both were REMOVED
// (engineering/decisions/2026-07-03-studio-succession.md) and their routes are now
// 310- and 306-byte redirect stubs with zero JS, so the six runs a night spent on
// them here measured nothing that could regress. The mobile history below is why
// they were worth measuring once, not why they still are.
module.exports = {
	ci: {
		collect: {
			startServerCommand: 'npx astro preview --port 4399',
			startServerReadyPattern: 'localhost:4399',
			url: [
				'http://localhost:4399/',
				'http://localhost:4399/components/',
				'http://localhost:4399/playground/',
				'http://localhost:4399/getting-started/',
				'http://localhost:4399/studio/',
			],
			numberOfRuns: 3,
			settings: {
				// No `preset` — formFactor + explicit screenEmulation + throttling
				// define the mobile profile (Moto-G4-class CPU 4×, Slow-4G).
				formFactor: 'mobile',
				screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2, disabled: false },
				throttling: {
					rttMs: 150,
					throughputKbps: 1638.4,
					cpuSlowdownMultiplier: 4,
					requestLatencyMs: 0,
					downloadThroughputKbps: 0,
					uploadThroughputKbps: 0,
				},
				chromeFlags: '--no-sandbox --headless=new --disable-dev-shm-usage --disable-gpu',
			},
		},
		upload: { target: 'temporary-public-storage' },
	},
};
