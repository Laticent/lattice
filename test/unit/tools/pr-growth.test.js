// tools/pr-growth.js: the pre-merge card's GROWTH section (owner's D3, 2026-11-19).
// Each test that touches git builds its own throwaway repo in its own temp folder (HARD RULE #32).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { classify, commentLines, growth, growthLines } = require('../../../tools/pr-growth');
const { renderCard, displayWidth, WIDTH } = require('../../../tools/agent-card');

const lines = (set) => [...set].sort((a, b) => a - b);

test('classify: each path lands in one row', () => {
  const cases = {
    'engineering/workflow.md': 'docs',
    'CLAUDE.md': 'docs',
    'lib/components/statement/quote/quote.docs.md': 'docs',
    'examples/deck-class-register.md': 'decks',
    'lib/components/statement/quote/quote.gallery.md': 'decks',
    'lib/core/leading-is.js': 'code',
    'docs/src/components/studio/architect-agent.ts': 'code',
    'docs/src/pages/comparison.astro': 'code',
    '.claude/hooks/session-start.sh': 'code',
    'lib/base/base.table-reflow.css': 'style',
    'test/unit/tools/pr-growth.test.js': 'tests',
    'docs/e2e/studio.spec.ts': 'tests',
    'package.json': 'config',
    '.github/workflows/ci.yml': 'config',
    'package-lock.json': 'generated',
    'lib/plugins/styles.generated.js': 'generated',
  };
  for (const [file, kind] of Object.entries(cases)) assert.equal(classify(file), kind, file);
});

test('JS: only lines that are wholly comment count, and look-alikes in strings, regexes and templates do not', () => {
  const src = [
    '// a line comment', // 1 comment
    'const url = "http://example.com"; // trailing', // 2 code (has code)
    'const re = /\\/\\*not a comment/;', // 3 code
    'const t = `/* also not */`;', // 4 code
    '/**', // 5 comment
    ' * JSDoc body', // 6 comment
    ' */', // 7 comment
    '', // 8 blank: neither
    'const s = \'// nope\';', // 9 code
    '  /* indented block */', // 10 comment
    'const sql = `', // 11 code
    '// inside a template literal: text, not a comment', // 12 code (string content)
    '/* also text */', // 13 code (string content)
    '`;', // 14 code
  ].join('\n');
  assert.deepEqual(lines(commentLines('x.js', src)), [1, 5, 6, 7, 10]);
});

test('TS and TSX parse as TypeScript, so a type annotation never confuses the scan', () => {
  const ts = 'type A = { b: string }; // trailing\n// whole\nconst f = (x: number): string => String(x);\n';
  assert.deepEqual(lines(commentLines('x.ts', ts)), [2]);
  const tsx = 'const el = <div>{/* jsx comment */}</div>;\n// whole\n';
  assert.deepEqual(lines(commentLines('x.tsx', tsx)), [2]);
});

test('CSS: block comments count, and a // inside url() does not', () => {
  const css = '/* banner */\n.a { background: url(//cdn.example/x.png); }\n/*\n multi\n*/\n.b { color: red; } /* trailing */\n';
  assert.deepEqual(lines(commentLines('x.css', css)), [1, 3, 4, 5]);
});

test('shell and YAML: # lines count, a shebang and an inline # do not', () => {
  const sh = '#!/bin/bash\n# comment\necho "# not one"\n  # indented\n';
  assert.deepEqual(lines(commentLines('x.sh', sh)), [2, 4]);
  assert.deepEqual(lines(commentLines('x.yml', 'a: 1 # trailing\n# whole\n')), [2]);
});

test('Astro: front matter, HTML comments and style blocks are each read in their own language', () => {
  const astro = '---\n// fm comment\nconst a = "//x";\n---\n<!-- html -->\n<p>hi</p>\n<style>\n/* css */\n.a{}\n</style>\n';
  assert.deepEqual(lines(commentLines('x.astro', astro)), [2, 5, 8]);
});

