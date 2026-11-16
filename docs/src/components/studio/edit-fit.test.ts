// @vitest-environment node
// The edit bar's steps (chrome-parts.tsx EDIT_FIT) run in two places: the app's row (useRowFit) and the pre-paint shell's,
// which studio.astro steps with a few lines of inline script. The two must try the same number of steps, or the shell and
// the app settle on different rows at the same width (studio-shell-parity.spec.ts would catch it, but only on the e2e tier).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EDIT_FIT, EDIT_FIT_LEVELS } from './chrome-parts';

const astro = readFileSync(join(__dirname, '../../pages/studio.astro'), 'utf8');

describe('the edit bar steps the same way in the app and the shell', () => {
	it('the shell script tries every step the app does', () => {
		const m = /for\(var l=0;l<(\d+);l\+\+\)\{b\.setAttribute\("data-fit",l\)/.exec(astro);
		expect(m, 'studio.astro steps the shell edit bar').not.toBeNull();
		expect(Number(m?.[1])).toBe(EDIT_FIT_LEVELS);
	});

	it('every step a class names is a step the row can reach', () => {
		for (const [name, cls] of Object.entries(EDIT_FIT)) {
			for (const [, n] of cls.matchAll(/fit=(\d+)/g)) expect(Number(n), `${name} names fit=${n}`).toBeLessThan(EDIT_FIT_LEVELS);
		}
	});

	it('a control that leaves the row at step N stays out at every later step', () => {
		for (const [name, cls] of Object.entries(EDIT_FIT)) {
			if (!/:hidden/.test(cls) || name === 'issueLong') continue;
			const steps = [...cls.matchAll(/fit=(\d+)\]\/editbar:hidden/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
			const first = steps[0];
			expect(steps, `${name} hides from step ${first} through the last`).toEqual(Array.from({ length: EDIT_FIT_LEVELS - first }, (_, k) => first + k));
		}
	});
});
