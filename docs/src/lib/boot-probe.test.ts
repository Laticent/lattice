// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BOOT_SLOW_BLOCKING_MS, BOOT_WINDOW_MS, type BootProbeDeps, blockingMs, type LongTask, watchBoot } from './boot-probe';

// The boot probe is fed long-task entries and a clock by hand: nothing here makes a page slow or waits on time
// (HARD RULE #32, F4 and F1).

/** A fake long-task source and timer: the test pushes entries and fires the timer itself. */
function fake(now: number) {
	let push: (e: readonly LongTask[]) => void = () => {};
	let fire: () => void = () => {};
	let delay = -1;
	let stopped = false;
	const deps: BootProbeDeps = {
		observe: (cb) => {
			push = cb;
			return () => {
				stopped = true;
			};
		},
		now: () => now,
		setTimeout: (fn, ms) => {
			fire = fn;
			delay = ms;
		},
	};
	return { deps, push: (e: LongTask[]) => push(e), fire: () => fire(), delay: () => delay, stopped: () => stopped };
}

describe('blockingMs', () => {
	it('sums each long task past 50 ms, only for tasks that start inside the window', () => {
		const tasks = [
			{ startTime: 100, duration: 250 }, // 200
			{ startTime: 5000, duration: 60 }, // 10
			{ startTime: 9999, duration: 1000 }, // 950: started inside
			{ startTime: BOOT_WINDOW_MS, duration: 5000 }, // outside
			{ startTime: 200, duration: 40 }, // not long: 0
		];
		expect(blockingMs(tasks)).toBe(1160);
	});
});

describe('watchBoot', () => {
	it('calls a boot slow at the cut-off, once the window has closed', async () => {
		const f = fake(3000);
		const done = watchBoot(f.deps);
		expect(f.delay()).toBe(BOOT_WINDOW_MS + 500 - 3000);
		f.push([{ startTime: 1000, duration: 50 + BOOT_SLOW_BLOCKING_MS }]);
		f.fire();
		expect(await done).toBe(true);
		expect(f.stopped()).toBe(true);
	});

	it('calls a boot fast just under the cut-off', async () => {
		const f = fake(3000);
		const done = watchBoot(f.deps);
		f.push([{ startTime: 1000, duration: 49 + BOOT_SLOW_BLOCKING_MS }]);
		f.fire();
		expect(await done).toBe(false);
	});

	it('started after the window, still waits a task for the buffered backlog before it answers (review finding)', async () => {
		const f = fake(BOOT_WINDOW_MS + 4000);
		const done = watchBoot(f.deps);
		expect(f.delay()).toBe(250);
		// The backlog arrives in a later task, as Chromium delivers it.
		f.push([{ startTime: 500, duration: 3000 }]);
		f.fire();
		expect(await done).toBe(true);
	});

	it('answers null (unknown) where the browser has no long-task API, or observing throws', async () => {
		expect(await watchBoot({ ...fake(0).deps, observe: () => null })).toBeNull();
		expect(
			await watchBoot({
				...fake(0).deps,
				observe: () => {
					throw new Error('no');
				},
			}),
		).toBeNull();
	});
});
