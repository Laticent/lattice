import { describe, expect, it, vi } from 'vitest';
import { guardedActions, run } from './runner';

describe('guardedActions (I8) — inert after abort', () => {
	it('calls through before abort, no-ops after', () => {
		const c = new AbortController();
		const spy = vi.fn();
		const g = guardedActions({ go: spy }, c.signal);
		g.go();
		expect(spy).toHaveBeenCalledTimes(1);
		c.abort();
		g.go();
		expect(spy).toHaveBeenCalledTimes(1); // no-op after abort
	});
	it('passes non-function props through', () => {
		const g = guardedActions({ name: 'x', fn: () => 1 }, new AbortController().signal);
		expect(g.name).toBe('x');
	});
	it('returns non-object actions unchanged', () => {
		const same = () => 1;
		expect(guardedActions(same, new AbortController().signal)).toBe(same);
	});
});

describe('run() single-flight (I6d)', () => {
	it('a second run() while one is active throws a NAMED error', () => {
		const root = document.createElement('div');
		document.body.appendChild(root);
		const h1 = run({ root, actions: {}, play: async () => {} });
		try {
			expect(() => run({ root, actions: {}, play: async () => {} })).toThrow(/single-flight/);
		} finally {
			h1.stop(); // abort before the async play touches WAAPI; frees the single-flight latch
		}
	});
});
