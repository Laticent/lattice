/**
 * The preset judging gate's two contracts that need no browser:
 *
 *  1. THE CORPUS (test/fixtures/preset-corpus.md) is what engineering/decisions/
 *     2026-11-20-deck-preset-study.md §8 says it is: 25 to 30 slides, one or more per
 *     component bucket, the six chart kinds a new mark touches, the dense layouts, a title,
 *     a divider and a closing, and no look key in its front matter (a look key would pin
 *     the very thing the gate varies).
 *  2. THE ROWS tools/preset-gate.js renders: own is the recipe, flip inverts the mode, and
 *     house is indaco light whatever the recipe says; the recipe lands in the corpus's front
 *     matter and the slides are untouched.
 *
 * The gates themselves run real Chromium and are exercised by running the tool (its PR body
 * carries the failing arms); this file pins the parts a refactor could quietly break.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const CORPUS = path.join(ROOT, 'test', 'fixtures', 'preset-corpus.md');
const { rowValues, deckFor, readRecipe } = require(path.join(ROOT, 'tools', 'preset-gate.js'));

const BUCKETS = ['anchor', 'statement', 'inventory', 'comparison', 'progression', 'evidence', 'imagery',
  'chart', 'diagram', 'math', 'code', 'legal', 'connect', 'layout'];
const LOOK_KEYS = ['theme', 'color-mode', 'preset', 'finish', 'backdrop', 'typography', 'marks', 'mode',
  'spectrum', 'rule', 'eyebrow', 'headline', 'lift', 'corners', 'class', 'style'];

/** The bucket a `_class` (or `_pane`) component lives in, from where its directory is. */
function bucketOf(name) {
  for (const b of fs.readdirSync(path.join(ROOT, 'lib', 'components'))) {
    if (fs.existsSync(path.join(ROOT, 'lib', 'components', b, name))) return b;
  }
  if (fs.existsSync(path.join(ROOT, 'lib', 'plugins', 'chart-family', 'kinds', name))) return 'chart';
  return null;
}

function corpus() {
  const src = fs.readFileSync(CORPUS, 'utf8');
  const fm = src.match(/^---\n([\s\S]*?)\n---\n/)[1];
  const classes = [...src.matchAll(/<!--\s*_class:\s*([a-z0-9-]+)/g)].map((m) => m[1]);
  const panes = [...src.matchAll(/<!--\s*_pane:\s*([a-z0-9-]+)/g)].map((m) => m[1]);
  return { src, fm, classes, panes };
}

test('the corpus has 25 to 30 slides, each with a component class', () => {
  const { src, classes } = corpus();
  const body = src.replace(/^---\n[\s\S]*?\n---\n/, '');
  const slides = body.split(/^---$/m).length;
  assert.ok(slides >= 25 && slides <= 30, `the corpus has ${slides} slides; the study fixes it at 25 to 30`);
  assert.equal(classes.length, slides, 'a slide with no `_class` falls back to content and tests nothing named');
});

test('the corpus reaches every component bucket', () => {
  const { classes, panes } = corpus();
  const reached = new Set([...classes, ...panes].map(bucketOf));
  for (const name of [...classes, ...panes]) assert.ok(bucketOf(name), `\`${name}\` is not a component`);
  const missing = BUCKETS.filter((b) => !reached.has(b));
  assert.deepEqual(missing, [], `no corpus slide is in bucket(s) ${missing.join(', ')}`);
});

test('the corpus carries the chart kinds a new mark touches, the dense layouts and the anchors', () => {
  const { classes } = corpus();
  for (const name of ['bar', 'line', 'stacked-bar', 'piechart', 'heatmap', 'scatter',
    'table', 'list-tabular', 'kpi', 'title', 'divider', 'closing']) {
    assert.ok(classes.includes(name), `the corpus has no \`${name}\` slide`);
  }
});

test('the corpus front matter carries no look key, so the recipe is the only variable', () => {
  const { fm } = corpus();
  const keys = fm.split('\n').map((l) => (l.match(/^([a-z-]+)\s*:/) || [])[1]).filter(Boolean);
  const pinned = keys.filter((k) => LOOK_KEYS.includes(k));
  assert.deepEqual(pinned, [], `the corpus pins ${pinned.join(', ')}`);
});

