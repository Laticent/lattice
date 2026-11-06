// @vitest-environment node
import { describe, expect, it } from 'vitest';
// The engine's single source of truth for the `align:` register (CommonJS).
import { HORIZONTAL, VERTICAL } from '../../../../lib/core/resolve-align.js';
import { ALIGN_HORIZONTAL, ALIGN_VERTICAL, readAlign, writeAlign } from './align-catalog';

// Rot-guard: the Studio display catalog MUST stay in step with the engine register, or a word
// renders but is not offered, or the picker offers a dead word. Mirrors mode-catalog.test.ts.
describe('align-catalog ↔ resolve-align', () => {
	it('offers exactly the engine words, in the engine order, on each axis', () => {
		expect(ALIGN_VERTICAL.map((e) => e.name)).toEqual([...VERTICAL]);
		expect(ALIGN_HORIZONTAL.map((e) => e.name)).toEqual([...HORIZONTAL]);
	});

	it('reads a value as the engine does', () => {
		expect(readAlign('bottom right')).toMatchObject({ v: { name: 'bottom' }, h: { name: 'right' } });
		expect(readAlign('left top')).toMatchObject({ v: { name: 'top' }, h: { name: 'left' } });
		expect(readAlign('center')).toMatchObject({ v: { name: 'middle' }, h: { name: 'center' } });
		expect(readAlign('top center')).toMatchObject({ v: { name: 'top' }, h: { name: 'center' } });
		expect(readAlign('')).toEqual({ v: null, h: null });
	});

	it('writes the shortest value that says the picks', () => {
		expect(writeAlign('middle', 'center')).toBe('center');
		expect(writeAlign('bottom', 'right')).toBe('bottom right');
		expect(writeAlign(null, 'left')).toBe('left');
		// `center` alone means both axes; the picker cannot say "side to side only" with it.
		expect(writeAlign(null, 'center')).toBe('center');
		expect(writeAlign(null, null)).toBeNull();
	});
});
