import { describe, expect, it } from 'vitest';
import { buildTour, DEFAULT_TOUR, TOURS } from './index';

// The tour registry powers the "Show Me" menu. Every entry must build a real, responsive
// Walkthrough for both surfaces, ids must be unique + stable (they're the startDemo/e2e anchors),
// and an unknown id must fall back to the default rather than crash the launcher.

describe('tour registry', () => {
	it('exposes the five tours in menu order with unique, kebab ids', () => {
		expect(TOURS.map((t) => t.id)).toEqual(['first-look', 'walkthrough', 'board-deck', 'just-markdown', 'quiet']);
		expect(new Set(TOURS.map((t) => t.id)).size).toBe(TOURS.length);
		for (const t of TOURS) {
			expect(t.id).toMatch(/^[a-z][a-z-]*$/);
			expect(t.label.length).toBeGreaterThan(0);
			expect(t.description.length).toBeGreaterThan(0);
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
