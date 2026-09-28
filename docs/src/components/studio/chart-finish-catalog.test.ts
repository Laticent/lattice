// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
// The engine's single source of truth for the `chart-finish:` register (CommonJS).
import { CHART_FINISH_NAMES } from '../../../../lib/core/resolve-chart-finish.js';
import { CHART_FINISHES } from './chart-finish-catalog';

// Rot-guard: the Studio display catalog MUST stay in step with the engine register.
// Without it, a register change silently drifts the picker — a value that renders but
// isn't offered, or a catalog entry pointing at a dead name. Mirrors corners-catalog.test.ts.
describe('chart-finish-catalog ↔ CHART_FINISH_NAMES', () => {
	const names = new Set<string>(CHART_FINISH_NAMES);

	it('every catalog entry is a registered chart-finish value', () => {
		for (const s of CHART_FINISHES) {
			expect(names.has(s.name), `catalog "${s.name}" is not in CHART_FINISH_NAMES`).toBe(true);
		}
	});

	it('every registered chart-finish value has a catalog entry (the picker offers all of them)', () => {
		const cataloged = new Set(CHART_FINISHES.map((s) => s.name));
		for (const name of CHART_FINISH_NAMES) {
			expect(cataloged.has(name), `chart-finish "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});
});
