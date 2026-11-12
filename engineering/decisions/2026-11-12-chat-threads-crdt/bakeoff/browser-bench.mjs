// Run bench.ts's `runAll()` in real Chromium, Firefox and WebKit (Playwright), RUNS times each, and print the median of
// each metric per engine. usage (from docs/, which has esbuild and Playwright's browsers):
//   node ../engineering/decisions/2026-11-12-chat-threads-crdt/bakeoff/browser-bench.mjs [runs]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(`${process.cwd()}/`);
const esbuild = require('esbuild');
const pw = require('playwright');
const RUNS = Number(process.argv[2] ?? 3);

const built = await esbuild.build({ entryPoints: [path.join(here, 'bench.ts')], bundle: true, format: 'iife', globalName: 'Bench', write: false, nodePaths: [path.join(process.cwd(), 'node_modules')] });
const script = Buffer.from(built.outputFiles[0].contents).toString();
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const result = {};
for (const engine of ['chromium', 'firefox', 'webkit']) {
	const browser = await pw[engine].launch();
	const runs = [];
	for (let i = 0; i < RUNS; i++) {
		const page = await browser.newPage();
		await page.setContent('<!doctype html><title>bench</title>');
		await page.addScriptTag({ content: script });
		runs.push(await page.evaluate(() => globalThis.Bench.runAll()));
		await page.close();
	}
	await browser.close();
	result[engine] = {};
	for (const name of Object.keys(runs[0])) {
		result[engine][name] = {};
		for (const k of Object.keys(runs[0][name])) result[engine][name][k] = median(runs.map((r) => r[name][k]));
	}
}
console.log(JSON.stringify(result));
