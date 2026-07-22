import { describe, expect, it } from 'vitest';
import { MOTION_SPEEDS, MOTION_STYLES } from '@/playground/anima-host-sel';
import { activeMotionSpeed, activeMotionStyle, MOTION_SPEED_ENTRIES, MOTION_STYLE_ENTRIES } from './motion-catalog';

// Rot-guard: the Studio Style/Speed pickers MUST stay in step with the value sets the host resolves
// (MOTION_STYLES / MOTION_SPEEDS in anima-host-sel.ts). Otherwise a picker offers a style/speed the
// host doesn't understand, or a resolvable value has no picker entry. Mirrors mode-catalog.test.ts.
describe('motion-catalog ↔ host vocabularies', () => {
	it('the Style picker offers exactly MOTION_STYLES', () => {
		expect(MOTION_STYLE_ENTRIES.map((e) => e.name).sort()).toEqual([...MOTION_STYLES].sort());
	});
	it('the Speed picker offers exactly MOTION_SPEEDS', () => {
		expect(MOTION_SPEED_ENTRIES.map((e) => e.name).sort()).toEqual([...MOTION_SPEEDS].sort());
	});
	it('active* default an unset/unknown value to the built-in default', () => {
		expect(activeMotionStyle(undefined).name).toBe('build');
		expect(activeMotionStyle('nope').name).toBe('build');
		expect(activeMotionSpeed(undefined).name).toBe('auto');
		expect(activeMotionSpeed('nope').name).toBe('auto');
		expect(activeMotionSpeed('fast').name).toBe('fast');
	});
});
