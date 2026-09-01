/**
 * Unit: the lockfile optional-peer gate (tools/check-ownership.js).
 *
 * npm and Dependabot disagree about optional peer dependencies. npm materializes
 * one whenever it can resolve it; Dependabot's lockfile writer deletes it. So a
 * committed lockfile holding a node that ONLY an optional peer edge reaches is a
 * time bomb: the tree is green here, and every Dependabot PR against that
 * directory arrives with the subtree gone and `npm ci` failing EUSAGE.
 *
 * #1491 is the worked example — one `proxy-agent@8.0.2` under `puppeteer-core`,
 * four /docs Dependabot PRs red for three weeks, and a `npm ci` message naming
 * puppeteer on a PR whose whole diff was `brace-expansion`.
 *
 * Both verdicts run through the PURE function on BUILT fixtures, because the
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

const {
  checkLockfileOptionalPeers,
  optionalPeerOnlyNodes,
  resolveLockNode,
  OPTIONAL_PEER_LOCKFILES,
} = require(path.join(__dirname, '..', '..', '..', 'tools', 'check-ownership.js'));

/** A lockfile `packages` map with the boilerplate every node carries filled in. */
const lock = (nodes) =>
  Object.fromEntries(Object.entries(nodes).map(([key, node]) => [key, { version: '1.0.0', ...node }]));

/** The shape #1491 was: a hard consumer, and a nested optional peer nobody else wants. */
const puppeteerShape = () =>
  lock({
    '': { dependencies: { 'puppeteer-core': '^25.1.0' } },
    'node_modules/puppeteer-core': { version: '25.1.0', dependencies: { '@puppeteer/browsers': '3.0.4' } },
    'node_modules/puppeteer-core/node_modules/@puppeteer/browsers': {
      version: '3.0.4',
      peerDependencies: { 'proxy-agent': '>=8.0.1' },
      peerDependenciesMeta: { 'proxy-agent': { optional: true } },
    },
    'node_modules/puppeteer-core/node_modules/proxy-agent': { version: '8.0.2' },
  });

describe('optionalPeerOnlyNodes — detection', () => {
  test('flags a node only an optional peer edge reaches', () => {
    assert.deepEqual(optionalPeerOnlyNodes(puppeteerShape()), [
      'node_modules/puppeteer-core/node_modules/proxy-agent',
    ]);
  });

  test('a REQUIRED peer is not a finding — Dependabot keeps those', () => {
    const packages = puppeteerShape();
    delete packages['node_modules/puppeteer-core/node_modules/@puppeteer/browsers'].peerDependenciesMeta;
    assert.deepEqual(optionalPeerOnlyNodes(packages), []);
  });

  test('a direct dependency clears the node — the fix #1491 took', () => {
    // Declaring the package a direct dependency hoists it to the root, and npm
    // then drops the nested copy because the root one satisfies the peer range.
    // The optional peer edge survives untouched and stops mattering: it now
    // lands on a node a hard root edge also reaches.
    const packages = puppeteerShape();
    packages[''].devDependencies = { 'proxy-agent': '^8.0.2' };
    packages['node_modules/proxy-agent'] = { version: '8.0.2' };
    delete packages['node_modules/puppeteer-core/node_modules/proxy-agent'];
    assert.deepEqual(optionalPeerOnlyNodes(packages), []);
  });

  test('a hoisted copy does NOT clear a nested one — shadowing is per subtree', () => {
    // The near-miss the fix above has to avoid. A root `proxy-agent` that does
    // not satisfy the peer range leaves the nested copy in place, still reached
    // only by the optional peer, and Dependabot still deletes it.
    const packages = puppeteerShape();
    packages[''].devDependencies = { 'proxy-agent': '^6.5.0' };
    packages['node_modules/proxy-agent'] = { version: '6.5.0' };
    assert.deepEqual(optionalPeerOnlyNodes(packages), [
      'node_modules/puppeteer-core/node_modules/proxy-agent',
    ]);
  });

  test('an optionalDependencies edge is HARD — optional-dependency and optional-PEER are different things', () => {
    const packages = puppeteerShape();
    packages['node_modules/puppeteer-core'].optionalDependencies = { 'proxy-agent': '^8.0.2' };
    assert.deepEqual(optionalPeerOnlyNodes(packages), []);
  });

  test('an optional peer nothing supplies is not a finding — there is no node to delete', () => {
    const packages = puppeteerShape();
    delete packages['node_modules/puppeteer-core/node_modules/proxy-agent'];
    assert.deepEqual(optionalPeerOnlyNodes(packages), []);
  });

  test('a clean tree produces nothing', () => {
    assert.deepEqual(
      optionalPeerOnlyNodes(lock({ '': { dependencies: { a: '^1' } }, 'node_modules/a': {} })),
      [],
    );
  });

  test('two findings come back sorted, so the message is stable across runs', () => {
    const packages = lock({
      '': { dependencies: { z: '^1', a: '^1' } },
      'node_modules/a': { peerDependencies: { 'a-peer': '*' }, peerDependenciesMeta: { 'a-peer': { optional: true } } },
      'node_modules/z': { peerDependencies: { 'z-peer': '*' }, peerDependenciesMeta: { 'z-peer': { optional: true } } },
      'node_modules/a-peer': {},
      'node_modules/z-peer': {},
    });
    assert.deepEqual(optionalPeerOnlyNodes(packages), ['node_modules/a-peer', 'node_modules/z-peer']);
  });
});

