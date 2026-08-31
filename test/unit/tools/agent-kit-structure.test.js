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
const BOOTSTRAP = path.join(KIT, 'BOOTSTRAP.md');
const built = fs.existsSync(BOOTSTRAP);

const skip = built ? false : 'dist/agent-kit not built — run `npm run build`';

test('agent kit structure', { skip }, async (t) => {
	const text = fs.readFileSync(BOOTSTRAP, 'utf8');

	await t.test('the four task folders exist and are non-empty', () => {
		for (const dir of ['authoring', 'components', 'skills', 'reference']) {
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
			.filter((f) => f.endsWith('.md') && f !== '_index.md')
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
			.filter((f) => f.endsWith('.md'))
			.sort();
		assert.deepEqual(kit, src, 'the kit ships a different set of skills than design/skills/');
		for (const f of src) {
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
		// FINISH_SYSTEM is extracted from TypeScript via esbuild, so assert on a
		// stable sentence of its own rather than re-running the bundle here.
		assert.match(
			doc,
			/You design a SLIDE FINISH/,
			'FINISH_SYSTEM missing — its esbuild extraction from architect.ts has probably broken',
		);
		assert.match(
			doc,
			/the skill is the safer bet/,
			'studio-prompts.md no longer states which source wins when a prompt and a skill ' +
				'disagree. 2026-07-19 found these prompts had silently drifted twice; without the ' +
				'precedence note a reader may follow the drifted one.',
		);
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
