/**
 * THE FOLDER-DROP PROOF — the acceptance check for #287, executed rather than
 * asserted.
 *
 * The claim the manifest-driven dispatch makes is: adding a chart is a folder
 * drop. Drop `lib/components/chart/<name>/` carrying a manifest with a `kernel`
 * block and a `<name>.transform.js`, rebuild, and the chart renders — with no
 * edit to chart-family.js, no entry in a layout array, no adapter, and no line
 * in a figure-class alternation. Before this change all four of those were hand
 * edits to one file, and the fourth failed SILENTLY: the kernel ran, the figure
 * was built, and the section rendered it unframed.
 *
 * So this test actually adds one. It copies lib/ into a scratch tree, drops a
 * chart nobody has ever seen into the copy, runs the real generator against it,
 * and renders a deck through the real engine loaded FROM THAT COPY. Nothing
 * asserts against a mock: the registry is the shipped generator's output and the
 * frame is the shipped wrap.
 *
 * WHY A COPY. The drop has to be a real, valid component for `loadAll` to see
 * it — which means every other test file in the run would see it too, and hold
 * it to the docs, gallery and catalog contracts a fixture cannot meet. A copy
 * keeps the window from existing at all. (`--root` on the generator exists for
 * exactly this caller.)
 *
 * See engineering/decisions/2026-09-01-manifest-driven-chart-dispatch.md.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const SCRATCH = path.join(ROOT, '.scratch', `folder-drop-${process.pid}`);

// The dropped chart: a "tempo bars" strip, one <div> per item with a beat
// count. Deliberately trivial — the point under test is the DISPATCH, and a
// kernel with real geometry would only add ways for the test to fail for
// reasons that are not the dispatch.
const DROP_NAME = 'tempo-bars';
const DROP_FIGURE = 'tempo-bars-strip';

// Deliberately takes EVERY helper off \`ctx.utils\` and requires nothing. That is
// the facility \`ctx\` carries for a dropped-in kernel — a kernel written outside
// this tree cannot know the relative path to transform-utils — so the drop proof
// is the right place to exercise it. First-party kernels require directly, which
// would have left \`ctx.utils\` shipped and unused.
const DROP_KERNEL = `function buildTempoBars(ulInner, utils) {
  const { escAttr, parseTopLevelLis } = utils;
  const rows = parseTopLevelLis(ulInner).map((item) => {
    const m = item.match(/^([\\s\\S]*?)\\s*<code>([^<]+)<\\/code>\\s*$/);
    const label = (m ? m[1] : item).replace(/<[^>]+>/g, '').trim();
    const beats = m ? m[2].trim() : '';
    return '<div class="tempo-bar" data-beats="' + escAttr(beats) + '">' + label + '</div>';
  }).join('');
  return '<div class="${DROP_FIGURE}">' + rows + '</div>';
}

function transformSection(html, ctx) {
  return ctx.utils.spliceFirstList(html, (ext) => buildTempoBars(ext.inner, ctx.utils));
}

module.exports = { transformSection, buildTempoBars };
`;

const DROP_MANIFEST = {
  name: DROP_NAME,
  function: 'evidence',
  bucket: 'chart',
  form: 'canvas',
  substance: 'series',
  render: 'html',
  renderNote:
    'Plain HTML boxes: each bar is a <div> whose width comes from a CSS custom property, ' +
    'so there is no shared coordinate system to solve and nothing to draw in SVG.',
  // `marks` is required alongside `figureClass`, and the drop declares it for
  // the same reason a shipped member does: a chart FINISH is a stylesheet, so a
  // member that declares no mark is one no finish can reach. `tempo-bar` is an
  // HTML box painted through `background`, its width is the datum and its color
  // is a flat identity, and it carries its own label.
  kernel: {
    figureClass: DROP_FIGURE,
    marks: [{ class: 'tempo-bar', paint: 'bg', encodes: 'hue', bears: true }],
  },
  // Declared, because a chart-bucket component without it fails `checkProjectionCoverage`
  // — which is the point: the six rosters this replaces could each be forgotten in silence.
  // `flow` is the honest kind for a strip of <div> bars; the svg catalogs are exercised by
  // the second generator run below, which re-declares the same drop as `svg`.
  projection: { figure: 'flow', data: true },
  tags: ['percentage', 'stoplight', 'status'],
  description: 'A strip of labeled tempo bars, one per item, for the folder-drop proof.',
  skeleton: `<!-- _class: ${DROP_NAME} -->\n\n## Tempo\n\n- Verse \`4\`\n- Chorus \`8\`\n`,
};

const DECK_SECTION =
  '<h2>Tempo</h2>\n<ul><li>Verse <code>4</code></li><li>Chorus <code>8</code></li></ul>';

/** Copy lib/ into the scratch tree. PDFs are 59 of lib's 68 MB and no code reads them. */
function stageTree() {
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.cpSync(path.join(ROOT, 'lib'), path.join(SCRATCH, 'lib'), {
    recursive: true,
    filter: (src) => !src.endsWith('.pdf'),
  });
}

