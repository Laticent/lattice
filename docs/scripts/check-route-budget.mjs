// Per-route payload ledger — a BLOCKING build gate on the bytes a route ships.
//
// WHY THIS EXISTS. The Studio's eager JS grew from 615KB gz (2026-07-19, right after
// the Editor lazy split shipped) to 976KB gz a month later — heavier than the 816KB
// that split was written to fix — and nothing noticed. The only payload watch was
// `perf-nightly.yml`: nightly, non-blocking, and relative at 3%/10KB, which at this
// route's weight is roughly 40KB of headroom PER DAY. Slow accretion is exactly the
// failure mode a relative nightly cannot see, and it is what happened.
// See engineering/decisions/2026-08-17-studio-dynamic-loading-audit.md §7, §9.7.
//
// AND THAT NIGHTLY WATCH NO LONGER MEASURES BYTES AT ALL, which is why this ledger covers
// all five routes it measures rather than two. The nightly itself still runs — it watches
// LCP, CLS, TBT and the perf score, the things only a browser can see. Only the bytes moved.
//
// `script-size` claimed to be deterministic and was not: it summed Lighthouse NETWORK
// records, so it measured what happened to load during a visit. Across 140 (commit, URL, form-factor) triples read two or more times on an
// IDENTICAL commit, 35% moved further than its own 3% tolerance and the worst moved
// 104KB on a ~200KB page — surviving a median of three runs. A tolerance band wide
// enough to swallow that is 52%, which would pass a doubling of the payload, so the
// metric was deleted rather than widened (2026-09-05) and the three routes it covered
// joined this ledger. `check-route-budget.test.mjs` pins the two lists equal, so a route
// cannot be added to one and forgotten in the other.
// See engineering/decisions/2026-09-02-alarm-channel-saturation.md.
//
// WHY BYTES CAN BE GATED WHERE WALL CLOCK CANNOT. 2026-08-03-performance-guard.md
// established the rule: a shared runner cannot resolve anything smaller than ~2x, so
// durations became a nightly alarm and only DETERMINISTIC COUNTS gate the merge. Bytes
// off a built artifact are deterministic — same input, same number, no runner variance,
// nothing to flake.
//
// WHY IT IS A LEDGER AND NOT A THRESHOLD. 2026-06-15-docs-perf-gating-policy.md retired
// the old per-PR Lighthouse budget for TWO reasons: runner flapping AND absolute
// thresholds ROTTING as the site legitimately grows. Determinism answers the first only.
// So this follows the `tools/check-ownership.js` idiom the repo already uses for HARD
// RULES #20/#22/#26 — a committed budget that fails BOTH ways:
//
//   • OVER  → the route grew past its HARD limit. Either give the bytes back, or get the
//             owner's OK and reset the budget (`npm run route-budget:rebaseline`), which
//             writes the new number AND a history entry in the same PR.
//   • UNDER → the route is now well below its SOFT target, so the target is STALE-LOOSE
//             and must be ratcheted down. Without this the ledger rots into a number nobody
//             has to respect, and a hard-won reduction is silently re-spendable.
//
// SOFT TARGET, HARD LIMIT (2026-09-29). Each ledger number is a SOFT target; the HARD limit
// is derived from it, soft × (1 + HARD_HEADROOM_PCT), and is never written down, so no PR
// can raise it on its own. Between the two, the gate PASSES and prints a warning with the
// room left. The first cut had one number set to "the measurement plus about 280 bytes",
// so nearly every PR that touched the Studio edited the same line and prepended to the same
// 48KB note string in route-budget.json: 14 of 49 commits on main in about 36 hours. Any two such
// PRs conflicted in git, and two that each fit alone could fail together in the merge
// queue. Now a PR edits the ledger only when it crosses the hard limit or trips the stale
// floor, and a reset is one owner-approved PR at a time.
// See engineering/decisions/2026-09-29-route-budget-soft-hard.md.
//
// This gate does NOT try to be a performance model. It counts bytes on five routes: the two
// heavy app shells and the three content routes that joined in 2026-09.
//
// AND IT DOES NOT COUNT ALL OF THEM — read this before claiming a route is "covered". measure()
// counts only `/_astro/*.js` REFERENCED IN THE HTML. It deliberately does not follow dynamic
// `import()` (that is the whole point of a lazy boundary), and it cannot see a script served
// from outside `/_astro/` at all — `docs/public/playground/lattice-playground.js` is 971KB and
// invisible here. So this is a deterministic watch on the EAGER path, not a payload total. The
// retired `script-size` metric summed everything a visit actually fetched, which is a strictly
// larger quantity (~2x on studio: ~1335KB measured vs this gate's 639KB budget) — it was deleted
// for being unmeasurable, not for being redundant, and nothing watches the deferred bytes today. Bytes are a proxy for parse+hydrate, which — because the service worker serves
// /_astro/ cache-first — is the cost that actually RECURS per launch.
//
// Runs post-`astro build` in the docs `build` script, which `docs-build` runs in CI, and
// `docs-build` is in ci.needs — so this blocks the merge. Standalone:
// `npm run check:route-budget` (needs a built dist/).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, '..', 'dist');
const LEDGER_PATH = path.join(HERE, '..', 'route-budget.json');

