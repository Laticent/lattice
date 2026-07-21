#!/usr/bin/env node
// perf-torture CLI — resolve `--scenario <name>` to scenarios/<name>.mjs and run the engine.
//
//   node tools/perf-torture/cli.mjs [--scenario studio] [--mode within] [--cycle idle,compose|all]
//        [--k 40] [--cpu 4] [--snapshot] [--retainers [--realm]] [--listeners] [--tts] [--json]
//        [--out <dir>] [--junit]   ← write report.json + report.md (+ .heapsnapshot / report.junit.xml)
//
// Needs the scenario's site BUILT (studio: `cd docs && npm run build`) and CHROME_PATH set.
// See tools/perf-torture/README.md.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runTorture } from './engine.mjs';

const argv = process.argv.slice(2);
const i = argv.indexOf('--scenario');
const name = i >= 0 ? argv[i + 1] : 'studio';
// A scenario name is a bare filename stem — reject path separators / traversal so `--scenario`
// can't import an arbitrary module off disk (dev tool, but a typo shouldn't execute a random file).
if (!/^[a-z0-9_-]+$/i.test(name || '')) { console.error(`perf-torture: invalid scenario name "${name}" (expected [A-Za-z0-9_-]).`); process.exit(2); }
const here = fileURLToPath(new URL('.', import.meta.url));
const scenarioPath = join(here, 'scenarios', `${name}.mjs`);

// OBSERVER-POLLUTION LINT — the engine's whole reason to exist is that it doesn't pin the nodes it
// measures, but it can't stop a scenario author from calling raw puppeteer handle APIs (the default
// idiom every tutorial teaches). An undisposed `page.$`/`page.$$`/`waitForSelector`/`waitForXPath`
// in a cycle or probe pins a detached node and fabricates a per-cycle "leak". Statically flag it and
// point at the exported helpers. (waitForFunction/evaluate/click are fine — they don't leak a DOM
// handle — so they're deliberately not matched.)
try {
	const src = await readFile(scenarioPath, 'utf8');
	// Negative lookahead, NOT a trailing \b: `$`/`$$` are non-word chars, so a trailing \b would never
	// fire for them and page.$ / page.$$ would slip through. `(?![\w$])` rejects page.$foo / waitForSelectorX.
	const hits = [...src.matchAll(/\bpage\s*\.\s*(\$\$?|\$x|waitForSelector|waitForXPath)(?![\w$])/g)];
	if (hits.length) {
		console.error(`  ⚠ perf-torture: scenario "${name}" uses ${hits.length} raw puppeteer handle call(s) (page.${[...new Set(hits.map((h) => h[1]))].join('/page.')}).`);
		console.error('    These leak an undisposed ElementHandle → a FABRICATED per-cycle leak. Use the engine helpers instead: clickSel / settle / exists / clickIn / clickNth / countSel (all dispose or return primitives). See the README §"Two hard-won rules".');
	}
} catch { /* unreadable → the import below will surface a clearer error */ }

let scenario;
try {
	scenario = (await import(pathToFileURL(scenarioPath).href)).default;
} catch (e) {
	console.error(`perf-torture: could not load scenario "${name}" (scenarios/${name}.mjs) — ${e.message}`);
	process.exit(2);
}
if (!scenario?.cycles) { console.error(`perf-torture: scenario "${name}" has no default export with a \`cycles\` map.`); process.exit(2); }
await runTorture({ scenario, argv });
