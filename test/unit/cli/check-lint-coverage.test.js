/**
 * The lint-coverage gate (#1235), tested the way the issue specifies: each of the nine
 * measured bypasses that killed the removed SYNTAX gate is a case here, run against a real
 * Biome in a real (tiny) git repo. Rows 1–8 must fire; row 9 — a pattern quoted inside a
 * comment — must not, and neither must the legitimate `!docs/*\/dist` consolidation whose
 * false positive is what made the first gate block `pre-push` on its own first edit.
 *
 * The sandbox is a synthetic repo rather than a copy of this one: a handful of source files
 * makes every attack expressible in milliseconds, where mutating the real config would be
 * slow, serial, and destructive if a case threw halfway through.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const gate = require('../../../tools/check-lint-coverage.js');

const REPO = path.join(__dirname, '..', '..', '..');
const BIOME = gate.resolveBiome(REPO);

// ── PURE PREDICATES ───────────────────────────────────────────────────────────

test('parseFilesProcessed reads the verbose block and stops at the next banner', () => {
	const out = [
		' VERBOSE  ━━━━',
		'',
		'  i Files processed:',
		'  ',
		'  - src/a.js',
		'  - src/nested/b.ts',
		'  ',
		'',
		' VERBOSE  ━━━━',
		'',
		'  i Files fixed:',
		'  ',
		'  - not/a/processed/file.js',
		'',
	].join('\n');
	assert.deepStrictEqual(gate.parseFilesProcessed(out), ['src/a.js', 'src/nested/b.ts']);
});

test('parseFilesProcessed returns nothing when Biome never printed a list', () => {
	const out = '  × Biome exited because the configuration resulted in errors.';
	assert.deepStrictEqual(gate.parseFilesProcessed(out), []);
	assert.strictEqual(gate.sawFilesProcessedBlock(out), false);
});

test('sawFilesProcessedBlock separates "checked nothing" from "never started"', () => {
	// `files.maxSize` produces this: Biome answered, and the answer is zero files.
	const empty = '  i Files processed:\n  \n  ! The list is empty.\n';
	assert.strictEqual(gate.sawFilesProcessedBlock(empty), true);
	assert.deepStrictEqual(gate.parseFilesProcessed(empty), []);
});

test('trackedLintable keeps only watched extensions', () => {
	const got = gate.trackedLintable([
		'lib/a.js',
		'docs/b.tsx',
		'themes/c.css',
		'README.md',
		'biome.jsonc',
		'assets/d.woff2',
		'tools/e.mjs',
	]);
	// `biome.jsonc` is absent on purpose — see WATCHED_EXTENSIONS.
	assert.deepStrictEqual(got, ['docs/b.tsx', 'lib/a.js', 'tools/e.mjs']);
});

test('trackedLintable is not fooled by an extension that is only a substring', () => {
	assert.deepStrictEqual(gate.trackedLintable(['a.jsonc.bak', 'b.ts.snap', 'c.ts']), ['c.ts']);
});

test('probeTargets covers every directory AND every language present in it', () => {
	assert.deepStrictEqual(
		gate.probeTargets(['package.json', 'lib/a.js', 'lib/b.js', 'lib/c.ts', 'lib/core/d.js']),
		[
			{ dir: '.', ext: 'json' },
			{ dir: 'lib', ext: 'js' },
			{ dir: 'lib', ext: 'ts' },
			{ dir: 'lib/core', ext: 'js' },
		],
	);
});

test('probeTargets ignores an extension with no probe body', () => {
	// biome.jsonc rides in the processed list because Biome processes its own config, not
	// because `files.includes` asks for it — a probe beside it would be skipped entirely.
	assert.deepStrictEqual(gate.probeTargets(['biome.jsonc', 'lib/a.js']), [{ dir: 'lib', ext: 'js' }]);
});

test('probePaths gives every run its own filenames', () => {
	const targets = [{ dir: 'lib', ext: 'ts' }, { dir: '.', ext: 'js' }];
	const a = gate.probePaths(targets, 'aaaa');
	const b = gate.probePaths(targets, 'bbbb');
	assert.deepStrictEqual(a.map((p) => p.path), ['lib/lint-teeth-probe-aaaa.ts', 'lint-teeth-probe-aaaa.js']);
	assert.strictEqual(a.filter((p) => b.some((q) => q.path === p.path)).length, 0);
});

test('diffCoverage separates the ratchet from the anti-rot arm', () => {
	const got = gate.diffCoverage({
		lintable: ['a.js', 'b.js', 'c.js', 'd.js'],
		processed: ['a.js', 'b.js'],
		baseline: ['c.js', 'gone.js'],
	});
	assert.deepStrictEqual(got.uncovered, ['c.js', 'd.js']);
	assert.deepStrictEqual(got.newlyUncovered, ['d.js'], 'd.js left coverage unrecorded');
	assert.deepStrictEqual(got.stale, ['gone.js'], 'baseline entry that is linted again, or gone');
	assert.strictEqual(got.coveredCount, 2);
});

test('diffCoverage is silent when the baseline matches exactly', () => {
	const got = gate.diffCoverage({
		lintable: ['a.js', 'b.js'],
		processed: ['a.js'],
		baseline: ['b.js'],
	});
	assert.deepStrictEqual(got.newlyUncovered, []);
	assert.deepStrictEqual(got.stale, []);
});

test('diffProbes flags a probe missing ANY of its language rules, not just all of them', () => {
	const all = gate.PROBE_LANGUAGES.js.rules;
	const probes = [
		{ path: 'a/p.js', dir: 'a', ext: 'js' },
		{ path: 'b/p.js', dir: 'b', ext: 'js' },
		{ path: 'c/p.js', dir: 'c', ext: 'js' },
		{ path: 'd/p.json', dir: 'd', ext: 'json' },
	];
	const diagnostics = [
		...all.map((category) => ({ location: { path: 'a/p.js' }, category })),
		{ location: { path: 'b/p.js' }, category: all[0] },
		{ location: { path: 'd/p.json' }, category: gate.PROBE_LANGUAGES.json.rules[0] },
	];
	assert.deepStrictEqual(
		gate.diffProbes({ probes, diagnostics }).map((p) => p.path),
		['b/p.js', 'c/p.js'],
	);
});

test('each language probe body actually triggers every rule claimed for it', (t) => {
	// The bodies and the rule lists are two hand-written halves of one fact. If they drift,
	// the arm reports "teeth confirmed" from a probe that never had them.
	const root = makeSandbox(t);
	const targets = Object.keys(gate.PROBE_LANGUAGES).map((ext) => ({ dir: 'src', ext }));
	const { silent } = gate.runProbe(root, BIOME, targets, 'ruleaudit');
	assert.deepStrictEqual(silent, []);
});

test('SUPPRESS_ALL matches a real whole-file suppression, not a passing mention', () => {
	const token = 'biome-ignore' + '-all';
	assert.ok(gate.SUPPRESS_ALL.test(`// ${token} lint: shhh\ndebugger;\n`));
	assert.ok(gate.SUPPRESS_ALL.test(`/** ${token} lint/suspicious/noDebugger: why */\n`));
	assert.ok(!gate.SUPPRESS_ALL.test(`// we should never use ${token} here\n`));
	assert.ok(!gate.SUPPRESS_ALL.test('// biome-ignore lint/suspicious/noDebugger: one line\ndebugger;\n'));
});

