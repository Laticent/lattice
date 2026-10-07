/**
 * Unit: tools/lib/golden-affected.mjs — which goldens a PR's changed sources can affect.
 *
 * Under the bot-blessed design a PR commits no PDFs, so golden-diff renders the goldens
 * this mapping names. A MISS here means a reviewer is never shown a visual change; an
 * over-reach only costs render time. So the cases pin the misses hardest, and the real
 * corpus is checked too: every component directory must map to a gallery that exists.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');

const GALLERIES = [
  'lib/base/_logo/logo.gallery.md',
  'lib/components/chart/bar/bar.gallery.md',
  'lib/components/chart/bullet/bullet.gallery.md',
  'lib/components/chart/chart.gallery.md',
  'lib/components/statement/quote/quote.gallery.md',
  'lib/components/statement/statement.gallery.md',
];
const DECKS = ['examples/pricing.pdf', 'exemplars/finance/q3.pdf'];

let affectedGoldens;
const load = async () => {
  ({ affectedGoldens } = await import('../../../tools/lib/golden-affected.mjs'));
};
const run = (changed, cap) => affectedGoldens(changed, { galleries: GALLERIES, deckGoldens: DECKS, cap });

describe('golden-affected — targeted changes', () => {
  test('a component file renders its gallery and its bucket gallery', async () => {
    await load();
    const r = run(['lib/components/chart/bar/bar.styles.css']);
    assert.deepEqual(r.galleries, ['lib/components/chart/chart.gallery.md', 'lib/components/chart/bar/bar.gallery.md']);
    assert.equal(r.scope, 'targeted');
  });
  test('a bucket-shared directory (_chart-family) renders every gallery in that bucket', async () => {
    await load();
    const r = run(['lib/components/chart/_chart-family/axis.js']);
    assert.deepEqual(r.galleries.sort(), [
      'lib/components/chart/bar/bar.gallery.md',
      'lib/components/chart/bullet/bullet.gallery.md',
      'lib/components/chart/chart.gallery.md',
    ]);
  });
  test('a gallery markdown renders that gallery', async () => {
    await load();
    assert.deepEqual(run(['lib/base/_logo/logo.gallery.md']).galleries, ['lib/base/_logo/logo.gallery.md']);
  });
  test('a deck markdown with a committed PDF renders that deck', async () => {
    await load();
    const r = run(['examples/pricing.md', 'examples/no-golden.md']);
    assert.deepEqual(r.decks, ['examples/pricing.pdf']);
    assert.deepEqual(r.galleries, []);
  });
});

describe('golden-affected — shared changes', () => {
  for (const f of [
    'lib/core/fit.js',
    'lib/base/base.tokens.css',
    'lib/engine/index.js',
    'themes/indaco.css',
    'lattice-emulator.js',
    'package-lock.json',
    'tools/build-css.js',
    'lib/something-new/x.js',
  ]) {
    test(`${f} renders every gallery, bucket galleries first`, async () => {
      await load();
      const r = run([f], 100);
      assert.equal(r.scope, 'shared');
      assert.equal(r.galleries.length, GALLERIES.length);
      assert.deepEqual(r.galleries.slice(0, 2), ['lib/components/chart/chart.gallery.md', 'lib/components/statement/statement.gallery.md']);
    });
  }
  test('the cap bounds renders and reports what it dropped', async () => {
    await load();
    const r = run(['lib/core/fit.js'], 4); // 4 renders = 2 galleries × 2 moods
    assert.equal(r.galleries.length, 2);
    assert.equal(r.omitted.length, GALLERIES.length - 2);
    assert.deepEqual(r.galleries, ['lib/components/chart/chart.gallery.md', 'lib/components/statement/statement.gallery.md']);
  });
});

describe('golden-affected — nothing to render', () => {
  for (const f of [
    'lib/authoring/lint-core.js',
    'lib/components/chart/bar/bar.docs.md',
    'docs/src/pages/index.astro',
    'engineering/workflow.md',
    'test/unit/x.test.js',
    'tools/golden-diff.mjs',
    'examples/pricing.pdf',
  ]) {
    test(f, async () => {
      await load();
      const r = run([f]);
      assert.equal(r.scope, 'none', f);
      assert.deepEqual(r.galleries, []);
      assert.deepEqual(r.decks, []);
    });
  }
});

test('on the real corpus, every component directory maps to its OWN gallery (not just the bucket one)', async () => {
  await load();
  const { galleryDecks } = await import('../../../tools/lib/golden-render.mjs');
  const galleries = galleryDecks(ROOT).map((g) => path.relative(ROOT, g));
  const dirs = execFileSync('git', ['ls-files', 'lib/components'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .map((f) => f.match(/^lib\/components\/([^/]+)\/([^_/][^/]*)\//))
    .filter(Boolean)
    .map((m) => `${m[1]}/${m[2]}`);
  const missing = [];
  for (const d of new Set(dirs)) {
    const [bucket, name] = d.split('/');
    const r = affectedGoldens([`lib/components/${bucket}/${name}/x.css`], { galleries, deckGoldens: [], cap: 1000 });
    if (!r.galleries.includes(`lib/components/${bucket}/${name}/${name}.gallery.md`)) missing.push(d);
  }
  assert.deepEqual(missing, [], `component directories with no gallery: ${missing.join(', ')}`);
});

// #2583: a one-line `scripts` edit read as a dependency change, widened the render to every
// gallery, and skipped the base render, so the PR comment listed 46 slides the PR never moved.
describe('golden-affected — a package.json edit is a dependency change only when it touches a render input', () => {
  const PKG = { name: 'lattice', version: '1.0.0', scripts: { build: 'node tools/build.js' }, dependencies: { 'markdown-it': '14.1.0' } };
  const text = (o) => JSON.stringify(o, null, 2);
  const withKey = (k, v) => text({ ...PKG, [k]: v });
  let packageJsonMovesRenders;
  let renderRelevantChanges;
  const loadPkg = async () => {
    ({ packageJsonMovesRenders, renderRelevantChanges } = await import('../../../tools/lib/golden-affected.mjs'));
  };

  test('a scripts-only edit drops package.json, so the scope is none and nothing reads it as a dependency', async () => {
    await load();
    await loadPkg();
    const head = withKey('scripts', { ...PKG.scripts, 'parser:bakeoff': 'node tools/parser-bakeoff/run.mjs' });
    const changed = renderRelevantChanges(['package.json', 'tools/parser-bakeoff/segno.mjs'], () => text(PKG), () => head);
    assert.deepEqual(changed, ['tools/parser-bakeoff/segno.mjs']);
    // golden-diff's depChange is this same test over the filtered list.
    assert.equal(changed.some((f) => /^package(-lock)?\.json$/.test(f)), false);
    assert.equal(run(changed).scope, 'none');
  });
  for (const [what, key, value] of [
    ['a dependency bump', 'dependencies', { 'markdown-it': '14.2.0' }],
    ['a devDependency added', 'devDependencies', { mermaid: '11.0.0' }],
    ['a version bump (lattice-emulator.js reads it)', 'version', '1.0.1'],
    ['a key nobody listed', 'exports', { '.': './index.js' }],
  ]) {
    test(`${what} keeps package.json, so every gallery renders`, async () => {
      await load();
      await loadPkg();
      const changed = renderRelevantChanges(['package.json'], () => text(PKG), () => withKey(key, value));
      assert.deepEqual(changed, ['package.json']);
      assert.equal(run(changed, 100).scope, 'shared');
    });
  }
  test('a lockfile change still counts whatever package.json did', async () => {
    await load();
    await loadPkg();
    const head = withKey('scripts', { ...PKG.scripts, x: 'y' });
    const changed = renderRelevantChanges(['package.json', 'package-lock.json'], () => text(PKG), () => head);
    assert.deepEqual(changed, ['package-lock.json']);
    assert.equal(run(changed, 100).scope, 'shared');
  });
  test('a package.json missing or unparsable on either side is not proven inert', async () => {
    await loadPkg();
    assert.equal(packageJsonMovesRenders(null, text(PKG)), true);
    assert.equal(packageJsonMovesRenders(text(PKG), '{ not json'), true);
    assert.equal(packageJsonMovesRenders(text(PKG), text(PKG)), false);
  });
  test('package.json is not read when it did not change', async () => {
    await loadPkg();
    const boom = () => { throw new Error('read'); };
    assert.deepEqual(renderRelevantChanges(['lib/core/fit.js'], boom, boom), ['lib/core/fit.js']);
  });
});
