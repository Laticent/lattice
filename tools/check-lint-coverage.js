#!/usr/bin/env node
/**
 * Lint-coverage gate — asks what Biome ACTUALLY checks, never how the config is spelled.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A CONFIG PARSER (#1235, split out of #1232).
 * A first attempt gated the SYNTAX of `biome.jsonc`: every `!` entry had to carry a
 * prose class and match at least one tracked file. It was removed before merge because
 * an adversarial pass measured nine ways to un-lint real source that it could not see —
 * and one legitimate edit that it wrongly blocked. Two of the nine need no config edit
 * at all, and one is the incident the rule was born from walking straight back in: the
 * comment is unverifiable prose, so `"!docs/src/components/ui"` under the single word
 * `vendor` passes every check a syntax gate can make.
 *
 * The incident is not hypothetical. A one-line `.gitignore` addition shipped in #1232
 * (`docs/src/components/site/`) silently removed 14 tracked source files from lint, and
 * `biome.jsonc` was never touched. Nothing noticed for a merge cycle. That line is test
 * case one below.
 *
 * THREE ARMS, because no one of them covers the table:
 *
 *   1. COVERAGE BASELINE. The set of tracked, lintable files Biome does NOT process is
 *      committed and exceed-only. Catches everything that moves the file set — a
 *      `.gitignore` line, a deleted POSITIVE include, an added `!` entry however it is
 *      spelled, a shadowing second config.
 *
 *   2. SCANNED vs CHECKED. Biome's own tally, compared against the file list it just
 *      printed. `files.maxSize` is the case that needs this: an oversized file stays in
 *      "Files processed" — so arm 1 still counts it covered — while "Checked 0 files"
 *      admits nothing was read. It warns rather than errors, so `npm run lint` exits 0.
 *
 *   3. TEETH PROBE. A file carrying known violations is written into every DIRECTORY ×
 *      LANGUAGE that holds a checked file — 245 targets against 199 directories here — and
 *      Biome must report every rule in every one. Catches the tricks that leave the file
 *      count flat or higher: `overrides[].linter.enabled: false` (whether scoped by path or
 *      by extension), a `linter.includes` allowlist, `recommended: false`.
 *
 * Plus a fold-in rather than a fourth arm: a file carrying `biome-ignore-all` is checked and
 * reports nothing, so it is subtracted from the covered set and lands in arm 1's ratchet.
 *
 * None of the three needs a glob engine. That is deliberate: the removed gate's `matchesLintPattern`
 * was a hand-rolled regex builder, broken once during its own review, and its false
 * positive would have blocked `pre-push` for everyone with HARD RULE #14 forbidding the
 * `--no-verify` escape. Here the escape hatch is `npm run lint:coverage:bless`, which
 * leaves a reviewable diff instead of an instruction to delete a live exclusion.
 *
 * RESIDUALS, stated because they are real. An independent checker measured each of these
 * green, and the first draft of this header claimed only the first:
 *
 *   • A FILE-scoped `overrides[]` entry (`"includes":
 *     ["docs/src/components/studio/StudioShell.tsx"], "linter": {"enabled": false}`) evades
 *     the probe, because the probe beside it still reports. Closing it needs a probe per
 *     FILE — mutating every tracked source file on every push. Directory × language is
 *     where the cost curve turns.
 *   • A config pattern written against `lint-teeth-probe-*` defeats arm 3. Randomizing the
 *     rest of the name stops the ACCIDENTS (`"!**\/*.tmp.js"` is ordinary-looking tempfile
 *     hygiene, and it used to silence the whole repo while every probe reported); it does
 *     not stop someone who reads this file and writes a pattern against the prefix.
 *   • `"rules": {"recommended": false}` while hand-preserving the probe's four rules AT
 *     ERROR SEVERITY leaves arm 3 satisfied and everything else off. Three rules across two
 *     groups for the JS family makes it an odd thing to write by accident; it is not
 *     impossible to write on purpose. (Downgrading a whole rule GROUP to "warn"/"info" —
 *     the far easier edit, and the one that also makes `npm run lint` exit 0 — is caught:
 *     `diffProbes` counts only `severity: "error"`.)
 *   • This gate needs a git checkout — it asks `git ls-files` what is tracked. It cannot
 *     run in the extracted `git archive` tree that `biome.jsonc` recommends for counting.
 *   • SIGKILL leaves probe files behind; nothing can catch it. A survivor is untracked,
 *     says in its own header to delete it, and fails the next `npm run lint` on its own
 *     `debugger;` — loud rather than silent. Do NOT gitignore the probe name to tidy that
 *     up: `useIgnoreFile` is on, so an ignored probe is skipped and every target reads as
 *     silent.
 *
 * The shape of all five: they are things someone does deliberately, with the edit visible
 * in a diff. What the gate is FOR is the accident — the `.gitignore` line that shipped in
 * #1232 — and the plausible-looking config entry nobody reads closely.
 *
 * WATCHED_EXTENSIONS is hardcoded ON PURPOSE. Deriving it from `files.includes` would make
 * attack #4 — deleting the positive `"**\/*.ts"` line, which drops 361 files — invisible,
 * because the gate would stop watching exactly what the config stopped checking. The one
 * config read below runs the OTHER way: it fails when the config covers a language this
 * list does not watch, which can only widen the gate, never narrow it.
 *
 * Read-only apart from the probe files, which are written and removed inside one call.
 * Background: engineering/decisions/2026-07-28-lint-exclusions-and-off-studio-back.md.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

/**
 * Extensions whose tracked files MUST be linted. Hardcoded — see the header.
 *
 * `jsonc` is deliberately absent. The repo's only `.jsonc` file is `biome.jsonc`, which
 * Biome processes because it is its own config, NOT because `files.includes` asks for it —
 * so a `.jsonc` probe beside it is skipped entirely while the config itself is checked.
 * Watching the extension produced a permanent, meaningless failure on nothing. (An earlier
 * version of this note said `biome.jsonc` "appears in the processed list". It no longer
 * does — `collectCoverage` keeps only rows it asked about — and that false premise was what
 * licensed `probeTargets` to skip an unprobed language in silence. Found by the independent
 * checker.) If a real `.jsonc` source file is ever added to `files.includes`,
 * `unwatchedIncludeExtensions` below fails and tells you to add it here; that is the
 * safety valve for this omission.
 */
