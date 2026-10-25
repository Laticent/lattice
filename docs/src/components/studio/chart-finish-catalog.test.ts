// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
// The engine's single source of truth for the `chart-finish:` register (CommonJS).
import {
	CHART_FINISH_DEFAULT,
	CHART_FINISH_INTENSITY_DEFAULT,
	CHART_FINISH_NAMES,
	CHART_FINISH_AXES as ENGINE_AXES,
	CHART_FINISH_INTENSITIES as ENGINE_INTENSITIES,
	CHART_FINISH_TOKENS as ENGINE_TOKENS,
	parseChartFinish,
} from '../../../../lib/core/resolve-chart-finish.js';
import {
	activeChartFinish,
	CHART_FINISHES,
	DEFAULT_CHART_FINISH,
} from './chart-finish-catalog';
import {
	CHART_FINISH_AXES,
	CHART_FINISH_INTENSITIES,
	CHART_FINISH_TOKENS,
	chartFinishValue,
	DEFAULT_CHART_FINISH_INTENSITY,
	parseChartFinishValue,
	CHART_FINISH_NAMES as WORD_NAMES,
} from './chart-finish-words';

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

	it('the default the picker falls back to is the one the engine stamps', () => {
		expect(DEFAULT_CHART_FINISH).toBe(CHART_FINISH_DEFAULT);
		expect(activeChartFinish('')).toBe(activeChartFinish(DEFAULT_CHART_FINISH));
		expect(activeChartFinish('off').name).toBe(DEFAULT_CHART_FINISH); // not a finish: reads as the default, as it renders
	});

	it('the editor axes match the engine axes, word for word and in order', () => {
		expect([...WORD_NAMES]).toEqual([...CHART_FINISH_NAMES]);
		expect(CHART_FINISH_TOKENS).toEqual([...ENGINE_TOKENS]);
		expect([...CHART_FINISH_INTENSITIES]).toEqual([...ENGINE_INTENSITIES]);
		expect(CHART_FINISH_AXES.map((a) => [...a])).toEqual(ENGINE_AXES.map((a: readonly string[]) => [...a]));
	});

	it('reads a deck value by axis exactly as the engine does', () => {
		expect(DEFAULT_CHART_FINISH_INTENSITY).toBe(CHART_FINISH_INTENSITY_DEFAULT);
		for (const raw of ['tone vivid', 'vivid tone', 'Pigment  VIVID', '[etch, vivid]', 'vivid', 'tone', 'muted etch', 'etch tone', 'wibble vivid', '']) {
			const engine = parseChartFinish(raw);
			expect(parseChartFinishValue(raw), raw).toEqual({ finish: engine.finish, intensity: engine.intensity });
		}
		expect(parseChartFinishValue('tone vivid # house')).toEqual({ finish: 'tone', intensity: 'vivid' });
	});

	it('writes a finish without dropping the deck\'s intensity, and removes the line at the defaults', () => {
		expect(chartFinishValue('etch', 'vivid')).toBe('etch vivid');
		expect(chartFinishValue('pigment', 'vivid')).toBe('pigment vivid');
		expect(chartFinishValue('tone', '')).toBe('tone');
		expect(chartFinishValue('tone', 'muted')).toBe('tone');
		expect(chartFinishValue('pigment', 'muted')).toBe('');
		expect(chartFinishValue('pigment', '')).toBe('');
	});
});
