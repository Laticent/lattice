'use strict';
/**
 * The fleet and desk skills tell an agent to read a doc "by section": `§Desks`,
 * `§Merge queue — the facts`, `§5`. A renamed heading makes that lookup return
 * nothing, silently, and the agent works from memory instead. This test resolves
 * every `§Name` those skills cite against the real headings under `engineering/`,
 * so a rename goes red here instead.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SKILLS = path.join(ROOT, '.claude', 'skills');

function markdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return markdownFiles(p);
    return e.name.endsWith('.md') ? [p] : [];
  });
}

/** Every heading's text, and its short name (before " (" or " — "), under engineering/. */
function headings() {
  const out = [];
  for (const file of markdownFiles(path.join(ROOT, 'engineering'))) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = /^#{1,6} (.+)$/.exec(line);
      if (!m) continue;
      const text = m[1].trim();
      out.push({ text, short: text.split(/ \(| — /)[0].trim() });
    }
  }
  return out;
}

/** The `§Name` citations in one skill, with line breaks and indentation joined. */
function citations(source) {
  const flat = source.replace(/\n\s*/g, ' ');
  return [...flat.matchAll(/§(.+?)(?=[,;(`"]| and\b| then\b|\. |\.$| §|$)/g)].map((m) => m[1].trim());
}

const resolves = (cite, all) => all.some((h) => h.text.startsWith(cite) || cite.startsWith(h.short));

function citingSkills() {
  return fs
    .readdirSync(SKILLS)
    .filter((d) => /^(desk-|fleet$)/.test(d))
    .map((d) => path.join(SKILLS, d, 'SKILL.md'));
}

test('every § section a fleet or desk skill cites is a real heading', () => {
  const all = headings();
  const skills = citingSkills();
  assert.ok(skills.length >= 8, `found ${skills.length} fleet/desk skills`);
  const broken = [];
  let checked = 0;
  for (const file of skills) {
    for (const cite of citations(fs.readFileSync(file, 'utf8'))) {
      checked++;
      if (!resolves(cite, all)) broken.push(`${path.relative(ROOT, file)}: §${cite}`);
    }
  }
  assert.ok(checked >= 20, `only ${checked} citations parsed; the parser broke`);
  assert.deepEqual(broken, [], `cited sections with no heading:\n${broken.join('\n')}`);
});

test('the parser splits joined citations and a renamed heading is caught', () => {
  assert.deepEqual(citations('read §Desks, §Merge queue — the\n   facts and §5 and §9 then'), [
    'Desks',
    'Merge queue — the facts',
    '5',
    '9',
  ]);
  const all = [{ text: 'Merging', short: 'Merging' }];
  assert.equal(resolves('Merging', all), true);
  assert.equal(resolves('Merge order', all), false);
});