const WATCHED_EXTENSIONS = ['js', 'mjs', 'cjs', 'json', 'ts', 'tsx'];

const BASELINE_REL = 'test/lint-coverage/baseline.json';

/**
 * The seven classes an exclusion may claim — the same vocabulary `biome.jsonc` uses, and
 * the one #1223 asked for. Recording the class IN THE BASELINE is what makes this list a
 * house `SANCTIONED_*` allowlist rather than a second reason-free exclusion list, which is
 * the exact defect #1223 was filed about ("29 exclusions and zero reasons"). An earlier
 * draft told the author to "say in the PR" instead — strictly less durable and less
 * discoverable than the prose it replaced, and the entries this gate EXISTS to produce are
 * by construction the ones whose path does not explain them. Raised by the Munger inversion.
 *
 * This is not the removed syntax gate returning. That one validated the spelling of a
 * PATTERN and could be walked around by nine routes that never touched a pattern. This
 * validates a field on a MEASURED set: whatever route removes a file from coverage, the
 * file lands here and has to carry a class.
 */
const EXCLUSION_CLASSES = ['dependency', 'build-output', 'transient', 'vendor', 'not-code', 'generated', 'unparseable'];

/** Biome's stdout is parsed in three places and its JSON reporter self-describes as unstable. */
const VERIFIED_BIOME = '2.4.15';
const CONFIG_REL = 'biome.jsonc';

/**
 * Probe filename prefix. The rest of the name is RANDOM per run, which buys three things
 * a fixed name cost:
 *
 *   • Two gate runs at once no longer fight. With one shared name, a `npm run build` in
 *     another terminal deleted this run's probes mid-flight and the gate failed at
 *     pre-push pointing at `biome.jsonc`, where nothing was wrong.
 *   • A published name is a target. `"linter": {"includes": ["**\/lint-teeth-probe.tmp.js"]}`
 *     — issue #1235's own attack #3 — silenced the whole repo while every probe still
 *     reported. So did `"!**\/*.tmp.js"`, which reads as ordinary tempfile hygiene.
 *   • Nothing this gate writes can collide with a file someone already has.
 *
 * It does NOT make the probe untargetable: a pattern written against this prefix still
 * works. That is a deliberate, visible config edit rather than an accident, and accidents
 * are what this gate is for. Stated again in the header's residual list.
 */
const PROBE_PREFIX = 'lint-teeth-probe-';

/**
 * One probe body per language, because a probe is only evidence for the language it is
 * written in. A single `.js` probe let `overrides[{includes: ["**\/*.ts"], linter:
 * {enabled: false}}]` un-lint 519 tracked files with every arm green — the likeliest real
 * form of the attack ("we'll turn TS lint back on later"), and quieter than the
 * file-scoped override the first draft called the only residual.
 *
 * Each body is padded past 80 bytes: `files.maxSize` silences by BYTE COUNT, and a probe
 * small enough to slip under a limit would report while real source went unchecked.
 */
const PROBE_HEADER = [
	'// Teeth probe for tools/check-lint-coverage.js — written and removed inside one run.',
	'// If you are reading this in a committed file, a gate run was killed. Delete it.',
].join('\n');

const PROBE_JS = `${PROBE_HEADER}\ndebugger;\nconst probeEq = String(1) == "1";\nif (true) { console.log(probeEq); }\n`;
// JSON has no statements to violate, so the probe is a duplicate key. `noDuplicateObjectKeys`
// is `recommended` and fires on both .json and .jsonc.
const PROBE_JSON = `{ "${'x'.repeat(60)}": 1, "lattice-lint-teeth-probe": 1, "lattice-lint-teeth-probe": 2 }\n`;

/**
 * Rules each language's probe must report. THREE for the JS family, spanning two groups —
 * a config that keeps exactly the probe's rules on while switching `recommended` off is
 * the remaining way past this arm, and it gets less plausible the more groups it has to
 * hand-preserve. It is not impossible; see the header's residual list.
 */
