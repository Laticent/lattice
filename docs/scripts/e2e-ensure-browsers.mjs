// Playwright globalSetup: every browser the selected projects need is installed before a test
// runs. A missing browser is never a reason a test did not run.
//
// Only Chromium is baked into the cloud sandbox (/opt/pw-browsers). The `webkit-*` and `gecko`
// projects used to fail with "browserType.launch: Executable doesn't exist", and that error read
// as a fact about the environment: sessions reported 197 tests as "could not run here" when
// `npx playwright install` takes 32 seconds. So this step installs WebKit and Firefox when a
// selected project needs one and it is missing, and fails the run if the install does not take.
//
// Chromium is never installed here: the sandbox pins it to the build @playwright/test expects
// (playwright.config.ts header), and a second copy would shadow that pin. CI provisions every
// browser in its own workflow steps, so on CI this step only checks.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { chromium, firefox, webkit } from '@playwright/test';

/** @typedef {'chromium' | 'firefox' | 'webkit'} Engine */
const ENGINES = { chromium, firefox, webkit };

/**
 * The `--project` filters on the command line (`--project=x` or `--project x`); empty = all.
 * @param {readonly string[]} argv
 * @returns {string[]}
 */
export function selectedProjects(argv) {
	const out = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith('--project=')) out.push(a.slice('--project='.length));
		else if (a === '--project' && i + 1 < argv.length) out.push(argv[++i]);
	}
	return out;
}

/**
 * Playwright's project filter: an exact name or a `*` glob, case-insensitive.
 * @param {string} name
 * @param {readonly string[]} filters
 */
export function matchesFilter(name, filters) {
	if (!filters.length) return true;
	return filters.some((f) => new RegExp(`^${f.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i').test(name));
}

/**
 * The engines the selected projects launch.
 * @param {{ projects: ReadonlyArray<{ name: string, use: { browserName?: Engine, defaultBrowserType?: Engine } }> }} config
 * @param {readonly string[]} filters
 * @returns {Set<Engine>}
 */
export function enginesFor(config, filters) {
	const out = new Set();
	for (const p of config.projects) {
		if (!matchesFilter(p.name, filters)) continue;
		out.add(p.use.browserName ?? p.use.defaultBrowserType ?? 'chromium');
	}
	return out;
}

/** @param {Engine} e */
const installed = (e) => fs.existsSync(ENGINES[e].executablePath());

/** @param {string[]} args */
function run(args) {
	const r = spawnSync('npx', ['playwright', ...args], { stdio: 'inherit' });
	return r.status ?? 1;
}

/** @param {import('@playwright/test').FullConfig} config */
export default async function ensureBrowsers(config) {
	const missing = [...enginesFor(config, selectedProjects(process.argv))].filter((e) => !installed(e));
	if (!missing.length) return;
	const installable = missing.filter((e) => e !== 'chromium');
	if (installable.length && !process.env.CI) {
		console.log(`[e2e] installing ${installable.join(', ')} for the selected projects (about 30 s, once per machine)…`);
		// The system libraries first: without them the binary installs and then cannot launch.
		// They need root on Linux; elsewhere (a developer's Mac) they are already there.
		if (process.platform === 'linux') run(['install-deps', ...installable]);
		// The CDN drops a transfer now and then ("server closed connection", seen 2026-10-15);
		// a retry is what a person would do, so three attempts before the run fails.
		for (let attempt = 1; attempt <= 3 && installable.some((e) => !installed(e)); attempt++) {
			if (attempt > 1) console.log(`[e2e] install attempt ${attempt} of 3…`);
			run(['install', ...installable.filter((e) => !installed(e))]);
		}
	}
	const still = missing.filter((e) => !installed(e));
	if (still.length) {
		throw new Error(
			`[e2e] ${still.join(', ')} is not installed and the selected projects need it. ` +
				(still.includes('chromium')
					? 'Chromium is pinned by the environment (playwright.config.ts header): fix PLAYWRIGHT_BROWSERS_PATH, do not skip the run.'
					: `Install it: npx playwright install-deps ${still.join(' ')} && npx playwright install ${still.join(' ')}.`) +
				' A missing browser is never a reason a test did not run.',
		);
	}
}