test('unwatchedIncludeExtensions widens only — negated patterns and comments are ignored', () => {
	const config = [
		'{',
		'  // a comment quoting "**/*.vue" must not count as coverage',
		'  "files": { "includes": ["**/*.js", "**/*.vue", "!**/*.min.js"] }',
		'}',
	].join('\n');
	assert.deepStrictEqual(gate.unwatchedIncludeExtensions(config), ['vue']);
	assert.deepStrictEqual(
		gate.unwatchedIncludeExtensions('{ "includes": ["**/*.js", "!**/*.min.js"] }'),
		[],
	);
});

// ── THE SANDBOX: a real repo, a real Biome ────────────────────────────────────

const CLEAN = (name) =>
	`// ${name} — sandbox source for the lint-coverage gate. Deliberately clean, and\n` +
	`// deliberately longer than 60 bytes so \`files.maxSize\` can push it out of coverage.\n` +
	'export const value = 42;\n';

const SANDBOX_CONFIG = `{
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "includes": [
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
      "**/*.json",
      "**/*.ts",
      "**/*.tsx",

      // vendor — minified third-party.
      "!**/*.min.js",
      // build-output — regenerated.
      "!build",
      // generated by \`tools/build-x.js\` — compiled library output.
      "!docs/x/dist",
      // generated by \`tools/build-y.js\` — compiled library output.
      "!docs/y/dist"
    ]
  },
  "formatter": { "enabled": false },
  "linter": { "enabled": true, "rules": { "recommended": true } }
}
`;

