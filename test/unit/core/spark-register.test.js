/**
 * The `spark:` register — the frame, look and corners of every inline spark
 * (lib/core/resolve-spark.js), and the per-axis eviction both render paths apply.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '../../..');
const {
  SPARK_TOKENS, parseSpark, sparkClasses, sparkClassesFromFrontMatter, sparkTokenAxis, isSparkToken,
} = require(path.join(ROOT, 'lib/core/resolve-spark.js'));
const { isSurfaceRegisterToken } = require(path.join(ROOT, 'lib/core/surface-registers.js'));
const latticeEngine = require(path.join(ROOT, 'lib/engine'));
const { lintText } = require(path.join(ROOT, 'lib/authoring/lint.js'));
const { frontMatterBlock } = require(path.join(ROOT, 'lib/core/deck-front-matter.js'));

const deck = (fm, body) => ['---', 'theme: indaco', ...fm, '---', '', body].join('\n');
const TWO = '## One\n\nA `~{1 2 3}` spark.\n\n---\n\n<!-- _class: spark-framed -->\n\n## Two\n\nAnother `~{1 2 3}`.';
const classesOf = (fm, body) => {
  const doc = new JSDOM(latticeEngine.createEngine().render(deck(fm, body)).html).window.document;
  return [...doc.querySelectorAll('section')].map((s) => s.className.split(/\s+/).filter(Boolean));
};

test('a deck value becomes one class per axis, in axis order, whatever the word order', () => {
  assert.deepEqual(sparkClasses('rounded bare'), ['spark-bare', 'spark-rounded']);
  assert.deepEqual(sparkClasses('etching'), ['spark-etching']);
  assert.deepEqual(sparkClasses(''), []);
  assert.deepEqual(sparkClassesFromFrontMatter('marp: true\nspark: bare tone square'),
    ['spark-bare', 'spark-tone', 'spark-square']);
});

test('a YAML flow list reads as its words', () => {
  assert.deepEqual(sparkClasses('[bare, etching]'), ['spark-bare', 'spark-etching']);
});

test('unknown words and second words on an axis are reported, and never reach the slide', () => {
  const p = parseSpark('bare framed glossy');
  assert.equal(p.frame, 'bare');
  assert.deepEqual(p.duplicate, ['framed']);
  assert.deepEqual(p.unknown, ['glossy']);
  assert.deepEqual(sparkClasses('bare framed glossy'), ['spark-bare']);
});

test('every token knows its axis, and every token rides a split page (it decorates)', () => {
  for (const t of SPARK_TOKENS) {
    assert.ok(isSparkToken(t), t);
    assert.ok(['frame', 'look', 'corners'].includes(sparkTokenAxis(t)), t);
    assert.ok(isSurfaceRegisterToken(t), `${t} survives a split page's class swap`);
  }
  assert.equal(sparkTokenAxis('spark'), '');
});

test(`engine: the deck stamps every slide, and a slide's word evicts the deck's on its own axis only`, () => {
  const [a, b] = classesOf(['spark: bare etching'], TWO);
  assert.ok(a.includes('spark-bare') && a.includes('spark-etching'), a.join(' '));
  assert.ok(b.includes('spark-framed') && !b.includes('spark-bare'), `slide 2 frames: ${b.join(' ')}`);
  assert.ok(b.includes('spark-etching'), `slide 2 keeps the deck's look: ${b.join(' ')}`);
  const [c] = classesOf([], TWO);
  assert.ok(!c.some((t) => t.startsWith('spark-')), `control: ${c.join(' ')}`);
});

test('runtime: stamps the tokens from a baked block, and evicts per axis', async () => {
  const bundle = fs.readFileSync(path.join(ROOT, 'dist', 'lattice-runtime.js'), 'utf8');
  // CONTENT, not mtime: the look axis is the register's fingerprint in the bundle.
  assert.ok(/"pigment", *"etching", *"tone"/.test(bundle), 'dist/lattice-runtime.js predates the spark register — run `npm run build`.');
  const markup = '<section class="content"><h2>One</h2></section><section class="content spark-framed"><h2>Two</h2></section>';
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>${markup}${frontMatterBlock(deck(['spark: bare rounded'], ''))}</body></html>`,
    { url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
  );
  dom.window.fetch = () => Promise.reject(new Error('baked: no fetch expected'));
  const el = dom.window.document.createElement('script');
  el.textContent = bundle;
  dom.window.document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 1000));
  const [a, b] = [...dom.window.document.querySelectorAll('section')].map((x) => x.className.split(/\s+/));
  assert.ok(a.includes('spark-bare') && a.includes('spark-rounded'), a.join(' '));
  assert.ok(b.includes('spark-framed') && !b.includes('spark-bare') && b.includes('spark-rounded'), b.join(' '));
  dom.window.close();
});

test('lint: an unknown word and a second word on an axis warn; the slide classes are known', () => {
  const found = lintText(deck(['spark: bare glossy framed'], '<!-- _class: content spark-etching -->\n\n## One\n\nText.'));
  const spark = found.filter((f) => f.rule === 'unknown-spark');
  assert.equal(spark.length, 2, spark.map((f) => f.message).join(' | '));
  assert.ok(spark.some((f) => /'glossy' is not a known spark value/.test(f.message)));
  assert.ok(spark.some((f) => /second frame word \('framed'\)/.test(f.message)));
  assert.equal(found.filter((f) => f.rule === 'unknown-class').length, 0, 'spark-etching is a known slide class');
});
