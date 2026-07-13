import { describe, expect, it } from 'vitest';
import { createBoundedCache, createInflight } from './cache';

describe('createBoundedCache', () => {
	it('evicts the oldest entry once over the limit (FIFO)', () => {
		const c = createBoundedCache<number>(2);
		c.set('a', 1);
		c.set('b', 2);
		c.set('c', 3); // evicts 'a'
		expect(c.has('a')).toBe(false);
		expect(c.get('b')).toBe(2);
		expect(c.get('c')).toBe(3);
		expect(c.size).toBe(2);
	});

	it('updating an existing key does not evict and does not re-order', () => {
		const c = createBoundedCache<number>(2);
		c.set('a', 1);
		c.set('b', 2);
		c.set('a', 11); // in-place update — 'a' is still oldest
		c.set('c', 3); // evicts 'a' (not 'b')
		expect(c.has('a')).toBe(false);
		expect(c.get('b')).toBe(2);
		expect(c.get('a')).toBeUndefined();
	});
});

describe('createInflight', () => {
	it('joins a live in-flight promise for the same key', () => {
		const f = createInflight<number>();
		const ctl = new AbortController();
		const p = Promise.resolve(1);
		f.set('k', p, ctl.signal);
		expect(f.join('k')).toBe(p);
		expect(f.join('other')).toBeNull();
	});

	it('refuses to join an entry whose owner is already aborted (barge-in safety)', () => {
		const f = createInflight<number>();
		const ctl = new AbortController();
		f.set('k', Promise.resolve(1), ctl.signal);
		ctl.abort();
		expect(f.join('k')).toBeNull(); // a fresh call must fire its own request, not join the doomed one
	});

	it('settle only removes the entry if it is still the registered promise', () => {
		const f = createInflight<number>();
		const ctl = new AbortController();
		const older = Promise.resolve(1);
		const newer = Promise.resolve(2);
		f.set('k', older, ctl.signal);
		f.set('k', newer, ctl.signal); // a newer call overwrote it
		f.settle('k', older); // the older call settling must NOT evict the newer entry
		expect(f.join('k')).toBe(newer);
		f.settle('k', newer);
		expect(f.join('k')).toBeNull();
	});
});