const SANDBOX_FILES = {
	'.gitignore': 'node_modules\n',
	'package.json': '{ "name": "sandbox", "private": true }\n',
	'biome.jsonc': SANDBOX_CONFIG,
	'src/a.js': CLEAN('src/a.js'),
	// Deliberately larger than the teeth probe, so `files.maxSize` can be tuned to a
	// threshold that hides a real file while the probe beside it still reports.
	'src/big.js': `${CLEAN('src/big.js')}${'// filler\n'.repeat(200)}`,
	'src/b.ts': CLEAN('src/b.ts'),
	'src/nested/c.tsx': CLEAN('src/nested/c.tsx'),
	'tools/d.mjs': CLEAN('tools/d.mjs'),
	'vendor/e.min.js': CLEAN('vendor/e.min.js'),
	'build/out.js': CLEAN('build/out.js'),
	'docs/x/dist/i.js': CLEAN('docs/x/dist/i.js'),
	'docs/y/dist/j.js': CLEAN('docs/y/dist/j.js'),
};

/** A git repo with a blessed baseline, ready for one attack. */
function makeSandbox(t) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-coverage-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	for (const [rel, body] of Object.entries(SANDBOX_FILES)) {
		const file = path.join(root, rel);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, body);
	}
	execFileSync('git', ['init', '-q'], { cwd: root });
	// `git ls-files` reports the index, so staging is enough — no commit, no identity.
	execFileSync('git', ['add', '-A'], { cwd: root });
	gate.bless({ root, biome: BIOME });
	return root;
}

const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (root, rel, body) => fs.writeFileSync(path.join(root, rel), body);
const errorsOf = (root) => gate.check({ root, biome: BIOME }).errors;

test('the un-attacked sandbox is green, and its exclusions are the expected four', (t) => {
	const root = makeSandbox(t);
	assert.deepStrictEqual(errorsOf(root), []);
	const baseline = gate.readBaseline(root);
	assert.deepStrictEqual(baseline.uncovered, [
		'build/out.js',
		'docs/x/dist/i.js',
		'docs/y/dist/j.js',
		'vendor/e.min.js',
	]);
	// No count of what IS checked: that number moves whenever anyone adds a source file,
	// and a file entering coverage is never the failure.
	assert.ok(!('coveredCount' in baseline));
});

test('parseCheckedCount reads Biome\'s own tally, singular and plural', () => {
	assert.strictEqual(gate.parseCheckedCount('Checked 1254 files in 1727ms. No fixes applied.'), 1254);
	assert.strictEqual(gate.parseCheckedCount('Checked 1 file in 2ms.'), 1);
	assert.strictEqual(gate.parseCheckedCount('Scanned project folder in 31ms.'), null);
});

test('attack 1 — a line in .gitignore, with no config edit at all', (t) => {
	const root = makeSandbox(t);
	write(root, '.gitignore', `${read(root, '.gitignore')}src/a.js\n`);
	const errors = errorsOf(root);
	assert.match(errors.join('\n'), /coverage SHRANK/);
	assert.match(errors.join('\n'), /src\/a\.js/);
});

