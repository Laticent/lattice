
// tools/skill-index.js turns each design/skills/*.md front matter into the index every reader
// uses (README table, index.json for the Studio chat, the agent kit, .claude/skills). These arms
// pin the contract and prove the validator bites.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { mdCell, parseFrontMatter, validate, readSkills } = require('../../../tools/skill-index.js');

const ROOT = path.join(__dirname, '..', '..', '..');

test('every skill in design/skills/ carries valid front matter', () => {
  const errors = [];
  const rows = readSkills(errors);
  assert.deepEqual(errors, []);
  const files = fs.readdirSync(path.join(ROOT, 'design', 'skills')).filter((f) => f.endsWith('.md') && f !== 'README.md');
  assert.equal(rows.length, files.length, 'every skill file is indexed');
  for (const r of rows) assert.ok(r.tokens > 0 && r.description.startsWith('Use when'), `${r.name}: description leads with "Use when"`);
});

test('the committed indexes are fresh (node tools/skill-index.js --check)', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'skill-index.js'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('index.json lists exactly the skills on disk, with what the Studio needs', () => {
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'design', 'skills', 'index.json'), 'utf8'));
  assert.deepEqual(idx.skills.map((s) => s.name), readSkills().map((s) => s.name));
  assert.ok(idx.skills.some((s) => s.studio), 'at least one skill is offered to the Studio chat');
  assert.ok(idx.skills.find((s) => s.name === 'deck')?.studio, 'the deck skill reaches the Studio chat');
});

test('the front matter parses as YAML, the way Claude Code and external agents read it', () => {
  const yaml = require('js-yaml');
  for (const r of readSkills()) {
    const text = fs.readFileSync(path.join(ROOT, r.file), 'utf8');
    const block = text.match(/^---\n([\s\S]*?)\n---\n/)[1];
    const doc = yaml.load(block);
    assert.equal(doc.description, r.description, `${r.name}: YAML and our parser agree on the description`);
  }
});

test('the validator bites: missing block, wrong name, unquoted description, bad kind', () => {
  assert.equal(parseFrontMatter('# no front matter'), null);
  assert.match(validate('deck.md', null)[0], /no front matter/);
  const ok = parseFrontMatter('---\nname: deck\ndescription: "Use when writing a whole deck from a blank file."\nkind: make\nstudio: true\n---\n# x\n').fields;
  assert.deepEqual(validate('deck.md', ok), []);
  assert.ok(validate('theme.md', ok).some((e) => /must equal the file name/.test(e)));
  const unquoted = parseFrontMatter('---\nname: deck\ndescription: Use when: writing a whole deck from a blank file.\nkind: make\nstudio: true\n---\n').fields;
  assert.ok(validate('deck.md', unquoted).some((e) => /quote the description/.test(e)));
  assert.ok(validate('deck.md', { ...ok, kind: 'build' }).some((e) => /kind must be/.test(e)));
  assert.ok(validate('deck.md', { ...ok, studio: 'yes' }).some((e) => /studio must be/.test(e)));
});

test('table cells escape backslashes before pipes', () => {
  assert.equal(mdCell('a|b'), 'a\\|b');
  assert.equal(mdCell('a\\|b'), 'a\\\\\\|b');
});