test('markdown and unknown types have no comment lines', () => {
  assert.equal(commentLines('x.md', '<!-- _class: quote -->\n').size, 0);
  assert.equal(commentLines('x.json', '{"a": 1}\n').size, 0);
});

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-growth-'));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
    GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
  };
  const git = (...a) => execFileSync('git', a, { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  git('init', '-q', '-b', 'main');
  git('config', 'core.autocrlf', 'false');
  const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };
  return { dir, git, write, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('growth() on a real repo: rows match the edit exactly, and comment lines leave the code row', (t) => {
  const r = repo();
  t.after(r.cleanup);
  r.write('lib/a.js', 'const a = 1;\n// old note\nconst b = 2;\n');
  r.write('lib/a.css', '.a { color: red; }\n');
  r.write('README.md', '# Title\n');
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'base');
  r.git('checkout', '-q', '-b', 'feature');
  // a.js: drop the old comment, add one comment line and two code lines.
  r.write('lib/a.js', 'const a = 1;\n// new note\nconst b = 2;\nconst c = 3;\nconst d = 4;\n');
  r.write('lib/a.css', '.a { color: red; }\n/* why */\n.b { color: blue; }\n');
  r.write('README.md', '# Title\n\nMore words.\n');
  r.write('test/a.test.js', '// test\nassert(true);\n');
  r.write('package.json', '{}\n');
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'feature');

  const g = growth({ base: 'main', head: 'HEAD', cwd: r.dir });
  const row = (k) => g.rows.find((x) => x.kind === k);
  assert.deepEqual(row('code'), { kind: 'code', added: 2, removed: 0, files: 1 });
  assert.deepEqual(row('comments'), { kind: 'comments', added: 3, removed: 1, files: 3 });
  assert.deepEqual(row('style'), { kind: 'style', added: 1, removed: 0, files: 1 });
  assert.deepEqual(row('tests'), { kind: 'tests', added: 1, removed: 0, files: 1 });
  assert.deepEqual(row('docs'), { kind: 'docs', added: 2, removed: 0, files: 1 });
  assert.deepEqual(row('config'), { kind: 'config', added: 1, removed: 0, files: 1 });

  // The total equals git's own count, line for line.
  const numstat = r.git('diff', '--numstat', 'main', 'HEAD').trim().split('\n')
    .reduce((acc, l) => { const [a, d] = l.split('\t'); return [acc[0] + Number(a), acc[1] + Number(d)]; }, [0, 0]);
  const total = growthLines(g).at(-1);
  assert.match(total, new RegExp(`\\+${numstat[0]}\\s+−${numstat[1]}\\s+5$`));
});

test('the pre-merge card renders a GROWTH section within the phone width', () => {
  const card = {
    card: 'pre-merge', pr: 1, title: 'x',
    pick: { verdict: 'merge', why: 'w' },
    confidence: { level: 'very high', limited_by: 'nothing', graded_by: 'checker agent' },
    raise_it: 'nothing outstanding', raised: 'none',
    change: { what: 'w', why: 'w' },
    proof: { ran: 'r' },
    risk: { if_wrong: 'w', revert: 'r', left_behind: 'none' },
    growth: { base: 'origin/main', rows: [
      { kind: 'docs', added: 12345, removed: 6789, files: 123 },
      { kind: 'comments', added: 10, removed: 2, files: 1 },
      { kind: 'tests', added: 0, removed: 0, files: 0 },
    ] },
  };
  const r = renderCard(card);
  assert.equal(r.ok, true, r.errors.join('; '));
  const at = r.lines.indexOf('GROWTH — vs main, from git');
  assert.ok(at > 0, 'GROWTH section present');
  assert.ok(!r.lines.some((l) => l.includes('tests')), 'an unchanged kind is left out');
  for (const l of r.lines) assert.ok(displayWidth(l) <= WIDTH, `"${l}" is ${displayWidth(l)} columns`);
});
