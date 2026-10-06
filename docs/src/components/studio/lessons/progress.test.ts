// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LESSONS } from './catalog';
import { doneLessons, markDone, markOffered, nextLesson, wasOffered } from './progress';

// Progress is a per-viewer convenience (2026-10-05-studio-lessons.md §Reach): it must remember,
// suggest the curriculum's next unfinished lesson, and never break the Studio when storage throws.

afterEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
});

describe('lesson progress', () => {
	it('remembers finished lessons and offers', () => {
		markDone('present');
		markDone('present');
		expect([...doneLessons()]).toEqual(['present']);
		expect(wasOffered('coach')).toBe(false);
		markOffered('coach');
		expect(wasOffered('coach')).toBe(true);
	});

	it('suggests the next unfinished lesson in catalog order, wrapping, and null when all are done', () => {
		const [first, second, third] = LESSONS;
		expect(nextLesson(first.id, new Set())?.id).toBe(second.id);
		expect(nextLesson(first.id, new Set([second.id]))?.id).toBe(third.id);
		const last = LESSONS[LESSONS.length - 1];
		expect(nextLesson(last.id, new Set())?.id).toBe(first.id);
		expect(nextLesson(first.id, new Set(LESSONS.map((l) => l.id)))).toBeNull();
	});

	it('survives storage that throws or holds junk', () => {
		localStorage.setItem('lattice-studio-lessons-done', '{"not":"a list"}');
		expect(doneLessons().size).toBe(0);
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		expect(() => markDone('present')).not.toThrow();
		expect(doneLessons().size).toBe(0);
		expect(wasOffered('coach')).toBe(false);
	});
});