// How far BELOW its budget a route may drift before the budget counts as stale-loose.
//
// PROPORTIONAL, and sized from measured behavior rather than taste. Three inputs:
//   • the audit measured ~0.4%/day of real drift on this route (~2.6KB/day at today's
//     weight), so a 5% floor is roughly a fortnight of ordinary churn — frequent enough
//     to catch accretion, rare enough that most PRs never touch the ledger;
//   • gzip output is implementation-dependent, so a CI Node/zlib bump can move the total
//     by more than a percent on its own. An absolute few-KB band would red-build on a
//     runtime upgrade that changed nothing about the app;
//   • the first cut of this gate used 12KB/20KB absolute, which left the studio route
//     ~4KB of room below budget — and the very next real improvement (taking theme-core
//     off the eager path, −10.7KB) tripped it. A gate that fires on its own wins is a
//     gate people learn to silence.
const STALE_SLACK_PCT = 0.05;

/**
 * A route's EAGER JS: every `/_astro/*.js` referenced in its HTML, gzipped.
 *
 * This is deliberately the same rule `2026-07-19-defer-editor-hydration.md` measured
 * itself against, so today's number and that one are the same quantity. It counts the
 * `modulepreload` hints `inject-modulepreload.mjs` writes AND the astro-island
 * `renderer-url` / `component-url` references — all of which the browser fetches before
 * the route is interactive. It does NOT follow dynamic `import()`, which is the whole
 * point of a lazy boundary.
 */
