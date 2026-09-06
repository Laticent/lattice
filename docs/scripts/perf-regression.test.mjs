// Unit tests for the relative perf-regression detector. These run in the
// sandbox (no browser, no build) because the detector is a pure parser+comparer
// over LHR JSON — exactly why the measurement (perf-collect) and the verdict
// (this) are split. Fixtures are written to a tmp dir in the perf-collect output
// layout: <dir>/<formFactor>/lhr-*.json.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compare, evaluate, median, metricsFromLhr } from './perf-regression.mjs';

let tmp;
beforeEach(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-test-'));
});
afterEach(() => {
	fs.rmSync(tmp, { recursive: true, force: true });
});

// Build one LHR object with the metrics the detector reads.
function lhr({ url = 'http://localhost:4399/lattice/', score, lcp, cls, tbt, script }) {
	return {
		finalDisplayedUrl: url,
		categories: { performance: { score } },
		audits: {
			'largest-contentful-paint': { numericValue: lcp },
			'cumulative-layout-shift': { numericValue: cls },
			'total-blocking-time': { numericValue: tbt },
			'resource-summary': { details: { items: [{ resourceType: 'script', transferSize: script }] } },
		},
	};
}

function writeRuns(dir, formFactor, runs) {
	const ff = path.join(dir, formFactor);
	fs.mkdirSync(ff, { recursive: true });
	runs.forEach((r, i) => {
		fs.writeFileSync(path.join(ff, `lhr-${i}.json`), JSON.stringify(r));
	});
}

describe('median', () => {
	it('odd + even length', () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([1, 2, 3, 4])).toBe(2.5);
		expect(median([])).toBeNull();
	});
});

describe('metricsFromLhr', () => {
	it('extracts the four tracked metrics', () => {
		const m = metricsFromLhr(lhr({ score: 0.9, lcp: 2000, cls: 0.01, tbt: 100, script: 1500000 }));
		expect(m['performance-score']).toBe(0.9);
		expect(m['largest-contentful-paint']).toBe(2000);
		expect(m['cumulative-layout-shift']).toBe(0.01);
		expect(m['total-blocking-time']).toBe(100);
	});
	// The RETIRED metric, pinned as an absence. `script-size` summed Lighthouse
	// network records, so it measured what happened to load during a visit rather
	// than what the build produced — 35% of 140 repeat readings of an IDENTICAL
	// commit moved past its own 3% tolerance. The fixture still carries a populated
	// `resource-summary`, exactly as a real LHR does: the point is that the detector
	// no longer reads it. Deterministic bytes are gated per-PR off the built artifact
	// by check-route-budget.mjs; a bytes metric must never come back here.
	it('does NOT emit script-size, even from a populated resource-summary', () => {
		const m = metricsFromLhr(lhr({ score: 0.9, lcp: 2000, cls: 0.01, tbt: 100, script: 1500000 }));
		expect(m['script-size']).toBeUndefined();
		expect(Object.keys(m).sort()).toEqual([
			'cumulative-layout-shift',
			'largest-contentful-paint',
			'performance-score',
			'total-blocking-time',
		]);
	});
});

describe('evaluate', () => {
	it('ignores LCP noise under 150ms even if technically slower', () => {
		expect(evaluate('largest-contentful-paint', 2000, 2100).regressed).toBe(false);
	});
	it('flags LCP slower than 15% AND >150ms', () => {
		expect(evaluate('largest-contentful-paint', 2000, 2400).regressed).toBe(true);
	});
	it('treats a faster head as never a regression', () => {
		expect(evaluate('largest-contentful-paint', 3000, 2000).regressed).toBe(false);
		expect(evaluate('performance-score', 0.8, 0.95).regressed).toBe(false);
	});
	it('flags a score drop beyond 0.05', () => {
		expect(evaluate('performance-score', 0.95, 0.85).regressed).toBe(true);
	});
	it('ignores a score wobble within noise', () => {
		expect(evaluate('performance-score', 0.95, 0.94).regressed).toBe(false);
	});
	it('flags a head score under the catastrophe floor when it got worse', () => {
		expect(evaluate('performance-score', 0.52, 0.48).regressed).toBe(true);
	});
	it('does NOT fire the floor on an improving (or no-op) day below the floor', () => {
		expect(evaluate('performance-score', 0.4, 0.45).regressed).toBe(false); // improved
		expect(evaluate('performance-score', 0.45, 0.45).regressed).toBe(false); // no-op
	});
	it('treats a missing metric as skip, not a 0-valued improvement/regression', () => {
		expect(evaluate('total-blocking-time', 300, null).regressed).toBe(false); // head missing
		expect(evaluate('total-blocking-time', null, 300).regressed).toBe(false); // base missing
	});
	it('flags CLS worse by more than 0.05 absolute', () => {
		expect(evaluate('cumulative-layout-shift', 0.0, 0.1).regressed).toBe(true);
		expect(evaluate('cumulative-layout-shift', 0.0, 0.03).regressed).toBe(false);
	});
});

