import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Vitest + React Testing Library harness for the docs site's React islands
// (Phase 1+ of the shadcn migration). jsdom environment; `@` resolves to src/
// to match the app's tsconfig path alias.
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
			// react-resizable-panels hijacks document pointerdown to hit-test dividers;
			// in jsdom (all rects 0×0 at 0,0) that swallows every click and breaks Radix
			// menus. Resize is verified in the Playwright e2e; unit tests use a plain-div
			// stub. See src/test/react-resizable-panels.stub.tsx.
			'react-resizable-panels': fileURLToPath(new URL('./src/test/react-resizable-panels.stub.tsx', import.meta.url)),
		},
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