function measure(routeHtml, dist = DIST) {
	const html = fs.readFileSync(path.join(dist, routeHtml), 'utf8');
	const refs = [...new Set(html.match(/\/_astro\/[A-Za-z0-9._-]+\.js/g) || [])];
	let eagerJsGz = 0;
	for (const ref of refs) {
		const file = path.join(dist, ref.replace(/^\//, ''));
		// A referenced chunk that is not on disk is a BROKEN BUILD, and skipping it would
		// under-count — which this gate would then report as "STALE, ratchet it down",
		// laundering the breakage into a smaller committed budget that the next correct
		// build exceeds. Fail loudly instead.
		if (!fs.existsSync(file)) {
			throw new Error(`check-route-budget: ${routeHtml} references ${ref}, which is not in dist/ — the build is broken, not smaller.`);
		}
		eagerJsGz += zlib.gzipSync(fs.readFileSync(file), { level: 6 }).length;
	}
	return { eagerJsGz, htmlRaw: Buffer.byteLength(html), chunks: refs.length };
}

const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

// How far ABOVE its soft target a route may sit before the build fails: the HARD limit is
// soft × (1 + this). The owner set 3% on 2026-09-29: the margin the other four routes
// already carried, about 19KB on the Studio, or roughly two days at the ~9KB/day the
// Studio grew over the 36 hours before (+14,030 bytes from 2026-09-27 23:28 to 09-29 11:07). It lives here and not in route-budget.json so
// that a PR cannot widen its own room by editing the ledger.
export const HARD_HEADROOM_PCT = 0.03;

const METRICS = ['eagerJsGz', 'htmlRaw'];

/** The hard limit for a soft target. Exact bytes, so a message can quote it. */
export const hardLimit = (soft, hardPct = HARD_HEADROOM_PCT) => soft + Math.round(soft * hardPct);

/**
 * Compare one route's measurement against its budget. PURE — no fs, no dist — so the
 * properties that matter (it fails in BOTH directions, and it only WARNS between soft and
 * hard) are unit-testable without a built site. The docs test tier runs before
 * `npm run build`, so a dist-dependent test would silently skip in CI and gate nothing.
 *
 * Returns { problems, warnings }: problems fail the build, warnings print and pass.
 */
export function evaluateRoute(route, actual, budget, slackPct = STALE_SLACK_PCT, hardPct = HARD_HEADROOM_PCT) {
	const problems = [];
	const warnings = [];
	for (const metric of METRICS) {
		const soft = budget[metric];
		const got = actual[metric];
		if (typeof soft !== 'number' || typeof got !== 'number') continue;
		const hard = hardLimit(soft, hardPct);
		if (got > hard) {
			problems.push(
				`${route} ${metric}: ${kb(got)} EXCEEDS its hard limit ${kb(hard)} (soft ${kb(soft)}, +${kb(got - hard)} past hard).\n` +
					`    Give the bytes back, or ask the owner to approve a reset. With that OK, run\n` +
					`    \`npm run route-budget:rebaseline -- --reason "<what grew and why>"\` in this PR;\n` +
					`    it rewrites docs/route-budget.json and adds an entry to docs/route-budget.history.md.`,
			);
		} else if (got > soft) {
			const band = hard - soft;
			const left = hard - got;
			warnings.push(
				`${route} ${metric}: ${kb(got)} is ${kb(got - soft)} over its soft target ${kb(soft)}; ` +
					`${kb(left)} of the ${kb(band)} band (${Math.round((left / band) * 100)}%) is left before the hard limit ${kb(hard)}.`,
			);
		} else if (got < soft - Math.round(soft * slackPct)) {
			problems.push(
				`${route} ${metric}: ${kb(got)} is ${kb(soft - got)} under its soft target ${kb(soft)} — the budget is STALE.\n` +
					`    Ratchet it down to ${got} (${kb(got)}) so the win is banked and cannot be silently re-spent:\n` +
					`    \`npm run route-budget:rebaseline -- --reason "<what shrank>"\` does it and records it.`,
			);
		}
	}
	return { problems, warnings };
}

/**
 * The new soft targets for a reset. PURE. A metric moves only when it sits OUTSIDE the
 * range where the gate is silent — over soft, or past the stale floor — so a reset on the
 * Studio does not also rewrite routes sitting quietly under their targets.
 *
 * LOWERING a stale target is routine. RAISING one needs the owner's OK, so a raise is
 * applied only with `raise: true` (the `--raise` flag) and is otherwise returned in
 * `refused`. Without this split, a routine stale-lowering run would also raise every
 * metric that happened to sit in a warning band, owner or no owner.
 */
export function rebaseline(ledgerRoutes, measured, { slackPct = STALE_SLACK_PCT, raise = false } = {}) {
	const changes = [];
	const refused = [];
	for (const [route, budget] of Object.entries(ledgerRoutes)) {
		for (const metric of METRICS) {
			const soft = budget[metric];
			const got = measured[route]?.[metric];
			if (typeof soft !== 'number' || typeof got !== 'number') continue;
			if (got > soft) (raise ? changes : refused).push({ route, metric, from: soft, to: got });
			else if (got < soft - Math.round(soft * slackPct)) changes.push({ route, metric, from: soft, to: got });
		}
	}
	return { changes, refused };
}

// PER-PR ALLOWANCE (2026-09-29). Soft/hard stopped the ledger conflicts, but on its own it
// makes the band a commons: the first PRs to arrive spend it unaccounted, and whichever PR
// finally crosses hard pays for everyone. So each PR may add at most this many bytes of
// eager JS to any one route, measured against `main`, before it must explain itself in its
// OWN file under docs/route-budget.d/ — one file per PR, so explanations cannot conflict.
// The owner set 2KB: 8 of the Studio's last 10 raises before the switch were under it
// (the two over were +2,220 and +5,202 bytes).
export const PR_ALLOWANCE_BYTES = 2048;

const FRAGMENT_DIR = path.join(HERE, '..', 'route-budget.d');

/**
 * Compare this build against `main`'s. PURE. `explained` is true when the PR adds a
 * fragment under docs/route-budget.d/. Returns { problems, lines }.
 */
export function evaluateAllowance(route, actual, base, explained, allowance = PR_ALLOWANCE_BYTES) {
	const problems = [];
	const lines = [];
	if (typeof actual?.eagerJsGz !== 'number' || typeof base?.eagerJsGz !== 'number') return { problems, lines };
	const delta = actual.eagerJsGz - base.eagerJsGz;
	const sign = delta >= 0 ? '+' : '-';
	lines.push(`${route} eagerJsGz ${sign}${Math.abs(delta)} bytes vs main (allowance ${allowance})`);
	if (delta > allowance && !explained) {
		problems.push(
			`${route} eagerJsGz: this PR adds ${delta} bytes (${kb(delta)}) of eager JS vs main, over the per-PR allowance of ${allowance}.\n` +
				`    Give bytes back, or add docs/route-budget.d/<slug>.md in this PR saying what grew and why\n` +
				`    (one file per PR, so it cannot conflict; the next reset folds it into route-budget.history.md).`,
		);
	}
	return { problems, lines };
}

/** Fragments this PR ADDS under docs/route-budget.d/, relative to `baseSha`. */
function addedFragments(baseSha) {
	const repo = path.join(HERE, '..', '..');
	const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=A', baseSha, 'HEAD', '--', 'docs/route-budget.d/'], {
		cwd: repo,
		encoding: 'utf8',
	});
	return out
		.split('\n')
		// Top-level files only: that is all a reset folds (pendingFragments), so a file in a
		// subdirectory would explain growth once and then never reach the history.
		.filter((f) => /^docs\/route-budget\.d\/[^/]+\.md$/.test(f) && !f.endsWith('/README.md'))
		.filter((f) => fs.existsSync(path.join(repo, f)) && fs.readFileSync(path.join(repo, f), 'utf8').trim());
}

