// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
// The engine's single source of truth for the `chart-finish:` and `color-intensity:` keys (CommonJS).
import {
	CHART_FINISH_DEFAULT,
	CHART_FINISH_NAMES,
	COLOR_INTENSITY_DEFAULT,
	CHART_FINISH_AXES as ENGINE_AXES,
	COLOR_INTENSITIES as ENGINE_INTENSITIES,
	CHART_FINISH_SOURCE_FINISH as ENGINE_SOURCE_FINISH,
	CHART_FINISH_SOURCE_TOKENS as ENGINE_SOURCE_TOKENS,
	CHART_FINISH_SOURCES as ENGINE_SOURCES,
	CHART_FINISH_TOKENS as ENGINE_TOKENS,
	parseChartFinish,
} from '../../../../lib/core/resolve-chart-finish.js';
import {
	CHART_FINISH_AXES,
	CHART_FINISH_SOURCE_FINISH,
	CHART_FINISH_SOURCE_TOKENS,
	CHART_FINISH_SOURCES,
	CHART_FINISH_TOKENS,
	COLOR_INTENSITIES,
	DEFAULT_COLOR_INTENSITY,
	CHART_FINISH_NAMES as WORD_NAMES,
} from '../../lib/chart-finish-words';
import {
	activeChartFinish,
	CHART_FINISH_SOURCE_ENTRIES,
	CHART_FINISHES,
	DEFAULT_CHART_FINISH,
} from './chart-finish-catalog';
import { chartFinishValue, deckChartFinish, parseChartFinishValue } from './chart-finish-value';

// Rot-guard: the Studio display catalog MUST stay in step with the engine register.
// Without it, a register change silently drifts the picker — a value that renders but
// isn't offered, or a catalog entry pointing at a dead name. Mirrors corners-catalog.test.ts.
describe('chart-finish-catalog ↔ CHART_FINISH_NAMES', () => {
	const names = new Set<string>(CHART_FINISH_NAMES);

	it('every catalog entry is a registered marks value', () => {
		for (const s of CHART_FINISHES) {
			expect(names.has(s.name), `catalog "${s.name}" is not in CHART_FINISH_NAMES`).toBe(true);
		}
	});

	it('every registered marks value has a catalog entry (the picker offers all of them)', () => {
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
		expect([...COLOR_INTENSITIES]).toEqual([...ENGINE_INTENSITIES]);
		expect([...CHART_FINISH_SOURCES]).toEqual([...ENGINE_SOURCES]);
		expect(CHART_FINISH_SOURCE_TOKENS).toEqual([...ENGINE_SOURCE_TOKENS]);
		expect(CHART_FINISH_SOURCE_FINISH).toBe(ENGINE_SOURCE_FINISH);
		expect(CHART_FINISH_SOURCE_ENTRIES.map((e) => e.name)).toEqual([...ENGINE_SOURCES]);
		expect(CHART_FINISH_AXES.map((a) => [...a])).toEqual(ENGINE_AXES.map((a: readonly string[]) => [...a]));
	});

	it('reads a deck value by axis exactly as the engine does', () => {
		expect(DEFAULT_COLOR_INTENSITY).toBe(COLOR_INTENSITY_DEFAULT);
		for (const raw of ['tone vivid', 'vivid tone', 'Pigment  VIVID', '[etch, vivid]', 'vivid', 'tone', 'muted etch', 'etch tone', 'wibble vivid', '', 'tone ink', 'accent tone vivid', 'tone ink accent', 'ink']) {
			const engine = parseChartFinish(raw);
			expect(parseChartFinishValue(raw), raw).toEqual({ finish: engine.finish, intensity: engine.intensity, source: engine.source });
		}
		expect(parseChartFinishValue('tone vivid # house')).toEqual({ finish: 'tone', intensity: 'vivid', source: '' });
	});

	it('writes a finish, and removes the line at the default', () => {
		expect(chartFinishValue('etch')).toBe('etch');
		expect(chartFinishValue('tone')).toBe('tone');
		expect(chartFinishValue('pigment')).toBe('');
		expect(chartFinishValue('')).toBe('');
	});

	it('keeps tone\'s source while the finish stays tone, and drops it under a finish it means nothing to', () => {
		expect(chartFinishValue('tone', 'ink')).toBe('tone ink');
		expect(chartFinishValue('tone', 'accent')).toBe('tone accent');
		expect(chartFinishValue('etch', 'ink')).toBe('etch');
		expect(chartFinishValue('pigment', 'accent')).toBe('');
	});

	it('reads the deck from its two keys, each giving only its own axes, as the engine joins them', () => {
		const fm: Record<string, string> = { 'chart-finish': 'tone ink vivid', 'color-intensity': 'vivid etch' };
		expect(deckChartFinish((k) => fm[k])).toEqual({ finish: 'tone', source: 'ink', intensity: 'vivid' });
		expect(deckChartFinish(() => undefined)).toEqual({ finish: '', source: '', intensity: '' });
	});
});
