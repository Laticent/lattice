// @vitest-environment node
// The edit bar's steps (chrome-parts.tsx EDIT_FIT) run in two places: the app's row (useRowFit) and the pre-paint shell's,
// which studio.astro steps with a few lines of inline script, and styles/tailwind.css says what each step hides. The three
// must agree, or the shell and the app settle on different rows at the same width (studio-shell-parity.spec.ts would catch
// it, but only on the e2e tier).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EDIT_FIT, EDIT_FIT_LEVELS } from './chrome-parts';

const astro = readFileSync(join(__dirname, '../../pages/studio.astro'), 'utf8');
const css = readFileSync(join(__dirname, '../../styles/tailwind.css'), 'utf8');

/** The `data-out` steps the stylesheet hides at step `fit` (every one when it hides bare `[data-out]`). */
function hiddenAt(fit: number): number[] | 'all' {
	const line = css.split('\n').find((l) => l.startsWith(`[data-slot="edit-bar"][data-fit="${fit}"]`));
	if (!line) return [];
	if (/\[data-fit="\d"\] \[data-out\],?$/.test(line.trim())) return 'all';
	return [...line.matchAll(/\[data-out="(\d)"\]/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
}

describe('the edit bar steps the same way in the app, the shell and the stylesheet', () => {
	it('the shell script tries every step the app does', () => {
		const m = /for\(var l=0;l<(\d+);l\+\+\)\{b\.setAttribute\("data-fit",l\)/.exec(astro);
		expect(m, 'studio.astro steps the shell edit bar').not.toBeNull();
		expect(Number(m?.[1])).toBe(EDIT_FIT_LEVELS);
	});

	it('every step hides what left at it or before, and nothing that leaves later', () => {
		for (let fit = 1; fit < EDIT_FIT_LEVELS - 1; fit++) expect(hiddenAt(fit), `step ${fit}`).toEqual(Array.from({ length: fit }, (_, k) => k + 1));
		expect(hiddenAt(EDIT_FIT_LEVELS - 1), 'the last step hides every control that leaves').toBe('all');
	});

	it('every control leaves at a step the row can reach', () => {
		for (const [name, step] of Object.entries(EDIT_FIT)) {
			expect(Number(step), name).toBeGreaterThanOrEqual(1);
			expect(Number(step), name).toBeLessThan(EDIT_FIT_LEVELS);
		}
	});
});
