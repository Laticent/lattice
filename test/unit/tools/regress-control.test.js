/**
 * Unit: tools/lib/regress-control.mjs — `regress --control`'s verdict.
 *
 * The control compares two FRESH renders on one machine: HEAD and the commit a golden was
 * rendered from. A false "machine" verdict hides a real source change behind the cross-machine
 * band, the direction that cost three sessions a day when they read the band as a regression.
 * So the rows pin the edges: a page-count change (pixels -1), a page just over the floor, and a
 * page exactly at it. The fixtures use pixelDiff's real perPage shape ({ page, pixels, total }).
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');

let m;
before(async () => {
  m = await import('../../../tools/lib/regress-control.mjs');
});

const TOTAL = 960 * 540;
const FLOOR = 0.0005; // FAIL_FRACTION, the deck floor
const page = (n, pixels) => ({ page: n, pixels, total: TOTAL });

describe('controlVerdict', () => {
  test('identical renders are the machine band', () => {
    const v = m.controlVerdict([page(1, 0), page(2, 0)], FLOOR);
    assert.deepEqual(v, { verdict: 'machine', moved: [], worst: 0 });
  });

  test('a page at the floor is still the band; one pixel over it is source drift', () => {
    // 20,000 px makes the floor exactly 10 px, so "at" is on the floor, not just under it.
    const small = (n, pixels) => ({ page: n, pixels, total: 20000 });
    assert.equal(m.controlVerdict([small(1, 10)], FLOOR).verdict, 'machine');
    const over = m.controlVerdict([small(1, 0), small(2, 11)], FLOOR);
    assert.equal(over.verdict, 'source');
    assert.deepEqual(over.moved, [2]);
  });

  test('a page-count change is source drift at worst 100%', () => {
    const v = m.controlVerdict([page(1, 0), { page: 0, pixels: -1, total: 0 }], FLOOR);
    assert.equal(v.verdict, 'source');
    assert.equal(v.worst, 1);
  });
});

describe('groupByBlessCommit', () => {
  test('one group per rendered-from commit, and an uncommitted golden in its own group', () => {
    const shas = { 'a.pdf': 'aaa', 'b.pdf': 'bbb', 'c.pdf': 'aaa', 'd.pdf': '' };
    const groups = m.groupByBlessCommit(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf'].map((golden) => ({ golden })), (g) => shas[g]);
    assert.deepEqual([...groups.keys()], ['aaa', 'bbb', '']);
    assert.deepEqual(groups.get('aaa').map((i) => i.golden), ['a.pdf', 'c.pdf']);
  });
});

describe('controlLine', () => {
  test('each verdict says what to do with the drift', () => {
    assert.match(m.controlLine({ sha: '68f1cd042d9a', nightly: true, verdict: 'machine' }), /@68f1cd04: same render here → cross-machine band \(no pixel past the anti-aliasing fuzz\)/);
    assert.match(m.controlLine({ sha: '68f1cd042d9a', nightly: true, verdict: 'source', worst: 0.0123 }), /worst 1\.23%\) → source drift/);
    assert.match(m.controlLine({ sha: '', verdict: 'unavailable', error: 'never committed' }), /unavailable \(never committed\); treat the drift as unexplained/);
  });

  test('a golden not written by a nightly bless says its source is a guess', () => {
    assert.match(m.controlLine({ sha: 'bcc7c55c00', nightly: false, verdict: 'machine' }), /is a guess; not counted as a pass/);
    assert.doesNotMatch(m.controlLine({ sha: 'bcc7c55c00', nightly: true, verdict: 'machine' }), /guess/);
    assert.match(m.controlLine({ sha: '68f1cd042d9a', nightly: true, depsChanged: true, verdict: 'machine' }), /dependencies changed since @68f1cd04.*not counted as a pass/);
  });
});

describe('controlPasses', () => {
  test('only a machine verdict against a nightly bless clears the drift', () => {
    assert.equal(m.controlPasses({ verdict: 'machine', nightly: true }), true);
    // Dependencies moved since the source: the control borrows this checkout's node_modules.
    assert.equal(m.controlPasses({ verdict: 'machine', nightly: true, depsChanged: true }), false);
    // A guessed source (hand bless, revert of a bless) never passes, whatever it rendered.
    assert.equal(m.controlPasses({ verdict: 'machine', nightly: false }), false);
    assert.equal(m.controlPasses({ verdict: 'source', nightly: true }), false);
    assert.equal(m.controlPasses({ verdict: 'unavailable', nightly: false, error: 'shallow' }), false);
    assert.equal(m.controlPasses(undefined), false);
  });
});

test('hostLine names the Chrome and the CPU, and says where the goldens were blessed', () => {
  const line = m.hostLine({ chrome: 'Google Chrome for Testing 158.0.8127.36', cpu: 'Intel(R) Xeon(R)', cores: 4 });
  assert.match(line, /Chrome for Testing 158\.0\.8127\.36 · Intel\(R\) Xeon\(R\) · 4 cores/);
  assert.match(line, /GitHub runner/);
  assert.match(m.hostLine({ chrome: '', cpu: '', cores: 1 }), /version unknown\) · CPU unknown/);
});

describe('resolveSource', () => {
  const BLESS = 'chore(goldens): nightly bless of 68f1cd042d9a (#3524)';
  const blessFrom = (subject) => (subject.match(/^chore\(goldens\): nightly bless of ([0-9a-f]{12,40}) \(#\d+\)$/) || [])[1] || null;
  // A fake git: each command is answered from `answers` by its first word; a function throws to
  // mimic a non-zero exit. Unlisted commands throw, so a test sees any call it did not expect.
  const fakeGit = (answers) => (args) => {
    const a = answers[args[0]];
    if (a === undefined) throw new Error(`unexpected git ${args.join(' ')}`);
    return typeof a === 'function' ? a(args) : a;
  };
  const fail = () => { throw new Error('exit 1'); };
  const ctx = (answers, over = {}) => ({
    git: fakeGit(answers), cutoffs: new Set(), isShallow: false,
    renderInputs: ['package.json', 'package-lock.json', 'docs/src/lib/markup'], blessFrom, ...over,
  });
  const ok = { status: '', log: `aaaa1111\t${BLESS}`, 'rev-parse': '68f1cd042d9a0000', diff: '' };

  test('a nightly bless resolves to the sha it rendered from, deps unchanged', () => {
    assert.deepEqual(m.resolveSource('x.pdf', ctx(ok)), { sha: '68f1cd042d9a0000', nightly: true, depsChanged: false });
  });

  test('a changed lockfile or workspace package marks depsChanged, against the working tree', () => {
    let seen;
    const r = m.resolveSource('x.pdf', ctx({ ...ok, diff: (args) => { seen = args; fail(); } }));
    assert.equal(r.depsChanged, true);
    // Working tree, not HEAD: the sha is the only revision, and the workspaces are inputs.
    assert.deepEqual(seen, ['diff', '--quiet', '68f1cd042d9a0000', '--', 'package.json', 'package-lock.json', 'docs/src/lib/markup']);
  });

  test('a non-bless writer is its own source, with nightly false', () => {
    const r = m.resolveSource('x.pdf', ctx({ ...ok, log: 'bbbb2222\tRevert "chore(goldens): nightly bless of 68f1cd042d9a (#3524)"' }));
    assert.deepEqual(r, { sha: 'bbbb2222', nightly: false, depsChanged: false });
  });

  test('a shallow cut-off commit is never taken as the author', () => {
    const r = m.resolveSource('x.pdf', ctx(ok, { isShallow: true, cutoffs: new Set(['aaaa1111']) }));
    assert.match(r.error, /history stops at aaaa1111.*fetch --unshallow/);
  });

  test('a shallow clone whose cut-off list could not be read fails closed', () => {
    assert.match(m.resolveSource('x.pdf', ctx(ok, { isShallow: true })).error, /could not be read/);
  });

  test('a bless source this clone lacks, local changes, never committed, and a git failure are all errors', () => {
    assert.match(m.resolveSource('x.pdf', ctx({ ...ok, 'rev-parse': fail })).error, /rendered from 68f1cd04, which this clone does not have/);
    assert.match(m.resolveSource('x.pdf', ctx({ ...ok, status: ' M x.pdf' })).error, /local changes/);
    assert.match(m.resolveSource('x.pdf', ctx({ ...ok, log: '' })).error, /never committed/);
    assert.match(m.resolveSource('x.pdf', ctx({ ...ok, status: fail })).error, /git could not answer/);
  });
});

test('renderEnvOverrides refuses every LATTICE_* setting but the inert ones, and the test marker', () => {
  const env = {
    PATH: '/bin', LATTICE_ACTOR: 'kirk', NODE_TEST_CONTEXT: 'child',
    LATTICE_PDF_PHOTO_QUALITY: '60', LATTICE_MERMAID_SINGLE: '1', LATTICE_OVERFLOW_MARKER: 'off', LATTICE_HOME: '/tmp/h',
  };
  assert.deepEqual(m.renderEnvOverrides(env), ['LATTICE_HOME', 'LATTICE_MERMAID_SINGLE', 'LATTICE_OVERFLOW_MARKER', 'LATTICE_PDF_PHOTO_QUALITY', 'NODE_TEST_CONTEXT']);
  assert.deepEqual(m.renderEnvOverrides({ PATH: '/bin', LATTICE_ACTOR: 'kirk' }), []);
});

describe('renderBuildSteps and staleSteps', () => {
  test('every gitignored build a PDF render loads, in build order, from the tree\'s own tools/', () => {
    const scripts = ['build-css.js', 'build-zeta-lib.js', 'build-pdf-compose.js', 'build-agent-kit.mjs', 'build-alpha-lib.js',
      'build-segno-grammar.js', 'build-dagre-bundle.js', 'build-callout-browser.js', 'build-default-bundle.js', 'build-runtime.js'];
    assert.deepEqual(m.renderBuildSteps(scripts), ['build-segno-grammar.js', 'build-alpha-lib.js', 'build-zeta-lib.js',
      'build-css.js', 'build-default-bundle.js', 'build-dagre-bundle.js', 'build-callout-browser.js', 'build-pdf-compose.js']);
    // An old tree without a step simply lacks it.
    assert.deepEqual(m.renderBuildSteps(['build-css.js', 'build-markup-lib.js']), ['build-markup-lib.js', 'build-css.js']);
  });

  test('staleSteps names each step whose check throws', () => {
    const ran = [];
    const stale = m.staleSteps(['build-markup-lib.js', 'build-css.js', 'build-pdf-compose.js'], (step) => {
      ran.push(step);
      if (step !== 'build-css.js') throw new Error('stale');
    });
    assert.deepEqual(stale, ['markup', 'pdf-compose']);
    assert.equal(ran.length, 3, 'every step is checked, not only up to the first failure');
  });
});

describe('linkTreeModules', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  let bt;
  before(async () => {
    bt = await import('../../../tools/lib/base-tree.mjs');
  });

  test('third-party packages are borrowed; the tree\'s workspaces are its own; a gone workspace is not borrowed', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'regress-tree-'));
    try {
      const repo = path.join(base, 'repo');
      const tree = path.join(base, 'tree');
      // This checkout: a third-party package, a workspace link the tree's commit does not have, docs/node_modules.
      fs.mkdirSync(path.join(repo, 'node_modules', 'leftpad'), { recursive: true });
      fs.mkdirSync(path.join(repo, 'docs', 'src', 'lib', 'renamed'), { recursive: true });
      fs.mkdirSync(path.join(repo, 'node_modules', '@laticent'), { recursive: true });
      fs.symlinkSync(path.join(repo, 'docs', 'src', 'lib', 'renamed'), path.join(repo, 'node_modules', '@laticent', 'renamed'));
      fs.mkdirSync(path.join(repo, 'docs', 'node_modules'), { recursive: true });
      // The tree: one workspace under its own name.
      fs.mkdirSync(path.join(tree, 'docs', 'src', 'lib', 'markup'), { recursive: true });
      fs.writeFileSync(path.join(tree, 'package.json'), JSON.stringify({ workspaces: ['docs/src/lib/markup'] }));
      fs.writeFileSync(path.join(tree, 'docs', 'src', 'lib', 'markup', 'package.json'), JSON.stringify({ name: '@laticent/markup-old' }));

      const linked = bt.linkTreeModules(repo, tree);
      const nm = path.join(tree, 'node_modules');
      assert.deepEqual([...linked], ['@laticent/markup-old']);
      assert.equal(fs.realpathSync(path.join(nm, 'leftpad')), fs.realpathSync(path.join(repo, 'node_modules', 'leftpad')));
      assert.equal(fs.realpathSync(path.join(nm, '@laticent', 'markup-old')), fs.realpathSync(path.join(tree, 'docs', 'src', 'lib', 'markup')));
      assert.equal(fs.existsSync(path.join(nm, '@laticent', 'renamed')), false, "this checkout's own workspace must not leak into the tree");
      assert.equal(fs.realpathSync(path.join(tree, 'docs', 'node_modules')), fs.realpathSync(path.join(repo, 'docs', 'node_modules')));
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});

test('hostStateRefusals refuses an installed package store and an untracked plugin list', () => {
  assert.deepEqual(m.hostStateRefusals({ installed: [], untrackedPluginList: false }), []);
  const store = m.hostStateRefusals({ installed: ['component/tiered'], untrackedPluginList: false });
  assert.equal(store.length, 1);
  assert.match(store[0], /installed in your store \(component\/tiered\)/);
  assert.match(m.hostStateRefusals({ installed: [], untrackedPluginList: true })[0], /untracked lattice-plugins\.json/);
  const many = m.hostStateRefusals({ installed: ['a/1', 'a/2', 'a/3', 'a/4'], untrackedPluginList: true });
  assert.equal(many.length, 2);
  assert.match(many[0], /a\/1, a\/2, a\/3, …/);
});

test('renderGallery darkens with the rendered root\'s own injectDark, not this checkout\'s', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const gr = await import('../../../tools/lib/golden-render.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'regress-dark-'));
  try {
    fs.mkdirSync(path.join(root, 'tools'));
    fs.writeFileSync(path.join(root, 'tools', 'build-galleries.js'), "module.exports = { injectDark: (md) => 'OTHER TREE:' + md };\n");
    assert.equal(gr.injectDarkFor(root)('x'), 'OTHER TREE:x');
    // This checkout's own producer is a different function.
    const here = path.join(__dirname, '..', '..', '..');
    assert.notEqual(gr.injectDarkFor(here)('x'), 'OTHER TREE:x');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
