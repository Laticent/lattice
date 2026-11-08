// Build the docs site and collect Lighthouse runs for BOTH form factors into a
// single output directory, ready for scripts/perf-regression.mjs to diff.
//
// This is the measurement half of the nightly perf watch
// (.github/workflows/perf-nightly.yml). It needs a browser (CHROME_PATH) and is
// realistically a CI-only step; locally it powers the report-only `npm run perf`.
//
// TWO MODES.
//
//   One arm:      node scripts/perf-collect.mjs --out <dir> [--no-build]
//   Alternated:   node scripts/perf-collect.mjs --out <head-dir> --base-docs <base>/docs --base-out <base-dir> [--no-build]
//   Build only:   node scripts/perf-collect.mjs --build-only      (builds the docs dir this script sits in)
//
// The alternated mode is what the nightly runs. It serves the head build and the
// base build at the same time (head on :4399, base on :4398) and measures each
// URL head, base, head, base ... with the order flipped every round, so runner
// drift across the job (thermal state, a noisy neighbor, CDN font loads) lands on
// both arms instead of on whichever ran second. Both arms use THIS checkout's
// lighthouserc configs, so they always have the same run count and settings.
// Before 2026-11-08 the nightly collected every head run and then every base run,
// and the base used its own config (issue #2085,
// engineering/decisions/2026-11-08-docs-perf-nightly-diagnosis.md §2).
// `--base-docs` is the base checkout's `docs/`, ALREADY BUILT (the nightly copies this
// script there and runs it with --build-only in a step of its own, so a base that fails
// to build still leaves a head-only report). A base run that fails (a page added since
// the base commit is a 404 there) is logged and skipped; the compare skips a URL with no
// base. A base server that will not start leaves head to run alone. A head run that fails
// stops the collect. Either mode appends `base_ok=true|false` to $GITHUB_OUTPUT: true only
// when every form factor has at least one base run, so the nightly never reports a night
// with nothing compared as measured green.
//
// Output layout (consumed by perf-regression.mjs), the same in both modes:
//   <out>/desktop/lhr-*.json   <out>/mobile/lhr-*.json
//
// Configs reused for collection settings (url list, numberOfRuns,
// desktop/mobile emulation): lighthouserc.cjs + lighthouserc.mobile.cjs. Their
// `assert` blocks are advisory only — the regression compare is the real gate.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LHCI_DIR = path.join(DOCS, '.lighthouseci');
const require = createRequire(import.meta.url);

const FORM_FACTORS = [
	['desktop', 'lighthouserc.cjs'],
	['mobile', 'lighthouserc.mobile.cjs'],
];

// The configs name :4399. In the alternated mode head keeps it and base moves here.
const HEAD_PORT = 4399;
const BASE_PORT = 4398;

export function parseArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--out') out.out = argv[++i];
		else if (a === '--no-build') out.noBuild = true;
		else if (a === '--build-only') out.buildOnly = true;
		else if (a === '--base-docs') out.baseDocs = argv[++i];
		else if (a === '--base-out') out.baseOut = argv[++i];
		else throw new Error(`unknown arg: ${a}`);
	}
	if (out.buildOnly) return out;
	if (!out.out) throw new Error('--out <dir> is required');
	if (Boolean(out.baseDocs) !== Boolean(out.baseOut)) throw new Error('--base-docs and --base-out go together');
	out.out = path.resolve(out.out);
	if (out.baseDocs) {
		out.baseDocs = path.resolve(out.baseDocs);
		out.baseOut = path.resolve(out.baseOut);
	}
	return out;
}

/**
 * The measuring order for the alternated mode: every URL, `runs` times per arm, with head
 * and base adjacent and their order flipped each round (round 0 head first, round 1 base
 * first, ...). Adjacent pairs are what cancel drift; the flip stops one arm always going
 * first after a URL change. Pure, so the test pins the shape.
 * @returns {{ round: number, url: string, arm: 'head' | 'base' }[]}
 */
export function alternationPlan(urls, runs) {
	const plan = [];
	for (let round = 0; round < runs; round++) {
		const order = round % 2 === 0 ? ['head', 'base'] : ['base', 'head'];
		for (const url of urls) for (const arm of order) plan.push({ round, url, arm });
	}
	return plan;
}

/** The config's URL with its port swapped for the arm's server. */
export function urlForArm(url, arm) {
	const u = new URL(url);
	u.port = String(arm === 'base' ? BASE_PORT : HEAD_PORT);
	return u.toString();
}

