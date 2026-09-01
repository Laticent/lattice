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

	await t.test('every skill the bootstrap offers actually ships', () => {
		for (const m of text.matchAll(/`skills\/([a-z-]+\.md)`/g)) {
			assert.ok(
				fs.existsSync(path.join(KIT, 'skills', m[1])),
				`the bootstrap offers skills/${m[1]}, which is not in the kit`,
			);
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
		const out = execFileSync(process.execPath, [check, deck, '--json'], { encoding: 'utf8' });
		const findings = JSON.parse(out);
		fs.rmSync(tmp, { recursive: true, force: true });
		assert.ok(
			findings.some((f) => f.rule === 'label-title'),
			'the shipped checker did not flag a label heading. It is the kit\'s only independent ' +
				'quality gate; if it stops biting, an agent grades its own work.',
		);
		assert.ok(findings.every((f) => f.message), 'findings must carry a human-readable message');
	});

	await t.test('generated table cells escape backslash as well as pipe', () => {
		// CodeQL flagged this as two high-severity alerts: escaping `|` alone leaves a
		// trailing backslash free to escape the table's own delimiter and silently break
		// the row. The inputs are prose anyone may edit, so this is a latent defect, not
		// a hypothetical one.
		for (const rel of [
			['review', 'rubric.md'],
			['skills', 'README.md'],
		]) {
			const doc = fs.readFileSync(path.join(KIT, ...rel), 'utf8');
			for (const line of doc.split('\n')) {
				if (!line.startsWith('|') || /^\|[\s-]*\|[\s-]*\|?\s*$/.test(line)) continue;
				// A cell may legitimately END in an escaped backslash (\\\\) but never in a
				// lone one, which would swallow the delimiter that follows.
				assert.doesNotMatch(
					line,
					/[^\\]\\ *\|/,
					`${rel.join('/')} has a table cell ending in an unescaped backslash, which ` +
						'escapes the delimiter and breaks the row:\n  ' + line,
				);
			}
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
});
