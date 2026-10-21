import { afterEach, describe, expect, it, vi } from 'vitest';
import { followBus } from './follow-bus';

afterEach(() => followBus.reset());

describe('follow bus', () => {
	it('tells the session what a screen reports, once per change', () => {
		const seen: Array<[string, unknown]> = [];
		const off = followBus.onLocal((k, v) => seen.push([k, v]));
		followBus.setLocal('section', 'look');
		followBus.setLocal('section', 'look');
		followBus.setLocal('section', null);
		off();
		expect(seen).toEqual([['section', 'look'], ['section', null]]);
	});

	it('tells a screen where it was moved, and replays a value to one that mounts just after', () => {
		vi.useFakeTimers();
		const got: string[] = [];
		followBus.apply('section', 'brand');
		expect(followBus.freshApplied('section')).toBe('brand');
		const off = followBus.onApply((k, v) => v && got.push(`${k}:${v}`));
		followBus.apply('inspector', 'deck');
		off();
		expect(got).toEqual(['inspector:deck']);
		vi.advanceTimersByTime(5000);
		expect(followBus.freshApplied('section')).toBeNull();
		// What was applied stays known, so a change a person makes themselves can be told from it.
		expect(followBus.lastApplied('section')).toBe('brand');
		vi.useRealTimers();
	});
});