/** Fragments waiting to be folded into the history by the next reset. */
function pendingFragments() {
	if (!fs.existsSync(FRAGMENT_DIR)) return [];
	return fs
		.readdirSync(FRAGMENT_DIR)
		.filter((f) => f.endsWith('.md') && f !== 'README.md')
		.sort()
		.map((f) => ({ file: path.join(FRAGMENT_DIR, f), name: f, text: fs.readFileSync(path.join(FRAGMENT_DIR, f), 'utf8').trim() }));
}

const HISTORY_PATH = path.join(HERE, '..', 'route-budget.history.md');
const HISTORY_ANCHOR = '<!-- resets: newest first, below this line -->';

function writeReset(ledger, changes, reason) {
	for (const c of changes) ledger.routes[c.route][c.metric] = c.to;
	fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n');

	let base = 'unknown';
	try {
		base = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		// Not a git checkout (a tarball build): the entry says "unknown" rather than failing.
	}
	const date = new Date().toISOString().slice(0, 10);
	const rows = changes.map((c) => {
		const delta = c.to - c.from;
		const sign = delta >= 0 ? '+' : '-';
		return `| ${c.route} | ${c.metric} | ${c.from} | ${c.to} | ${sign}${Math.abs(delta)} | ${hardLimit(c.to)} |`;
	});
	const entry =
		`### ${date} — measured on the built tree at ${base} plus any uncommitted changes\n\n${reason}\n\n` +
		`| Route | Metric | Soft before | Soft after | Change | Hard after |\n|---|---|---|---|---|---|\n` +
		rows.join('\n') +
		'\n\n';
	const fragments = pendingFragments();
	const folded = fragments.length
		? `Growth explained since the last reset (from docs/route-budget.d/):\n\n${fragments.map((f) => `- **${f.name}** — ${f.text.replace(/\s*\n\s*/g, ' ')}`).join('\n')}\n\n`
		: '';
	const history = fs.readFileSync(HISTORY_PATH, 'utf8');
	const at = history.indexOf(HISTORY_ANCHOR);
	if (at === -1) throw new Error(`check-route-budget: ${HISTORY_PATH} has lost its "${HISTORY_ANCHOR}" line.`);
	const cut = at + HISTORY_ANCHOR.length + 1;
	fs.writeFileSync(HISTORY_PATH, history.slice(0, cut) + '\n' + entry + folded + history.slice(cut).replace(/^\n+/, ''));
	for (const f of fragments) fs.unlinkSync(f.file);
}

