#!/usr/bin/env node
// perf-torture CLI — resolve `--scenario <name>` to scenarios/<name>.mjs and run the engine.
//
//   node tools/perf-torture/cli.mjs [--scenario studio] [--mode within] [--cycle idle,compose|all]
//        [--k 40] [--cpu 4] [--snapshot] [--retainers [--realm]] [--tts] [--json]
//
// Needs the scenario's site BUILT (studio: `cd docs && npm run build`) and CHROME_PATH set.
// See tools/perf-torture/README.md.
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runTorture } from './engine.mjs';

const argv = process.argv.slice(2);
const i = argv.indexOf('--scenario');
const name = i >= 0 ? argv[i + 1] : 'studio';
const here = fileURLToPath(new URL('.', import.meta.url));

let scenario;
try {
	scenario = (await import(pathToFileURL(join(here, 'scenarios', `${name}.mjs`)).href)).default;
} catch (e) {
	console.error(`perf-torture: could not load scenario "${name}" (scenarios/${name}.mjs) — ${e.message}`);
	process.exit(2);
}
if (!scenario?.cycles) { console.error(`perf-torture: scenario "${name}" has no default export with a \`cycles\` map.`); process.exit(2); }
await runTorture({ scenario, argv });