function dropChart(projection = DROP_MANIFEST.projection) {
  const dir = path.join(SCRATCH, 'lib', 'components', 'chart', DROP_NAME);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = projection === null
    ? Object.fromEntries(Object.entries(DROP_MANIFEST).filter(([k]) => k !== 'projection'))
    : { ...DROP_MANIFEST, projection };
  fs.writeFileSync(path.join(dir, `${DROP_NAME}.manifest.json`),
    JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, `${DROP_NAME}.transform.js`), DROP_KERNEL);
}

/** Run a generator against the scratch tree and fail loudly if it did not. */
function generate(tool) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', tool), '--root', SCRATCH],
    { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, `${tool} failed:\n${r.stderr}`);
}

/** Re-read the scratch projection catalog, bypassing the ESM module cache. */
async function readProjectionCatalog() {
  const file = path.join(SCRATCH, 'lib', 'core', 'projection-catalog.generated.mjs');
  return import(`${require('node:url').pathToFileURL(file).href}?v=${Date.now()}${Math.random()}`);
}

test('a chart added by folder-drop alone', async (t) => {
  t.after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));

  stageTree();
  dropChart();

  // The real generator, against the copy. Nothing else is touched.
  const gen = spawnSync(process.execPath,
    [path.join(ROOT, 'tools', 'build-chart-registry.js'), '--root', SCRATCH],
    { cwd: ROOT, encoding: 'utf8' });
  assert.equal(gen.status, 0, `generator failed:\n${gen.stderr}`);

  const registry = require(
    path.join(SCRATCH, 'lib', 'components', 'chart', '_chart-family', 'chart-registry.generated.js'));
  const family = require(
    path.join(SCRATCH, 'lib', 'components', 'chart', '_chart-family', 'chart-family.js'));

  await t.test('the manifest alone put it in the dispatch table', () => {
    assert.ok(registry.LAYOUTS.includes(DROP_NAME),
      'the dropped chart is not a layout token — the generator did not read its `kernel` block');
    assert.ok(registry.FIGURE_CLASSES.includes(DROP_FIGURE));
    assert.equal(typeof registry.KERNELS[DROP_NAME].transformSection, 'function');
  });

  await t.test('it renders, framed, through the shipped dispatcher', () => {
    const r = family.transformChartSection(DECK_SECTION, DROP_NAME, undefined);
    assert.equal(r.transformed, true, 'the section was not dispatched to the dropped kernel');
    assert.match(r.html, new RegExp(`<div class="${DROP_FIGURE}">`), 'the kernel did not run');
    // The frame is the half that used to fail silently: the figure class had to
    // be added to a literal alternation in chart-family.js by hand, and a chart
    // whose class was missing still rendered its figure — unwrapped.
    assert.match(r.html, /<div class="chart-body">/,
      'the figure was built but never wrapped — the chart-frame body matcher did not find it');
    assert.ok(r.cls.split(/\s+/).includes('chart-frame'),
      'the section was not tagged chart-frame');
    assert.match(r.html, /data-beats="8"/, 'the kernel\'s own output did not survive the wrap');
  });

  await t.test('end to end: the engine renders the dropped chart in a real deck', () => {
    // `lib/engine` from the COPY — the whole transformer registry, the masthead
    // lift, the lot. This is the surface a deck actually goes through.
    const { render } = require(path.join(SCRATCH, 'lib', 'engine'));
    const md = [
      '---', 'theme: indaco', '---', '',
      `<!-- _class: ${DROP_NAME} -->`, '',
      '## Tempo', '', '- Verse `4`', '- Chorus `8`', '',
    ].join('\n');
    const { html } = render(md);
    assert.match(html, new RegExp(`<div class="${DROP_FIGURE}">`),
      'the engine render carries no tempo-bars figure');
    assert.match(html, /data-beats="4"/);
    assert.match(html, /class="[^"]*\btempo-bars\b[^"]*\bchart-frame\b/,
      'the rendered section is not tagged as a framed chart');
  });

  // ── The projected catalogs ────────────────────────────────────────────────
  //
  // Dispatch and framing were never the whole claim. A dropped chart was ALSO absent
  // from six hand-maintained rosters in five other files, and not one of them went
  // red: omit the chart-token roster and every fill rendered black; omit the
  // clean-SVG roster and vector export silently downgraded to PNG. These arms are
  // what make "a folder drop needs zero edits outside its own folder" a measured
  // claim rather than a slogan.
  // See engineering/decisions/2026-09-13-projected-rosters.md.

  await t.test('the drop reaches every catalog its declared kind belongs in', async () => {
    generate('build-projection-catalog.js');
    const c = await readProjectionCatalog();

    // Declared `flow`: the flow branch of the prose projection, the media set (which
    // is every re-hostable figure EXCEPT flow — so flow must be OUT), and the
    // scorecard's data layouts.
    assert.deepEqual(c.PROJECTION[DROP_NAME], { figure: 'flow', data: true },
      'the generator did not read the dropped manifest\'s `projection` block');
    assert.ok(c.FLOW_CHART_COMPONENTS.includes(DROP_NAME),
      'the dropped chart is not in FLOW_CHART_COMPONENTS — the prose projection would ' +
      'drop its .chart-body re-host and the bare table would overflow a narrow column');
    assert.ok(c.DATA_LAYOUTS.includes(DROP_NAME),
      'the dropped chart is not in DATA_LAYOUTS — a deck built on it would score Data: N/A');
    assert.ok(!c.MEDIA_COMPONENTS.includes(DROP_NAME),
      'a flow chart must NOT be in MEDIA_COMPONENTS — flow is dispatched on its own ' +
      'branch first, and the media branch would re-host it as a bare figure');
    assert.ok(!c.SVG_CHART_LAYOUTS.includes(DROP_NAME),
      'a flow chart must NOT claim standalone-vector extraction');
  });

  await t.test('re-declared `svg`, the same drop reaches the four vector catalogs', async () => {
    // The four rosters that held the IDENTICAL twelve names — CHART_TOKEN_COMPONENTS,
    // KEYED_CHART_LAYOUTS, CLEAN_SVG_LAYOUTS and the copy inside a page.evaluate in
    // tools/export-chart-svg.js — are all one export now, so one membership assertion
    // covers all four. Re-dropping rather than adding a second fixture keeps the proof
    // about the DECLARATION, not about this particular chart.
    dropChart({ figure: 'svg', data: true });
    generate('build-projection-catalog.js');
    const c = await readProjectionCatalog();

    assert.ok(c.SVG_CHART_LAYOUTS.includes(DROP_NAME),
      'the dropped chart is not in SVG_CHART_LAYOUTS — its fills would resolve to an ' +
      'undefined var and render BLACK in the prose projection, it would yield no ' +
      'standalone SVG, and both export surfaces would degrade it to a raster PNG');
    assert.ok(c.MEDIA_COMPONENTS.includes(DROP_NAME),
      'an svg chart must be in MEDIA_COMPONENTS — else no captioned-<figure> projection');
    assert.ok(!c.FLOW_CHART_COMPONENTS.includes(DROP_NAME));

    dropChart();  // restore the honest declaration for anything after this
    generate('build-projection-catalog.js');
  });

  await t.test('`none` is a real answer, not a way to opt out of the catalogs', async () => {
    dropChart({ figure: 'none', data: true });
    generate('build-projection-catalog.js');
    const c = await readProjectionCatalog();

    // It is still RECORDED — that is the difference between declaring "no producer"
    // and simply being forgotten, which is the entire subject of this change.
    assert.deepEqual(c.PROJECTION[DROP_NAME], { figure: 'none', data: true });
    for (const set of ['SVG_CHART_LAYOUTS', 'FLOW_CHART_COMPONENTS', 'MEDIA_COMPONENTS',
      'SPATIAL_BOUNDED_COMPONENTS', 'SPATIAL_PLACEHOLDER_COMPONENTS']) {
      assert.ok(!c[set].includes(DROP_NAME), `\`none\` must not appear in ${set}`);
    }
    assert.ok(c.DATA_LAYOUTS.includes(DROP_NAME),
      'having no figure path says nothing about whether the substance is data');

    dropChart();
    generate('build-projection-catalog.js');
  });

  await t.test('FORGETTING the declaration goes RED — the arm the six rosters lacked', () => {
    dropChart(null);
    const dropped = JSON.parse(fs.readFileSync(path.join(
      SCRATCH, 'lib', 'components', 'chart', DROP_NAME, `${DROP_NAME}.manifest.json`), 'utf8'));
    assert.equal(dropped.projection, undefined, 'the fixture still declares a projection');

    // The LOADER accepts it: absence is a coverage question, not a shape error, and
    // conflating the two would make the block un-optional for the 41 components that
    // legitimately have no rendered visual.
    const { validate } = require(path.join(ROOT, 'lib', 'components'));
    assert.deepEqual(validate(dropped, DROP_NAME), []);

    // The OWNERSHIP GATE refuses it. Driven over the synthetic manifest rather than
    // over the shipped tree, because the shipped tree can never be in this state —
    // which is exactly why every roster this replaces could be forgotten in silence.
    const { checkProjectionCoverage } = require(path.join(ROOT, 'tools', 'check-ownership.js'));
    const errors = [];
    checkProjectionCoverage([dropped], errors);
    assert.equal(errors.length, 1, `expected one coverage error, got ${JSON.stringify(errors)}`);
    assert.match(errors[0], /projection\.figure/);
    assert.match(errors[0], /silently degrades to PNG/,
      'the error must say what BREAKS, not just that a field is missing — the whole ' +
      'defect class is failures nobody could see');

    // And it passes the moment the chart declares one, including `none`.
    for (const figure of ['svg', 'flow', 'spatial', 'placeholder', 'bare', 'none']) {
      const ok = [];
      checkProjectionCoverage([{ ...dropped, projection: { figure } }], ok);
      assert.deepEqual(ok, [], `\`${figure}\` should satisfy coverage`);
    }
    // A non-chart component owes nothing.
    const nonChart = [];
    checkProjectionCoverage([{ name: 'x', bucket: 'statement', function: 'statement' }], nonChart);
    assert.deepEqual(nonChart, [], 'coverage must not reach outside the chart bucket');

    dropChart();
  });

  await t.test('the docs picker finds it with no edit to families.mjs', async () => {
    const { familyOf } = await import(
      require('node:url').pathToFileURL(path.join(ROOT, 'docs', 'src', 'lib', 'families.mjs')).href);
    assert.equal(familyOf(DROP_NAME, 'chart'), 'charts',
      'the dropped chart fell to the `other` family — it would be absent from the ' +
      'component browser\'s shape lens, the sixth roster a drop used to miss');
  });

  await t.test('no central file was edited to get any of that', () => {
    // The diff between the shipped tree and the one that renders a chart it has
    // never heard of is the drop itself, plus the generated registry.
    const real = path.join(ROOT, 'lib', 'components', 'chart', '_chart-family', 'chart-family.js');
    const copy = path.join(SCRATCH, 'lib', 'components', 'chart', '_chart-family', 'chart-family.js');
    assert.equal(fs.readFileSync(copy, 'utf8'), fs.readFileSync(real, 'utf8'),
      'chart-family.js differs between the shipped tree and the one carrying the new chart');
    // And it holds no chart name at all — the property that makes the claim
    // durable rather than true-by-luck on this one drop.
    const src = fs.readFileSync(real, 'utf8');
    for (const layout of registry.LAYOUTS) {
      assert.ok(!src.includes(`'${layout}'`) && !src.includes(`"${layout}"`),
        `chart-family.js still names the ${layout} layout — the dispatch is not fully manifest-driven`);
    }
  });
});
