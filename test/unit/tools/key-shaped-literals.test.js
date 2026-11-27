/**
 * `checkKeyShapedLiterals` (engineering/testing.md §Test data): no committed text file carries a string shaped like a
 * real API key. The pure matcher is checked for each prefix; the gate's arms plant a key in a scratch repository and
 * expect a finding that names the file, the line and the prefix, and never echoes the literal itself.
 *
 * This file is itself in the check's scope, so every planted key is built from split strings.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { keyShapedLiterals, checkKeyShapedLiterals } = require('../../../tools/check-ownership.js');

const key = (prefix, body) => prefix + body;
const BODY = 'e2eFakeKeyBody0123456789';

describe('keyShapedLiterals', () => {
  for (const prefix of ['sk-ant-', 'sk-or-v1-', 'sk-proj-', 'ghp_', 'github_pat_', 'AIza', 'AQ.', 'xoxb-']) {
    test(`finds ${prefix} followed by a long run of key characters`, () => {
      assert.deepEqual(keyShapedLiterals(`a\nconst k = '${key(prefix, BODY)}';\n`), [{ line: 2, prefix }]);
    });
  }
  test('finds an AWS access key id: AKIA and 16 upper-case letters or digits', () => {
    assert.deepEqual(keyShapedLiterals(`'${key('AKIA', 'ABCDEFGHIJ012345')}'`), [{ line: 1, prefix: 'AKIA' }]);
  });
  test('passes a short placeholder, a prefix inside a longer word, and a key built from two strings', () => {
    assert.deepEqual(keyShapedLiterals("placeholder: 'sk-or-v1-…'"), []);
    assert.deepEqual(keyShapedLiterals(`'${key('sk-or-v1-', 'short-0a0a')}'`), []);
    assert.deepEqual(keyShapedLiterals(`'x${key('AIza', BODY)}'`), []);
    assert.deepEqual(keyShapedLiterals(`fakeKey('sk-ant-', '${BODY}')`), []);
    assert.deepEqual(keyShapedLiterals(`'${key('AKIA', 'ABCDEFGHIJ0123456')}'`), []); // 17: not the 16-character id
  });
});

describe('checkKeyShapedLiterals', () => {
  const scratch = (files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'key-shaped-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
    execFileSync('git', ['add', '-A'], { cwd: dir });
    return dir;
  };

  test('fails on a committed file with a key-shaped literal, naming the file, line and prefix but not the literal', () => {
    const literal = key('sk-ant-', BODY);
    const dir = scratch({ 'docs/e2e/a.spec.ts': `// a\nconst k = '${literal}';\n`, 'src/ok.ts': "export const p = 'sk-ant-…';\n" });
    try {
      const errors = [];
      checkKeyShapedLiterals(errors, dir);
      assert.equal(errors.length, 1, errors.join('\n'));
      assert.match(errors[0], /^docs\/e2e\/a\.spec\.ts:2: .*`sk-ant-…`/);
      assert.ok(!errors[0].includes(literal), 'the finding must not echo the key');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('passes a tree whose keys are built at run time, and an untracked file is out of scope', () => {
    const dir = scratch({ 'a.test.ts': `const k = fakeKey('sk-or-v1-', '${BODY}');\n` });
    try {
      fs.writeFileSync(path.join(dir, 'untracked.ts'), `'${key('sk-or-v1-', BODY)}'`);
      const errors = [];
      checkKeyShapedLiterals(errors, dir);
      assert.deepEqual(errors, []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('passes a tree with no key prefix anywhere (git grep finds nothing and exits 1)', () => {
    const dir = scratch({ 'a.test.ts': 'export const n = 1;\n' });
    try {
      const errors = [];
      checkKeyShapedLiterals(errors, dir);
      assert.deepEqual(errors, []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a colored git grep cannot hide a finding', () => {
    const dir = scratch({ 'a.spec.ts': `'${key('AIza', BODY)}'\n` });
    execFileSync('git', ['config', 'color.ui', 'always'], { cwd: dir });
    try {
      const errors = [];
      checkKeyShapedLiterals(errors, dir);
      assert.equal(errors.length, 1, errors.join('\n'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the repository itself holds none', () => {
    const errors = [];
    checkKeyShapedLiterals(errors);
    assert.deepEqual(errors, []);
  });
});
