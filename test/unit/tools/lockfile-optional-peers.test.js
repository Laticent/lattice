/**
 * Unit: the lockfile optional-peer gate (tools/check-ownership.js).
 *
 * npm and Dependabot disagree about optional peer dependencies. npm materializes
 * one whenever it can resolve it; Dependabot's lockfile writer deletes it. So a
 * committed lockfile holding a node npm placed for an optional peer is a time
 * bomb: the tree is green here, and every Dependabot PR against that directory
 * arrives with the subtree gone and `npm ci` failing EUSAGE.
 *
 * #1491 is the worked example — `proxy-agent@8.0.2` under `puppeteer-core`, four
 * /docs Dependabot PRs red for three weeks, and a `npm ci` message naming
 * puppeteer on a PR whose whole diff was `brace-expansion`.
 *
 * THE GATE ASKS NPM RATHER THAN RE-DERIVING. npm annotates each node it placed
 * with `peer` / `optional`, and the conjunction is an exact match for what
 * Dependabot deletes (14 of 14, measured on the real #1489 commit). An earlier
 * draft walked the graph and classified by incoming edges; it found 1 of those
 * 14. These tests pin the flag semantics, not a graph walk.
 *
 * Both verdicts run through the PURE functions on BUILT fixtures, because the
 * gate itself reads the two committed lockfiles and those are (correctly) clean
 * — a suite that only ever saw the real files would stay green with the
 * condition inverted. The real lockfiles get their own arm at the bottom, which
 * is a ratchet on the tree rather than a test of the logic.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const TOOLS = path.join(__dirname, '..', '..', '..', 'tools');
const {
  checkLockfileOptionalPeers,
  optionalPeerNodes,
  lockAnnotationCount,
  lockNodeName,
  OPTIONAL_PEER_LOCKFILES,
} = require(path.join(TOOLS, 'check-ownership.js'));

/** A lockfile `packages` map with the boilerplate every node carries filled in. */
const lock = (nodes) =>
  Object.fromEntries(Object.entries(nodes).map(([key, node]) => [key, { version: '1.0.0', ...node }]));

/** The shape #1491 was, as npm annotates it. */
const puppeteerShape = () =>
  lock({
    '': { dependencies: { 'puppeteer-core': '^25.1.0' } },
    'node_modules/puppeteer-core': { version: '25.1.0' },
    'node_modules/puppeteer-core/node_modules/proxy-agent': {
      version: '8.0.2',
      peer: true,
      optional: true,
    },
  });

describe('optionalPeerNodes — the flag conjunction', () => {
  test('flags a node npm marked both peer and optional', () => {
    assert.deepEqual(optionalPeerNodes(puppeteerShape()), [
      'node_modules/puppeteer-core/node_modules/proxy-agent',
    ]);
  });

  test('a REQUIRED peer is not a finding — Dependabot keeps those', () => {
    // 8 of these in docs/package-lock.json today, all kept by Dependabot.
    const packages = puppeteerShape();
    delete packages['node_modules/puppeteer-core/node_modules/proxy-agent'].optional;
    assert.deepEqual(optionalPeerNodes(packages), []);
  });

  test('an optionalDependency is not a finding — optional-dependency and optional-PEER differ', () => {
    // 131 of these in docs/package-lock.json today, all kept by Dependabot.
    const packages = puppeteerShape();
    delete packages['node_modules/puppeteer-core/node_modules/proxy-agent'].peer;
    assert.deepEqual(optionalPeerNodes(packages), []);
  });

  test('`optional: false` on a peer is NOT a finding — the check is strict, not truthy', () => {
    // Pins `=== true` against a loosening to `!== undefined`, which would flag this.
    const packages = puppeteerShape();
    packages['node_modules/puppeteer-core/node_modules/proxy-agent'].optional = false;
    assert.deepEqual(optionalPeerNodes(packages), []);
  });

  test('`peer: false` with `optional: true` is NOT a finding', () => {
    const packages = puppeteerShape();
    packages['node_modules/puppeteer-core/node_modules/proxy-agent'].peer = false;
    assert.deepEqual(optionalPeerNodes(packages), []);
  });

  test('a HOISTED optional peer is found — 2 of #1491\'s 14 were root-level', () => {
    // The graph walk this replaced could not see these at all.
    const packages = lock({
      '': { dependencies: { a: '^1' } },
      'node_modules/a': {},
      'node_modules/proxy-agent-negotiate': { version: '1.1.0', peer: true, optional: true },
    });
    assert.deepEqual(optionalPeerNodes(packages), ['node_modules/proxy-agent-negotiate']);
  });

  test('the root "" key is never a finding, however it is annotated', () => {
    const packages = puppeteerShape();
    packages[''].peer = true;
    packages[''].optional = true;
    assert.deepEqual(optionalPeerNodes(packages), [
      'node_modules/puppeteer-core/node_modules/proxy-agent',
    ]);
  });

  test('a clean tree produces nothing', () => {
    assert.deepEqual(optionalPeerNodes(lock({ '': {}, 'node_modules/a': {} })), []);
  });

  test('findings come back SORTED, from an input whose insertion order is not', () => {
    // Insertion order here is z, a — so a returned-as-inserted list fails.
    const packages = lock({
      '': {},
      'node_modules/zeta': { peer: true, optional: true },
      'node_modules/alpha': { peer: true, optional: true },
    });
    assert.deepEqual(optionalPeerNodes(packages), ['node_modules/alpha', 'node_modules/zeta']);
  });
});