const PROBE_LANGUAGES = {
	js: { source: PROBE_JS, rules: ['lint/suspicious/noDebugger', 'lint/suspicious/noDoubleEquals', 'lint/correctness/noConstantCondition'] },
	mjs: { source: PROBE_JS, rules: ['lint/suspicious/noDebugger', 'lint/suspicious/noDoubleEquals', 'lint/correctness/noConstantCondition'] },
	cjs: { source: PROBE_JS, rules: ['lint/suspicious/noDebugger', 'lint/suspicious/noDoubleEquals', 'lint/correctness/noConstantCondition'] },
	ts: { source: PROBE_JS, rules: ['lint/suspicious/noDebugger', 'lint/suspicious/noDoubleEquals', 'lint/correctness/noConstantCondition'] },
	tsx: { source: PROBE_JS, rules: ['lint/suspicious/noDebugger', 'lint/suspicious/noDoubleEquals', 'lint/correctness/noConstantCondition'] },
	json: { source: PROBE_JSON, rules: ['lint/suspicious/noDuplicateObjectKeys'] },
};

/**
 * A whole-file suppression. `biome-ignore-all lint: …` at the top of a file leaves it in
 * every count — Biome scans it, checks it, and reports nothing — so all three arms read it
 * as covered. Treating a suppressed file as UNCOVERED folds it into the same exceed-only
 * ratchet: adding one fails until it is blessed. Per-line `biome-ignore` is untouched;
 * that is a legitimate, reviewable, single-rule escape.
 *
 * ONLY `lint` counts. `biome-ignore-all format` and `... assist` leave the file fully
 * linted, and matching them made the gate demand a bless for a file Biome was still
 * checking — the same "ratchet a real file out of the ratchet" failure the existsSync fix
 * exists to prevent, through a different door. `assist` is realistic here: `lint:fix`
 * includes import sorting. Found by the independent checker.
 *
 * The trailing `:` is not decoration — it is Biome's grammar, and requiring it is what
 * keeps prose out of the match. Measured on 2.4.15: `// biome-ignore-all lint` suppresses
 * NOTHING (both violations still reported), while `// biome-ignore-all lint: reason`
 * suppresses the file. Without the colon the pattern hit an ordinary JSDoc block that
 * merely *documented* the syntax, and then the gate's own remedy — `--bless` — would have
 * written a fully-linted source file into the baseline permanently, with the stale arm
 * never firing to prune it. A benign prose edit, converted by the error message into a
 * silent hole. Found by the red team.
 *
 * The token is assembled at runtime so this file — which is itself linted — cannot match
 * its own pattern. Candidates are then CONFIRMED BY EFFECT (`confirmSuppressed`), so a
 * string literal that happens to contain the whole grammar still cannot false-positive.
 */
const SUPPRESS_ALL = new RegExp(
	String.raw`(?:^|//|/\*|\*)\s*biome-ignore` +
		'-all' +
		String.raw`\s+lint\b[^\n:]*:`,
	'm',
);

/**
 * A watched language with no probe body is an EXTENSION-SCOPED BYPASS waiting to happen:
 * `probeTargets` skips it, so `overrides[{includes: ["**\/*.css"], linter: {enabled:
 * false}}]` would be invisible exactly the way the `.ts` case was before round one. The
 * widening guard tells you to add a language to WATCHED_EXTENSIONS and says nothing about
 * this table, so the two lists are wired together here rather than by hope. Found by the
 * independent checker.
 */
const unprobed = WATCHED_EXTENSIONS.filter((e) => !PROBE_LANGUAGES[e]);
if (unprobed.length) {
	throw new Error(
		`check-lint-coverage: WATCHED_EXTENSIONS has no PROBE_LANGUAGES body for: ${unprobed.join(', ')}. ` +
			'Add one (source + the rules it must trigger), or the teeth probe silently skips that language.',
	);
}

// ── PURE PREDICATES (exported and unit-tested, like every sibling gate) ────────

/**
 * Pull the file list out of `biome check --verbose`. The block is
 * `i Files processed:`, a whitespace-only line, then `  - <path>` rows. Any other
 * non-blank line (the next ` VERBOSE ` banner, `! The list is empty.`) ends it.
 */
function parseFilesProcessed(output) {
	const files = [];
	let inBlock = false;
	for (const line of String(output).split('\n')) {
		if (/Files processed:\s*$/.test(line)) {
			inBlock = true;
			continue;
		}
		if (!inBlock) continue;
		const row = /^\s*-\s+(\S.*?)\s*$/.exec(line);
		if (row) {
			files.push(row[1]);
			continue;
		}
		if (line.trim() === '') continue;
		inBlock = false;
	}
	return files;
}

/**
 * Did Biome answer the question at all? Distinguishes "checked nothing" — a real answer,
 * and what `files.maxSize: 60` produces — from "never started", which a config error
 * produces and which would otherwise read as every file losing coverage at once.
 */
function sawFilesProcessedBlock(output) {
	return /Files processed:\s*$/m.test(String(output));
}

/**
 * The `Checked N files` tally. Biome distinguishes SCANNED from CHECKED, and the gap is a
 * bypass: `files.maxSize` leaves a file in the verbose "Files processed" list and then
 * checks zero of them. Comparing the two closes that at ANY size threshold — including one
 * tuned to sit above the teeth probe but below a real source file, which the probe alone
 * would miss.
 */
