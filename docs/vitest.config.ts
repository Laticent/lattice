import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Every docs/src/lib package (cadenza, segno, vetrina, … 17 of them) names its built, gitignored dist/ in
// `main` and its TypeScript source under the `@laticent/source` export. The docs import them by directory
// (`@/lib/vetrina`, `./segno`), and a directory import reads `main`, never `exports`, so the tests ran the
// BUILT bundle: a test passed or failed on whether dist/ had been rebuilt, not on the code (HARD RULE #32;
// with recorder.ts broken and dist/ stale, recorder.test.ts still passed). This sends any import that lands
// on a src/lib/<pkg>/dist/ entry to the source file the package exports beside it, as the app reads it.
function libSource(): Plugin {
	const lib = fileURLToPath(new URL('./src/lib/', import.meta.url));
	const bundle = /^(.*)[\\/]dist[\\/]([^\\/]+?)\.(?:c|m)?js$/;
	return {
		name: 'lattice-lib-source',
		enforce: 'pre',
		async resolveId(source, importer, options) {
			const hit = await this.resolve(source, importer, { ...options, skipSelf: true });
			const m = hit && !hit.external ? bundle.exec(hit.id) : null;
			if (!m || dirname(m[1]) !== lib.replace(/[\\/]$/, '')) return null;
			const exportsMap = JSON.parse(readFileSync(join(m[1], 'package.json'), 'utf8')).exports || {};
			for (const entry of Object.values(exportsMap) as Record<string, unknown>[]) {
				const targets = JSON.stringify(entry);
				if (typeof entry?.['@laticent/source'] === 'string' && targets.includes(`./dist/${m[2]}.`)) return join(m[1], entry['@laticent/source'] as string);
			}
			return null;
		},
	};
}

// Vitest + React Testing Library harness for the docs site's React islands
// (Phase 1+ of the shadcn migration). jsdom environment; `@` resolves to src/
// to match the app's tsconfig path alias.
export default defineConfig({
	plugins: [libSource(), react()],
	resolve: {
		alias: [
			// The lint core loads from esm/lint.js beside the engine in the browser; Node has no engine
			// directory, so tests load the Node build of the same entry (lint-core-source.vitest.js).
			{ find: /^\.\/lint-core-source\.js$/, replacement: fileURLToPath(new URL('./src/playground/lint-core-source.vitest.js', import.meta.url)) },
			// The code record's writer: esm/code-record.js in the browser, the source here.
			{ find: /^@\/playground\/code-record-source\.js$/, replacement: fileURLToPath(new URL('./src/playground/code-record-source.vitest.js', import.meta.url)) },
			// The Marp export's `![bg]` lift: esm/bg-image-lift.js in the browser, the source here.
			{ find: /^.*\/playground\/bg-image-lift-source\.js$/, replacement: fileURLToPath(new URL('./src/playground/bg-image-lift-source.vitest.js', import.meta.url)) },
			{ find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
			// Cadenza imports the LTT format by its package name (its one dependency, and the name
			// its npm consumers resolve). The docs read every library as SOURCE, so the name maps to
			// the source here as `@/lib/*` does — never to the package's built dist/.
			{ find: '@laticent/ltt', replacement: fileURLToPath(new URL('./src/lib/ltt/index.ts', import.meta.url)) },
			// react-resizable-panels hijacks document pointerdown to hit-test dividers;
			// in jsdom (all rects 0×0 at 0,0) that swallows every click and breaks Radix
			// menus. Resize is verified in the Playwright e2e; unit tests use a plain-div
			// stub. See src/test/react-resizable-panels.stub.tsx.
			{ find: 'react-resizable-panels', replacement: fileURLToPath(new URL('./src/test/react-resizable-panels.stub.tsx', import.meta.url)) },
		],
		// The narration encoder lives in lib/core (the CLI voices a deck with it too), and a bare
		// import from there would otherwise reach the ROOT node_modules copy of the MP3 encoder while
		// a test's `vi.mock` names this project's. One copy, resolved from here, for every importer.
		dedupe: ['@breezystack/lamejs'],
	},
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./vitest.setup.ts'],
		include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
		// A CONSIDERED budget, replacing the framework's generic 5s default (#1328).
		//
		// A per-test timeout's job is to catch a HANG — an await that will never
		// resolve — not to police speed. At 5s it was doing the second job by accident:
		// the heaviest tests here drive a full `StudioShell` render plus a chain of
		// real-timer `userEvent` interactions, which costs 1-2s on an idle machine and
		// crosses 5s the moment the machine is busy. Measured, same box, 4-way CPU
		// contention against 4 vitest workers on 4 cores:
		//
		//   studio.theme-depth  "removes a saved theme…"  1.98s idle → 6.09s (3.1x)
		//   studio.theme-depth  "saves a named theme…"    1.78s idle → 4.94s (2.8x)
		//   studio.fuzz         "never crashes…"         12.99s idle → 43.14s (3.3x)
		//
		// The first two are the pair #1328 filed. They are not racy and they are not
		// slow — they are ~10 re-renders of a 5,000-line component, which is what the
		// end-to-end save → list → select → delete loop they cover actually costs.
		// (Checked, so nobody re-checks: `userEvent.setup({ delay: null })` saves
		// nothing — 1.99s vs 1.78s — and a bare `render(<StudioShell/>)` is 90-205ms,
		// so the cost is the interactions, not mount and not the inter-event delay.)
		//
		// TWO tests relying on this default crossed 5s in that run — `studio.theme-depth`
		// (6.09s) and `StudioShell.test.tsx`'s human-in-the-loop Present gate (5.09s),
		// with a third at 4.94s just under. Both files are under `components/studio/`.
		//
		// So why is this here and not on a `studio.*` glob? NOT because the flake pool
		// reaches outside the Studio — an earlier draft claimed that and it was a regex
		// artifact (a per-test budget is written two ways in this repo, and the scan saw
		// only one; see the decision note). It is because the suite already carries TEN
		// private per-test budgets across FIVE files, every one >=20s: five authors who
		// each hit this default and worked around it in their own file. The two files
		// nobody had patched yet are the two that flaked. Fix the default, not the two
		// files that happened to surface first.
		//
		// 20s is ~3.3x the slowest test that relies on this default under that
		// contention (6.09s) and ~10x its idle cost. It is deliberately generous:
		// being wrong high costs one slow report on a genuine hang, being wrong low
		// costs a red suite that people learn to dismiss — which is the actual damage
		// #1328 records, a real regression in #1312 waved through as contention. This
		// is also what 2026-08-03-performance-guard.md already concluded for CI wall
		// clock: a shared runner cannot resolve small durations, so timing gates the
		// merge only where it is deterministic. A 5s test timeout is a wall-clock gate
		// on a shared runner, arrived at by default rather than by choice.
		//
		// Files needing MORE than this keep their explicit third-argument budgets
		// (studio.fuzz, studio.present-*, PlaygroundApp, deictic); every one sits AT
		// or above 20s, so this default weakens none of them. It also repairs a
		// contradiction it had produced: two waits in studio.controls.test.tsx were
		// budgeted at 6000ms INSIDE a 5000ms test, so their grace was unreachable —
		// the test died first. See
		// engineering/decisions/2026-08-23-jsdom-suite-timeout-budget.md.
		testTimeout: 20_000,
	},
});
