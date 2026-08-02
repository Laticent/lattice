import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasFinePointer } from './use-breakpoint';

// Gates behavior that is free with a mouse and costly on a touchscreen — above all
// taking keyboard FOCUS, which on a tablet raises the software keyboard over half
// the screen. Doing that on every slide selection made navigation a chore (#1301
// review), so the Studio reveals the slide on touch WITHOUT focusing it.
afterEach(() => vi.unstubAllGlobals());

describe('hasFinePointer', () => {
	it('is true only for a hovering, fine pointer', () => {
		const seen: string[] = [];
		vi.stubGlobal('matchMedia', (q: string) => { seen.push(q); return { matches: true }; });
		expect(hasFinePointer()).toBe(true);
		// It must ask about INPUT capability, never about width — a large tablet is
		// desktop-wide and still has no mouse.
		expect(seen[0]).toBe('(hover: hover) and (pointer: fine)');
		expect(seen[0]).not.toMatch(/width/);
	});

	it('is false on a coarse/touch pointer', () => {
		vi.stubGlobal('matchMedia', () => ({ matches: false }));
		expect(hasFinePointer()).toBe(false);
	});

	it('is false where matchMedia does not exist, rather than throwing', () => {
		vi.stubGlobal('matchMedia', undefined);
		expect(() => hasFinePointer()).not.toThrow();
		expect(hasFinePointer()).toBe(false);
	});
});
