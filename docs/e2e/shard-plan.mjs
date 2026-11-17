/**
 * Time-balanced shards for the Studio E2E nightly.
 *
 * Why this exists: `playwright test --shard=K/N` with `fullyParallel` cuts the ordered test
 * list into N runs of equal COUNT. The projects come in config order, so every WebKit and
 * Gecko test lands in the last legs, and on 2026-11-16 legs 7 and 8 ran 38.7 and 43.9 min
 * against a 45-minute step while leg 1 ran 22.1 (1.47x the mean).
 *
 * Instead, `playwright.config.ts` asks this module, when E2E_SHARD=K/N is set, which spec
 * files each project runs in leg K. The unit is one (project, spec file) pair:
 *   - a pair with a measured weight (seconds, in e2e/shard-weights.json) is dealt by
 *     `plan()` from tools/shard-tests.js, the same longest-first balancer the unit and
 *     integration legs use;
 *   - a pair with no weight (a new spec, a new tag, or a project that runs none of the
 *     file's tests) goes to the leg a stable hash of its name picks, so new work spreads
 *     out instead of piling into one leg until the next re-bless.
 * Every pair lands in exactly one leg, so no test is dropped or run twice. The plan is a
 * pure function of (spec files, projects, weights, N), so every leg and every worker
 * process computes the same one.
 *
 * Re-bless the weights from a scheduled run's per-leg report text with
 * `node scripts/e2e-shard-bless.mjs` (engineering/development.md §Studio E2E nightly).
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { plan, parseShard } = require('../../tools/shard-tests.js');

/** Playwright's default testMatch, `**\/*.@(spec|test).?(c|m)[jt]s?(x)`, as one RegExp. */
export const TEST_FILE = /\.(?:spec|test)\.(?:c|m)?[jt]sx?$/;

/** Every test file under `dir` (Playwright's default naming), as posix paths relative to it, sorted. */
export function listSpecs(dir) {
	const out = [];
	const walk = (rel) => {
		for (const ent of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
			const p = rel ? `${rel}/${ent.name}` : ent.name;
			if (ent.isDirectory()) walk(p);
			else if (TEST_FILE.test(ent.name)) out.push(p);
		}
	};
	walk('');
	return out.sort();
}

/** FNV-1a over the key, so an unweighted pair's leg never depends on what else exists. */
export function hashLeg(key, n) {
	let h = 0x811c9dc5;
	for (let i = 0; i < key.length; i++) {
		h ^= key.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h % n;
}

export const pairKey = (project, spec) => `${project}|e2e/${spec}`;

/**
 * A project's own testMatch, as a test on a spec's ABSOLUTE path (what Playwright tests it against).
 * Only a plain RegExp is understood. A string, an array, or a stateful (g/y) RegExp throws, because
 * replacing it with this leg's file list would silently widen or narrow what the project runs.
 */
function ownMatch(p, testDir) {
	const m = p.testMatch;
	if (m === undefined) return () => true;
	if (!(m instanceof RegExp) || m.global || m.sticky) {
		throw new Error(`e2e shard plan: project "${p.name}" has a testMatch the planner cannot read (${String(m)}); use one non-global RegExp, or teach docs/e2e/shard-plan.mjs the new form`);
	}
	return (spec) => m.test(path.join(testDir, spec));
}

/**
 * Deal every (project, spec) pair into n legs.
 * `projects`: [{ name, testMatch? }]; a project's own RegExp testMatch narrows its specs first.
 * Returns n arrays of pair keys, plus each leg's planned seconds (weighted pairs only).
 */
export function planLegs({ projects, specs, weights, n, testDir = '/e2e' }) {
	const legs = Array.from({ length: n }, () => ({ load: 0, keys: [] }));
	const unknown = [];
	const byProject = [];
	for (const p of projects) {
		const own = ownMatch(p, testDir);
		const known = [];
		for (const s of specs) {
			if (!own(s)) continue;
			const k = pairKey(p.name, s);
			if (Number(weights[k]) > 0) known.push(k);
			else unknown.push(k);
		}
		byProject.push({ name: p.name, known, total: known.reduce((t, k) => t + Number(weights[k]), 0) });
	}
	// PER PROJECT, into the legs' RUNNING totals. An engine's speed moves from night to night (on 2026-11-17 webkit-tablet ran
	// ~30% over its weights), and one plan over all pairs had put 1.7 min of webkit-tablet in one leg and 6.4 in another, so
	// the leg holding the most of a slow engine overran. Dealing each project on its own spreads each engine; dealing it
	// into the totals so far (not as whole bins) lets a later project level what an earlier one left uneven. Lightest
	// project first: a small project with one big pair (compose-default's 6.2 min `lessons`) lands early, and the many
	// small pairs of the big engines, dealt last, fill around it. Ties by name, so the plan stays a pure function of its
	// inputs. (Whole bins, heaviest project first, planned 1.08x every night: the lump arrived when nothing could absorb it.)
	byProject.sort((a, b) => a.total - b.total || a.name.localeCompare(b.name));
	for (const pr of byProject) {
		if (!pr.known.length) continue;
		const bins = plan(pr.known, weights, n, legs.map((l) => l.load));
		bins.forEach((b, i) => {
			legs[i].load = b.load;
			legs[i].keys.push(...b.files);
		});
	}
	for (const k of unknown) legs[hashLeg(k, n)].keys.push(k);
	return legs.map((l) => ({ load: l.load, keys: l.keys.sort() }));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NOTHING = /(?!)/;

/** A RegExp that matches exactly these spec paths (relative to testDir), by suffix. */
export function specsRegExp(specs) {
	if (!specs.length) return NOTHING;
	return new RegExp(`(?:^|[\\\\/])(?:${specs.map((s) => escapeRe(s).replace(/\//g, '[\\\\/]')).join('|')})$`);
}

/**
 * The projects for leg `shard` ("K/N"): each one's testMatch becomes the spec files it runs
 * in that leg. Everything else about a project (grep, use, ...) is left alone.
 */
export function shardProjects(projects, shard, { testDir, weightsFile }) {
	let s = null;
	try {
		s = parseShard(shard);
	} catch {}
	if (!s) throw new Error(`E2E_SHARD must be K/N with 1 <= K <= N, got "${shard}"`);
	const weights = JSON.parse(fs.readFileSync(weightsFile, 'utf8'));
	const legs = planLegs({ projects, specs: listSpecs(testDir), weights, n: s.n, testDir });
	const mine = legs[s.k - 1].keys;
	return projects.map((p) => {
		const specs = mine.filter((k) => k.startsWith(`${p.name}|`)).map((k) => k.slice(p.name.length + 1 + 'e2e/'.length));
		return { ...p, testMatch: specsRegExp(specs) };
	});
}
