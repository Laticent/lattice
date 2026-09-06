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
//   • OVER  → the route grew past its recorded budget. Either give the bytes back, or
//             raise the number IN THE SAME PR, which is the point: growth becomes a
//             reviewable line in the diff of the change that caused it, which is the
//             attribution a nightly can never give.
//   • UNDER → the route is now well below its budget, so the budget is STALE-LOOSE and
//             must be ratcheted down. Without this the ledger rots into a number nobody
//             has to respect, and a hard-won reduction is silently re-spendable.
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
function measure(routeHtml) {
	const html = fs.readFileSync(path.join(DIST, routeHtml), 'utf8');
	const refs = [...new Set(html.match(/\/_astro\/[A-Za-z0-9._-]+\.js/g) || [])];
	let eagerJsGz = 0;
	for (const ref of refs) {
		const file = path.join(DIST, ref.replace(/^\//, ''));
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

/**
 * Compare one route's measurement against its budget. PURE — no fs, no dist — so the
 * property that matters (it fails in BOTH directions) is unit-testable without a built
 * site. The docs test tier runs before `npm run build`, so a dist-dependent test would
 * silently skip in CI and gate nothing.
 *
 * Returns a list of human-readable problems; empty means within budget.
 */
export function evaluateRoute(route, actual, budget, slackPct = STALE_SLACK_PCT) {
	const problems = [];
	for (const metric of ['eagerJsGz', 'htmlRaw']) {
		const cap = budget[metric];
		const got = actual[metric];
		if (typeof cap !== 'number' || typeof got !== 'number') continue;
		if (got > cap) {
			problems.push(
				`${route} ${metric}: ${kb(got)} EXCEEDS its budget ${kb(cap)} (+${kb(got - cap)}).\n` +
					`    Give the bytes back, or raise "${metric}" for "${route}" in docs/route-budget.json\n` +
					`    IN THIS PR — so the growth is reviewable where it happened.`,
			);
		} else if (got < cap - Math.round(cap * slackPct)) {
			problems.push(
				`${route} ${metric}: ${kb(got)} is ${kb(cap - got)} under its budget ${kb(cap)} — the budget is STALE.\n` +
					`    Ratchet it down to ${got} (${kb(got)}) in docs/route-budget.json so the win is banked and cannot be silently re-spent.`,
			);
		}
	}
	return problems;
}

function main() {
	if (!fs.existsSync(DIST)) {
		process.stderr.write('check-route-budget: no dist/ — run `npm run build` first.\n');
		process.exit(1);
	}
	const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
	const problems = [];
	const lines = [];

	for (const [route, budget] of Object.entries(ledger.routes)) {
		const actual = measure(budget.html);
		problems.push(...evaluateRoute(route, actual, budget));
		for (const metric of ['eagerJsGz', 'htmlRaw']) {
			lines.push(`  ${route.padEnd(12)} ${metric.padEnd(10)} ${kb(actual[metric]).padStart(9)} / ${kb(budget[metric]).padStart(9)}`);
		}
		lines.push(`  ${route.padEnd(12)} ${'chunks'.padEnd(10)} ${String(actual.chunks).padStart(9)}`);
	}

	if (problems.length) {
		process.stderr.write(`check-route-budget FAILED — ${problems.length} problem(s):\n`);
		for (const p of problems) process.stderr.write(`  • ${p}\n`);
		process.stderr.write('\nMeasured:\n' + lines.join('\n') + '\n');
		process.exit(1);
	}
	process.stdout.write(`✓ check:route-budget — ${Object.keys(ledger.routes).length} route(s) within budget.\n`);
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
