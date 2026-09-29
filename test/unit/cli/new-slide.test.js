/**
 * Unit: tools/new-slide.js — scaffolder CLI.
 *
 * Covers:
 *   1. emitSkeleton prints the manifest's skeleton field for a known
 *      component and returns 0
 *   2. emitSkeleton returns 1 and writes a friendly error for unknown
 *      names (with "did you mean" suggestions when applicable)
 *   3. listAll groups by function and includes every shipped component
 *   4. main() dispatches --list, --help, --bogus flag, multi-arg, etc.
 *      with the documented exit codes
 *
 * The scaffolder is also exercised end-to-end via Bash in the integration
 * suite (cli scope), but this unit covers the library surface fast.
 */



const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const { main, listAll, emitSkeleton } = require('../../../tools/new-slide');

function captureStdio(fn) {
  const stdout = [];
  const stderr = [];
  const origOut = process.stdout.write;
  const origErr = process.stderr.write;
  process.stdout.write = (chunk) => { stdout.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { stderr.push(String(chunk)); return true; };
  let result;
  try { result = fn(); }
  finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { result, stdout: stdout.join(''), stderr: stderr.join('') };
}

// Silence the Writable import if linter flags it as unused; it documents
// the stdio-stream shape we're replacing above.
void Writable;

describe('new-slide CLI', () => {
  describe('emitSkeleton', () => {
    test('prints the skeleton for a known component and returns 0', () => {
      const { result, stdout, stderr } = captureStdio(() => emitSkeleton('cards-grid'));
      assert.equal(result, 0);
      assert.equal(stderr, '');
      assert.match(stdout, /<!-- _class: cards-grid -->/);
      assert.match(stdout, /## Slide heading/);
    });

    test('returns 1 and writes to stderr on unknown name', () => {
      const { result, stdout, stderr } = captureStdio(() => emitSkeleton('totally-fake-layout-xyz'));
      assert.equal(result, 1);
      assert.equal(stdout, '');
      assert.match(stderr, /unknown component/);
    });

    test('offers "did you mean" suggestions for near-misses', () => {
      const { stderr } = captureStdio(() => emitSkeleton('cards'));
      // "cards" is a substring of cards-grid, cards-stack
      assert.match(stderr, /did you mean: cards-/);
    });

    test('skeleton always ends with a newline', () => {
      const { stdout } = captureStdio(() => emitSkeleton('quote'));
      assert.ok(stdout.endsWith('\n'), 'skeleton output must end with newline');
    });
  });

  describe('listAll', () => {
    test('lists every component grouped by function family', () => {
      const out = listAll();
      // Header
      // Count is dynamic — grows as new components are authored. Just assert the shape.
      assert.match(out, /\d+ layouts across 8 function families/);
      // Every function family that has components shows up
      for (const fn of ['ANCHOR', 'STATEMENT', 'INVENTORY', 'COMPARISON', 'PROGRESSION', 'EVIDENCE', 'IMAGERY']) {
        assert.match(out, new RegExp(`^${fn}$`, 'm'), `family ${fn} missing from listing`);
      }
      // A spot-check that descriptions are present
      assert.match(out, /cards-grid\s+2.4 parallel items/);
    });

    test('orders components within each family by name', () => {
      const out = listAll();
      const anchorSection = out.match(/ANCHOR\n((?: {2}[a-z-]+ .*\n)+)/);
      assert.ok(anchorSection, 'anchor section not found');
      const names = [...anchorSection[1].matchAll(/ {2}([a-z-]+) /g)].map((m) => m[1]);
      const sorted = [...names].sort();
      assert.deepEqual(names, sorted);
    });
  });

  describe('main', () => {
    test('returns 2 and prints usage when called with no args', () => {
      const { result, stderr } = captureStdio(() => main([]));
      assert.equal(result, 2);
      assert.match(stderr, /Usage:/);
    });

    test('returns 0 and prints usage on --help', () => {
      const { result, stdout } = captureStdio(() => main(['--help']));
      assert.equal(result, 0);
      assert.match(stdout, /Usage:/);
    });

    test('returns 0 and prints usage on -h', () => {
      const { result, stdout } = captureStdio(() => main(['-h']));
      assert.equal(result, 0);
      assert.match(stdout, /Usage:/);
    });

    test('returns 0 and prints catalog on --list', () => {
      const { result, stdout } = captureStdio(() => main(['--list']));
      assert.equal(result, 0);
      assert.match(stdout, /ANCHOR/);
    });

    test('returns 2 on unknown flag', () => {
      const { result, stderr } = captureStdio(() => main(['--bogus']));
      assert.equal(result, 2);
      assert.match(stderr, /unknown flag/);
    });

    test('returns 2 on multiple positional args', () => {
      const { result, stderr } = captureStdio(() => main(['cards-grid', 'extra-arg']));
      assert.equal(result, 2);
      assert.match(stderr, /expected one component name/);
    });

    test('returns 0 and emits skeleton on a single valid name', () => {
      const { result, stdout } = captureStdio(() => main(['quote']));
      assert.equal(result, 0);
      assert.match(stdout, /<!-- _class: quote -->/);
    });

    test('returns 1 on unknown component name', () => {
      const { result, stderr } = captureStdio(() => main(['bogus']));
      assert.equal(result, 1);
      assert.match(stderr, /unknown component/);
    });
  });
});
