// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { buildTour, TOUR_IDS } from './build';
import { DEFAULT_TOUR, TOURS } from './index';
import { TOUR_LINES } from './lines';
import { welcomeSteps } from './welcome';

// The tour registry powers the "Show Me" menu. Every entry must build a real, responsive
// Walkthrough for both surfaces, ids must be unique + stable (they're the startDemo/e2e anchors),
// and an unknown id must fall back to the default rather than crash the launcher.

describe('tour registry', () => {
	it('exposes the welcome tour and first-look, each with a unique kebab id', () => {
		// The other four became lessons (2026-10-05-studio-lessons.md).
		expect(TOURS.map((t) => t.id)).toEqual(['welcome', 'first-look']);
		expect(new Set(TOURS.map((t) => t.id)).size).toBe(TOURS.length);
		for (const t of TOURS) {
			expect(t.id).toMatch(/^[a-z][a-z-]*$/);
			expect(t.label.length).toBeGreaterThan(0);
			expect(t.description.length).toBeGreaterThan(0);
		}
	});

	it('every menu entry has a script, and every script a menu entry', () => {
		expect([...TOUR_IDS].sort()).toEqual(TOURS.map((t) => t.id).sort());
	});

	it('every line the welcome tour says is in TOUR_LINES, so it has a recorded clip', () => {
		// The tour speaks from clips recorded ahead of time, found by exact text.
		for (const mobile of [true, false]) {
			const said = welcomeSteps(mobile).flatMap((s) => (s.say ? [s.say] : []));
			expect(said.length).toBeGreaterThan(2);
			for (const text of said) expect(Object.values(TOUR_LINES), `"${text}" has no clip`).toContain(text);
		}
	});

	it('DEFAULT_TOUR is a real member', () => {
		expect(TOURS.some((t) => t.id === DEFAULT_TOUR)).toBe(true);
	});

	it('builds a Walkthrough (function) for every tour, on both surfaces', () => {
		for (const t of TOURS) {
			for (const mobile of [true, false]) {
				expect(typeof buildTour(t.id, { mobile })).toBe('function');
			}
		}
	});

	it('an unknown id falls back to the default tour, never throws', () => {
		expect(typeof buildTour('does-not-exist', { mobile: false })).toBe('function');
	});
});
