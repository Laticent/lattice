// @vitest-environment node
import { describe, expect, it } from 'vitest';
import config from '../playwright.config';
import { enginesFor, matchesFilter, selectedProjects } from './e2e-ensure-browsers.mjs';

describe('e2e browser provisioning', () => {
	it('reads --project in both spellings, and none means all', () => {
		expect(selectedProjects(['node', 'playwright', 'test', 'e2e/a.spec.ts', '--project=gecko', '--project', 'webkit-phone'])).toEqual(['gecko', 'webkit-phone']);
		expect(selectedProjects(['node', 'playwright', 'test'])).toEqual([]);
		// Playwright's flag is variadic: `--project desktop gecko` selects both.
		expect(selectedProjects(['node', 'playwright', 'test', '--project', 'desktop', 'gecko', '--workers=1'])).toEqual(['desktop', 'gecko']);
	});

	it('matches project filters the way Playwright does: exact or glob, any case', () => {
		expect(matchesFilter('webkit-phone', ['webkit-*'])).toBe(true);
		expect(matchesFilter('Gecko', ['gecko'])).toBe(true);
		expect(matchesFilter('desktop', ['webkit-*'])).toBe(false);
		expect(matchesFilter('desktop', [])).toBe(true);
	});

	it('finds every engine the real config launches, so a full run provisions WebKit and Firefox', () => {
		const projects = config.projects.map((p) => ({ name: p.name, use: p.use ?? {} }));
		expect([...enginesFor({ projects }, [])].sort()).toEqual(['chromium', 'firefox', 'webkit']);
		expect([...enginesFor({ projects }, ['desktop'])]).toEqual(['chromium']);
		// webkit-phone takes WebKit from the iPhone device preset, not a browserName of its own.
		expect([...enginesFor({ projects }, ['webkit-phone'])]).toEqual(['webkit']);
		expect([...enginesFor({ projects }, ['gecko'])]).toEqual(['firefox']);
	});
});
