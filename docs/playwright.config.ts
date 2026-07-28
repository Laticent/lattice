import { defineConfig, devices } from '@playwright/test';

// Playwright E2E for the Studio (route `/studio/`). Governed by
// engineering/decisions/2026-06-28-experience-gating-playwright.md.
//
// WHY a built site, not `astro dev`: the dev server's Vite dep-optimizer throws
// 504 "Outdated Optimize Dep" on the Studio island's lazy imports (the engine +
// heavy lint/chat bundles), which makes the preview flaky. `astro preview` on a
// production build has no Vite optimizer — deterministic and prod-like. So the
// webServer builds (without the slow `showcase:check` rasterization, irrelevant
// to E2E) then previews. Locally, `reuseExistingServer` picks up a preview you
// already have running so you don't rebuild every run.
//
// Browser: Chromium from the sandbox at PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
// (build 1194 ↔ @playwright/test 1.56.1). Do NOT run `playwright install` here.
// In CI, provision the pinned browser explicitly (the version pin IS the browser
// pin). See the decision doc §"Sandbox + CI browser provisioning".
//
// trace + video are ON by default (decision doc §"Watching a run") so every run
// leaves an RPA-style, scrubable record — the same artifacts the nightly relies
// on to make a failure reproducible without re-running.

const PORT = 4321;
const BASE_URL = `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

export default defineConfig({
	testDir: './e2e',
	// One slow surface (engine paint inside a srcdoc iframe) sets the timeout floor.
	timeout: 60_000,
	expect: {
		timeout: 15_000,
		// Committed pixel baselines for the @visual specs (the 2026-06-28 doc's
		// deferred follow-up, now implemented). Determinism comes from three pins:
		// the @playwright/test version IS the browser (rasterizer) pin; the
		// stylePath pins fonts to DejaVu with the webfont fetches blocked (see
		// e2e/visual.css + visual.spec.ts); animations/caret are neutralized here.
		// The small maxDiffPixelRatio absorbs sub-pixel AA noise only. Re-bless
		// deliberately with `npm run test:e2e:bless` — in the SAME PR as an
		// intentional look change, like the slide golden-diff baselines.
		toHaveScreenshot: {
			maxDiffPixelRatio: 0.01,
			stylePath: './e2e/visual.css',
			animations: 'disabled',
			caret: 'hide',
		},
	},
	fullyParallel: true,
	forbidOnly: isCI,
	// The E2E suite is nightly (not the PR critical path), so a single retry to
	// absorb browser-launch jitter is acceptable; local runs get none so flake is
	// visible immediately.
	retries: isCI ? 1 : 0,
	workers: isCI ? 2 : undefined,
	reporter: isCI
		? [['list'], ['html', { open: 'never' }], ['github']]
		: [['list'], ['html', { open: 'never' }]],
	outputDir: 'test-results',
	use: {
		baseURL: BASE_URL,
		trace: 'on',
		video: 'on',
		screenshot: 'only-on-failure',
		actionTimeout: 15_000,
		navigationTimeout: 40_000,
		// The site ships a service worker (docs/public/sw.js). Keep it OUT of the
		// e2e contexts by default: a controlling worker re-originates same-origin
		// GETs, which makes them invisible to page.route/context.route mocks
		// (playground-paint.spec.ts stubs Mermaid/KaTeX/fonts that way). The PWA
		// spec opts back in with test.use({ serviceWorkers: 'allow' }).
		serviceWorkers: 'block',
	},
	// Tag routing:
	//   (untagged)   functional oracles — desktop only (no need to re-run per width)
	//   @mobile      mobile-layout-specific (single swappable pane) — mobile only;
	//                the two-pane layout applies at ≥ tablet, so these can't run there
	//   @crosswidth  same assertion worth running at desktop AND mobile (the paint check)
	//   @visual      screenshot evidence — all three widths
	//   @webkit      real-WebKit-only, at devices['iPhone 15 Pro'] — engine behavior a
	//                Chromium project cannot stand in for (history traversal, #1226)
	projects: [
		{
			name: 'desktop',
			use: { viewport: { width: 1440, height: 900 } },
			grepInvert: /@mobile|@webkit/,
		},
		{
			name: 'tablet',
			use: { viewport: { width: 820, height: 1180 } },
			grep: /@visual/,
		},
		{
			name: 'mobile',
			use: { viewport: { width: 390, height: 844 } },
			grep: /@mobile|@crosswidth|@visual/,
		},
		// The ONLY non-Chromium project, and it exists for one reason: the back-gesture
		// guard (#1226) is a navigation mechanism whose first implementation passed every
		// Chromium check here and still failed on a real iPhone. History traversal timing
		// is engine behavior, so a Chromium project cannot stand in for it — and without a
		// committed WebKit run the "verified on iPhone 15 Pro" claim lives only in a
		// scratch file nobody can re-run (HARD RULE #23). Scoped by tag so it stays one
		// fast spec rather than a second full matrix.
		{
			name: 'webkit-phone',
			use: { ...devices['iPhone 15 Pro'] },
			grep: /@webkit/,
		},
	],
	webServer: {
		command: 'npm run build:e2e && npm run preview:e2e',
		url: `${BASE_URL}/studio/`,
		reuseExistingServer: !isCI,
		timeout: 300_000,
		stdout: 'ignore',
		stderr: 'pipe',
	},
});
