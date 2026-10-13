import { describe, expect, it } from 'vitest';
import { WakeKeeper } from './live-wake';

/** A fake Screen Wake Lock: every request is kept, and resolves when the test says so. */
function fake() {
	const requests: Array<{ resolve: () => void; released: boolean; onRelease: Array<() => void> }> = [];
	const sentinels: Array<{ released: boolean; fire(): void }> = [];
	const nav = {
		wakeLock: {
			request: () =>
				new Promise<{ release(): Promise<void>; addEventListener(type: 'release', cb: () => void): void }>((res) => {
					const rec = { released: false, onRelease: [] as Array<() => void>, resolve: () => {} };
					const sentinel = {
						release: async () => {
							rec.released = true;
						},
						addEventListener: (_t: 'release', cb: () => void) => rec.onRelease.push(cb),
					};
					rec.resolve = () => res(sentinel);
					requests.push(rec);
					sentinels.push({
						get released() {
							return rec.released;
						},
						fire: () => {
							for (const f of rec.onRelease) f();
						},
					});
				}),
		},
	};
	const listeners = new Set<() => void>();
	const doc = { visibilityState: 'visible', addEventListener: (_t: 'visibilitychange', cb: () => void) => listeners.add(cb), removeEventListener: (_t: 'visibilitychange', cb: () => void) => listeners.delete(cb) };
	return { nav, doc, requests, sentinels, listeners };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('WakeKeeper (screen wake lock)', () => {
	it('asks once however many times it is told to keep, even before the first request is answered', async () => {
		const f = fake();
		const k = new WakeKeeper(f.nav, f.doc);
		k.keep(true);
		k.keep(true);
		k.keep(true);
		expect(f.requests).toHaveLength(1);
		f.requests[0].resolve();
		await settle();
		expect(k.state).toBe('held');
		k.keep(true);
		expect(f.requests).toHaveLength(1);
	});
	it('releases the lock when told to stop, and a lock that arrives after the stop is released at once', async () => {
		const f = fake();
		const k = new WakeKeeper(f.nav, f.doc);
		k.keep(true);
		k.keep(false);
		f.requests[0].resolve();
		await settle();
		expect(f.requests[0].released).toBe(true);
		expect(k.state).toBe('not held');
		k.keep(true);
		f.requests[1].resolve();
		await settle();
		expect(k.state).toBe('held');
		k.keep(false);
		expect(f.requests[1].released).toBe(true);
	});
	it('takes the lock again when a hidden page comes back, and stops listening once it is told to stop', async () => {
		const f = fake();
		const k = new WakeKeeper(f.nav, f.doc);
		k.keep(true);
		f.requests[0].resolve();
		await settle();
		f.sentinels[0].fire(); // the browser dropped it (the page was hidden)
		expect(k.state).toBe('not held');
		for (const cb of [...f.listeners]) cb();
		expect(f.requests).toHaveLength(2);
		k.keep(false);
		expect(f.listeners.size).toBe(0);
	});
	it('does nothing where the browser has no wake lock, and survives a refused request', async () => {
		const k = new WakeKeeper({}, undefined);
		k.keep(true);
		expect(k.state).toBe('unsupported');
		const refused = new WakeKeeper({ wakeLock: { request: () => Promise.reject(new Error('denied')) } }, undefined);
		refused.keep(true);
		await settle();
		expect(refused.state).toBe('not held');
		refused.keep(true); // can ask again after a refusal
	});
});
