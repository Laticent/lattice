import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { HOOK_TIMEOUT_MS, TEST_TIMEOUT_MS } from './test-budgets.js';

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
		// Not vitest's 5 s default — the Studio tests cost 1–2 s of real wall-clock
		// each and the suite runs its files in parallel, so the default left 20
		// tests close enough to the wall that contention pushed a different one
		// over it every run (#1324). Rationale + measurements: ./test-budgets.js.
		testTimeout: TEST_TIMEOUT_MS,
		hookTimeout: HOOK_TIMEOUT_MS,
	},
});