test('own is the recipe, flip inverts the mode, house is indaco light whatever the recipe says', () => {
  const recipe = { name: 'x', values: { preset: 'editorial', theme: 'cuoio', 'color-mode': 'dark' } };
  assert.deepEqual(rowValues(recipe, 'own'), recipe.values);
  assert.equal(rowValues(recipe, 'flip')['color-mode'], 'light');
  assert.equal(rowValues(recipe, 'flip').theme, 'cuoio');
  assert.deepEqual(rowValues(recipe, 'house'), { preset: 'editorial', theme: 'indaco', 'color-mode': 'light' });
  // a recipe that names no mode is light, so its flip is dark
  assert.equal(rowValues({ name: 'y', values: { preset: 'classic' } }, 'flip')['color-mode'], 'dark');
  // a `-dark` theme with no color-mode is dark by default, so its flip is LIGHT (it used to stay dark)
  assert.equal(rowValues({ name: 'z', values: { theme: 'cuoio-dark' } }, 'flip')['color-mode'], 'light');
  // so is a deck pinned dark the legacy way
  assert.equal(rowValues({ name: 'w', values: { class: 'dark' } }, 'flip')['color-mode'], 'light');
});

test('the recipe lands in the front matter and the slides are untouched', () => {
  const src = fs.readFileSync(CORPUS, 'utf8');
  const out = deckFor({ preset: 'brand', 'color-mode': 'dark' });
  const fm = out.match(/^---\n([\s\S]*?)\n---\n/)[1];
  assert.match(fm, /^preset: brand$/m);
  assert.match(fm, /^color-mode: dark$/m);
  assert.equal(out.slice(out.indexOf('\n---\n', 4)), src.slice(src.indexOf('\n---\n', 4)));
});

test('a recipe file reads key: value lines, ignores comments, and survives a BOM, CRLF and quotes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-gate-'));
  const file = path.join(dir, 'earnings.yml');
  fs.writeFileSync(file, '\uFEFF# a candidate\r\npreset: editorial\r\nmarks: tone   # one ink\r\n\r\ntheme: "cuoio"\r\naccent: #0a3\r\n');
  try {
    // BOM and CRLF folded, quotes dropped, and a `#` value is not mistaken for a comment
    assert.deepEqual(readRecipe(file), { name: 'earnings', values: { preset: 'editorial', marks: 'tone', theme: 'cuoio', accent: '#0a3' } });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the mark gate scores contrast by WCAG relative luminance, in either order', () => {
  const { contrastRatio } = require(path.join(ROOT, 'tools', 'preset-gate.js'));
  assert.equal(+contrastRatio([0, 0, 0], [255, 255, 255]).toFixed(2), 21);
  assert.equal(contrastRatio([0, 93, 143], [255, 255, 255]), contrastRatio([255, 255, 255], [0, 93, 143]));
  // #767676 on white is the textbook 4.54:1; a gray cannot tell the channel weights apart, so
  // pure red on white (4.00:1, red weighs 0.2126) pins them
  assert.equal(+contrastRatio([118, 118, 118], [255, 255, 255]).toFixed(2), 4.54);
  assert.equal(+contrastRatio([255, 0, 0], [255, 255, 255]).toFixed(2), 4);
});

test('the overflow gate reads all three of the CLI\'s lost-content lines, and a clean log has none', () => {
  const { lostPages } = require(path.join(ROOT, 'tools', 'preset-gate.js'));
  // The line shapes lattice.js prints (its OVERFLOW, CONTENT CLIPPED and TYPE FLOOR warnings).
  const log = [
    '  ⚠ OVERFLOW — 1 slide exceed the frame and is CLIPPED in this export: page 14.',
    '  ⚠ CONTENT CLIPPED — 2 slides lose content inside a box that clips, without exceeding the frame: pages 3, 17.',
    '    First cut on each: p3 "Grocery chains", p17 "FY2026".',
    '  ⚠ TYPE FLOOR — 2 scaled figures render text below the legibility floor (9pt = 1.25% of slide height, 9px here): page 21 at 7.1pt (7.1px, 0.99%), page 26 at 8pt (8px, 1.1%).',
  ].join('\n');
  assert.deepEqual(lostPages(log), [3, 14, 17, 21, 26]);
  assert.deepEqual(lostPages('PNG: 30 slides → deck.NNN.png\n'), []);
});
