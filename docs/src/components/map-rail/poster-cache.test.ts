import { describe, expect, it, vi } from 'vitest';
import { createPosterCache, posterKey } from './poster-cache';

describe('posterKey', () => {
	it('is the same for the same slide and look, and differs when either changes', () => {
		expect(posterKey('# A', 'indaco/dark')).toBe(posterKey('# A', 'indaco/dark'));
		expect(posterKey('# A', 'indaco/dark')).not.toBe(posterKey('# B', 'indaco/dark'));
		expect(posterKey('# A', 'indaco/dark')).not.toBe(posterKey('# A', 'indaco/light'));
		// The separator keeps a look that ends where a text begins from colliding.
		expect(posterKey('b', 'a')).not.toBe(posterKey('', 'ab'));
	});
});

describe('createPosterCache', () => {
	it('evicts the least recently used poster past its byte budget, and releases it', () => {
		const release = vi.fn();
		const c = createPosterCache<string>({ budget: 300, release });
		c.set('a', 'A', 100);
		c.set('b', 'B', 100);
		c.set('c', 'C', 100);
		c.get('a'); // a is now the most recent
		c.set('d', 'D', 100);
		expect(c.has('b')).toBe(false);
		expect(release).toHaveBeenCalledWith('B');
		expect([c.has('a'), c.has('c'), c.has('d')]).toEqual([true, true, true]);
		expect(c.bytes).toBe(300);
	});

	it('never evicts a pinned poster, whatever the budget, and lets it go once unpinned', () => {
		const c = createPosterCache<string>({ budget: 250 });
		c.pin('rail', ['a']);
		c.set('a', 'A', 100);
		c.set('b', 'B', 100);
		c.set('c', 'C', 100);
		// Over budget: the oldest UNPINNED poster goes, and the older pinned one stays.
		expect([c.has('a'), c.has('b'), c.has('c')], 'a pinned poster on screen was evicted').toEqual([true, false, true]);
		c.unpin('rail');
		c.set('d', 'D', 100);
		// Unpinned, `a` is the least recently used again and is the one to go.
		expect([c.has('a'), c.has('c'), c.has('d')]).toEqual([false, true, true]);
	});

	it('keeps a key pinned while any window pins it', () => {
		const c = createPosterCache<string>({ budget: 0 });
		c.pin('stage', ['a']);
		c.pin('map', ['a']);
		c.set('a', 'A', 10);
		c.unpin('stage');
		expect(c.has('a')).toBe(true);
		c.pin('map', []);
		expect(c.has('a')).toBe(false);
	});

	it('refuses one poster larger than the whole budget instead of emptying the cache for it', () => {
		const release = vi.fn();
		const c = createPosterCache<string>({ budget: 300, release });
		c.set('a', 'A', 100);
		c.set('b', 'B', 100);
		c.set('big', 'BIG', 400);
		expect([c.has('a'), c.has('b'), c.has('big')]).toEqual([true, true, false]);
		expect(release.mock.calls).toEqual([['BIG']]);
		// Pinned, it is kept: a poster on screen is never refused.
		c.pin('rail', ['big']);
		c.set('big', 'BIG', 400);
		expect(c.has('big')).toBe(true);
	});

	it('does not release a value re-stored under its own key, and treats a bad budget as 0', () => {
		const release = vi.fn();
		const c = createPosterCache<string>({ budget: 100, release });
		c.set('a', 'A', 10);
		c.set('a', 'A', 10);
		expect(release).not.toHaveBeenCalled();
		expect(c.has('a')).toBe(true);
		const nan = createPosterCache<string>({ budget: Number.NaN });
		nan.set('x', 'X', 0);
		expect(nan.has('x'), 'a zero-byte poster fits a budget of 0').toBe(true);
	});

	it('replaces a re-stored key, releasing the old value, and clears everything', () => {
		const release = vi.fn();
		const c = createPosterCache<string>({ budget: 1000, release });
		c.set('a', 'A1', 10);
		c.set('a', 'A2', 20);
		expect(release).toHaveBeenCalledWith('A1');
		expect(c.get('a')).toBe('A2');
		expect(c.bytes).toBe(20);
		c.clear();
		expect([c.size, c.bytes]).toEqual([0, 0]);
		expect(release).toHaveBeenCalledWith('A2');
	});
});
