// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
// The engine's single source of truth for the `marks:` register (CommonJS).
import {
	MARKS_AXES as ENGINE_AXES,
	MARKS_INTENSITIES as ENGINE_INTENSITIES,
	MARKS_TOKENS as ENGINE_TOKENS,
	MARKS_DEFAULT,
	MARKS_INTENSITY_DEFAULT,
	MARKS_NAMES,
	parseMarks,
} from '../../../../lib/core/resolve-marks.js';
import {
	activeMarks,
	DEFAULT_MARKS,
	MARKS_FINISHES,
} from './marks-catalog';
import { marksValue, parseMarksValue } from './marks-value';
import {
	DEFAULT_MARKS_INTENSITY,
	MARKS_AXES,
	MARKS_INTENSITIES,
	MARKS_TOKENS,
	MARKS_NAMES as WORD_NAMES,
} from './marks-words';

// Rot-guard: the Studio display catalog MUST stay in step with the engine register.
// Without it, a register change silently drifts the picker — a value that renders but
// isn't offered, or a catalog entry pointing at a dead name. Mirrors corners-catalog.test.ts.
describe('marks-catalog ↔ MARKS_NAMES', () => {
	const names = new Set<string>(MARKS_NAMES);

	it('every catalog entry is a registered marks value', () => {
		for (const s of MARKS_FINISHES) {
			expect(names.has(s.name), `catalog "${s.name}" is not in MARKS_NAMES`).toBe(true);
		}
	});

	it('every registered marks value has a catalog entry (the picker offers all of them)', () => {
		const cataloged = new Set(MARKS_FINISHES.map((s) => s.name));
		for (const name of MARKS_NAMES) {
			expect(cataloged.has(name), `chart-finish "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});

	it('the default the picker falls back to is the one the engine stamps', () => {
		expect(DEFAULT_MARKS).toBe(MARKS_DEFAULT);
		expect(activeMarks('')).toBe(activeMarks(DEFAULT_MARKS));
		expect(activeMarks('off').name).toBe(DEFAULT_MARKS); // not a finish: reads as the default, as it renders
	});

	it('the editor axes match the engine axes, word for word and in order', () => {
		expect([...WORD_NAMES]).toEqual([...MARKS_NAMES]);
		expect(MARKS_TOKENS).toEqual([...ENGINE_TOKENS]);
		expect([...MARKS_INTENSITIES]).toEqual([...ENGINE_INTENSITIES]);
		expect(MARKS_AXES.map((a) => [...a])).toEqual(ENGINE_AXES.map((a: readonly string[]) => [...a]));
	});

	it('reads a deck value by axis exactly as the engine does', () => {
		expect(DEFAULT_MARKS_INTENSITY).toBe(MARKS_INTENSITY_DEFAULT);
		for (const raw of ['tone vivid', 'vivid tone', 'Pigment  VIVID', '[etch, vivid]', 'vivid', 'tone', 'muted etch', 'etch tone', 'wibble vivid', '']) {
			const engine = parseMarks(raw);
			expect(parseMarksValue(raw), raw).toEqual({ finish: engine.finish, intensity: engine.intensity });
		}
		expect(parseMarksValue('tone vivid # house')).toEqual({ finish: 'tone', intensity: 'vivid' });
	});

	it('writes a finish without dropping the deck\'s intensity, and removes the line at the defaults', () => {
		expect(marksValue('etch', 'vivid')).toBe('etch vivid');
		expect(marksValue('pigment', 'vivid')).toBe('pigment vivid');
		expect(marksValue('tone', '')).toBe('tone');
		expect(marksValue('tone', 'muted')).toBe('tone');
		expect(marksValue('pigment', 'muted')).toBe('');
		expect(marksValue('pigment', '')).toBe('');
	});
});