test('attack 2 — overrides[].linter.enabled: false leaves the count flat', (t) => {
	const root = makeSandbox(t);
	write(
		root,
		'biome.jsonc',
		read(root, 'biome.jsonc').replace(
			/\n}\n$/,
			',\n  "overrides": [{ "includes": ["src/**"], "linter": { "enabled": false } }]\n}\n',
		),
	);
	const errors = errorsOf(root).join('\n');
	assert.doesNotMatch(errors, /coverage SHRANK/, 'the file count cannot see this one');
	assert.match(errors, /linter is SILENT/);
	assert.match(errors, /src\b/);
});

test('attack 3 — a linter.includes allowlist leaves the count flat', (t) => {
	const root = makeSandbox(t);
	write(
		root,
		'biome.jsonc',
		read(root, 'biome.jsonc').replace(
			'"linter": { "enabled": true,',
			'"linter": { "enabled": true, "includes": ["tools/**"],',
		),
	);
	const errors = errorsOf(root).join('\n');
	assert.doesNotMatch(errors, /coverage SHRANK/);
	assert.match(errors, /linter is SILENT/);
});

test('attack 4 — deleting a POSITIVE include, which the removed gate never read', (t) => {
	const root = makeSandbox(t);
	write(root, 'biome.jsonc', read(root, 'biome.jsonc').replace('      "**/*.ts",\n', ''));
	const errors = errorsOf(root).join('\n');
	assert.match(errors, /coverage SHRANK/);
	assert.match(errors, /src\/b\.ts/);
});

test('attack 5 — a single-file "!" exclusion, however it is spelled', (t) => {
	const root = makeSandbox(t);
	write(root, 'biome.jsonc', read(root, 'biome.jsonc').replace('"**/*.js",', '"**/*.js",\n      "\\u0021src/a.js",'));
	const errors = errorsOf(root).join('\n');
	assert.match(errors, /coverage SHRANK/);
	assert.match(errors, /src\/a\.js/);
});

test('attack 6 — a plausible class comment over a directory-wide exclusion', (t) => {
	const root = makeSandbox(t);
	write(
		root,
		'biome.jsonc',
		read(root, 'biome.jsonc').replace('"**/*.js",', '"**/*.js",\n      // dependency\n      "!src",'),
	);
	const errors = errorsOf(root).join('\n');
	assert.match(errors, /coverage SHRANK/);
	// The comment is unverifiable prose; the gate never reads it, and all three files go.
	for (const f of ['src/a.js', 'src/b.ts', 'src/nested/c.tsx']) assert.match(errors, new RegExp(f));
});

test('attack 7 — a second config file shadowing the first', (t) => {
	const root = makeSandbox(t);
	write(
		root,
		'biome.json',
		JSON.stringify({
			vcs: { enabled: true, clientKind: 'git', useIgnoreFile: true },
			files: { includes: ['**/*.js', '**/*.mjs', '**/*.json', '**/*.ts', '**/*.tsx', '!src'] },
			formatter: { enabled: false },
			linter: { enabled: true, rules: { recommended: true } },
		}),
	);
	assert.match(errorsOf(root).join('\n'), /coverage SHRANK/);
});

test('attack 8 — files.maxSize, which exits 0 with every automated check green', (t) => {
	const root = makeSandbox(t);
	write(root, 'biome.jsonc', read(root, 'biome.jsonc').replace('"files": {', '"files": { "maxSize": 60,'));
	const errors = errorsOf(root).join('\n');
	// An oversized file stays in the verbose "Files processed" list, so the coverage
	// baseline reads it as covered. Measured against Biome 2.4.15 — this is why arm 2 exists.
	assert.doesNotMatch(errors, /coverage SHRANK/);
	assert.match(errors, /SCANNED \d+ file\(s\) and CHECKED only \d+/);
	assert.match(errors, /linter is SILENT/, 'the probe is padded past 60 bytes on purpose');
});

