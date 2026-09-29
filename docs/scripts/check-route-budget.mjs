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
//   • OVER  → the route grew past its CEILING. Give the bytes back; raising a ceiling is
//             the owner's decision, made rarely, in its own PR.
//   • UNDER → the route is now well below its SOFT target, so the target is STALE-LOOSE
//             and must be ratcheted down. Without this the ledger rots into a number nobody
//             has to respect, and a hard-won reduction is silently re-spendable.
//
// THREE LAYERS (2026-09-29). The first cut had one number per metric, set to "the measurement
// plus about 280 bytes", so nearly every PR that touched the Studio edited the same line of
// route-budget.json: 14 of 49 commits on main in about 36 hours, and any two conflicted.
// Now each metric has a SOFT target and a CEILING (`hard`), both in route-budget.json:
//   1. A PR that keeps a route at or under soft may add up to PR_ALLOWANCE_BYTES of eager JS
//      without a word. Every byte that lands ABOVE soft must be declared, per route, in the
//      PR's own file under docs/route-budget.d/ (`studio: +5123` plus why). One file per PR,
//      so explanations never conflict.
//   2. Between soft and the ceiling the build passes; past the ceiling it fails.
//   3. Moving either number is a reset with a history entry (`route-budget:rebaseline`); a
//      test holds route-budget.json to the newest entry, so a ledger-only hand edit fails,
//      and CI flags any raise over the base on the summary page for the owner to see.
// The adversarial review that shaped this: engineering/decisions/2026-09-29-route-budget-soft-hard.md.
//
// This gate does NOT try to be a performance model. It counts bytes on five routes: the two
// heavy app shells and the three content routes that joined in 2026-09.
//
// WHAT IT COUNTS: every `/_astro/*.js` the route's HTML references, PLUS everything those
// chunks import statically, transitively. Until 2026-09-29 it counted only the HTML's direct
// references, which on the content routes missed React and the shared UI chunks their islands
// import (183KB gz of 260KB on home). It deliberately does not follow dynamic `import()`
// (that is the whole point of a lazy boundary), so code a page loads with `import()` at
// startup is only counted when inject-modulepreload.mjs lists it. It cannot see a script
// served from outside `/_astro/` (`docs/public/playground/lattice-playground.js` is 971KB and
// invisible here), inline scripts except as HTML bytes, or CSS. So this is a deterministic
// watch on the EAGER JS path, not a payload total. Bytes are a proxy for parse+hydrate,
// which — because the service worker serves /_astro/ cache-first — is the cost that
// actually RECURS per launch.
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
const REPO = path.join(HERE, '..', '..');
const DIST = path.join(HERE, '..', 'dist');
const LEDGER_PATH = path.join(HERE, '..', 'route-budget.json');
const HISTORY_PATH = path.join(HERE, '..', 'route-budget.history.md');
const HISTORY_ANCHOR = '<!-- resets: newest first, below this line -->';
const FRAGMENT_DIR = path.join(HERE, '..', 'route-budget.d');

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

// A route's ceiling starts this far above its soft target, and a reset that moves the
// ceiling (`--ceiling`) puts it back there. The owner set 10% on 2026-09-29: room for weeks
// of growth, so the ceiling is a decision made rarely rather than a ritual every two days.
export const CEILING_PCT = 0.1;

// How much eager JS a PR may add to a route without a word, as long as the route stays at or
// under its soft target. The owner set 2KB: 8 of the Studio's last 10 raises before the switch
// were under it (the two over were +2,220 and +5,202 bytes).
export const PR_ALLOWANCE_BYTES = 2048;

export const METRICS = ['eagerJsGz', 'htmlRaw'];

const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
export const ceilingFor = (soft) => soft + Math.round(soft * CEILING_PCT);

