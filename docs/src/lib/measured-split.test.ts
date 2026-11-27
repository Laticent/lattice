// studioPlan: the Studio's measured split for one shown slide (measured-split.ts, fit-everywhere-model.md
// §17). Reuse a plan made for this exact layout, measure a slide's first render at once, redraw an edit
// with the last plan and measure once the author pauses, never cache a plan measured with a fallback
// face, and let a newer render or another slide call a pending measurement off.
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedPlan, cancelPendingMeasure, fitMemoryFor, isCanceledMeasure, layoutKey, measuredSplitInFrame, studioPlan, UnmeasuredError } from './measured-split';

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

	it('nor is its memory kept, so it cannot steer the measurement made with the real face', async () => {
		const key = fresh();
		const { o, measure } = harness(key, 'text A');
		measure.mockResolvedValue({ html: 'm', plan: plan([1, 3]), memory: { 2: { sizes: [1, 3] } }, fontsLoaded: false });
		await studioPlan(o);
		expect(fitMemoryFor(key, 'text A')).toBeNull();
		// A plan read with every face loaded keeps its memory as before.
		const b = harness(fresh(), 'text B');
		b.measure.mockResolvedValue({ html: 'm', plan: plan([2, 2]), memory: { 2: { sizes: [2, 2] } }, fontsLoaded: true });
		await studioPlan(b.o);
		expect(fitMemoryFor(b.o.key, 'text B')).toEqual({ 2: { sizes: [2, 2] } });
	});

	it('a layout whose first measurement failed is not measured again on the next render', async () => {
		const { o, measure } = harness(fresh(), 'text A');
		measure.mockResolvedValue(null as never);
		expect(await studioPlan(o)).toBeNull();
		expect(measure).toHaveBeenCalledTimes(1);
		// Stepping to the slide's next page renders the same layout: no second wait.
		expect(await studioPlan(o)).toBeNull();
		expect(measure).toHaveBeenCalledTimes(1);
		// An edit is a new layout, and measures again.
		const edited = { ...o, source: 'text A, edited', layout: layoutKey(o.key, 'text A, edited', 'box') };
		await studioPlan(edited);
		expect(measure).toHaveBeenCalledTimes(2);
	});

	it('a measurement called off is not a failure: the next render measures again', async () => {
		const { o, measure } = harness(fresh(), 'text A');
		measure.mockResolvedValueOnce(undefined as never);
		expect(await studioPlan(o)).toBeNull();
		await studioPlan(o);
		expect(measure).toHaveBeenCalledTimes(2);
	});

	it('a pause measurement that read a fallback face settles the preview once, not at every pause', async () => {
		const key = fresh();
		await studioPlan(harness(key, 'v1').o);
		const { o, host, measure } = harness(key, 'v2');
		measure.mockResolvedValue({ html: 'm', plan: plan([1, 3]), memory: {}, fontsLoaded: false });
		const ready = vi.fn();
		host.addEventListener('lattice:measured-split-ready', ready);
		// The first pause settles the preview with the fallback plan...
		await studioPlan(o);
		await vi.runAllTimersAsync();
		expect(ready).toHaveBeenCalledTimes(1);
		// ...and the re-render that event fires (the plan is not cached) measures again, but does not fire it again.
		await studioPlan(o);
		await vi.runAllTimersAsync();
		expect(measure).toHaveBeenCalledTimes(2);
		expect(ready).toHaveBeenCalledTimes(1);
	});
});

describe('isCanceledMeasure', () => {
	it('tells a called-off measurement from a real failure', () => {
		expect(isCanceledMeasure(new UnmeasuredError('the preview was torn down'))).toBe(true);
		expect(isCanceledMeasure(new UnmeasuredError('the measuring frame held no slides'))).toBe(false);
		expect(isCanceledMeasure(new Error('the preview was torn down'))).toBe(false);
	});
});

describe('measuredSplitInFrame deadline', () => {
	// A measuring frame that never loads (the iPhone Studio's stuck preview, #2988): each write is bounded by
	// `settleMs`, but the whole measurement must also end by `deadlineMs`, so the host falls back to the
	// structural split instead of holding its placeholder.
	it('rejects with UnmeasuredError at the deadline when the frame never loads', async () => {
		const srcdoc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
		Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', { configurable: true, set() {}, get: () => '' });
		try {
			const run = measuredSplitInFrame({
				html: '<section data-lattice-slide="1"></section>',
				split: () => ({ html: '', changed: 0 }),
				buildDoc: () => '<html><head></head><body></body></html>',
				runtimeUrl: '/v/x/esm/engine.js',
				verdictConfig: {},
				width: 1080,
				height: 1080,
				settleMs: 60000,
				deadlineMs: 100,
			});
			const outcome = run.then(
				() => 'resolved',
				(e) => e,
			);
			await vi.advanceTimersByTimeAsync(100);
			const e = await outcome;
			expect(e).toBeInstanceOf(UnmeasuredError);
			expect(String(e.message)).toMatch(/did not finish within 100 ms/);
			// The measurement is called off, not mistaken for a newer render's cancel: the host warns about it.
			expect(isCanceledMeasure(e)).toBe(false);
			// The hidden frame is gone once its own bounded wait ends.
			await vi.advanceTimersByTimeAsync(60000);
			expect(document.querySelectorAll('iframe').length).toBe(0);
		} finally {
			if (srcdoc) Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', srcdoc);
		}
	});
});