test('attack 8b — a maxSize tuned ABOVE the probe but below a real file', (t) => {
	const root = makeSandbox(t);
	const probeBytes = Buffer.byteLength(gate.PROBE_LANGUAGES.js.source);
	const bigBytes = fs.statSync(path.join(root, 'src/big.js')).size;
	assert.ok(probeBytes < 1000 && bigBytes > 1000, 'the threshold must split them');
	write(root, 'biome.jsonc', read(root, 'biome.jsonc').replace('"files": {', '"files": { "maxSize": 1000,'));
	const errors = errorsOf(root).join('\n');
	assert.match(errors, /SCANNED \d+ file\(s\) and CHECKED only/);
	// The probe is under the limit, so it reports normally — arm 3 is blind here by design.
	assert.doesNotMatch(errors, /linter is SILENT/);
});

test('attack 9 — a pattern QUOTED IN A COMMENT is not an exclusion, and must not fire', (t) => {
	const root = makeSandbox(t);
	write(
		root,
		'biome.jsonc',
		read(root, 'biome.jsonc').replace(
			'      "**/*.js",',
			'      // consolidated from "!docs/x/dist" and "!docs/y/dist" — see the PR\n      "**/*.js",',
		),
	);
	assert.deepStrictEqual(errorsOf(root), [], 'the removed gate false-positived here');
});

test('the legitimate consolidation to a single glob stays green', (t) => {
	const root = makeSandbox(t);
	write(
		root,
		'biome.jsonc',
		read(root, 'biome.jsonc')
			.replace('      // generated by `tools/build-y.js` — compiled library output.\n', '')
			.replace('      "!docs/x/dist",\n', '')
			.replace('"!docs/y/dist"', '"!docs/*/dist"'),
	);
	assert.deepStrictEqual(errorsOf(root), [], 'byte-identical effect must be byte-identical verdict');
});

test('a file returning to coverage is a STALE baseline, not a pass', (t) => {
	const root = makeSandbox(t);
	write(root, 'biome.jsonc', read(root, 'biome.jsonc').replace('"!build",', ''));
	const errors = errorsOf(root).join('\n');
	assert.match(errors, /is STALE/);
	assert.match(errors, /build\/out\.js/);
});

test('adding a source file does NOT require a re-bless', (t) => {
	const root = makeSandbox(t);
	write(root, 'src/newcomer.js', CLEAN('src/newcomer.js'));
	execFileSync('git', ['add', '-A'], { cwd: root });
	assert.deepStrictEqual(errorsOf(root), [], 'a file entering coverage is never the failure');
});

test('a language the config covers but the gate does not watch fails loudly', (t) => {
	const root = makeSandbox(t);
	write(root, 'biome.jsonc', read(root, 'biome.jsonc').replace('"**/*.js",', '"**/*.js",\n      "**/*.vue",'));
	assert.match(errorsOf(root).join('\n'), /does not watch: vue/);
});

test('probe files never survive a run, including one that throws', (t) => {
	const root = makeSandbox(t);
	errorsOf(root);
	const strays = execFileSync('git', ['status', '--porcelain', '--ignored'], {
		cwd: root,
		encoding: 'utf8',
	});
	assert.doesNotMatch(strays, new RegExp(gate.PROBE_PREFIX));

	assert.throws(() =>
		gate.runProbe(root, path.join(root, 'no-such-biome'), [{ dir: 'src', ext: 'js' }], 'throwcase'),
	);
	assert.strictEqual(
		fs.existsSync(path.join(root, 'src', `${gate.PROBE_PREFIX}throwcase.js`)),
		false,
	);
});

test('a corrupt config falls back to Biome defaults — and the gate notices', (t) => {
	const root = makeSandbox(t);
	write(root, 'biome.jsonc', '{ this is not json }');
	// Measured against Biome 2.4.15: an unparseable config is not an error. It is silently
	// discarded and every default applies, so coverage WIDENS rather than collapsing —
	// `build/` and the vendored bundle start being linted. That is the shape the gate
	// reports, and it is worth stating precisely, because the intuition (and an earlier
	// version of this test) says a broken config means "Biome refused to run".
	const errors = errorsOf(root).join('\n');
	assert.match(errors, /is STALE/);
	assert.match(errors, /build\/out\.js/);
	assert.match(errors, /vendor\/e\.min\.js/);
});

