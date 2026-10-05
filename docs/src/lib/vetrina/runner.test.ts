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

describe('awaitUser — an older turn timing out never clears a newer one', () => {
	it('a press matching the newer turn still resolves it after the older turn times out', async () => {
		const root = document.createElement('div');
		const button = document.createElement('button');
		root.appendChild(button);
		document.body.appendChild(root);
		let outcome = '';
		let armedAt = 0;
		const stopped: string[] = [];
		const h = run({
			root,
			actions: {},
			intro: false, // the stage's entrance needs Web Animations, which jsdom lacks
			onStop: (r) => void stopped.push(r),
			play: async (ctx) => {
				// A host that races its own window against Vetrina's timeout arms a second turn before
				// the first has timed out (Studio lessons do this, lesson-kit.ts `yourTurn`).
				armedAt = performance.now();
				void ctx.awaitUser({ match: () => false, timeout: 30, onTimeout: 'resume' }).catch(() => {});
				const e = await ctx.awaitUser({ match: (ev) => ev.target === button });
				outcome = e.type;
			},
		});
		try {
			// Wait for the run to reach its turns, then past the older turn's timeout.
			for (let i = 0; i < 100 && armedAt === 0; i++) await new Promise((r) => setTimeout(r, 20));
			expect(armedAt).toBeGreaterThan(0);
			await new Promise((r) => setTimeout(r, 80));
			button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
			await new Promise((r) => setTimeout(r, 10));
			expect(stopped).not.toContain('takeover');
			expect(outcome).toBe('pointerdown');
		} finally {
			h.stop();
			root.remove();
		}
	});
});
