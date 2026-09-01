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
  kernel: { figureClass: DROP_FIGURE },
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

function dropChart() {
  const dir = path.join(SCRATCH, 'lib', 'components', 'chart', DROP_NAME);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${DROP_NAME}.manifest.json`),
    JSON.stringify(DROP_MANIFEST, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, `${DROP_NAME}.transform.js`), DROP_KERNEL);
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