describe('compare (end-to-end over fixture dirs)', () => {
	it('reports clean when head matches base', () => {
		const base = path.join(tmp, 'base');
		const head = path.join(tmp, 'head');
		const runs = [lhr({ score: 0.9, lcp: 2000, cls: 0.01, tbt: 100, script: 1500000 })];
		writeRuns(base, 'desktop', runs);
		writeRuns(head, 'desktop', runs);
		const { regressions } = compare(base, head);
		expect(regressions).toHaveLength(0);
	});

	it('detects a real LCP regression across runs (median, not worst)', () => {
		const base = path.join(tmp, 'base');
		const head = path.join(tmp, 'head');
		writeRuns(base, 'mobile', [
			lhr({ score: 0.9, lcp: 2000, cls: 0.01, tbt: 100, script: 1500000 }),
			lhr({ score: 0.9, lcp: 2050, cls: 0.01, tbt: 100, script: 1500000 }),
			lhr({ score: 0.9, lcp: 1950, cls: 0.01, tbt: 100, script: 1500000 }),
		]);
		writeRuns(head, 'mobile', [
			lhr({ score: 0.7, lcp: 3000, cls: 0.01, tbt: 100, script: 1500000 }),
			lhr({ score: 0.7, lcp: 3050, cls: 0.01, tbt: 100, script: 1500000 }),
			lhr({ score: 0.7, lcp: 2950, cls: 0.01, tbt: 100, script: 1500000 }),
		]);
		const { regressions } = compare(base, head);
		const ids = regressions.map((r) => r.metricId);
		expect(ids).toContain('largest-contentful-paint');
		expect(ids).toContain('performance-score');
	});

	it('median-of-3 + noise floor damps a single jittery run (no false-red)', () => {
		const base = path.join(tmp, 'base');
		const head = path.join(tmp, 'head');
		// One CI-scale bad run on each side (LCP 3338 like #327 §3), but the
		// medians (2000 vs 2050) differ by < the 150ms floor → not a regression.
		writeRuns(base, 'mobile', [
			lhr({ score: 0.9, lcp: 1980, cls: 0.01, tbt: 100, script: 1500000 }),
			lhr({ score: 0.9, lcp: 2000, cls: 0.01, tbt: 100, script: 1500000 }),
			lhr({ score: 0.9, lcp: 3338, cls: 0.01, tbt: 100, script: 1500000 }),
		]);
		writeRuns(head, 'mobile', [
			lhr({ score: 0.9, lcp: 2050, cls: 0.01, tbt: 100, script: 1500000 }),
			lhr({ score: 0.9, lcp: 3200, cls: 0.01, tbt: 100, script: 1500000 }),
			lhr({ score: 0.9, lcp: 1990, cls: 0.01, tbt: 100, script: 1500000 }),
		]);
		const { regressions } = compare(base, head);
		expect(regressions).toHaveLength(0);
	});

	it('does not trip on font-swap CLS that is present on BOTH sides (B neutralises it)', () => {
		const base = path.join(tmp, 'base');
		const head = path.join(tmp, 'head');
		// CLS high on both (the CI font-swap reflow) → delta ~0 → no regression.
		const runs = [lhr({ score: 0.7, lcp: 3000, cls: 0.17, tbt: 100, script: 1500000 })];
		writeRuns(base, 'mobile', runs);
		writeRuns(head, 'mobile', runs);
		const { regressions } = compare(base, head);
		expect(regressions).toHaveLength(0);
	});
});
