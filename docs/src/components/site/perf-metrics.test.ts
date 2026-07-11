// Regime-aware rating for FRAME/TOTAL — the metrics-honesty fix (perf-diagnosis §C1).
// The panel must judge a warm in-place patch against the frame budget and a cold full
// rebuild against a realistic reparse budget — never a rebuild against the impossible
// 16ms frame budget, which was the panel's central lie.

import { describe, expect, it } from 'vitest';
import { bandLabel, METRIC_BY_KEY, rateMetric } from './perf-metrics';

const FRAME = METRIC_BY_KEY.frameMs;
const TOTAL = METRIC_BY_KEY.totalMs;

describe('FRAME rating is regime-aware', () => {
	it('rates a warm patch against the tight frame budget', () => {
		expect(rateMetric(FRAME, 2, 'patch')).toBe('good');
		expect(rateMetric(FRAME, 30, 'patch')).toBe('needs-improvement');
		expect(rateMetric(FRAME, 80, 'patch')).toBe('poor');
	});

	it('rates a cold rebuild against a realistic reparse budget, NOT the 16ms frame budget', () => {
		// 485ms is a full-document rebuild on a throttled phone — it can never meet a
		// single-frame budget, so it must not read "poor" against 16ms.
		expect(rateMetric(FRAME, 485, 'write')).toBe('needs-improvement');
		expect(rateMetric(FRAME, 120, 'write')).toBe('good');
		expect(rateMetric(FRAME, 900, 'write')).toBe('poor');
	});

	it('without a regime falls back to the default (frame) band', () => {
		// A sample from a path that does not distinguish still rates by the base band.
		expect(rateMetric(FRAME, 2)).toBe('good');
		expect(rateMetric(FRAME, 485)).toBe('poor');
	});
});

describe('TOTAL rating is regime-aware', () => {
	it('separates the patch total from the rebuild total', () => {
		expect(rateMetric(TOTAL, 40, 'patch')).toBe('good');
		expect(rateMetric(TOTAL, 500, 'write')).toBe('needs-improvement');
	});
});

describe('bandLabel reflects the live regime', () => {
	it('shows the frame budget for a patch and the reparse budget for a rebuild', () => {
		expect(bandLabel(FRAME, 'patch')).toBe('good < 16ms · ok < 50ms');
		expect(bandLabel(FRAME, 'write')).toBe('good < 250ms · ok < 600ms');
		// No regime → default band.
		expect(bandLabel(FRAME)).toBe('good < 16ms · ok < 50ms');
	});
});