function parseCheckedCount(output) {
	// ANCHORED to column 0, and the LAST match wins. Biome prints its summary at the start
	// of a line; the `--verbose` file list indents every row by two spaces. Unanchored, a
	// tracked file named `Checked 0 files in .js` appeared in that list FIRST and became the
	// answer — a permanent pre-push block that `--bless` could not clear, and in its
	// `Checked 9999 files in .js` form, a way to neutralize this arm and re-open
	// `files.maxSize` as a silent bypass. Found by the red team.
	const matches = [...String(output).matchAll(/^Checked (\d+) files? in /gm)];
	return matches.length ? Number(matches[matches.length - 1][1]) : null;
}

/** Tracked paths whose extension this gate watches. */
function trackedLintable(paths, watched = WATCHED_EXTENSIONS) {
	const suffixes = watched.map((e) => `.${e}`);
	return paths.filter((p) => suffixes.some((s) => p.endsWith(s))).sort();
}

/**
 * One probe per DIRECTORY × LANGUAGE actually present there — 245 targets against 199
 * directories in this repo, so the extension arm is nearly free. Probing only the
 * directory would leave every language but `.js` unguarded.
 */
function probeTargets(processed) {
	const seen = new Set();
	const targets = [];
	for (const p of processed) {
		const ext = path.posix.extname(p).slice(1);
		if (!PROBE_LANGUAGES[ext]) continue;
		const dir = path.posix.dirname(p);
		const key = `${dir} ${ext}`;
		if (seen.has(key)) continue;
		seen.add(key);
		targets.push({ dir, ext });
	}
	return targets.sort((a, b) => a.dir.localeCompare(b.dir) || a.ext.localeCompare(b.ext));
}

/** Files Biome checks but that suppress every rule in themselves — covered in name only. */
function suppressedFiles(processed, readFile) {
	return processed.filter((p) => {
		const body = readFile(p);
		return typeof body === 'string' && SUPPRESS_ALL.test(body);
	});
}

/**
 * Coverage verdict. `newlyUncovered` is the ratchet (source that stopped being linted);
 * `stale` is the anti-rot arm (a baseline entry that is linted again, or gone), which
 * matters for the same reason it does in `SANCTIONED_PREVIEW_BUILDERS`: a list nobody
 * prunes stops describing anything.
 */
function diffCoverage({ lintable, processed, baseline, present = null }) {
	const covered = new Set(processed);
	const uncovered = lintable.filter((p) => !covered.has(p)).sort();
	const sanctioned = new Set(baseline);
	const uncoveredSet = new Set(uncovered);
	// A baseline entry is STALE when it is linted AGAIN — not when its file is merely gone
	// from the worktree. 62 of the 72 entries here are build output, and this gate is a
	// PREFLIGHT that runs BEFORE the steps that regenerate it, so `rm -rf docs/src/lib/lente/dist
	// && npm run build` aborted the build on a baseline that was perfectly correct. The
	// existsSync filter fixed this for linted files and left the excluded half open. Found by
	// the independent checker.
	const gone = (p) => present !== null && !present.has(p);
	return {
		uncovered,
		coveredCount: lintable.length - uncovered.length,
		newlyUncovered: uncovered.filter((p) => !sanctioned.has(p)),
		stale: [...sanctioned].filter((p) => !uncoveredSet.has(p) && !gone(p)).sort(),
	};
}

/**
 * Probes where Biome failed to report every rule that language's body must trigger — i.e.
 * lint is off for that language, in that directory. `probes` is `[{path, ext, dir}]`.
 */
function diffProbes({ probes, diagnostics }) {
	const byFile = new Map();
	for (const d of diagnostics) {
		const file = typeof d.path === 'string' ? d.path : d.location?.path;
		if (typeof file !== 'string') continue;
		// SEVERITY IS PART OF THE EVIDENCE, and leaving it out was the worst hole in the
		// first version. Biome accepts a severity string where a rule-group object goes
		// (`"suspicious": "warn"`), which downgrades every rule in the group — and
		// `biome check` EXITS 0 on warnings and infos. The probe still emitted all three
		// categories, so all three arms passed and printed "teeth confirmed" while nothing
		// in the repo was enforced any more, through CI. "Downgrade to warnings during a
		// migration" is the most ordinary thing anyone writes into a linter config, and it
		// turns `npm run lint` green immediately, which rewards doing it. Only an ERROR is
		// a tooth. Found by the red team.
		if (d.severity !== 'error') continue;
		if (!byFile.has(file)) byFile.set(file, new Set());
		byFile.get(file).add(d.category);
	}
	return probes.filter((probe) => {
		const seen = byFile.get(probe.path);
		return !seen || PROBE_LANGUAGES[probe.ext].rules.some((r) => !seen.has(r));
	});
}

/**
 * The one config read, and it can only WIDEN this gate. Returns extensions the config
 * asks Biome to check that `WATCHED_EXTENSIONS` does not watch — adding `"**\/*.vue"` to
 * `files.includes` without adding `vue` here would leave a whole language unratcheted.
 * Negated entries are ignored; a `!` pattern removes coverage, and removal is the
 * baseline's job.
 */