describe('resolveLockNode — npm walk-up resolution', () => {
  const packages = lock({
    '': {},
    'node_modules/dep': { version: '2.0.0' },
    'node_modules/host': {},
    'node_modules/host/node_modules/dep': { version: '1.0.0' },
  });

  test('a nested copy shadows the hoisted one for its own subtree', () => {
    assert.equal(resolveLockNode(packages, 'node_modules/host', 'dep'), 'node_modules/host/node_modules/dep');
  });

  test('a consumer with no nested copy walks up to the root', () => {
    assert.equal(resolveLockNode(packages, 'node_modules/other', 'dep'), 'node_modules/dep');
  });

  test('an unsupplied name resolves to null rather than throwing', () => {
    assert.equal(resolveLockNode(packages, 'node_modules/host', 'absent'), null);
  });

  test('a WORKSPACE root walks straight up to the root — the shape package-lock.json actually has', () => {
    // The repo-root lockfile carries four of these (docs/src/lib/cadenza and its
    // siblings). Their keys hold no `node_modules/` segment at all, so the walk-up
    // has to fall to the root in one step rather than looping or throwing.
    const ws = lock({
      '': {},
      'docs/src/lib/cadenza': { dependencies: { dep: '^1' } },
      'node_modules/dep': { version: '2.0.0' },
    });
    assert.equal(resolveLockNode(ws, 'docs/src/lib/cadenza', 'dep'), 'node_modules/dep');
    assert.equal(resolveLockNode(ws, 'docs/src/lib/cadenza', 'absent'), null);
  });

  test('a workspace holding its OWN copy keeps it', () => {
    const ws = lock({
      '': {},
      'docs/src/lib/cadenza': { dependencies: { dep: '^1' } },
      'docs/src/lib/cadenza/node_modules/dep': { version: '1.0.0' },
      'node_modules/dep': { version: '2.0.0' },
    });
    assert.equal(
      resolveLockNode(ws, 'docs/src/lib/cadenza', 'dep'),
      'docs/src/lib/cadenza/node_modules/dep',
    );
  });
});

describe('checkLockfileOptionalPeers — reporting', () => {
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

  // 100 filler nodes, so the fixture clears the "did the parse work at all" floor.
  const padded = (packages) => ({
    ...packages,
    ...Object.fromEntries(
      Array.from({ length: 120 }, (_, i) => [`node_modules/filler-${i}`, { version: '1.0.0' }]),
    ),
  });

  test('the message names the package, the npm ci error it will cause, and the one-line fix', () => {
    const errors = withLockfile(padded(puppeteerShape()), (errs, dir) =>
      checkLockfileOptionalPeers(errs, dir, ['docs/package-lock.json']),
    );
    assert.equal(errors.length, 1);
    // Each of these is load-bearing: the reader arrives at this message from a red
    // CI job whose own error blamed a package they never touched.
    assert.match(errors[0], /OPTIONAL peer edge/);
    assert.match(errors[0], /Missing: proxy-agent@8\.0\.2 from lock file/);
    assert.match(errors[0], /"proxy-agent": "\^8\.0\.2"/);
    assert.match(errors[0], new RegExp(`direct dependency of ${path.join('docs', 'package.json')}`));
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
    const errors = withLockfile(puppeteerShape(), (errs, dir) =>
      checkLockfileOptionalPeers(errs, dir, ['docs/package-lock.json']),
    );
    assert.equal(errors.length, 1);
    assert.match(errors[0], /broken parse/);
  });
});

describe('the committed lockfiles', () => {
  test('both are named, so neither directory can drift un-gated', () => {
    assert.deepEqual(OPTIONAL_PEER_LOCKFILES, ['package-lock.json', 'docs/package-lock.json']);
  });

  test('neither holds an optional-peer-only node', () => {
    const errors = [];
    checkLockfileOptionalPeers(errors);
    assert.deepEqual(errors, []);
  });
});
