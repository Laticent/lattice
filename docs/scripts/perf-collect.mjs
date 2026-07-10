// Build the docs site and collect Lighthouse runs for BOTH form factors into a
// single output directory, ready for scripts/perf-regression.mjs to diff.
//
// This is the measurement half of the nightly perf watch
// (.github/workflows/perf-nightly.yml): the workflow runs it once for `head`
// and once for the `base` checkout, then compares. It needs a browser
// (CHROME_PATH) and is realistically a CI-only step; locally it powers the
// report-only `npm run perf`.
//
// Output layout (consumed by perf-regression.mjs):
//   <out>/desktop/lhr-*.json   <out>/mobile/lhr-*.json
//
// Usage: node scripts/perf-collect.mjs --out <dir> [--no-build]
//
// Configs reused as-is for collection settings (url list, numberOfRuns,
// desktop/mobile emulation): lighthouserc.cjs + lighthouserc.mobile.cjs. Their
// `assert` blocks are advisory only — the regression compare is the real gate.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LHCI_DIR = path.join(DOCS, '.lighthouseci');

const FORM_FACTORS = [
	['desktop', 'lighthouserc.cjs'],
	['mobile', 'lighthouserc.mobile.cjs'],
];

function parseArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--out') out.out = argv[++i];
		else if (a === '--no-build') out.noBuild = true;
		else throw new Error(`unknown arg: ${a}`);
	}
	if (!out.out) throw new Error('--out <dir> is required');
	out.out = path.resolve(out.out);
	return out;
}

function run(cmd, args) {
	execFileSync(cmd, args, { cwd: DOCS, stdio: 'inherit' });
}

function build() {
	// Mirror the (former) `perf` script: sync the generated assets, then build.
	// NOT the full `npm run build` (that adds the strict showcase:check, which is
	// unrelated to perf and slow).
	run('npm', ['run', 'sync:portal']);
	run('npm', ['run', 'sync:playground']);
	run('npx', ['astro', 'build']);
	// So the nightly perf watch measures the SAME build a real deploy ships —
	// without this, Lighthouse would profile a build missing the modulepreload
	// hints and never see this fix (or a future regression to it).
	run('node', ['scripts/inject-modulepreload.mjs']);
}

function collect(formFactor, config, outRoot) {
	fs.rmSync(LHCI_DIR, { recursive: true, force: true });
	run('npx', ['lhci', 'collect', `--config=${config}`]);

	const ffOut = path.join(outRoot, formFactor);
	fs.mkdirSync(ffOut, { recursive: true });
	const produced = fs
		.readdirSync(LHCI_DIR)
		.filter((f) => f.startsWith('lhr-') && f.endsWith('.json'));
	if (produced.length === 0) {
		throw new Error(`lhci collect produced no lhr-*.json for ${formFactor} (config ${config})`);
	}
	for (const f of produced) {
		fs.copyFileSync(path.join(LHCI_DIR, f), path.join(ffOut, f));
	}
	console.log(`perf-collect: ${formFactor} → ${produced.length} run(s) in ${ffOut}`);
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	fs.mkdirSync(args.out, { recursive: true });
	if (!args.noBuild) build();
	for (const [ff, cfg] of FORM_FACTORS) collect(ff, cfg, args.out);
	fs.rmSync(LHCI_DIR, { recursive: true, force: true });
	console.log(`perf-collect: done → ${args.out}`);
}

main();
