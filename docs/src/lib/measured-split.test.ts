// studioPlan: the Studio's measured split for one shown slide (measured-split.ts, fit-everywhere-model.md
// §17). Reuse a plan made for this exact layout, measure a slide's first render at once, redraw an edit
// with the last plan and measure once the author pauses, never cache a plan measured with a fallback
// face, and let a newer render or another slide call a pending measurement off.
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedPlan, cancelPendingMeasure, isCanceledMeasure, layoutKey, studioPlan, UnmeasuredError } from './measured-split';

type Shown = { html: string };
const plan = (sizes: number[]) => ({ 2: sizes });
let n = 0;
const fresh = () => `deck${++n}:3`;

function harness(key: string, source: string, layoutTail = 'box') {
	const host = document.createElement('div');
	document.body.appendChild(host);
	const measure = vi.fn(async () => ({ html: 'measured', plan: plan([2, 2]), memory: {}, fontsLoaded: true }));
	const o = {
		host,
		key,
		source,
		layout: layoutKey(key, source, layoutTail),
		split: (p: Record<string, unknown>): Shown => ({ html: `split ${JSON.stringify(p)}` }),
		measure,
		alive: () => host.isConnected,
	};
	return { host, measure, o };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.useRealTimers();
	document.body.innerHTML = '';
});

describe('studioPlan', () => {
	it('measures a slide on its first render, then reuses that plan for the same layout', async () => {
		const { o, measure } = harness(fresh(), 'text A');
		const first = await studioPlan(o);
		expect(first?.plan).toEqual(plan([2, 2]));
		expect(measure).toHaveBeenCalledTimes(1);
		const again = await studioPlan(o);
		expect(again?.plan).toEqual(plan([2, 2]));
		expect(measure).toHaveBeenCalledTimes(1);
	});

	it('a different stylesheet hash is a different layout, so the plan is not reused', async () => {
		const key = fresh();
		const a = harness(key, 'text A', 'box|css#1');
		await studioPlan(a.o);
		const b = harness(key, 'text A', 'box|css#2');
		b.measure.mockResolvedValue({ html: 'm', plan: plan([3, 1]), memory: {}, fontsLoaded: true });
		// The slide was measured before, so an unseen layout redraws with the last plan at once...
		const shown = await studioPlan(b.o);
		expect(shown?.plan).toEqual(plan([2, 2]));
		expect(b.measure).not.toHaveBeenCalled();
		// ...and measures when the author pauses.
		await vi.runAllTimersAsync();
		expect(b.measure).toHaveBeenCalledTimes(1);
		expect(cachedPlan(b.o.layout)).toEqual(plan([3, 1]));
	});

	it('an edit redraws with the last plan, measures once after the pause, and fires the ready event', async () => {
		const key = fresh();
		await studioPlan(harness(key, 'v1').o);
		const { o, host, measure } = harness(key, 'v2');
		const ready = vi.fn();
		host.addEventListener('lattice:measured-split-ready', ready);
		const shown = await studioPlan(o);
		expect(shown?.plan).toEqual(plan([2, 2]));
		expect(measure).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(500);
		expect(measure).not.toHaveBeenCalled();
		await vi.runAllTimersAsync();
		expect(measure).toHaveBeenCalledTimes(1);
		expect(ready).toHaveBeenCalledTimes(1);
	});

	it('a keystroke before the pause ends calls the pending measurement off', async () => {
		const key = fresh();
		await studioPlan(harness(key, 'v1').o);
		const h = harness(key, 'v2');
		await studioPlan(h.o);
		// The next keystroke renders the same host again before the pause ends.
		const next = { ...harness(key, 'v3').o, host: h.host };
		await studioPlan(next);
		await vi.runAllTimersAsync();
		expect(h.measure).not.toHaveBeenCalled();
	});

	it('moving to a slide without the measured split cancels the old slide\'s pending measurement', async () => {
		const key = fresh();
		await studioPlan(harness(key, 'v1').o);
		const { o, host, measure } = harness(key, 'v2');
		await studioPlan(o);
		cancelPendingMeasure(host);
		await vi.runAllTimersAsync();
		expect(measure).not.toHaveBeenCalled();
	});

	it('a plan measured with a fallback face is used but not cached', async () => {
		const { o, measure } = harness(fresh(), 'text A');
		measure.mockResolvedValue({ html: 'm', plan: plan([1, 3]), memory: {}, fontsLoaded: false });
		const shown = await studioPlan(o);
		expect(shown?.plan).toEqual(plan([1, 3]));
		expect(cachedPlan(o.layout)).toBeNull();
	});
});

describe('isCanceledMeasure', () => {
	it('tells a called-off measurement from a real failure', () => {
		expect(isCanceledMeasure(new UnmeasuredError('the preview was torn down'))).toBe(true);
		expect(isCanceledMeasure(new UnmeasuredError('the measuring frame held no slides'))).toBe(false);
		expect(isCanceledMeasure(new Error('the preview was torn down'))).toBe(false);
	});
});
