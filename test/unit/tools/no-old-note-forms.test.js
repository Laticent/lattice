// No old-form note anywhere in the tree (engineering/decisions/2026-11-20-four-notes.md).
//
// The four notes replaced `<!-- say: … -->`, `<!-- describe: … -->`, `<!-- reader: … -->`, the Studio's
// `<!-- note: … -->`, a record's `note=` / `say=` / `describe=` / `reader=` fields and the front-matter `say:` map,
// with NO alias: an old form reaches nothing. `lint:deck` catches one in a deck, and `lattice migrate notes` rewrites a
// deck, but neither reaches a test fixture typed into a `.ts` file, a writer that still emits the old form, or a PR
// that merges after the migration ran. This test does: it reads every tracked text file.
//
// The allowlist is the history and the machinery that must name the old forms to retire them, each with its reason.
// A new entry goes in with its reason, never as a silent edit.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');

/** Files that name the old forms on purpose. */
const SANCTIONED = new Map([
  // History: decision notes and the changelog record what the syntax was.
  ['engineering/decisions/', 'decision notes record the syntax as it was'],
  ['changelog.d/', 'changelog fragments record the change'],
  ['CHANGELOG.md', 'the released changelog records the syntax as it was'],
  ['changelog/pre-release-archive.md', 'the pre-release changelog archive records the syntax as it was'],
  // Frozen corpora: text captured from the tree at a point in time, which a test or a measurement compares against.
  // Rewriting one would change what it measures, not migrate a deck (HARD RULE #21 names the benchmark fixture).
  ['test/benchmark/fixtures/inline-spans.json', 'the pre-registered inline-span benchmark corpus'],
  ['test/unit/tools/fixtures/list-text.frozen.json', 'the frozen list-text reader corpus the grammar is diffed against'],
  ['tools/frame-lab/bakeoff/corpus.json', 'the frame-lab bake-off corpus, sampled from the tree when it was measured'],
  ['spec/LFM-1.0.md', 'ratified LFM 1.0 specifies the 1.x note semantics'],
  ['spec/LFM-1.1.md', 'the LFM 1.1 draft specifies the 1.x note semantics'],
  ['docs/src/content/docs/spec/lfm.md', 'the docs projection of ratified LFM 1.0'],
  // The machinery that retires them must name them.
  ['lib/authoring/lint-core.js', 'the `note-key-retired` rule matches the old keys'],
  ['lib/authoring/notes-core.js', '`--strip-say` still scrubs a retired `say:` comment and map from shipped source'],
  ['lib/authoring/notes-migrate.mjs', 'the migration reads the old forms to rewrite them'],
  ['lib/cli/migrate-notes.mjs', 'the migration help shows the old forms it rewrites'],
  ['docs/src/content/docs/reference/cli.md', 'the `lattice migrate notes` reference shows what it rewrites'],
  ['design/skills/', 'skills name the retired keys so an author knows what replaced them'],
  ['spec/diagnostics.md', 'the diagnostics table names what `note-key-retired` reports'],
  ['docs/src/content/docs/spec/diagnostics.md', 'the docs copy of the diagnostics table'],
  ['test/unit/tools/no-old-note-forms.test.js', 'this test'],
  ['test/unit/authoring/notes-migrate.test.js', 'the migration test feeds it the old forms'],
  ['test/unit/components/lint-core.test.js', 'the `note-key-retired` rule test feeds it the old keys'],
  ['test/unit/authoring/notes-core.test.js', 'the retired-scrub and not-a-note tests feed it the old forms'],
  ['test/unit/core/meta-door.test.js', 'the `meta-note-field` and retired-field scrub tests feed records the old fields'],
  ['test/unit/export/marp-directives.test.js', 'the Marp bridge test proves a retired `note=` field is reported and dropped'],
]);

const sanctioned = (file) => [...SANCTIONED.keys()].some((k) => (k.endsWith('/') ? file.startsWith(k) : file === k));

// An old comment key, in the engine's comment shape (lowercase, as the engine read `say:`, `reader:` and `note:`;
// `describe:` in any case).
const OLD_COMMENT = /<!-{2,}[ \t]*(?:say|reader|note|[Dd][Ee][Ss][Cc][Rr][Ii][Bb][Ee])[ \t]*:/;
// A record's note field: `<!-- {…, note="…"} -->` or a `note: |` line inside a record comment.
const OLD_RECORD_FIELD = /<!--[ \t]*(?:@meta)?\{[^}\n]*\b(?:note|say|describe|reader)[ \t]*=/;
// A front-matter `say:` / `captions:` map: the key at column 0 with a numbered entry under it, ANYWHERE in the file,
// because a test writes its deck inside a template string, where the deck's front matter does not open the file
// (docs/e2e/hidden-slides-surfaces.spec.ts did, on PR 3351).
const OLD_SAY_MAP = /^(?:say|captions)[ \t]*:[ \t]*\r?\n[ \t]+\d+[ \t]*:/m;

/**
 * Every old form in one file's text, as `line: excerpt`.
 * @param {string} text
 * @returns {string[]}
 */
function oldForms(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (OLD_COMMENT.test(line) || OLD_RECORD_FIELD.test(line)) out.push(`${i + 1}: ${line.trim().slice(0, 100)}`);
  });
  if (OLD_SAY_MAP.test(text)) out.push('front matter: a `say:` map');
  return out;
}

test('no tracked file carries an old-form note outside the sanctioned history', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter((f) => f && /\.(md|mdx|js|mjs|cjs|ts|tsx|astro|json|yaml|yml|html)$/.test(f) && !sanctioned(f));
  const found = [];
  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    } catch {
      continue; // deleted in the working tree
    }
    if (!text.includes('<!--') && !/^﻿?---/.test(text)) continue;
    for (const hit of oldForms(text)) found.push(`${f}:${hit}`);
  }
  assert.deepEqual(found, [], `old-form notes reach nothing; write @note/@say/@alt/@handout (\`lattice migrate notes\` rewrites a deck):\n${found.join('\n')}`);
});

test('every sanctioned entry still names a file or folder that exists', () => {
  for (const k of SANCTIONED.keys()) assert.ok(fs.existsSync(path.join(ROOT, k)), `stale sanction: ${k}`);
});

test('the scanner finds each old form (the failing arm)', () => {
  assert.equal(oldForms('<!-- say: hello -->').length, 1);
  assert.equal(oldForms('<!-- Describe: a chart -->').length, 1);
  assert.equal(oldForms('<!-- reader: later -->').length, 1);
  assert.equal(oldForms('<!-- note: mine -->').length, 1);
  assert.equal(oldForms('<!-- {layout=cards, note="x"} -->').length, 1);
  assert.equal(oldForms('---\ntheme: indaco\nsay:\n  3: Hello.\n---\n\n# A\n').length, 1);
  assert.equal(oldForms('const DECK = `---\ntheme: indaco\nsay:\n  1: Alpha.\n---\n`;').length, 1, 'a deck inside a template string');
  assert.deepEqual(oldForms('<!-- @say{hello} -->\n<!-- Say: a private note -->\n<!-- {layout=cards} -->\n---\nsay:\n'), []);
});
