/**
 * The agent kit's structure — the routing file, the four folders, and the
 * verbatim-copy guarantees.
 *
 * WHY IT EXISTS. The kit is the surface an outside LLM reads to author Lattice
 * artifacts, and its failure modes are all SILENT: an index that points at a
 * missing file, a copied skill that has drifted from the repo's own, a canon that
 * quietly stopped shipping. None of those break a build; they just make the kit
 * quietly wrong for its only audience.
 *
 * The kit has already shipped two dangling pointers — `components.pick.md`
 * routing readers to a `lib/components/...` path a kit consumer does not have,
 * and the shared `chart-family` contract that 8 chart docs reference being absent
 * — so the index/file agreement below is a regression test, not a hypothetical.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const KIT = path.join(ROOT, 'dist', 'agent-kit');
const BOOTSTRAP = path.join(KIT, 'README.md');
const built = fs.existsSync(BOOTSTRAP);

const skip = built ? false : 'dist/agent-kit not built — run `npm run build`';

test('agent kit structure', { skip }, async (t) => {
	const text = fs.readFileSync(BOOTSTRAP, 'utf8');

	await t.test('the four task folders exist and are non-empty', () => {
		for (const dir of ['authoring', 'components', 'skills', 'reference', 'review']) {
			const p = path.join(KIT, dir);
			assert.ok(fs.existsSync(p), `${dir}/ is missing from the kit`);
			assert.ok(
				fs.readdirSync(p).length > 0,
				`${dir}/ is empty — the kit is organized by task, and an empty folder is a task ` +
					'the kit claims to answer and does not.',
			);
		}
	});

	await t.test('every component the bootstrap names has a file', () => {
		const named = new Set();
		for (const line of text.split('\n')) {
			if (!/^\s{2}`/.test(line)) continue; // the member lines under each family
			for (const m of line.matchAll(/`([a-z0-9-]+)`/g)) named.add(m[1]);
		}
		assert.ok(named.size >= 50, `only ${named.size} components parsed out of the bootstrap`);
		const missing = [...named].filter(
			(n) => !fs.existsSync(path.join(KIT, 'components', `${n}.md`)),
		);
		assert.deepEqual(
			missing,
			[],
			'The bootstrap names components with no file in components/. An index that points at ' +
				'a missing file costs the agent a fetch and returns nothing.',
		);
	});

	await t.test('every components/ file is reachable from the bootstrap', () => {
		const onDisk = fs
			.readdirSync(path.join(KIT, 'components'))
			.filter((f) => f.endsWith('.md') && f !== '_index.md' && f !== 'README.md')
			.map((f) => f.replace(/\.md$/, ''));
		const unreferenced = onDisk.filter(
			(n) => !text.includes(`\`${n}\``) && !text.includes(`${n}.md`),
		);
		assert.deepEqual(
			unreferenced,
			[],
			'These component files ship but nothing in the bootstrap points at them, so an agent ' +
				'reading the bootstrap never learns they exist.',
		);
	});

	await t.test('skills are byte-identical to design/skills/', () => {
		// They are HAND-WRITTEN, not generated, so copying them creates a second
		// copy that can drift. Everything else in the kit is derived from a
		// generator and cannot. This is the pin that keeps the copy honest.
		const srcDir = path.join(ROOT, 'design', 'skills');
		const src = fs.readdirSync(srcDir).filter((f) => f.endsWith('.md')).sort();
		const kit = fs
			.readdirSync(path.join(KIT, 'skills'))
			.filter((f) => f.endsWith('.md') && f !== 'README.md')
			.sort();
		assert.deepEqual(
			kit,
			src.filter((f) => f !== 'README.md'),
			'the kit ships a different set of skills than design/skills/',
		);
		for (const f of src.filter((f) => f !== 'README.md')) {
			assert.ok(
				fs.readFileSync(path.join(srcDir, f)).equals(fs.readFileSync(path.join(KIT, 'skills', f))),
				`skills/${f} has drifted from design/skills/${f}. The kit copies them verbatim; ` +
					'edit the source and rebuild rather than the copy.',
			);
		}
	});

	await t.test('every skill the index offers actually ships', () => {
		// This read the ROOT README, which names no skill file — so the loop body
		// never ran and the arm passed unconditionally. The index that DOES name
		// them is skills/README.md, and the count assertion below is what stops
		// this from silently going hollow again.
		const index = fs.readFileSync(path.join(KIT, 'skills', 'README.md'), 'utf8');
		const named = [...index.matchAll(/`([a-z-]+\.md)`/g)].map((m) => m[1]).filter((f) => f !== 'README.md');
		assert.ok(named.length >= 5, `skills/README.md names ${named.length} skills — the arm is not looking at anything`);
		for (const f of new Set(named)) {
			assert.ok(fs.existsSync(path.join(KIT, 'skills', f)), `the index offers skills/${f}, which is not in the kit`);
		}
		// ...and the other direction: a skill that ships but is not offered is
		// invisible to the reader who is choosing one.
		const shipped = fs.readdirSync(path.join(KIT, 'skills')).filter((f) => f.endsWith('.md') && f !== 'README.md');
		for (const f of shipped) {
			assert.ok(named.includes(f), `skills/${f} ships but skills/README.md never names it`);
		}
	});

	await t.test('the deck canon ships, with its traps', async () => {
		const canonPath = path.join(KIT, 'authoring', 'deck-canon.md');
		assert.ok(fs.existsSync(canonPath), 'authoring/deck-canon.md is missing');
		const doc = fs.readFileSync(canonPath, 'utf8');
		const { DECK_CANON, DECK_CANON_SHORT } = require(
			path.join(ROOT, 'lib', 'authoring', 'deck-canon.js'),
		);
		assert.ok(
			doc.includes(DECK_CANON.trim()),
			'authoring/deck-canon.md does not carry DECK_CANON verbatim. This is what the Studio ' +
				'sends itself every turn; a paraphrase is a second source of truth.',
		);
		assert.ok(doc.includes(DECK_CANON_SHORT.trim()), 'the short canon is missing');
		// The traps are the half that turns the canon from prose into a checklist.
		assert.ok(
			(doc.match(/^\s+- /gm) || []).length >= 15,
			'the canon shipped without its trap list — that is the part a reviewer actually flags',
		);
	});

	await t.test('all three generator canons ship', () => {
		const doc = fs.readFileSync(path.join(KIT, 'reference', 'studio-prompts.md'), 'utf8');
		const { THEME_CANON } = require(path.join(ROOT, 'lib', 'theme', 'ai.js'));
		const { COMPONENT_CANON } = require(path.join(ROOT, 'lib', 'layout', 'ai.js'));
		assert.ok(doc.includes(String(THEME_CANON).trim()), 'THEME_CANON missing or altered');
		assert.ok(doc.includes(String(COMPONENT_CANON).trim()), 'COMPONENT_CANON missing or altered');
		// FINISH_SYSTEM is deliberately NOT shipped: it lives in architect.ts, which
		// imports fuse.js and react from the docs workspace, and loading that in a
		// root-only `npm ci` broke the whole install. The kit must SAY so rather than
		// leave a reader wondering why three of four canons are here.
		assert.match(
			doc,
			/FINISH_SYSTEM — not shipped, and why/,
			'studio-prompts.md no longer explains the absent finish prompt. Silently shipping ' +
				'three of four canons leaves a reader unable to tell absence from oversight.',
		);
		assert.match(doc, /skills\/finish\.md/, 'the finish prompt section must route to the skill');
		assert.match(
			doc,
			/the skill is the safer bet/,
			'studio-prompts.md no longer states which source wins when a prompt and a skill ' +
				'disagree. 2026-07-19 found these prompts had silently drifted twice; without the ' +
				'precedence note a reader may follow the drifted one.',
		);
	});

	await t.test('every folder has its own README — the local bootstrap', () => {
		// "Ala carte": you open a folder and it tells you what is inside and in what
		// order to read it. GitHub renders these automatically, so a human browsing
		// lands oriented with no clicks.
		for (const dir of ['authoring', 'components', 'skills', 'reference', 'review']) {
			assert.ok(
				fs.existsSync(path.join(KIT, dir, 'README.md')),
				`${dir}/README.md is missing — every folder is meant to be its own entry point.`,
			);
		}
		assert.ok(
			!fs.existsSync(path.join(KIT, 'BOOTSTRAP.md')),
			'BOOTSTRAP.md is back alongside README.md. One front door: two is how they drifted ' +
				'into redundancy last time.',
		);
	});

	await t.test('the checker ships, runs, and finds real defects', () => {
		const check = path.join(KIT, 'review', 'check.mjs');
		assert.ok(fs.existsSync(check), 'review/check.mjs is missing — the kit has no checker');
		const { execFileSync } = require('node:child_process');
		const os = require('node:os');
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-check-'));
		const deck = path.join(tmp, 'd.md');
		fs.writeFileSync(
			deck,
			['---', 'theme: cuoio', '---', '', '## Next Steps', '', '- Continue monitoring', ''].join('\n'),
		);
		// A SECOND deck, whose heading carries a period qualifier. `## Q2 Results` is
		// the deck canon's own worked example of a bad heading and the checker used
		// to pass it clean, because the digit guard fired on the `2`.
		const dated = path.join(tmp, 'q.md');
		fs.writeFileSync(
			dated,
			['---', 'theme: cuoio', '---', '', '## Q2 Results', '', '- Continue monitoring', ''].join('\n'),
		);
		const out = execFileSync(process.execPath, [check, deck, dated, '--json'], { encoding: 'utf8' });
		const report = JSON.parse(out);
		fs.rmSync(tmp, { recursive: true, force: true });

		// ONE envelope shape, always, and it carries `partial`. The bare-array form
		// suppressed the partial marker in exactly the mode a machine reads, so a
		// check that skipped a whole rule class came back as [] and read as clean.
		assert.equal(typeof report, 'object', '--json must emit an envelope, not a bare array');
		assert.equal(report.partial, false, 'the kit ships its own catalog, so a check inside it is complete');
		assert.equal(report.files.length, 2, 'every file passed on the command line must be checked');

		for (const { file, findings } of report.files) {
			assert.ok(
				findings.some((f) => f.rule === 'label-title'),
				`the shipped checker did not flag the label heading in ${file}. It is the kit's only ` +
					'independent quality gate; if it stops biting, an agent grades its own work.',
			);
			assert.ok(findings.every((f) => f.message), 'findings must carry a human-readable message');
		}
	});

	await t.test('mdCell escapes what would break a table row', async () => {
		// CodeQL flagged the missing backslash escape as two high-severity alerts.
		// The arm that replaced this one asserted on the OUTPUT of the real docs —
		// and no live input carries a backslash OR a pipe, so removing the fix left
		// it green. Measured: 0 of 58 real cells differ with the fix reverted. That
		// is not a pin, so test the function against the inputs that would break it.
		const { mdCell } = await import('../../../tools/build-agent-kit.mjs');
		const cases = [
			['a | b', 'a pipe would split the cell into two'],
			['ends in a backslash \\', 'a trailing backslash escapes the delimiter that follows'],
			['\\| already escaped', 'a pre-escaped pipe must not double-unescape'],
			['multi\nline\n  text', 'a newline ends the row early'],
		];
		for (const [input, why] of cases) {
			const cell = mdCell(input);
			assert.doesNotMatch(cell, /\n/, `${why} — mdCell left a newline in`);
			// Every `|` must be escaped, and no backslash may be left dangling at
			// the end where it would consume the delimiter.
			assert.doesNotMatch(cell, /(^|[^\\])\|/, `${why} — mdCell left an unescaped pipe`);
			assert.doesNotMatch(cell, /(^|[^\\])\\$/, `${why} — mdCell left a trailing lone backslash`);
			// The row must still parse as three cells.
			const row = `| ${cell} | x |`;
			assert.equal(row.split(/(?<!\\)\|/).length - 2, 2, `${why} — the rendered row does not have 2 cells`);
		}
	});

	await t.test('the checker bundle is byte-stable across builds', () => {
		// esbuild writes each module's path as a comment, and the CLI entry lives in a
		// randomly named temp dir — so two builds of identical source differed by one
		// line, and the freshness gate would have failed on every CI run. The generator
		// normalizes that banner; this is the pin.
		const body = fs.readFileSync(path.join(KIT, 'review', 'check.mjs'), 'utf8');
		assert.doesNotMatch(
			body,
			/lattice-review-[A-Za-z0-9]+/,
			'check.mjs carries its build-time temp path, so it differs between builds and the ' +
				'freshness gate will fail spuriously. Normalize the banner in build-agent-kit.mjs.',
		);
		assert.match(body, /<CLI entry, generated by tools\/build-agent-kit\.mjs>/);
	});

	await t.test('the rubric ships every check the reviewer runs', () => {
		const doc = fs.readFileSync(path.join(KIT, 'review', 'rubric.md'), 'utf8');
		const { RUBRIC } = require(path.join(ROOT, 'lib', 'authoring', 'review-core.js'));
		for (const r of RUBRIC) {
			assert.ok(
				doc.includes(String(r.trap)),
				`rubric.md is missing the "${r.id}" trap. It must list what check.mjs actually ` +
					'applies, or a human following it looks for a different set.',
			);
		}
	});

	await t.test('components/README carries when-NOT-to-use, not just when-to-use', () => {
		// The pick list truncates to a first sentence and says so. Choosing between
		// two plausible components is where an agent goes wrong, and the deciding
		// fact is the anti-pattern.
		const doc = fs.readFileSync(path.join(KIT, 'components', 'README.md'), 'utf8');
		const notFor = (doc.match(/^\s+- \*not for:\*/gm) || []).length;
		const instead = (doc.match(/^\s+- \*use `[a-z0-9-]+` when\*/gm) || []).length;
		assert.ok(notFor >= 50, `only ${notFor} "not for" lines — expected one per component`);
		assert.ok(instead >= 50, `only ${instead} "use X instead when" lines — the disambiguation edges`);
	});

	await t.test('the skills index resolves the rules the skills cite', () => {
		const doc = fs.readFileSync(path.join(KIT, 'skills', 'README.md'), 'utf8');
		const cited = new Set();
		for (const f of fs.readdirSync(path.join(KIT, 'skills'))) {
			if (!f.endsWith('.md') || f === 'README.md') continue;
			const body = fs.readFileSync(path.join(KIT, 'skills', f), 'utf8');
			for (const m of body.matchAll(/HARD RULE #(\d+)/g)) cited.add(m[1]);
		}
		assert.ok(cited.size > 0, 'no HARD RULE citations found — has the glossary become unnecessary?');
		for (const n of cited) {
			assert.match(
				doc,
				new RegExp(`\\| #${n} \\|`),
				`the skills cite HARD RULE #${n} and the index does not resolve it. A kit reader ` +
					'has no CLAUDE.md, so an unresolved citation is a dead reference.',
			);
		}
	});

	await t.test('the routing file stays cheap', () => {
		const bytes = Buffer.byteLength(text, 'utf8');
		assert.ok(
			bytes < 16000,
			`BOOTSTRAP.md is ${bytes} B (~${Math.round(bytes / 4)} tokens). It is the file an agent ` +
				'reads INSTEAD of the catalog; past ~4k tokens the saving it exists for is eroding.',
		);
	});

	await t.test('the cross-cutting rules ship in full', async () => {
		const rules = fs.readFileSync(path.join(KIT, 'authoring', 'rules.md'), 'utf8');
		const { AUTHORING_RULES } = await import(
			path.join(ROOT, 'docs', 'src', 'components', 'studio', 'ai', 'architect-knowledge.js')
		);
		for (const rule of AUTHORING_RULES) {
			assert.ok(
				rules.includes(rule),
				'A shared authoring rule is missing from authoring/rules.md. These are the half a ' +
					`per-component file cannot supply:\n  ${rule.slice(0, 90)}…`,
			);
		}
		assert.match(
			rules,
			/you open next/,
			'rules.md no longer explains what the shared rules mean by "below" — those rules were ' +
				'written for the primer, where every skeleton is printed inline, and dangle here.',
		);
	});
	/**
	 * LICENSING. `review/check.mjs` is an esbuild bundle, and esbuild strips the
	 * comments from every package it inlines — including the copyright notices
	 * MIT and BSD-2-Clause both require to travel with the code. The kit shipped
	 * six such packages, no notices, and no LICENSE of its own, to a PUBLIC
	 * branch. These arms are the reason that cannot recur.
	 */
	await t.test('every package bundled into the checker has its notice reproduced', () => {
		const bundle = fs.readFileSync(path.join(KIT, 'review', 'check.mjs'), 'utf8');
		const notices = fs.readFileSync(path.join(KIT, 'THIRD-PARTY-LICENSES.txt'), 'utf8');
		const bundled = [
			...new Set(
				[...bundle.matchAll(/^\/\/ node_modules\/((?:@[^/\n]+\/)?[^/\n]+)\//gm)].map((m) => m[1]),
			),
		];
		assert.ok(
			bundled.length > 0,
			'no bundled packages detected — if esbuild stopped emitting path banners the license ' +
				'list is no longer derivable and this arm is blind, which is worse than a red build.',
		);
		for (const name of bundled) {
			assert.ok(
				notices.includes(name),
				`${name} is inlined into review/check.mjs but its license text is not reproduced ` +
					'in THIRD-PARTY-LICENSES.txt. Redistributing it without the notice breaks its terms.',
			);
		}
		// A heading per package is not the notice — the copyright line is the part
		// both licenses actually require.
		const copyrights = (notices.match(/Copyright/gi) || []).length;
		assert.ok(
			copyrights >= bundled.length,
			`${bundled.length} packages bundled but only ${copyrights} copyright lines reproduced`,
		);
	});

	await t.test('the kit carries its own license files', () => {
		for (const f of ['LICENSE', 'LICENSE-EXCEPTIONS', 'NOTICE.md', 'THIRD-PARTY-LICENSES.txt']) {
			const p = path.join(KIT, f);
			assert.ok(fs.existsSync(p), `${f} is missing — the kit publishes to a public branch`);
			assert.ok(fs.statSync(p).size > 200, `${f} is present but too short to be the real text`);
		}
		// NOTICE.md has to say the one thing a reader cannot infer: check.mjs is
		// engine code handed over loose, so the output exception does not reach it.
		const notice = fs.readFileSync(path.join(KIT, 'NOTICE.md'), 'utf8');
		assert.match(notice, /review\/check\.mjs/, 'NOTICE.md does not name the one file that is engine code');
		assert.match(notice, /exception/i, 'NOTICE.md does not address the output exception');
	});

	/**
	 * THE LINK CENSUS — the arm that would have caught 428 dead references.
	 *
	 * The component docs are written for someone standing in the repo, and the kit
	 * copied them verbatim: every `[x](../../<bucket>/<name>/<name>.docs.md)`,
	 * every `design/design-system.md §6.5` pointer and every gallery-PDF link
	 * pointed at a file no kit consumer has. A note explaining the mapping is not
	 * a fix and did not scale past the one pointer it was written for; resolving
	 * every link mechanically is, and this is what holds it.
	 *
	 * `skills/` is exempt BY DECISION: those seven files ship verbatim so they
	 * stay byte-identical to `design/skills/`, and `skills/README.md` carries a
	 * glossary for what they cite. Everything else in the kit must stand alone.
	 */
	await t.test('every relative link outside skills/ resolves inside the kit', () => {
		const dead = [];
		const walk = (dir) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const p = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					if (entry.name !== 'skills') walk(p);
					continue;
				}
				if (!entry.name.endsWith('.md')) continue;
				const body = fs.readFileSync(p, 'utf8');
				for (const m of body.matchAll(/\]\((\.[^)]*|[a-z][A-Za-z0-9_./-]*\.(?:md|json|mjs|pdf|css|js))\)/g)) {
					const target = m[1].split('#')[0];
					if (!target || /^(https?:|mailto:)/.test(target)) continue;
					const resolved = path.resolve(path.dirname(p), target);
					if (!fs.existsSync(resolved)) {
						dead.push(`${path.relative(KIT, p)} -> ${target}`);
					}
				}
			}
		};
		walk(KIT);
		assert.deepEqual(
			dead,
			[],
			`${dead.length} link(s) in the kit point at a file the kit does not contain. A reader ` +
				'with no clone cannot follow them, and that reader is the kit\'s entire audience.',
		);
	});

	await t.test('the kit does not tell its reader to open a repo path or obey a HARD RULE', () => {
		const offenders = [];
		const walk = (dir) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const p = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					if (entry.name !== 'skills') walk(p);
					continue;
				}
				if (!entry.name.endsWith('.md')) continue;
				const body = fs.readFileSync(p, 'utf8');
				// An instruction to OPEN a repo doc, and the repo's internal rule
				// index — neither resolves for a reader with no clone and no CLAUDE.md.
				// Keyed on the PATH SHAPE, not a verb: the first draft of this arm
				// matched /open `?lib\/components\// and a capital "Open" walked
				// straight past it. A kit file has no business naming a repo
				// `.docs.md` at all, whatever sentence wraps it.
				for (const re of [/lib\/components\/[^`\s)]*\.docs\.md/, /HARD RULE #\d+/]) {
					const hit = body.match(re);
					if (hit) offenders.push(`${path.relative(KIT, p)}: ${hit[0]}`);
				}
			}
		};
		walk(KIT);
		assert.deepEqual(offenders, [], 'the kit routes its reader somewhere they cannot go');
	});

	/**
	 * THE LINTER HALF. The kit shipped only the presentation reviewer, so an
	 * invented `_class` — the single most likely mistake a model makes writing a
	 * Lattice deck — came back "No findings. The checkable half is clean" while
	 * the deck would not render. An independent checker that passes a broken deck
	 * is worse than none: it certifies the failure.
	 */
	await t.test('the checker rejects a component name that does not exist', () => {
		const { execFileSync } = require('node:child_process');
		const os = require('node:os');
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-lint-'));
		const deck = path.join(tmp, 'bad.md');
		fs.writeFileSync(
			deck,
			['---', 'marp: true', '---', '', '<!-- _class: totally-not-a-component -->', '', '## A claim.', '', '- one', ''].join('\n'),
		);
		const out = execFileSync(process.execPath, [path.join(KIT, 'review', 'check.mjs'), deck, '--json'], {
			encoding: 'utf8',
		});
		fs.rmSync(tmp, { recursive: true, force: true });
		const [{ findings }] = JSON.parse(out).files;
		const unknown = findings.find((f) => f.rule === 'unknown-class');
		assert.ok(unknown, 'an invented _class passed the checker clean');
		// lint-core writes for a repo reader; its fix strings name two paths a kit
		// consumer does not have, and the CLI rewrites them to the kit's own.
		assert.doesNotMatch(unknown.fix, /dist\/docs|design\/design-system/, 'the fix routes outside the kit');
		assert.match(unknown.fix, /reference\/components\.json/);
	});

	/**
	 * THE PUBLISH FILTER — derived, not maintained by eye.
	 *
	 * publish-kits.yml republishes the kit on a push to `main` that touches an
	 * input. An input MISSING from that list is the worst kind of defect here:
	 * nothing errors, no check goes red, the kit just quietly serves stale
	 * content until someone happens to touch a different input. The workflow's
	 * own comment claimed the list had been verified while CLAUDE.md and
	 * build-bucket-galleries.js were both absent from it.
	 *
	 * So this reads the generator's `path.join(ROOT, ...)` literals — every
	 * repo-relative file it opens — and checks each against the filter.
	 */
	await t.test('every input the generator reads is in the publish filter', () => {
		const gen = fs.readFileSync(path.join(ROOT, 'tools', 'build-agent-kit.mjs'), 'utf8');
		const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'publish-kits.yml'), 'utf8');
		const patterns = [...wf.matchAll(/^\s+- '([^']+)'$/gm)].map((m) => m[1]);
		assert.ok(patterns.length > 10, 'could not parse the path filter — the arm would pass blind');

		// `design/skills/**` covers both the directory the generator opens and every
		// file under it; an exact pattern covers only itself.
		const covered = (file) =>
			patterns.some((pat) =>
				pat.endsWith('/**')
					? file === pat.slice(0, -3) || file.startsWith(pat.slice(0, -2))
					: pat === file,
			);

		const uncovered = [];
		for (const m of gen.matchAll(/path\.join\(ROOT, ((?:'[^']*'|\s|,)+)\)/g)) {
			const parts = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
			if (!parts.length) continue; // a computed segment (bucket, m.name) — the lib/** glob covers those
			const file = parts.join('/');
			// node_modules rides on package-lock.json; dist/ is this build's own output.
			if (file.startsWith('node_modules') || file.startsWith('dist')) continue;
			if (!covered(file)) uncovered.push(file);
		}
		assert.deepEqual(
			uncovered,
			[],
			'build-agent-kit.mjs reads these, but a push changing one would NOT republish the ' +
				'kit — it would serve stale content silently until the nightly backstop ran.',
		);
	});

	/**
	 * A cold-consumer agent could not find front matter anywhere on the
	 * "writing a deck" path. It is the one thing a deck CANNOT render without,
	 * and it lived only in `skills/deck.md` — a file the root README routes to
	 * for "creating a theme, component, finish or lens", not for writing one.
	 * The agent got it right by going off-path.
	 */
	await t.test('the deck-writing path teaches front matter and the modifier catalog', () => {
		const readme = fs.readFileSync(path.join(KIT, 'authoring', 'README.md'), 'utf8');
		assert.match(readme, /marp:\s*true/, 'the authoring README never shows front matter');
		assert.match(readme, /theme:/, 'the authoring README never shows how to pick a theme');
		assert.match(readme, /modifiers\.md/, 'the authoring README never points at the modifier catalog');
	});

	/**
	 * The budget table is what an agent sizes its context against. Every cell in
	 * it is computed from real bytes EXCEPT where someone types one, and the one
	 * typed cell was wrong by up to 87%. A deck also needs one component file per
	 * layout, so a single figure for "writing a deck" describes a one-slide deck:
	 * a cold agent measured a real nine-slide deck at 2.9x the quoted number.
	 */
	await t.test('the budget table quotes a per-component cost, not one flat figure', () => {
		const row = text.split('\n').find((l) => l.includes('per layout you use'));
		assert.ok(row, 'the table has no per-component row — the fixed figure alone understates a real deck');
		assert.match(row, /\+ ~[\d.]+k each/, 'the per-component row does not carry a measured cost');
		const skills = text.split('\n').find((l) => l.includes('creating a theme'));
		assert.doesNotMatch(skills, /~3k each/, 'the skills row is hand-typed again; measure it');
		assert.match(skills, /[\d.]+k–[\d.]+k each/, 'the skills row should quote the measured range');
	});

	/**
	 * A fixed ``` wrapper splits the moment its payload carries one at the start
	 * of a line, and the rest then parses as markup instead of the quoted text it
	 * is meant to be. The canons this kit wraps — DECK_CANON, THEME_CANON,
	 * COMPONENT_CANON — are prose anyone may edit, and COMPONENT_CANON already
	 * carries inline ``` runs. Latent, not live, which is exactly the kind that
	 * ships.
	 */
	await t.test('fenced picks a rail longer than anything inside the payload', async () => {
		const { fenced } = await import('../../../tools/build-agent-kit.mjs');
		const plain = fenced('no fences here');
		assert.equal(plain[0], '```', 'a payload with no fence should not escalate');
		assert.equal(plain[2], plain[0], 'the closer must match the opener');

		for (const [payload, why] of [
			['before\n```\nafter', 'a bare line-leading fence'],
			['before\n```js\ncode\n```\nafter', 'a full nested block'],
			['before\n````\nfour\n````\nafter', 'a four-tick block'],
			['   ```\nindented up to three spaces still opens a fence', 'an indented fence'],
		]) {
			const [open, body, close] = fenced(payload);
			assert.equal(open, close, `${why}: opener and closer must match`);
			assert.ok(open.length >= 4, `${why}: the rail did not escalate past the payload`);
			// The decisive property: no line in the body may open or close the rail.
			const rail = new RegExp(`^ {0,3}\\\`{${open.length},}`, 'm');
			assert.doesNotMatch(body, rail, `${why}: the payload can still break out of the fence`);
		}
	});
});
