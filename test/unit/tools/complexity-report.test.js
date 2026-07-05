const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const acorn = require('acorn');

const { cyclomaticComplexity, analyzeFile } = require('../../../tools/complexity-report.js');

/** Parse a single top-level function declaration and hand back its AST node. */
function parseFunction(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' });
  return ast.body[0];
}

test('a function with no branches has complexity 1', () => {
  const fn = parseFunction('function f() { return 1; }');
  assert.equal(cyclomaticComplexity(fn), 1);
});

test('if / else-if each add one decision point', () => {
  const fn = parseFunction(`
    function f(x) {
      if (x) { return 1; }
      else if (x > 2) { return 2; }
      return 3;
    }
  `);
  assert.equal(cyclomaticComplexity(fn), 3); // base 1 + if + else-if
});

test('short-circuit && / || each add one decision point', () => {
  const fn = parseFunction('function f(x, y, z) { return (x && y) || z; }');
  assert.equal(cyclomaticComplexity(fn), 3); // base 1 + && + ||
});

test('a for loop and switch cases add decision points, default does not', () => {
  const fn = parseFunction(`
    function f(items) {
      for (const i of items) {
        switch (i) {
          case 1: break;
          case 2: break;
          default: break;
        }
      }
    }
  `);
  assert.equal(cyclomaticComplexity(fn), 4); // base 1 + for-of + case 1 + case 2 (default excluded)
});

test('a nested function does not inflate the outer function\'s complexity', () => {
  const fn = parseFunction(`
    function outer() {
      function inner(x) {
        if (x) { return 1; }
        if (x > 2) { return 2; }
      }
      return inner;
    }
  `);
  assert.equal(cyclomaticComplexity(fn), 1); // outer itself branches on nothing
});

test('analyzeFile reports per-function complexity and file-level SLOC', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'complexity-report-test-'));
  const file = path.join(dir, 'sample.js');
  fs.writeFileSync(
    file,
    `
    function simple() { return 1; }

    function branchy(x) {
      if (x) { return 1; }
      else if (x > 2) { return 2; }
      return 3;
    }
    `,
  );

  const result = analyzeFile(file);
  assert.equal(result.error, undefined);
  assert.equal(result.functions.length, 2);

  const simple = result.functions.find((f) => f.name === 'simple');
  const branchy = result.functions.find((f) => f.name === 'branchy');
  assert.equal(simple.complexity, 1);
  assert.equal(branchy.complexity, 3);
  assert.equal(result.maxComplexity, 3);
  assert.ok(result.sloc > 0);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('analyzeFile reports a parse error instead of throwing on invalid syntax', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'complexity-report-test-'));
  const file = path.join(dir, 'broken.js');
  fs.writeFileSync(file, 'function ( { this is not valid javascript');

  const result = analyzeFile(file);
  assert.ok(result.error, 'a syntax error is reported, not thrown');
  assert.deepEqual(result.functions, []);

  fs.rmSync(dir, { recursive: true, force: true });
});