function unwatchedIncludeExtensions(configText, watched = WATCHED_EXTENSIONS) {
	// Comments out, THEN narrow to the `files.includes` array. Anywhere else — an
	// `overrides[].includes`, a `linter.includes` allowlist, a glob quoted in a trailing or
	// block comment — a pattern grants no coverage, so demanding the extension be watched was
	// a pre-push failure whose only documented remedy made things worse. Found by the
	// independent checker.
	// NARROW FIRST, strip comments second, and never run a comment regex over the whole
	// document — an earlier attempt did, and `//` inside a glob string (`"**\/*.js"` sits one
	// character away) let it eat the middle of the config and silently invent findings.
	const files = /"files"\s*:\s*\{[\s\S]*?"includes"\s*:\s*\[([\s\S]*?)\]/.exec(String(configText));
	if (!files) return [];
	const balanced = (text) => (text.match(/"/g) ?? []).length % 2 === 0;
	const body = files[1]
		.split('\n')
		.map((line) => {
			const at = line.indexOf('//');
			return at >= 0 && balanced(line.slice(0, at)) ? line.slice(0, at) : line;
		})
		.join('\n');
	const found = new Set();
	// Any positive pattern, anywhere in it, that names an extension — `"**\/*.vue"`,
	// `"docs/**\/*.vue"` and `"**\/*.{vue,svelte}"` all count. The first draft matched only
	// the exact token `"**\/*.<ext>"`, so the two other spellings slipped a whole language
	// past the one guard the header calls out.
	for (const m of body.matchAll(/"(!?)([^"]*?)\*\.(?:\{([^}"]+)\}|([A-Za-z0-9]+))"/g)) {
		if (m[1] === '!') continue;
		const exts = m[3] ? m[3].split(',') : [m[4]];
		for (const raw of exts) {
			const ext = raw.trim();
			if (ext && !watched.includes(ext)) found.add(ext);
		}
	}
	return [...found].sort();
}

// ── RUNNERS ───────────────────────────────────────────────────────────────────

function resolveBiome(root) {
	return path.join(root, 'node_modules', '.bin', 'biome');
}

/** The version these parsers were written against — see VERIFIED_BIOME. */
function biomeVersion(biome) {
	const res = spawnSync(biome, ['--version'], { encoding: 'utf8' });
	const m = /(\d+\.\d+\.\d+)/.exec(`${res.stdout ?? ''}${res.stderr ?? ''}`);
	return m ? m[1] : null;
}

function listTracked(root) {
	const out = execFileSync('git', ['ls-files', '-z'], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 1 << 28,
	});
	return out.split('\0').filter(Boolean);
}

/**
 * What Biome processes, asked with the tracked file list passed EXPLICITLY. Explicit
 * paths are still filtered by `files.includes` and by `.gitignore` (both verified against
 * Biome 2.4.15), so the answer is identical to a bare `biome check` — minus the untracked
 * build output a working-directory scan also picks up, which is what made an earlier
 * count wrong by four.
 */
function collectCoverage(root, biome) {
	// Tracked AND present. `git ls-files` reads the index; Biome reads the working tree.
	// Delete a file with `rm` and run the build before staging the deletion — an ordinary
	// mid-work state — and the mismatch reported it as coverage loss, telling the developer
	// to bless a removal into the baseline. That is the exact wrong action: it would ratchet
	// a real file out of the ratchet.
	const lintable = trackedLintable(listTracked(root)).filter((p) =>
		fs.existsSync(path.join(root, p)),
	);
	const res = spawnSync(biome, ['check', '--verbose', '--max-diagnostics=1', ...lintable], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 1 << 28,
	});
	if (res.error) throw new Error(`could not run ${biome}: ${res.error.message}`);
	const output = `${res.stdout}\n${res.stderr}`;
	// Only rows we ASKED about count. The list is parsed out of human-readable stdout, so a
	// tracked filename containing a newline made Biome emit an extra `  - <path>` row and
	// injected a file into the covered set. Intersecting with what we passed in makes a
	// phantom row unrepresentable rather than merely unlikely. (`biome.jsonc` drops out here
	// too — Biome processes its own config unasked — which is correct: it is not in
	// `lintable`, so it was never a coverage question.) Found by the red team.
	const asked = new Set(lintable);
	const processed = parseFilesProcessed(output).filter((p) => asked.has(p));
	// A config error makes Biome print no list at all — which would otherwise read as
	// "every file lost coverage" and bury the real message. An EMPTY list is different:
	// that is Biome answering, and `files.maxSize` is how it happens.
	if (!sawFilesProcessedBlock(output)) {
		throw new Error(
			`biome printed no file list for ${lintable.length} path(s) — it likely failed to start:\n${res.stdout}${res.stderr}`,
		);
	}
	return { lintable, processed, checkedCount: parseCheckedCount(output) };
}

/** `[{dir, ext}]` → `[{path, dir, ext}]`, with a run-unique name. */
function probePaths(targets, token) {
	return targets.map(({ dir, ext }) => {
		const base = `${PROBE_PREFIX}${token}.${ext}`;
		return { path: dir === '.' ? base : path.posix.join(dir, base), dir, ext };
	});
}

/**
 * Write a probe per directory × language, ask Biome, remove them.
 *
 * Cleanup is unconditional across every signal Node lets us intercept — SIGHUP included,
 * because its default disposition terminates WITHOUT unwinding, so a closed terminal or a
 * dropped SSH session during `npm run build` skipped the `finally` and left probes behind.
 * SIGKILL cannot be caught by anyone; a survivor is untracked, carries a header saying to
 * delete it, and fails the next `npm run lint` on its own `debugger;` — self-announcing
 * rather than silent. Do NOT answer that by gitignoring the probe name: `useIgnoreFile` is
 * on, so an ignored probe is skipped by Biome and every directory then reads as silent.
 *
 * Nothing sweeps ANOTHER run's probes. A shared name meant a concurrent `npm run build`
 * deleted this run's files mid-flight and failed the push with a diagnosis pointing at a
 * config that was fine.
 */
function runProbe(root, biome, targets, token = crypto.randomBytes(6).toString('hex')) {
	const probes = probePaths(targets, token);
	const abs = probes.map((p) => path.join(root, p.path));
	const sweep = () => {
		for (const p of abs) fs.rmSync(p, { force: true });
	};
	const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
	const onSignal = () => {
		sweep();
		process.exit(130);
	};
	for (const s of signals) process.once(s, onSignal);
	try {
		for (const [i, p] of abs.entries()) fs.writeFileSync(p, PROBE_LANGUAGES[probes[i].ext].source);
		const maxRules = Math.max(...Object.values(PROBE_LANGUAGES).map((l) => l.rules.length));
		const cap = Math.min(20000, probes.length * maxRules + 100);
		const res = spawnSync(
			biome,
			['check', '--reporter=json', `--max-diagnostics=${cap}`, ...probes.map((p) => p.path)],
			{ cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 },
		);
		if (res.error) throw new Error(`could not run ${biome}: ${res.error.message}`);
		let report;
		try {
			report = JSON.parse(res.stdout);
		} catch {
			throw new Error(`biome did not return JSON for the teeth probe:\n${res.stdout}${res.stderr}`);
		}
		if (report.summary?.diagnosticsNotPrinted) {
			throw new Error(
				`biome truncated ${report.summary.diagnosticsNotPrinted} probe diagnostic(s); raise the --max-diagnostics cap`,
			);
		}
		return { probes, silent: diffProbes({ probes, diagnostics: report.diagnostics ?? [] }) };
	} finally {
		for (const s of signals) process.removeListener(s, onSignal);
		sweep();
	}
}

function readBaseline(root) {
	const file = path.join(root, BASELINE_REL);
	if (!fs.existsSync(file)) return null;
	return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeBaseline(root, { uncovered, existing = [] }) {
	const file = path.join(root, BASELINE_REL);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	// Carry a known class forward; a NEW entry gets null and fails `check` until a human
	// names it. Nothing here infers a class — inference is what made the removed gate a lie.
	const known = new Map(existing.map((e) => [e?.path ?? e, e?.class ?? null]));
	const entries = uncovered.map((p) => ({ path: p, class: known.get(p) ?? null }));
	const body = {
		version: 1,
		// Deliberately NOT a count of what IS checked. That number moves every time anyone
		// adds a source file, so recording it would make an unrelated re-bless a condition
		// of every PR — a tax with no signal, since a file ENTERING coverage is never the
		// failure. The excluded set only moves when an exclusion does.
		note: 'Tracked, lintable files Biome does NOT check, each with the exclusion class it claims. Exceed-only: a file LEAVING coverage fails `npm run lint:coverage` until it is recorded here. Refresh with `npm run lint:coverage:bless`; a new entry lands with a null class and keeps failing until you name one of: dependency, build-output, transient, vendor, not-code, generated, unparseable. Gate + rationale: tools/check-lint-coverage.js.',
		uncovered: entries,
	};
	fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
	return file;
}

/**
 * A file that suppresses every rule in itself is checked and reports nothing, so all three
 * arms read it as covered. Drop it from the processed set and the existing exceed-only
 * ratchet handles it: adding one fails until it is blessed. Shared by `check` and `bless`
 * so the two can never disagree about what "covered" means.
 */
function dropSuppressed(root, scanned, biome) {
	const read = (p) => {
		try {
			return fs.readFileSync(path.join(root, p), 'utf8');
		} catch {
			return null;
		}
	};
	const candidates = suppressedFiles(scanned, read);
	const suppressed = new Set(candidates.length ? confirmSuppressed(root, biome, candidates, read) : []);
	return { processed: scanned.filter((p) => !suppressed.has(p)), suppressed: [...suppressed] };
}

/**
 * Confirm a regex candidate BY EFFECT rather than trusting the pattern.
 *
 * For each candidate, copy its leading text beside it under a probe name, append a known
 * violation, and ask Biome. A genuine `biome-ignore-all` carries over to the copy and Biome
 * stays quiet; prose that merely resembles one does not, and Biome reports. Only files whose
 * copy is silent are treated as suppressed.
 *
 * This exists because a false positive here is uniquely expensive: the gate's own error
 * message sends the developer to `--bless`, which would write a fully-linted source file
 * into the baseline permanently, with the stale arm never firing to prune it. Costs nothing
 * in the normal case — there are zero candidates today, and the loop does not run.
 */
function confirmSuppressed(root, biome, candidates, read) {
	const jsLike = candidates.filter((p) => PROBE_LANGUAGES[path.posix.extname(p).slice(1)]?.source === PROBE_JS);
	if (!jsLike.length) return [];
	const token = crypto.randomBytes(6).toString('hex');
	const copies = jsLike.map((p) => ({
		origin: p,
		rel: path.posix.join(path.posix.dirname(p), `${PROBE_PREFIX}${token}${path.posix.extname(p)}`),
	}));
	const sweep = () => {
		for (const c of copies) fs.rmSync(path.join(root, c.rel), { force: true });
	};
	try {
		for (const c of copies) {
			// The leading comment region is what carries a whole-file suppression; the rest of
			// the file is irrelevant and might not survive truncation.
			const head = String(read(c.origin) ?? '').split('\n').slice(0, 40).join('\n');
			fs.writeFileSync(path.join(root, c.rel), `${head}\n${PROBE_JS}`);
		}
		const res = spawnSync(
			biome,
			['check', '--reporter=json', `--max-diagnostics=${copies.length * 8 + 100}`, ...copies.map((c) => c.rel)],
			{ cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 },
		);
		let report;
		try {
			report = JSON.parse(res.stdout);
		} catch {
			// Could not confirm — treat every candidate as suppressed. Failing CLOSED here
			// costs a bless; failing open costs the protection this whole fold-in provides.
			return jsLike;
		}
		const noisy = new Set(
			(report.diagnostics ?? [])
				.filter((d) => d.severity === 'error')
				.map((d) => (typeof d.path === 'string' ? d.path : d.location?.path)),
		);
		return copies.filter((c) => !noisy.has(c.rel)).map((c) => c.origin);
	} finally {
		sweep();
	}
}

// ── GATE ──────────────────────────────────────────────────────────────────────

const bullets = (list, limit = 40) => {
	const shown = list.slice(0, limit).map((p) => `    ${p}`);
	if (list.length > limit) shown.push(`    … and ${list.length - limit} more`);
	return shown.join('\n');
};

/**
 * Run both mechanisms. Returns `{ errors, coverage, probe }`; the caller decides how loud
 * to be. `biome` is injectable so the unit tests can drive a synthetic repo that has no
 * `node_modules` of its own.
 */
function check({ root = ROOT, biome = resolveBiome(root) } = {}) {
	const errors = [];

	const configPath = path.join(root, CONFIG_REL);
	if (fs.existsSync(configPath)) {
		const unwatched = unwatchedIncludeExtensions(fs.readFileSync(configPath, 'utf8'));
		if (unwatched.length) {
			errors.push(
				`${CONFIG_REL} asks Biome to check extension(s) this gate does not watch: ${unwatched.join(', ')}.\n` +
					`  Add them to WATCHED_EXTENSIONS in tools/check-lint-coverage.js and re-bless, or those files\n` +
					'  are linted today with nothing holding them there tomorrow.',
			);
		}
	}

	const installed = biomeVersion(biome);
	if (installed && installed !== VERIFIED_BIOME) {
		errors.push(
			`Biome ${installed} is not the version these output parsers were verified against (${VERIFIED_BIOME}).\n` +
				'  This gate regexes `Files processed:` and `Checked N files` out of human-readable stdout and\n' +
				"  reads `--reporter=json`, which Biome itself labels unstable. Re-verify parseFilesProcessed,\n" +
				`  parseCheckedCount and diffProbes against ${installed}, then update VERIFIED_BIOME.\n` +
				'  Without this you get a repo-wide pre-push block diagnosed as "biome failed to start".',
		);
	}
	const { lintable, processed: scanned, checkedCount } = collectCoverage(root, biome);
	// Fail CLOSED. A null tally means the summary line did not parse — a Biome upgrade that
	// reformats it, say — and the first draft simply skipped this arm when that happened,
	// silently removing a mechanism while still printing "lint coverage OK".
	if (checkedCount === null) {
		errors.push(
			"could not read Biome's `Checked N files` summary, so the files.maxSize arm did not run.\n" +
				'  Fix `parseCheckedCount` in tools/check-lint-coverage.js against the current Biome output —\n' +
				'  this arm is not allowed to skip itself quietly.',
		);
	} else if (checkedCount < scanned.length) {
		errors.push(
			`Biome SCANNED ${scanned.length} file(s) and CHECKED only ${checkedCount}.\n` +
				`  ${scanned.length - checkedCount} file(s) were listed and then skipped, so they count as covered\n` +
				'  while nothing looks at them. `files.maxSize` is how this happens: it warns instead of\n' +
				'  erroring, so `npm run lint` still exits 0.',
		);
	}

	const { processed, suppressed } = dropSuppressed(root, scanned, biome);
	const baseline = readBaseline(root);
	if (!baseline) {
		errors.push(
			`missing ${BASELINE_REL} — run \`npm run lint:coverage:bless\` to record the current coverage.`,
		);
		return { errors, coverage: null, probe: null };
	}
	const entries = baseline.uncovered ?? [];
	const badClass = entries.filter((e) => !EXCLUSION_CLASSES.includes(e?.class));
	if (badClass.length) {
		errors.push(
			`${BASELINE_REL} has ${badClass.length} entry/entries with no valid class:\n${bullets(badClass.map((e) => `${e?.path ?? e} → ${JSON.stringify(e?.class ?? null)}`))}\n` +
				`  Edit the baseline and name one of: ${EXCLUSION_CLASSES.join(' · ')}.\n` +
				'  A bare path is the defect #1223 was filed about — the reason has to live with the fact.',
		);
	}
	const coverage = diffCoverage({
		lintable,
		processed,
		baseline: entries.map((e) => e?.path ?? e),
		present: new Set(listTracked(root).filter((p) => fs.existsSync(path.join(root, p)))),
	});

	if (coverage.newlyUncovered.length) {
		errors.push(
			`lint coverage SHRANK — ${coverage.newlyUncovered.length} tracked source file(s) are no longer linted:\n${bullets(coverage.newlyUncovered)}\n` +
				'  Nothing in biome.jsonc has to change for this: one line in .gitignore does it too\n' +
				'  (`vcs.useIgnoreFile` is on), and so does a `biome-ignore-all` comment in the file\n' +
				'  itself. Start with `git diff -- .gitignore biome.jsonc` and the files listed above.\n' +
				'  If the exclusion is deliberate, run `npm run lint:coverage:bless` and name the class in\n' +
				'  the PR (dependency · build-output · transient · vendor · not-code · generated · unparseable).',
		);
	}
	if (coverage.stale.length) {
		errors.push(
			`${BASELINE_REL} is STALE — ${coverage.stale.length} entry/entries are linted again, or gone:\n${bullets(coverage.stale)}\n` +
				'  Run `npm run lint:coverage:bless` to drop them. A list nobody prunes stops describing anything.',
		);
	}
	const probe = runProbe(root, biome, probeTargets(processed));
	if (probe.silent.length) {
		const where = probe.silent.map((p) => `${p.dir}  (*.${p.ext})`);
		// EVERY probe silent is a different diagnosis from SOME. The likeliest cause of a
		// clean sweep is that the probe itself is being skipped — a `.gitignore` line matching
		// its name is enough, since `vcs.useIgnoreFile` is on — and pointing at `overrides[]`
		// there sends the reader to a config where nothing is wrong.
		const total = probe.probes.length;
		const cause =
			probe.silent.length === total
				? `  EVERY probe went quiet, which usually means the PROBE is being skipped rather than the\n` +
					`  linter being off. Check .gitignore and biome.jsonc for anything matching\n` +
					`  \`${PROBE_PREFIX}*\`, then check whether the linter is disabled repo-wide.`
				: '  The file count does not move when this happens, so the coverage baseline cannot see it.\n' +
					'  Look for an `overrides[]` entry that disables the linter or its rules for these paths or\n' +
					'  this extension, a `linter.includes` allowlist, or `files.maxSize` in biome.jsonc.';
		errors.push(
			`the linter is SILENT for ${probe.silent.length} of ${total} checked directory × language target(s).\n` +
				`  A file carrying known violations was written into each and Biome reported nothing for:\n${bullets(where)}\n${cause}`,
		);
	}

	return { errors, coverage, probe, suppressed };
}

/** Record today's coverage as the new floor. The escape hatch, and it leaves a diff. */
function bless({ root = ROOT, biome = resolveBiome(root) } = {}) {
	const { lintable, processed: scanned } = collectCoverage(root, biome);
	const { processed } = dropSuppressed(root, scanned, biome);
	const { uncovered, coveredCount } = diffCoverage({ lintable, processed, baseline: [] });
	writeBaseline(root, { uncovered, existing: readBaseline(root)?.uncovered ?? [] });
	return { uncovered, coveredCount };
}

function main(argv) {
	const root = ROOT;
	const biome = resolveBiome(root);
	if (!fs.existsSync(biome)) {
		process.stderr.write(
			`lint coverage: biome not found at ${path.relative(root, biome)} — run \`npm ci\`.\n`,
		);
		return 1;
	}

	if (argv.includes('--bless')) {
		const { uncovered, coveredCount } = bless({ root, biome });
		process.stdout.write(
			`lint coverage blessed — ${coveredCount} file(s) linted, ${uncovered.length} excluded. Wrote ${BASELINE_REL}.\n`,
		);
		return 0;
	}

	let result;
	try {
		result = check({ root, biome });
	} catch (err) {
		process.stderr.write(`lint coverage FAILED — ${err.message}\n`);
		return 1;
	}
	if (result.errors.length) {
		process.stderr.write(`\nlint coverage FAILED\n\n${result.errors.map((e) => `  ${e}`).join('\n\n')}\n\n`);
		return 1;
	}
	process.stdout.write(
		`lint coverage OK — ${result.coverage.coveredCount} file(s) linted, ${result.coverage.uncovered.length} excluded, teeth confirmed at ${result.probe.probes.length} directory × language target(s).\n`,
	);
	return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
	WATCHED_EXTENSIONS,
	EXCLUSION_CLASSES,
	VERIFIED_BIOME,
	biomeVersion,
	BASELINE_REL,
	CONFIG_REL,
	PROBE_PREFIX,
	PROBE_LANGUAGES,
	SUPPRESS_ALL,
	parseFilesProcessed,
	sawFilesProcessedBlock,
	parseCheckedCount,
	trackedLintable,
	probeTargets,
	suppressedFiles,
	dropSuppressed,
	diffCoverage,
	diffProbes,
	unwatchedIncludeExtensions,
	resolveBiome,
	listTracked,
	collectCoverage,
	probePaths,
	runProbe,
	readBaseline,
	writeBaseline,
	check,
	bless,
	main,
};
