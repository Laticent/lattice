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

/** The older turn's own `timeout`, which the test steps past on the fake clock. */
const OLDER_TIMEOUT_MS = 30;

describe('awaitUser — an older turn timing out never clears a newer one', () => {
	it('a press matching the newer turn still resolves it after the older turn times out', async () => {
		const root = document.createElement('div');
		const button = document.createElement('button');
		root.appendChild(button);
		document.body.appendChild(root);
		let outcome = '';
		let armed = false;
		const stopped: string[] = [];
		// On vi's fake clock, so the older turn's timeout fires when the test steps past it, not
		// whenever a loaded machine gets round to it.
		vi.useFakeTimers();
		const h = run({
			root,
			actions: {},
			intro: false, // the stage's entrance needs Web Animations, which jsdom lacks
			onStop: (r) => void stopped.push(r),
			play: async (ctx) => {
				// A host that races its own window against Vetrina's timeout arms a second turn before
				// the first has timed out (Studio lessons do this, lesson-kit.ts `yourTurn`).
				armed = true;
				void ctx.awaitUser({ match: () => false, timeout: OLDER_TIMEOUT_MS, onTimeout: 'resume' }).catch(() => {});
				const e = await ctx.awaitUser({ match: (ev) => ev.target === button });
				outcome = e.type;
			},
		});
		try {
			// Wait for the run to reach its turns, then step exactly past the older turn's timeout.
			await vi.waitFor(() => expect(armed).toBe(true));
			await vi.advanceTimersByTimeAsync(OLDER_TIMEOUT_MS);
			button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
			await vi.waitFor(() => expect(outcome).toBe('pointerdown'));
			expect(stopped).not.toContain('takeover');
		} finally {
			h.stop();
			root.remove();
			vi.useRealTimers();
		}
	});
});