// ── FINDINGS FROM THE INDEPENDENT CHECKER, each measured green before the fix ──

test('an EXTENSION-scoped overrides[] cannot hide behind a .js-only probe', (t) => {
	// The first version probed `.js` alone, so `{includes: ["**/*.ts"], linter: {enabled:
	// false}} ` un-linted 556 tracked files in this repo with all three arms green — the
	// likeliest real form of the attack, and quieter than the file-scoped one.
	const root = makeSandbox(t);
	write(
		root,
		'biome.jsonc',
		read(root, 'biome.jsonc').replace(
			/\n}\n$/,
			',\n  "overrides": [{ "includes": ["**/*.ts", "**/*.tsx"], "linter": { "enabled": false } }]\n}\n',
		),
	);
	const errors = errorsOf(root).join('\n');
	assert.doesNotMatch(errors, /coverage SHRANK/, 'the file count is flat, as always');
	assert.match(errors, /linter is SILENT/);
	assert.match(errors, /\(\*\.ts\)/);
	assert.doesNotMatch(errors, /\(\*\.js\)/, 'JS is genuinely still linted here');
});

test('a pattern excluding the OLD fixed probe name no longer buys anything', (t) => {
	// `"!**/*.tmp.js"` reads as tempfile hygiene and silenced the whole repo while every
	// probe still reported, because the probe was named `lint-teeth-probe.tmp.js`.
	const root = makeSandbox(t);
	write(
		root,
		'biome.jsonc',
		read(root, 'biome.jsonc').replace(
			/\n}\n$/,
			',\n  "overrides": [{ "includes": ["**", "!**/*.tmp.js"], "linter": { "enabled": false } }]\n}\n',
		),
	);
	assert.match(errorsOf(root).join('\n'), /linter is SILENT/);
});

test('a linter.includes allowlist naming the old probe no longer buys anything', (t) => {
	const root = makeSandbox(t);
	write(
		root,
		'biome.jsonc',
		read(root, 'biome.jsonc').replace(
			'"linter": { "enabled": true,',
			'"linter": { "enabled": true, "includes": ["**/lint-teeth-probe.tmp.js"],',
		),
	);
	assert.match(errorsOf(root).join('\n'), /linter is SILENT/);
});

test('a whole-file biome-ignore-all is coverage loss, a per-line biome-ignore is not', (t) => {
	const root = makeSandbox(t);
	const token = 'biome-ignore' + '-all';
	write(root, 'src/a.js', `// ${token} lint: shhh\n${read(root, 'src/a.js')}`);
	const errors = errorsOf(root).join('\n');
	assert.match(errors, /coverage SHRANK/);
	assert.match(errors, /src\/a\.js/);

	// The single-rule form is a legitimate, reviewable escape and must stay green.
	const clean = makeSandbox(t);
	write(
		clean,
		'src/a.js',
		`// biome-ignore lint/suspicious/noDebugger: deliberate\n${read(clean, 'src/a.js')}`,
	);
	assert.deepStrictEqual(errorsOf(clean), []);
});

test('deleting a tracked file without `git rm` does not false-fail', (t) => {
	// git ls-files reads the INDEX; Biome reads the WORKING TREE. The mismatch reported an
	// ordinary mid-work `rm` as coverage loss and told the developer to bless the removal —
	// which would have ratcheted a real file out of the ratchet.
	const root = makeSandbox(t);
	fs.rmSync(path.join(root, 'src/a.js'));
	assert.deepStrictEqual(errorsOf(root), []);
});

