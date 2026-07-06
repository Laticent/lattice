import { describe, expect, it } from 'vitest';
import { loop, retry, waitFor } from './recipes';
import type { RunContext } from './runner';

const fakeCtx = () => ({ signal: new AbortController().signal, stage: { resolve: () => null } }) as unknown as RunContext<unknown>;

describe('recipes — loop', () => {
	it('runs `times`', async () => {
		let n = 0;
		await loop(async () => {
			n++;
		}, { times: 3 });
		expect(n).toBe(3);
	});
	it('stops on until()', async () => {
		let m = 0;
		await loop(async () => {
			m++;
		}, { until: () => m >= 2 });
		expect(m).toBe(2);
	});
	it('aborts on signal', async () => {
		const c = new AbortController();
		c.abort();
		await expect(loop(async () => {}, { signal: c.signal })).rejects.toThrow(/abort/i);
	});
});

describe('recipes — retry', () => {
	it('succeeds after transient failures', async () => {
		let a = 0;
		await retry(async () => {
			a++;
			if (a < 3) throw new Error('x');
		});
		expect(a).toBe(3);
	});
	it('exhausts and rethrows the last error', async () => {
		await expect(
			retry(async () => {
				throw new Error('boom');
			}, { times: 2 }),
		).rejects.toThrow('boom');
	});
});

describe('recipes — waitFor', () => {
	it('resolves when the predicate turns true', async () => {
		let ready = false;
		setTimeout(() => {
			ready = true;
		}, 25);
		await waitFor(fakeCtx(), () => ready, { interval: 5 });
		expect(ready).toBe(true);
	});
	it('returns undefined on timeout (no throw)', async () => {
		const r = await waitFor(fakeCtx(), () => false, { timeout: 20, interval: 5 });
		expect(r).toBeUndefined();
	});
});
