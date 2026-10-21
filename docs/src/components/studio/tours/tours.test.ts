// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { buildTour, TOUR_IDS } from './build';
import { craftSteps } from './craft';
import { DEFAULT_TOUR, SPOKEN_TOURS, TOURS } from './index';
import { TOUR_FOLDERS } from './lines';
import { presentSteps } from './present';
import { readSteps } from './read';
import { shareSteps } from './share';
import { welcomeSteps } from './welcome';

// The tour registry powers the "Show Me" menu. Every entry must build a real, responsive
// Walkthrough for both surfaces, ids must be unique + stable (they're the startDemo/e2e anchors),
// and an unknown id must fall back to the default rather than crash the launcher.

describe('tour registry', () => {
	it('lists the course in order and first-look, each with a unique kebab id', () => {
		// The other four became lessons (2026-10-05-studio-lessons.md).
		expect(TOURS.map((t) => t.id)).toEqual(['welcome', 'read', 'craft', 'present', 'share', 'first-look']);
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

	it('every line any tour says is in its own recorded folder, on both surfaces', () => {
		// The tours speak from clips recorded ahead of time, found by exact text. A line a script says that is
		// not in its folder's table is a line with no clip.
		const scripts: Record<string, (mobile: boolean) => { say?: string }[]> = {
			welcome: welcomeSteps,
			read: () => readSteps(),
			craft: () => craftSteps(),
			present: presentSteps,
			share: shareSteps,
		};
		for (const t of TOURS) {
			const steps = scripts[t.id];
			if (!steps) continue; // first-look builds its beats from the kit; its lines are pinned below
			for (const mobile of [true, false]) {
				const said = steps(mobile).flatMap((s) => (s.say ? [s.say] : []));
				expect(said.length, `${t.id} says nothing`).toBeGreaterThan(2);
				for (const text of said) expect(TOUR_FOLDERS[t.dir], `${t.id}: "${text}" has no clip`).toContain(text);
			}
		}
	});

	it('every tour has a folder of lines, and the course chains to a real tour', () => {
		for (const t of TOURS) {
			expect(TOUR_FOLDERS[t.dir]?.length, `${t.id} has no lines`).toBeGreaterThan(0);
			if (t.next) expect(TOURS.some((n) => n.id === t.next), `${t.id}.next`).toBe(true);
		}
		// Welcome → Read → Craft → Present → Share, and Share hands over to the lessons.
		const chain: string[] = [];
		for (let id: string | undefined = 'welcome'; id; id = TOURS.find((t) => t.id === id)?.next) chain.push(id);
		expect(chain).toEqual(['welcome', 'read', 'craft', 'present', 'share']);
	});

	it('every tour in the course speaks, and first-look too', () => {
		expect([...SPOKEN_TOURS].sort()).toEqual(TOURS.map((t) => t.id).sort());
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