function run(cmd, args, cwd = DOCS) {
	execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

function build(docsDir = DOCS) {
	// Mirror the (former) `perf` script: sync the generated assets, then build.
	// NOT the full `npm run build` (that adds the strict showcase:check, which is
	// unrelated to perf and slow).
	run('npm', ['run', 'sync:portal'], docsDir);
	run('npm', ['run', 'sync:playground'], docsDir);
	run('npx', ['astro', 'build'], docsDir);
	// So the nightly perf watch measures the SAME build a real deploy ships —
	// without this, Lighthouse would profile a build missing the modulepreload
	// hints and never see this fix (or a future regression to it).
	run('node', ['scripts/inject-modulepreload.mjs'], docsDir);
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

// Start `astro preview` in a docs dir and resolve once it prints its address. `--ignore-lock`: Astro 7 keeps one
// preview per project in a lock file, and a stale lock from a crashed run must not block the job. The server runs in
// its own process group so `stop` reaches the node process under `npx`; killing `npx` alone leaves it serving.
function serve(docsDir, port) {
	return new Promise((resolve, reject) => {
		const child = spawn('npx', ['astro', 'preview', '--port', String(port), '--ignore-lock'], {
			cwd: docsDir,
			stdio: ['ignore', 'pipe', 'inherit'],
			detached: true,
		});
		child.stop = () => {
			try {
				process.kill(-child.pid, 'SIGTERM');
			} catch {}
		};
		let seen = '';
		const timer = setTimeout(() => {
			child.stop();
			reject(new Error(`astro preview on :${port} (${docsDir}) printed no address in 120 s`));
		}, 120_000);
		child.stdout.on('data', (d) => {
			seen += d;
			// Astro moves to the next free port when this one is taken, which would measure nothing on ours.
			if (/is in use/.test(seen)) {
				clearTimeout(timer);
				child.stop();
				reject(new Error(`port ${port} is taken; astro preview (${docsDir}) would have moved off it`));
			} else if (seen.includes(`localhost:${port}`)) {
				clearTimeout(timer);
				resolve(child);
			}
		});
		child.on('error', (e) => {
			clearTimeout(timer);
			reject(new Error(`astro preview on :${port} (${docsDir}) failed to start: ${e.message}`));
		});
		child.on('exit', (code) => {
			clearTimeout(timer);
			reject(new Error(`astro preview on :${port} exited (${code}) before it was ready`));
		});
	});
}

// One Lighthouse run of one URL, through lhci so the LHR matches the one-arm mode's.
function collectOne(formFactor, config, url, out, name) {
	const tmp = path.join(DOCS, `.perf-collect-${formFactor}.json`);
	const { ci } = require(path.join(DOCS, config));
	const { startServerCommand, startServerReadyPattern, ...rest } = ci.collect;
	fs.writeFileSync(tmp, JSON.stringify({ ci: { collect: { ...rest, url: [url], numberOfRuns: 1 } } }));
	try {
		fs.rmSync(LHCI_DIR, { recursive: true, force: true });
		run('npx', ['lhci', 'collect', `--config=${tmp}`]);
		const produced = fs.readdirSync(LHCI_DIR).filter((f) => f.startsWith('lhr-') && f.endsWith('.json'));
		if (produced.length !== 1) throw new Error(`lhci collect produced ${produced.length} lhr-*.json for ${url}, expected 1`);
		const ffOut = path.join(out, formFactor);
		fs.mkdirSync(ffOut, { recursive: true });
		fs.copyFileSync(path.join(LHCI_DIR, produced[0]), path.join(ffOut, `lhr-${name}.json`));
	} finally {
		fs.rmSync(tmp, { force: true });
	}
}

/**
 * Whether the base arm measured enough to compare: at least one base run in every form factor. A night
 * whose base runs all failed must not read as a clean compare, because perf-regression.mjs skips a URL
 * with no base and calls the result clean (the "green nothing" the nightly's stand-down guards against).
 * @param {Record<string, number>} baseRuns base LHRs written, per form factor
 */
export function baseCollected(baseRuns, formFactors = FORM_FACTORS.map(([ff]) => ff)) {
	return formFactors.every((ff) => (baseRuns[ff] ?? 0) > 0);
}

// Tell the workflow whether the base arm measured anything (`steps.<id>.outputs.base_ok`).
function reportBase(ok, { quiet = false } = {}) {
	if (!ok && !quiet) console.warn('::warning::perf-collect: the base arm collected no runs in at least one form factor; nothing to compare there');
	if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `base_ok=${ok}\n`);
}

async function collectAlternated(args) {
	const servers = [];
	const baseRuns = {};
	try {
		servers.push(await serve(DOCS, HEAD_PORT));
		// A base server that will not start leaves the head arm to run alone, as a failed base build does.
		let baseUp = true;
		try {
			servers.push(await serve(args.baseDocs, BASE_PORT));
		} catch (e) {
			baseUp = false;
			console.warn(`perf-collect: the base server did not start, collecting head alone: ${e.message}`);
		}
		for (const [ff, cfg] of FORM_FACTORS) {
			const { ci } = require(path.join(DOCS, cfg));
			const plan = alternationPlan(ci.collect.url, ci.collect.numberOfRuns);
			baseRuns[ff] = 0;
			for (const [i, step] of plan.entries()) {
				const out = step.arm === 'base' ? args.baseOut : args.out;
				const slug = new URL(step.url).pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'root';
				const name = `${String(i).padStart(3, '0')}-r${step.round}-${slug}`;
				if (step.arm === 'head') {
					collectOne(ff, cfg, urlForArm(step.url, 'head'), out, name);
					continue;
				}
				if (!baseUp) continue;
				try {
					collectOne(ff, cfg, urlForArm(step.url, 'base'), out, name);
					baseRuns[ff]++;
				} catch (e) {
					console.warn(`perf-collect: base run ${name} (${ff}) failed, skipped: ${e.message}`);
				}
			}
			console.log(`perf-collect: ${ff} → ${plan.length} run(s), head and base alternated; ${baseRuns[ff]} base run(s) collected`);
		}
	} finally {
		for (const s of servers) s.stop();
	}
	reportBase(baseCollected(baseRuns));
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.buildOnly) {
		build();
		return;
	}
	fs.mkdirSync(args.out, { recursive: true });
	if (!args.noBuild) build();
	if (args.baseDocs) {
		fs.mkdirSync(args.baseOut, { recursive: true });
		await collectAlternated(args);
	} else {
		for (const [ff, cfg] of FORM_FACTORS) collect(ff, cfg, args.out);
		reportBase(false, { quiet: true }); // one arm: no base by design
	}
	fs.rmSync(LHCI_DIR, { recursive: true, force: true });
	console.log(`perf-collect: done → ${args.out}${args.baseOut ? ` and ${args.baseOut}` : ''}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
