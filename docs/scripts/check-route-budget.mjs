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
// This gate does NOT try to be a performance model. It counts bytes on the two heavy app
// routes. Bytes are a proxy for parse+hydrate, which — because the service worker serves
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

// Slack below the budget before it counts as stale-loose. Absorbs ordinary churn (a
// dependency bump, a few KB of new UI) without demanding a ledger edit on every PR,
// while staying far under any win worth banking.
const SLACK = { eagerJsGz: 12 * 1024, htmlRaw: 20 * 1024 };

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
		if (!fs.existsSync(file)) continue;
		eagerJsGz += zlib.gzipSync(fs.readFileSync(file), { level: 6 }).length;
	}
	return { eagerJsGz, htmlRaw: Buffer.byteLength(html), chunks: refs.length };
}

const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

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
		for (const metric of ['eagerJsGz', 'htmlRaw']) {
			const cap = budget[metric];
			const got = actual[metric];
			const slack = SLACK[metric];
			if (got > cap) {
				problems.push(
					`${route} ${metric}: ${kb(got)} EXCEEDS its budget ${kb(cap)} (+${kb(got - cap)}).\n` +
						`    Give the bytes back, or raise "${metric}" for "${route}" in docs/route-budget.json\n` +
						`    IN THIS PR — so the growth is reviewable where it happened.`,
				);
			} else if (got < cap - slack) {
				problems.push(
					`${route} ${metric}: ${kb(got)} is ${kb(cap - got)} under its budget ${kb(cap)} — the budget is STALE.\n` +
						`    Ratchet it down to ${kb(got)} in docs/route-budget.json so the win is banked and cannot be silently re-spent.`,
				);
			}
			lines.push(`  ${route.padEnd(12)} ${metric.padEnd(10)} ${kb(got).padStart(9)} / ${kb(cap).padStart(9)}`);
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

main();