function main() {
	const args = process.argv.slice(2);

	// `--measure <dist>`: print one build's numbers as JSON. measure-route-base.sh runs this
	// against a build of `main`, and the gate below reads it back as the per-PR baseline.
	if (args[0] === '--measure') {
		const dist = path.resolve(args[1] || DIST);
		const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
		const out = {};
		for (const [route, budget] of Object.entries(ledger.routes)) {
			if (fs.existsSync(path.join(dist, budget.html))) out[route] = measure(budget.html, dist);
		}
		process.stdout.write(JSON.stringify(out, null, 2) + '\n');
		return;
	}

	if (!fs.existsSync(DIST)) {
		process.stderr.write('check-route-budget: no dist/ — run `npm run build` first.\n');
		process.exit(1);
	}
	const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
	const measured = {};
	for (const [route, budget] of Object.entries(ledger.routes)) measured[route] = measure(budget.html);

	if (args.includes('--rebaseline')) {
		const i = args.indexOf('--reason');
		const reason = i === -1 ? '' : (args[i + 1] || '').trim();
		if (!reason) {
			process.stderr.write('route-budget:rebaseline needs --reason "<what grew or shrank, and why>".\n');
			process.exit(1);
		}
		const { changes, refused } = rebaseline(ledger.routes, measured, { raise: args.includes('--raise') });
		for (const c of refused) {
			process.stdout.write(`  NOT raised: ${c.route} ${c.metric} ${c.from} -> ${c.to}. A raise needs the owner's OK; with it, re-run with --raise.\n`);
		}
		if (!changes.length) {
			const waiting = pendingFragments().length;
			process.stdout.write(`route-budget:rebaseline — nothing to reset${waiting ? `; ${waiting} explanation file(s) in docs/route-budget.d/ wait for the next reset` : ''}.\n`);
			return;
		}
		writeReset(ledger, changes, reason);
		for (const c of changes) process.stdout.write(`  ${c.route} ${c.metric}: ${c.from} -> ${c.to} (hard ${hardLimit(c.to)})\n`);
		process.stdout.write('Wrote docs/route-budget.json and docs/route-budget.history.md. Commit both.\n');
		return;
	}

	const problems = [];
	const warnings = [];
	const lines = [`  ${'route'.padEnd(16)} ${'metric'.padEnd(10)} ${'measured'.padStart(9)} ${'soft'.padStart(9)} ${'hard'.padStart(9)}`];

	for (const [route, budget] of Object.entries(ledger.routes)) {
		const actual = measured[route];
		const r = evaluateRoute(route, actual, budget);
		problems.push(...r.problems);
		warnings.push(...r.warnings);
		for (const metric of METRICS) {
			if (typeof budget[metric] !== 'number') continue;
			lines.push(
				`  ${route.padEnd(16)} ${metric.padEnd(10)} ${kb(actual[metric]).padStart(9)} ${kb(budget[metric]).padStart(9)} ${kb(hardLimit(budget[metric])).padStart(9)}`,
			);
		}
		lines.push(`  ${route.padEnd(16)} ${'chunks'.padEnd(10)} ${String(actual.chunks).padStart(9)}`);
	}

	// The per-PR allowance needs `main`'s numbers, which only exist when something built
	// `main` first: CI does on pull_request (measure-route-base.sh). Without them, say so.
	const basePath = process.env.ROUTE_BUDGET_BASE_JSON;
	if (basePath && fs.existsSync(basePath)) {
		const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
		const explained = addedFragments(process.env.ROUTE_BUDGET_BASE_SHA || 'origin/main').length > 0;
		lines.push('', '  per-PR allowance:');
		for (const route of Object.keys(ledger.routes)) {
			const r = evaluateAllowance(route, measured[route], base[route], explained);
			problems.push(...r.problems);
			for (const l of r.lines) lines.push(`    ${l}`);
		}
		if (explained) lines.push('    growth explained by a docs/route-budget.d/ fragment in this PR');
	} else {
		lines.push('', '  per-PR allowance: NOT checked (no main build to compare against; CI checks it on pull requests).');
	}

	for (const w of warnings) process.stdout.write(`⚠ check:route-budget — ${w}\n`);
	if (problems.length) {
		process.stderr.write(`check-route-budget FAILED — ${problems.length} problem(s):\n`);
		for (const p of problems) process.stderr.write(`  • ${p}\n`);
		process.stderr.write('\nMeasured:\n' + lines.join('\n') + '\n');
		process.exit(1);
	}
	process.stdout.write(`✓ check:route-budget — ${Object.keys(ledger.routes).length} route(s) under their hard limits.\n`);
	process.stdout.write(lines.join('\n') + '\n');
}

// Only run the gate when INVOKED, not when imported by its tests.
//
// realpathSync on BOTH sides: Node's ESM loader resolves symlinks in `import.meta.url`
// but `process.argv[1]` keeps the path as typed. A checkout reached through a symlinked
// parent (macOS /tmp → /private/tmp, some CI cache mounts) made these two disagree, and
// the gate then exited 0 having printed nothing — a merge gate that silently vanishes is
// worse than no gate, because the build still looks clean.
const invokedAs = process.argv[1] ? fs.realpathSync(process.argv[1]) : '';
const selfPath = fs.realpathSync(fileURLToPath(import.meta.url));
if (invokedAs === selfPath) {
	main();
}