test('two concurrent runs do not delete each other\'s probes', (t) => {
	const root = makeSandbox(t);
	const targets = gate.probeTargets(['src/a.js', 'tools/d.mjs']);
	const a = gate.probePaths(targets, 'aaaaaa').map((p) => p.path);
	const b = gate.probePaths(targets, 'bbbbbb').map((p) => p.path);
	// Stand in for the other run: its files exist while ours runs, and must survive.
	for (const rel of b) fs.writeFileSync(path.join(root, rel), gate.PROBE_LANGUAGES.js.source);
	const { silent } = gate.runProbe(root, BIOME, targets, 'aaaaaa');
	assert.deepStrictEqual(silent, []);
	for (const rel of b) assert.ok(fs.existsSync(path.join(root, rel)), `${rel} was swept by another run`);
	for (const rel of a) assert.ok(!fs.existsSync(path.join(root, rel)));
	for (const rel of b) fs.rmSync(path.join(root, rel));
});

test('the probe never touches a file it did not write', (t) => {
	const root = makeSandbox(t);
	const victim = path.join(root, 'src', `${gate.PROBE_PREFIX}notmine.js`);
	fs.writeFileSync(victim, '// a file that merely shares the prefix\n');
	gate.runProbe(root, BIOME, [{ dir: 'src', ext: 'js' }], 'mine');
	assert.ok(fs.existsSync(victim), 'the gate deleted a file it did not create');
	fs.rmSync(victim);
});

test('an unreadable Checked-count fails the gate instead of skipping the arm', () => {
	// `parseCheckedCount` returning null used to disable the files.maxSize arm silently,
	// so a Biome upgrade that reformats one summary line would remove a mechanism while
	// every run still printed OK.
	assert.strictEqual(gate.parseCheckedCount('Biome reformatted this line'), null);
});

test('every probe silent gets a DIFFERENT diagnosis from some probes silent', (t) => {
	// A .gitignore line matching the probe skips it everywhere (useIgnoreFile is on), and
	// naming `overrides[]` there sends the reader to a config where nothing is wrong.
	const root = makeSandbox(t);
	write(root, '.gitignore', `${read(root, '.gitignore')}${gate.PROBE_PREFIX}*\n`);
	const errors = errorsOf(root).join('\n');
	assert.match(errors, /EVERY probe went quiet/);
	assert.match(errors, /\.gitignore/);
});

test('a config extension the gate does not watch is caught in every spelling', () => {
	for (const pattern of ['"**/*.vue"', '"docs/**/*.vue"', '"**/*.{vue,svelte}"']) {
		const config = `{ "files": { "includes": ["**/*.js", ${pattern}] } }`;
		assert.ok(
			gate.unwatchedIncludeExtensions(config).includes('vue'),
			`${pattern} slipped a whole language past the widening guard`,
		);
	}
});

test('a config Biome truly cannot start with is reported as that, not as coverage loss', (t) => {
	const root = makeSandbox(t);
	// No `.gitignore`, with `vcs.useIgnoreFile` on: Biome exits before processing anything.
	fs.rmSync(path.join(root, '.gitignore'));
	assert.throws(() => gate.check({ root, biome: BIOME }), /failed to start/);
});

// ── THIS REPO ─────────────────────────────────────────────────────────────────

test('the committed baseline describes the repo as it stands', () => {
	const baseline = gate.readBaseline(REPO);
	assert.ok(baseline, `${gate.BASELINE_REL} must exist`);
	assert.ok(Array.isArray(baseline.uncovered));
	// Every excluded path must still be a tracked file — a baseline entry pointing at
	// nothing is the exact rot that let `examples/**\/*.json` survive in the old config.
	const tracked = new Set(gate.listTracked(REPO));
	const gone = baseline.uncovered.filter((p) => !tracked.has(p));
	assert.deepStrictEqual(gone, [], 'baseline entries that are no longer tracked');
});

test('docs/src/components/site is linted — the regression this gate was built for', () => {
	const baseline = gate.readBaseline(REPO);
	const shadowed = baseline.uncovered.filter((p) => p.startsWith('docs/src/components/site/'));
	assert.deepStrictEqual(shadowed, [], 'a .gitignore line un-linted these once already');
});