describe('lockAnnotationCount — the going-blind sentinel', () => {
  test('counts nodes carrying either flag', () => {
    const packages = lock({
      '': {},
      'node_modules/a': { peer: true },
      'node_modules/b': { optional: true },
      'node_modules/c': { peer: true, optional: true },
      'node_modules/d': {},
    });
    assert.equal(lockAnnotationCount(packages), 3);
  });

  test('a lockfile with no annotations at all counts zero', () => {
    assert.equal(lockAnnotationCount(lock({ '': {}, 'node_modules/a': {} })), 0);
  });
});

describe('lockNodeName', () => {
  test('a nested key yields the bare package name', () => {
    assert.equal(lockNodeName('node_modules/puppeteer-core/node_modules/proxy-agent'), 'proxy-agent');
  });
  test('a hoisted key yields the bare package name', () => {
    assert.equal(lockNodeName('node_modules/proxy-agent'), 'proxy-agent');
  });
  test('a scoped package keeps its scope', () => {
    assert.equal(lockNodeName('node_modules/a/node_modules/@puppeteer/browsers'), '@puppeteer/browsers');
  });
});

describe('checkLockfileOptionalPeers — reporting', () => {
  // 120 filler nodes, so a fixture clears the "did the parse work at all" floor.
  const padded = (packages) => ({
    ...packages,
    ...Object.fromEntries(
      Array.from({ length: 120 }, (_, i) => [`node_modules/filler-${i}`, { version: '1.0.0' }]),
    ),
  });

  const withLockfile = (packages, run) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-lockgate-'));
    try {
      fs.mkdirSync(path.join(dir, 'docs'));
      fs.writeFileSync(
        path.join(dir, 'docs', 'package-lock.json'),
        JSON.stringify({ lockfileVersion: 3, packages }),
      );
      const errors = [];
      run(errors, dir);
      return errors;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  const check = (errs, dir) => checkLockfileOptionalPeers(errs, dir, ['docs/package-lock.json']);

  test('the message names the package, the npm ci error it will cause, and the fix', () => {
    const errors = withLockfile(padded(puppeteerShape()), check);
    assert.equal(errors.length, 1);
    // Each of these is load-bearing: the reader arrives at this message from a red
    // CI job whose own error blamed a package they never touched.
    assert.match(errors[0], /OPTIONAL peer dependency/);
    assert.match(errors[0], /Missing: proxy-agent@8\.0\.2 from lock file/);
    assert.match(errors[0], /"proxy-agent": "\^8\.0\.2"/);
    assert.match(errors[0], new RegExp(`direct dependency of ${path.join('docs', 'package.json')}`));
  });

  test('a node with no `version` does not print `@undefined`', () => {
    // Workspace link nodes carry `resolved` and no `version`; the root lockfile has four.
    const packages = padded(puppeteerShape());
    const key = 'node_modules/puppeteer-core/node_modules/proxy-agent';
    delete packages[key].version;
    packages[key].resolved = 'docs/src/lib/thing';
    const errors = withLockfile(packages, check);
    assert.equal(errors.length, 1);
    assert.doesNotMatch(errors[0], /undefined/);
    assert.match(errors[0], /docs\/src\/lib\/thing/);
  });

  test('a lockfile carrying NO peer/optional annotation is flagged as the gate going blind', () => {
    const errors = withLockfile(padded({ '': {}, 'node_modules/a': { version: '1.0.0' } }), check);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /going blind/);
  });

  test('a missing lockfile is an error, not a silent pass', () => {
    const errors = [];
    checkLockfileOptionalPeers(errors, os.tmpdir(), ['no-such-lock.json']);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /is missing/);
  });

  test('an unparseable lockfile is an error, not a silent pass', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-lockgate-'));
    try {
      fs.writeFileSync(path.join(dir, 'package-lock.json'), '{ not json');
      const errors = [];
      checkLockfileOptionalPeers(errors, dir, ['package-lock.json']);
      assert.equal(errors.length, 1);
      assert.match(errors[0], /could not parse/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a suspiciously small lockfile is a broken parse, not a clean tree', () => {
    const errors = withLockfile(puppeteerShape(), check);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /broken parse/);
  });
});

describe('the committed lockfiles', () => {
  test('both are named, so neither directory can drift un-gated', () => {
    assert.deepEqual(OPTIONAL_PEER_LOCKFILES, ['package-lock.json', 'docs/package-lock.json']);
  });

  test('the gate is actually WIRED into the ownership run', () => {
    // Every assertion above passes with the check unreferenced by `run()`. This is
    // the only arm that fails if someone deletes the call site.
    const src = fs.readFileSync(path.join(TOOLS, 'check-ownership.js'), 'utf8');
    assert.match(src, /^\s*checkLockfileOptionalPeers\(errors\);$/m);
  });

  test('neither holds a node placed for an optional peer', () => {
    const errors = [];
    checkLockfileOptionalPeers(errors);
    assert.deepEqual(errors, []);
  });
});
