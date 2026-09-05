// Lighthouse collection config — DESKTOP form factor (companion:
// lighthouserc.mobile.cjs for MOBILE). Used by scripts/perf-collect.mjs via
// `lhci collect` to MEASURE the docs site; the per-PR/per-run VERDICT is no
// longer here.
//
// History: this file used to carry absolute `assert` budgets enforced per-PR.
// Those rotted as the site grew and flapped on CI runner variance (issue #327),
// so the gate moved to a NIGHTLY relative-regression watch
// (.github/workflows/perf-nightly.yml + scripts/perf-regression.mjs), which
// diffs HEAD vs the ~24h-ago base measured back-to-back on the same runner. See
// engineering/decisions/2026-06-15-docs-perf-gating-policy.md.
//
// `lhci collect` ignores any `assert` block, so this file is COLLECTION-ONLY:
// the url list, run count, and desktop emulation. Edit the tolerances/metrics
// in scripts/perf-regression.mjs, not here.
//
// Surfaces measured: the migrated React-island pages (landing, components,
// playground) + a Starlight baseline (getting-started) + the interactive app
// surface (studio — the heavy CodeMirror + live engine shell a user actually
// authors in), median of 3, desktop. FIVE URLs, and that is the same five
// docs/route-budget.json gates per-PR; the equality is pinned by
// scripts/check-route-budget.test.mjs.
//
// URLs are ROOT-based ('/…'): the site serves at base '/' in every environment
// (the /lattice project-page base was retired 2026-06-28 — see astro.config.mjs).
module.exports = {
	ci: {
		collect: {
			// Serve the already-built dist; perf-collect.mjs builds first.
			startServerCommand: 'npx astro preview --port 4399',
			startServerReadyPattern: 'localhost:4399',
			url: [
				'http://localhost:4399/',
				'http://localhost:4399/components/',
				'http://localhost:4399/playground/',
				'http://localhost:4399/getting-started/',
				'http://localhost:4399/studio/',
				// `/drawing-board/` and `/workbench/` were measured here until 2026-09-05.
				// Both surfaces were REMOVED (the Studio succeeded them,
				// engineering/decisions/2026-07-03-studio-succession.md) and their routes are
				// now 310- and 306-byte redirect stubs carrying ZERO JS. Lighthouse ran three
				// times on each, on both form factors — 12 runs a night that cannot regress.
				// Dropped, which also makes this list exactly the set
				// docs/route-budget.json gates; check-route-budget.test.mjs pins that equality.
			],
			numberOfRuns: 3,
			settings: {
				preset: 'desktop',
				chromeFlags: '--no-sandbox --headless=new --disable-dev-shm-usage --disable-gpu',
			},
		},
		upload: { target: 'temporary-public-storage' },
	},
};
