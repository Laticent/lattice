// The component corpus is TWO trees: the buckets under lib/components, and each plugin's `kinds/`
// folder (the chart-family plugin's chart kinds). When the 28 chart kinds moved into their plugin,
// every tool that walked lib/components alone lost them, and nothing failed: the fit ratchet stopped
// scoring 28 baseline sources, the Segno deck scan stopped reading 56 files, and the /features
// page dropped its Chart row. This pins the shared enumeration (`componentCorpusRoots`, beside
// `listComponentFolders` in lib/packages/fs.js) against an oracle that does not walk at all, and
// pins each tool fixed to it to a corpus that reaches a chart kind.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { componentCorpusRoots, listComponentFolders } = require('../../../lib/packages/fs.js');
const components = require('../../../lib/components');

const ROOT = path.join(__dirname, '..', '..', '..');
const COMPONENTS = path.join(ROOT, 'lib', 'components');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

// THE ORACLE: every tracked `<X>/<X>.manifest.json` anywhere under lib/ that validates as a
// component. It does not know where components live, so a component tree no walk reaches shows here.
const tracked = execFileSync('git', ['ls-files', 'lib/*.manifest.json'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const oracleManifests = tracked
  .filter((p) => { const s = p.split('/'); return s.at(-1) === `${s.at(-2)}.manifest.json`; })
  .filter((p) => {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
    return components.BUCKETS.includes(components.manifestBucket(m)) && components.validate(m, p).length === 0;
  })
  .sort();

test('the corpus roots are lib/components and every plugin kinds folder', () => {
  assert.deepEqual(componentCorpusRoots().map(rel), ['lib/components', 'lib/plugins/chart-family/kinds']);
});

test('the shared enumeration sees every component manifest the oracle finds (51 bucketed + 28 kinds)', () => {
  const walked = componentCorpusRoots().flatMap(walk).filter((f) => f.endsWith('.manifest.json')).map(rel).sort();
  const listed = listComponentFolders(COMPONENTS, { isBucket: (n) => components.BUCKETS.includes(n) }).map((f) => rel(f.manifest)).sort();
  assert.deepEqual(walked, oracleManifests);
  assert.deepEqual(listed, oracleManifests);
  assert.equal(components.loadAll().length, oracleManifests.length);
  // A floor too, so the oracle and the walk cannot both shrink together.
  assert.ok(oracleManifests.length >= 79, `only ${oracleManifests.length} component manifests`);
  assert.ok(oracleManifests.filter((p) => p.includes('/kinds/')).length >= 28, 'the chart kinds are missing');
});

test('the shared enumeration sees every gallery: one per component, plus each bucket survey (93)', () => {
  const walked = componentCorpusRoots().flatMap(walk).filter((f) => f.endsWith('.gallery.md')).map(rel).sort();
  const perComponent = oracleManifests.map((p) => p.replace(/\.manifest\.json$/, '.gallery.md')).filter((p) => fs.existsSync(path.join(ROOT, p)));
  const surveys = components.BUCKETS.map((b) => `lib/components/${b}/${b}.gallery.md`).filter((p) => fs.existsSync(path.join(ROOT, p)));
  assert.deepEqual(walked, [...perComponent, ...surveys].sort());
  assert.ok(walked.length >= 93, `only ${walked.length} galleries`);
});

test('each tool fixed to the shared enumeration reaches a chart kind', () => {
  const gantt = 'lib/plugins/chart-family/kinds/gantt/gantt.gallery.md';
  // The nightly fit ratchet: its sources are exactly the baseline's keys.
  const { fitSources } = require('../../../tools/lib/fit-harness/sources.js');
  const fit = fitSources(ROOT).map(rel);
  assert.ok(fit.includes(gantt), 'fit-harness sources miss the kinds');
  assert.deepEqual(fit, Object.keys(require('../../fit/baseline.json')).sort(), 'fit sources and test/fit/baseline.json disagree');
  // The conformance render tier.
  assert.ok(require('../../../tools/conformance-render.js').galleryFiles().some((g) => rel(g.file) === gantt), 'conformance-render misses the kinds');
  // The /features bucket table (docs/src/pages/features.astro) and build-stress-deck read groupByBucket(loadAll()).
  const byBucket = components.groupByBucket(components.loadAll());
  assert.equal(Object.values(byBucket).filter((ms) => ms.length).length, 14);
  assert.ok(byBucket.chart.length >= 28, `chart bucket has ${byBucket.chart.length}`);
  // componentDir resolves a kind to its plugin folder (measure-pane-fit, fence-round-trip, adapt-contract).
  assert.equal(rel(components.componentDir('gantt')), 'lib/plugins/chart-family/kinds/gantt');
});
