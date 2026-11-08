// Unit tests for perf-collect's alternated mode: the measuring order and the port swap. The
// collection itself needs a browser and two builds, so the nightly is where it runs; what can be
// pinned here is that head and base sit next to each other for every URL and take turns going
// first (engineering/decisions/2026-11-08-docs-perf-nightly-diagnosis.md §2).

import { describe, expect, it } from 'vitest';
import { alternationPlan, baseCollected, parseArgs, urlForArm } from './perf-collect.mjs';

const URLS = ['http://localhost:4399/', 'http://localhost:4399/studio/'];

describe('alternationPlan', () => {
	it('gives each arm exactly `runs` runs of every URL', () => {
		const plan = alternationPlan(URLS, 5);
		expect(plan).toHaveLength(URLS.length * 5 * 2);
		for (const url of URLS) {
			for (const arm of ['head', 'base']) {
				expect(plan.filter((s) => s.url === url && s.arm === arm)).toHaveLength(5);
			}
		}
	});

	it('puts head and base side by side for each URL, flipping who goes first each round', () => {
		const plan = alternationPlan(URLS, 2);
		expect(plan.map((s) => `${s.round}:${new URL(s.url).pathname}:${s.arm}`)).toEqual([
			'0:/:head',
			'0:/:base',
			'0:/studio/:head',
			'0:/studio/:base',
			'1:/:base',
			'1:/:head',
			'1:/studio/:base',
			'1:/studio/:head',
		]);
	});
});

describe('urlForArm', () => {
	it('keeps head on the config port and moves base to its own, path intact', () => {
		expect(urlForArm('http://localhost:4399/studio/', 'head')).toBe('http://localhost:4399/studio/');
		expect(urlForArm('http://localhost:4399/studio/', 'base')).toBe('http://localhost:4398/studio/');
	});
});

describe('parseArgs', () => {
	it('takes the one-arm form unchanged', () => {
		const a = parseArgs(['--out', 'x', '--no-build']);
		expect(a.noBuild).toBe(true);
		expect(a.baseDocs).toBeUndefined();
	});

	it('takes --build-only alone, with no --out', () => {
		expect(parseArgs(['--build-only']).buildOnly).toBe(true);
	});

	it('refuses --base-docs without --base-out, and the reverse', () => {
		expect(() => parseArgs(['--out', 'x', '--base-docs', 'b'])).toThrow(/go together/);
		expect(() => parseArgs(['--out', 'x', '--base-out', 'b'])).toThrow(/go together/);
	});
});

describe('baseCollected', () => {
	it('is true only when every form factor has at least one base run', () => {
		expect(baseCollected({ desktop: 15, mobile: 25 })).toBe(true);
		expect(baseCollected({ desktop: 15, mobile: 0 })).toBe(false);
		expect(baseCollected({ desktop: 0, mobile: 0 })).toBe(false);
		expect(baseCollected({})).toBe(false);
	});
});