// Static imports in a minified chunk: `import{a}from"./x.js"`, `import"./x.js"`,
// `export{b}from"./x.js"`. Not `import("./x.js")`: the `(` never matches.
const STATIC_IMPORT = /(?<![\w$.])(?:import|export)\s*(?:[^'"()]*?\bfrom\s*)?["']\.\/([A-Za-z0-9._-]+\.js)["']/g;

/**
 * A route's EAGER JS: every `/_astro/*.js` referenced in its HTML and, transitively, every
 * chunk those import statically — all of which the browser fetches before the route is
 * interactive. It does NOT follow dynamic `import()`, which is the whole point of a lazy
 * boundary.
 */
function measure(routeHtml, dist = DIST) {
	const html = fs.readFileSync(path.join(dist, routeHtml), 'utf8');
	const direct = [...new Set((html.match(/\/_astro\/[A-Za-z0-9._-]+\.js/g) || []).map((r) => r.slice('/_astro/'.length)))];
	const seen = new Set(direct);
	const queue = [...direct];
	let eagerJsGz = 0;
	while (queue.length) {
		const name = queue.pop();
		const file = path.join(dist, '_astro', name);
		// A referenced chunk that is not on disk is a BROKEN BUILD, and skipping it would
		// under-count — which this gate would then report as "STALE, ratchet it down",
		// laundering the breakage into a smaller committed budget. Fail loudly instead.
		if (!fs.existsSync(file)) {
			throw new Error(`check-route-budget: ${routeHtml} needs /_astro/${name}, which is not in dist/ — the build is broken, not smaller.`);
		}
		const src = fs.readFileSync(file);
		eagerJsGz += zlib.gzipSync(src, { level: 6 }).length;
		for (const m of src.toString('utf8').matchAll(STATIC_IMPORT)) {
			if (!seen.has(m[1])) {
				seen.add(m[1]);
				queue.push(m[1]);
			}
		}
	}
	return { eagerJsGz, htmlRaw: Buffer.byteLength(html), chunks: seen.size };
}

/**
 * Compare one route's measurement against its soft target and ceiling. PURE — no fs, no
 * dist — so it is unit-testable without a built site (the docs test tier runs before
 * `npm run build`, so a dist-dependent test would silently skip in CI).
 *
 * Returns { problems, warnings }: problems fail the build, warnings print and pass.
 */
export function evaluateRoute(route, actual, budget, slackPct = STALE_SLACK_PCT) {
	const problems = [];
	const warnings = [];
	for (const metric of METRICS) {
		const { soft, hard } = budget[metric] ?? {};
		const got = actual[metric];
		if (typeof soft !== 'number' || typeof hard !== 'number' || typeof got !== 'number') continue;
		if (got > hard) {
			problems.push(
				`${route} ${metric}: ${kb(got)} EXCEEDS its ceiling ${kb(hard)} (soft ${kb(soft)}, +${kb(got - hard)} past the ceiling).\n` +
					`    Give the bytes back. Raising a ceiling is the owner's decision, made rarely and in its own PR\n` +
					`    (\`npm run route-budget:rebaseline -- --raise --ceiling --reason "..."\` after the owner's OK).`,
			);
		} else if (got > soft) {
			warnings.push(`${route} ${metric}: ${kb(got)} is ${kb(got - soft)} over its soft target ${kb(soft)}; ${kb(hard - got)} left before the ceiling ${kb(hard)}.`);
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
 * The bytes of growth a PR may add to a route without declaring them: up to
 * PR_ALLOWANCE_BYTES, and only the part that stays at or under soft. PURE.
 */
export const freeBytes = (base, soft, allowance = PR_ALLOWANCE_BYTES) => Math.max(0, Math.min(allowance, soft - base));

/**
 * Hold one route's growth against `main` to the allowance. PURE. `declared` is the bytes
 * this PR's explanation files declare for the route (`studio: +5123`). Returns
 * { problems, line }.
 */
export function evaluateAllowance(route, actual, base, soft, declared = 0, allowance = PR_ALLOWANCE_BYTES) {
	if (typeof actual?.eagerJsGz !== 'number' || typeof base?.eagerJsGz !== 'number' || typeof soft !== 'number') {
		return { problems: [], line: `${route} eagerJsGz: no main number to compare against` };
	}
	const delta = actual.eagerJsGz - base.eagerJsGz;
	const owed = delta - freeBytes(base.eagerJsGz, soft, allowance);
	const line = `${route} eagerJsGz ${delta >= 0 ? '+' : '-'}${Math.abs(delta)} bytes vs main${owed > 0 ? `, ${owed} to declare (declared ${declared})` : ''}`;
	if (owed > 0 && declared < owed) {
		return {
			line,
			problems: [
				`${route} eagerJsGz: this PR adds ${delta} bytes of eager JS vs main, and ${owed} of them are not free\n` +
					`    (a PR gets up to ${allowance} bytes, and only while the route stays at or under soft ${soft}).\n` +
					`    Give bytes back, or add docs/route-budget.d/<slug>.md to this PR with the line \`${route}: +${owed}\`\n` +
					`    and a sentence on what grew and why. One file per PR; the next reset folds it into the history.`,
			],
		};
	}
	return { problems: [], line };
}

/**
 * Per-route byte declarations in explanation files: lines like `studio: +5123`. A file
 * counts only if it also says something besides declarations. PURE.
 */
export function parseDeclarations(text) {
	const out = {};
	let prose = false;
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		const m = line.match(/^[-*]?\s*`?([a-z][a-z0-9-]*):\s*\+(\d+)`?\s*$/);
		if (m) out[m[1]] = (out[m[1]] || 0) + Number(m[2]);
		else if (line) prose = true;
	}
	return prose ? out : {};
}

/** Declarations from the explanation files this PR ADDS, relative to `baseSha`. */
function addedDeclarations(baseSha) {
	const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=A', baseSha, 'HEAD', '--', 'docs/route-budget.d/'], {
		cwd: REPO,
		encoding: 'utf8',
	});
	const totals = {};
	for (const f of out.split('\n')) {
		if (!/^docs\/route-budget\.d\/[^/]+\.md$/.test(f) || f.endsWith('/README.md')) continue;
		for (const [route, n] of Object.entries(parseDeclarations(fs.readFileSync(path.join(REPO, f), 'utf8')))) {
			totals[route] = (totals[route] || 0) + n;
		}
	}
	return totals;
}

/** Explanation files waiting to be folded into the history by the next reset. */
function pendingFragments() {
	if (!fs.existsSync(FRAGMENT_DIR)) return [];
	return fs
		.readdirSync(FRAGMENT_DIR)
		.filter((f) => f.endsWith('.md') && f !== 'README.md')
		.sort()
		.map((f) => ({ file: path.join(FRAGMENT_DIR, f), name: f, text: fs.readFileSync(path.join(FRAGMENT_DIR, f), 'utf8').trim() }));
}

/**
 * The resets to make. PURE. Lowering a stale soft target is routine. Raising soft needs
 * `raise` (the owner's OK), and never past the ceiling unless `ceiling` (also the owner's
 * OK) moves the ceiling to CEILING_PCT above the new soft target.
 */
export function rebaseline(ledgerRoutes, measured, { slackPct = STALE_SLACK_PCT, raise = false, ceiling = false } = {}) {
	const changes = [];
	const refused = [];
	for (const [route, budget] of Object.entries(ledgerRoutes)) {
		for (const metric of METRICS) {
			const { soft, hard } = budget[metric] ?? {};
			const got = measured[route]?.[metric];
			if (typeof soft !== 'number' || typeof got !== 'number') continue;
			const change = { route, metric, from: soft, to: got, hardFrom: hard, hardTo: hard };
			if (got > soft) {
				if (!raise) refused.push({ ...change, why: 'a raise needs the owner\'s OK, then --raise' });
				else if (got > hard && !ceiling) refused.push({ ...change, why: 'it is past the ceiling; moving a ceiling needs the owner\'s OK, then --ceiling' });
				else changes.push(ceiling ? { ...change, hardTo: Math.max(hard, ceilingFor(got)) } : change);
			} else if (got < soft - Math.round(soft * slackPct)) {
				// A banked win pulls the ceiling down with it, so the gap stays CEILING_PCT.
				changes.push({ ...change, hardTo: Math.min(hard, ceilingFor(got)) });
			}
		}
	}
	return { changes, refused };
}

/** The newest history row per route/metric: { soft, hard }. PURE. */
export function newestHistory(history) {
	const at = history.indexOf(HISTORY_ANCHOR);
	const end = history.indexOf('\n## ', at);
	const section = history.slice(at, end === -1 ? undefined : end);
	const out = {};
	for (const m of section.matchAll(/^\| ([a-z][a-z0-9-]*) \| (eagerJsGz|htmlRaw) \| \d+ \| (\d+) \| [^|]+ \| (\d+) \|$/gm)) {
		const key = `${m[1]}.${m[2]}`;
		if (!(key in out)) out[key] = { soft: Number(m[3]), hard: Number(m[4]) };
	}
	return out;
}

function writeReset(ledger, changes, reason) {
	for (const c of changes) ledger.routes[c.route][c.metric] = { soft: c.to, hard: c.hardTo };
	fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n');

	let base = 'unknown';
	try {
		base = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		// Not a git checkout (a tarball build): the entry says "unknown" rather than failing.
	}
	const date = new Date().toISOString().slice(0, 10);
	const signed = (n) => `${n >= 0 ? '+' : '-'}${Math.abs(n)}`;
	const rows = changes.map((c) => `| ${c.route} | ${c.metric} | ${c.from} | ${c.to} | ${signed(c.to - c.from)} | ${c.hardTo} |`);
	// Fold only the explanation files that declare a route this reset RAISES; a reset that
	// only lowers a stale target leaves them for the raise they explain.
	const raised = changes.filter((c) => c.metric === 'eagerJsGz' && c.to > c.from);
	const raisedRoutes = new Set(raised.map((c) => c.route));
	const fragments = pendingFragments().filter((f) => Object.keys(parseDeclarations(f.text)).some((r) => raisedRoutes.has(r)));
	const declared = {};
	for (const f of fragments) for (const [r, n] of Object.entries(parseDeclarations(f.text))) declared[r] = (declared[r] || 0) + n;
	const accounting = raised.length
		? `Of the eager-JS raises, declared in explanation files: ${raised.map((c) => `${c.route} ${declared[c.route] || 0} of ${c.to - c.from} bytes`).join('; ')}.\n\n`
		: '';
	const folded = fragments.length
		? `Explanation files folded in:\n\n${fragments.map((f) => `- **${f.name}** — ${f.text.replace(/\s*\n\s*/g, ' ')}`).join('\n')}\n\n`
		: '';
	const entry =
		`### ${date} — measured on the built tree at ${base}\n\n${reason}\n\n` +
		`| Route | Metric | Soft before | Soft after | Change | Ceiling after |\n|---|---|---|---|---|---|\n` +
		rows.join('\n') +
		'\n\n' +
		accounting +
		folded;
	const history = fs.readFileSync(HISTORY_PATH, 'utf8');
	const at = history.indexOf(HISTORY_ANCHOR);
	if (at === -1) throw new Error(`check-route-budget: ${HISTORY_PATH} has lost its "${HISTORY_ANCHOR}" line.`);
	const cut = at + HISTORY_ANCHOR.length + 1;
	fs.writeFileSync(HISTORY_PATH, history.slice(0, cut) + '\n' + entry + history.slice(cut).replace(/^\n+/, ''));
	for (const f of fragments) fs.unlinkSync(f.file);
}

/** A reset measured on a branch behind main would bake in a stale number. */
function behindMain() {
	try {
		execFileSync('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], { cwd: REPO, stdio: 'ignore' });
		return false;
	} catch (e) {
		return e.status === 1; // 1 = not an ancestor; anything else (no origin/main) is not a refusal
	}
}

/** The numbers this PR's ledger raises over the base's. */
function ledgerRaises(baseSha, ledger) {
	let base;
	try {
		base = JSON.parse(execFileSync('git', ['show', `${baseSha}:docs/route-budget.json`], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
	} catch {
		return [];
	}
	const out = [];
	for (const [route, b] of Object.entries(ledger.routes)) {
		for (const metric of METRICS) {
			for (const key of ['soft', 'hard']) {
				const was = base.routes?.[route]?.[metric]?.[key];
				const now = b[metric]?.[key];
				if (typeof was === 'number' && typeof now === 'number' && now > was) out.push(`${route} ${metric} ${key} ${was} -> ${now}`);
			}
		}
	}
	return out;
}

function summary(markdown) {
	if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
}

function main() {
	const args = process.argv.slice(2);
	const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));

	// `--measure <dist>`: print one build's numbers as JSON. measure-route-base.sh runs this
	// against a build of `main`, and the gate below reads it back as the per-PR baseline.
	if (args[0] === '--measure') {
		const dist = path.resolve(args[1] || DIST);
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
	const measured = {};
	for (const [route, budget] of Object.entries(ledger.routes)) measured[route] = measure(budget.html);

	if (args.includes('--rebaseline')) {
		const i = args.indexOf('--reason');
		const reason = i === -1 ? '' : (args[i + 1] || '').trim();
		if (!reason) {
			process.stderr.write('route-budget:rebaseline needs --reason "<what grew or shrank, and why>".\n');
			process.exit(1);
		}
		if (behindMain()) {
			process.stderr.write('route-budget:rebaseline: this branch is behind origin/main, so its numbers are stale. Rebase first.\n');
			process.exit(1);
		}
		const { changes, refused } = rebaseline(ledger.routes, measured, { raise: args.includes('--raise'), ceiling: args.includes('--ceiling') });
		for (const c of refused) process.stdout.write(`  NOT changed: ${c.route} ${c.metric} ${c.from} -> ${c.to}: ${c.why}.\n`);
		if (!changes.length) {
			const waiting = pendingFragments().length;
			process.stdout.write(`route-budget:rebaseline — nothing to reset${waiting ? `; ${waiting} explanation file(s) wait for the next reset` : ''}.\n`);
			return;
		}
		writeReset(ledger, changes, reason);
		for (const c of changes) process.stdout.write(`  ${c.route} ${c.metric}: soft ${c.from} -> ${c.to}, ceiling ${c.hardTo}\n`);
		process.stdout.write('Wrote docs/route-budget.json and docs/route-budget.history.md. Commit both, in a PR of their own.\n');
		return;
	}

	const problems = [];
	const warnings = [];
	const lines = [`  ${'route'.padEnd(16)} ${'metric'.padEnd(10)} ${'measured'.padStart(9)} ${'soft'.padStart(9)} ${'ceiling'.padStart(9)}`];
	for (const [route, budget] of Object.entries(ledger.routes)) {
		const actual = measured[route];
		const r = evaluateRoute(route, actual, budget);
		problems.push(...r.problems);
		warnings.push(...r.warnings);
		for (const metric of METRICS) {
			const { soft, hard } = budget[metric] ?? {};
			if (typeof soft !== 'number') continue;
			lines.push(`  ${route.padEnd(16)} ${metric.padEnd(10)} ${kb(actual[metric]).padStart(9)} ${kb(soft).padStart(9)} ${kb(hard).padStart(9)}`);
		}
		lines.push(`  ${route.padEnd(16)} ${'chunks'.padEnd(10)} ${String(actual.chunks).padStart(9)}`);
	}

	// The per-PR allowance needs main's numbers, which exist only when something built main
	// first: CI does on pull_request (measure-route-base.sh). Without them, say so.
	const basePath = process.env.ROUTE_BUDGET_BASE_JSON;
	let allowance = 'per-PR allowance: NOT checked (no main build to compare against; CI checks it on pull requests).';
	if (basePath && fs.existsSync(basePath)) {
		const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
		const declared = addedDeclarations(process.env.ROUTE_BUDGET_BASE_SHA || 'origin/main');
		const rows = [];
		for (const [route, budget] of Object.entries(ledger.routes)) {
			const r = evaluateAllowance(route, measured[route], base[route], budget.eagerJsGz?.soft, declared[route] || 0);
			problems.push(...r.problems);
			rows.push(r.line);
		}
		allowance = `per-PR allowance:\n${rows.map((l) => `    ${l}`).join('\n')}`;
	}
	// A PR that RAISES a number needs the owner's OK. Nothing here can prove the OK was given,
	// so say it where the owner looks before approving: the log and the summary page.
	const baseSha = process.env.ROUTE_BUDGET_BASE_SHA;
	if (baseSha) {
		for (const r of ledgerRaises(baseSha, ledger)) {
			warnings.push(`${r} — this PR RAISES the budget; it needs the owner's OK and belongs in a reset PR of its own.`);
		}
	}
	lines.push('', `  ${allowance}`);
	summary(
		`### Route budget\n\n${problems.length ? `❌ ${problems.length} problem(s)\n\n${problems.map((p) => `- ${p.replace(/\n\s*/g, ' ')}`).join('\n')}` : '✅ within budget'}\n\n` +
			`${warnings.map((w) => `- ⚠ ${w}`).join('\n')}\n\n\`\`\`\n${lines.join('\n')}\n\`\`\``,
	);

	for (const w of warnings) process.stdout.write(`⚠ check:route-budget — ${w}\n`);
	if (problems.length) {
		process.stderr.write(`check-route-budget FAILED — ${problems.length} problem(s):\n`);
		for (const p of problems) process.stderr.write(`  • ${p}\n`);
		process.stderr.write('\nMeasured:\n' + lines.join('\n') + '\n');
		process.exit(1);
	}
	process.stdout.write(`✓ check:route-budget — ${Object.keys(ledger.routes).length} route(s) under their ceilings.\n`);
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
