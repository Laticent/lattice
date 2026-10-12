/**
 * Unit: the per-ROW budget on dist/engineering/capabilities.md
 * (`ROW_CAP` in tools/build-capabilities.js).
 *
 * The catalog is read by GREP — HARD RULE #15 sends every "am I about to reinvent
 * this?" question to it, and what that reader pays is the rows a query returns, not
 * the file. So the budget is per-row, and this suite asserts the check that enforces
 * it rather than anything about the live catalog.
 *
 * NO ASSERTION HERE READS THE COMMITTED FILE, deliberately. A test like "the widest
 * live row is under the cap" is an aggregate over every capability in the repo: it
 * goes red when an unrelated PR adds a script, and it bills whoever trips it for 300
 * predecessors' contributions. That is the #1547 mistake, and `build-decisions-index`
 * already had it removed once. The freshness of the committed file is
 * `capabilities:check`'s job; the budget is this one's.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { rowCostProblems, ROW_CAP } = require('../../../tools/build-capabilities.js');

const rowOf = (name, len) => `| \`${name}\` | ${'x'.repeat(len)} |`;
/** Pad a description so the WHOLE rendered row lands on exactly `total` characters. */
const rowExactly = (name, total) => rowOf(name, total - rowOf(name, 0).length);

describe('capabilities row budget', () => {
  it('passes a row inside the cap', () => {
    assert.deepEqual(rowCostProblems([rowExactly('bench', ROW_CAP - 1)]), []);
  });

  it('passes a row exactly at the cap', () => {
    const row = rowExactly('bench', ROW_CAP);
    assert.equal(row.length, ROW_CAP);
    assert.deepEqual(rowCostProblems([row]), []);
  });

  it('fails a row one character over, and names the capability', () => {
    const problems = rowCostProblems([rowExactly('contrast:player', ROW_CAP + 1)]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^contrast:player: /);
    assert.match(problems[0], new RegExp(`${ROW_CAP + 1} characters`));
  });

  it('names where the row is edited AND warns about recall — the lever, not just the breach', () => {
    const [problem] = rowCostProblems([rowExactly('intent:pick-agents', ROW_CAP + 200)]);
    assert.match(problem, /tools\/script-docs\//);
    // The recall warning is the load-bearing half. The first cut of this gate trimmed
    // eleven rows into a lower cap and ~130 words stopped matching anywhere in the file;
    // a message that says only "too long" invites exactly that fix again.
    assert.match(problem, /read by grep/);
  });

  it('reports every over-cap row, not just the first', () => {
    const problems = rowCostProblems([
      rowExactly('a', ROW_CAP + 1),
      rowExactly('b', 100),
      rowExactly('c', ROW_CAP + 50),
    ]);
    assert.deepEqual(problems.map((p) => p.split(':')[0]), ['a', 'c']);
  });

  it('still identifies a row whose name is not backticked', () => {
    const [problem] = rowCostProblems([`| plain name | ${'x'.repeat(ROW_CAP)} |`]);
    assert.ok(problem.startsWith('| plain name |'), problem.slice(0, 40));
  });

  it('is a character budget, so a multi-byte row is not billed twice', () => {
    // The rows are full of em dashes and arrows; length is UTF-16 units, not bytes.
    const row = `| \`x\` | ${'—'.repeat(ROW_CAP)} |`;
    assert.equal(rowCostProblems([row]).length, 1);
    assert.match(rowCostProblems([row])[0], new RegExp(`${row.length} characters`));
  });
});

describe('script descriptions: one file per script', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { loadScriptMeta, parseScriptDoc, scriptFileName } = require('../../../tools/build-capabilities.js');
  const GROUPS = ['Build & bundle', 'Meta'];
  const doc = (group, desc) => `---\ngroup: ${group}\n---\n${desc}\n`;
  const withDir = (files, run) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'script-docs-'));
    try {
      for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), text);
      return run(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  it('writes a colon as a plus, so the name is a legal file name everywhere', () => {
    assert.equal(scriptFileName('build:check'), 'build+check.md');
    assert.equal(scriptFileName('test'), 'test.md');
  });

  it('reads group and description, folding a wrapped description to one line', () => {
    assert.deepEqual(parseScriptDoc('---\ngroup: Meta\n---\nfirst\nsecond\n'), { group: 'Meta', desc: 'first second' });
  });

  it('rejects a file with no front-matter, no group or no description', () => {
    assert.ok(parseScriptDoc('just text').error);
    assert.ok(parseScriptDoc('---\nfoo: 1\n---\ntext\n').error);
    assert.ok(parseScriptDoc('---\ngroup: Meta\n---\n\n').error);
  });

  it('loads a described script', () => {
    const { meta, problems } = withDir({ 'build+check.md': doc('Build & bundle', 'Gate.') }, (d) =>
      loadScriptMeta(['build:check'], GROUPS, d));
    assert.deepEqual(problems, []);
    assert.deepEqual(meta['build:check'], ['Build & bundle', 'Gate.']);
  });

  it('a script with no file is simply absent from meta, which render() turns into a failing TODO', () => {
    const { meta } = withDir({}, (d) => loadScriptMeta(['fake:new'], GROUPS, d));
    assert.equal(meta['fake:new'], undefined);
  });

  it('flags a file whose script no longer exists', () => {
    const { problems } = withDir({ 'gone.md': doc('Meta', 'x') }, (d) => loadScriptMeta(['other'], GROUPS, d));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /gone\.md: no package\.json script/);
  });

  it('flags an unknown group instead of silently dropping the row', () => {
    const { meta, problems } = withDir({ 'a.md': doc('Nope', 'x') }, (d) => loadScriptMeta(['a'], GROUPS, d));
    assert.equal(meta.a, undefined);
    assert.match(problems[0], /unknown group "Nope"/);
  });

  it('--check fails on a package.json script with no description file (real generator, scratch tree)', () => {
    // A copy of the generator in a temp tree, so no test touches the repo's package.json
    // while other test files read it in parallel.
    const { spawnSync } = require('node:child_process');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-root-'));
    try {
      fs.mkdirSync(path.join(root, 'tools', 'script-docs'), { recursive: true });
      fs.copyFileSync(path.join(__dirname, '../../../tools/build-capabilities.js'), path.join(root, 'tools', 'build-capabilities.js'));
      const run = (scripts) => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts }));
        return spawnSync(process.execPath, ['tools/build-capabilities.js', '--check'], { cwd: root, encoding: 'utf8' });
      };
      const failing = run({ 'zz:fake-undescribed': 'true' });
      assert.equal(failing.status, 1);
      assert.match(failing.stderr, /script: zz:fake-undescribed/);
      fs.writeFileSync(path.join(root, 'tools', 'script-docs', 'zz+fake-undescribed.md'), doc('Meta', 'Described.'));
      assert.equal(run({ 'zz:fake-undescribed': 'true' }).status, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
