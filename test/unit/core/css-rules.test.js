/**
 * lib/core/css-rules.mjs `cssRules` (a sheet's blocks and declarations on the CSS tokenizer, Segno P5a), and the two
 * tooling readers moved onto it: the conformance contract's physical-property count
 * (lib/conformance/kinds/component.contract.js `physicalCount`) and the rail-paint selector read
 * (lib/components/surfaces.js). The old count is copied below as it stood on `main` dbc4d73a, comments dropped.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { cssRules } = require('../../../lib/core/css-rules.mjs');
const { physicalCount } = require('../../../lib/conformance/kinds/component.contract.js');
const { componentSurfaces } = require('../../../lib/components/surfaces.js');

const ROOT = path.join(__dirname, '..', '..', '..');

test('cssRules: blocks at every depth, their preludes, and the declarations directly in each', () => {
  const css = 'a, b { color: red; --Q: x !important; margin: 0 0 0 4px!important } /* c{} */ @media print { p { left: 1px } } c{d:url("}");e:f(;)}';
  const read = cssRules(css).map((r) => ({
    at: r.at,
    prelude: css.slice(r.from, r.to),
    depth: r.depth,
    decls: r.decls.map((d) => [d.name, css.slice(d.valueFrom, d.valueTo), d.important]),
  }));
  assert.deepEqual(read, [
    { at: '', prelude: 'a, b', depth: 0, decls: [['color', 'red', false], ['--Q', 'x', true], ['margin', '0 0 0 4px', true]] },
    { at: 'media', prelude: '@media print', depth: 0, decls: [] },
    { at: '', prelude: 'p', depth: 1, decls: [['left', '1px', false]] },
    { at: '', prelude: 'c', depth: 0, decls: [['d', 'url("}")', false], ['e', 'f(;)', false]] },
  ]);
  // An unclosed block ends at the end of the text, as CSS closes it; a stray `}` closes nothing.
  const open = 'x { y: z';
  assert.deepEqual(cssRules(open).map((r) => [r.close, r.decls.map((d) => d.name)]), [[open.length, ['y']]]);
  assert.deepEqual(cssRules('} a{b:c}').map((r) => r.decls.length), [1]);
  // Names: decoded, lowercased but for a custom property.
  assert.deepEqual(cssRules('a{CoLoR:red;--Mixed:1;\\6c eft:0}')[0].decls.map((d) => d.name), ['color', '--Mixed', 'left']);
});

const PHYSICAL = [
  /(?<![\w#.-])(?:margin|padding|border|scroll-margin|scroll-padding)-(?:left|right)(?:-[a-z]+)*\s*:/gi,
  /(?<![\w#.-])border-(?:top|bottom)-(?:left|right)-radius\s*:/gi,
  /(?<![\w#.-])(?:left|right)\s*:/gi,
  /(?<![\w#.-])text-align\s*:\s*(?:left|right)\b/gi,
  /(?<![\w#.-])float\s*:\s*(?:left|right)\b/gi,
  /(?<![\w#.-])justify-(?:content|items|self)\s*:\s*(?:left|right)\b/gi,
  /(?<![\w#.-])(?:background|object|mask)-position\s*:[^;}]*\b(?:left|right)\b/gi,
];
const FOUR_VALUE = /(?<![\w#.-])(?:margin|padding|inset|scroll-margin|scroll-padding|border-width|border-style|border-color)\s*:\s*([^;}]+)/gi;
function oldTopLevelWords(v) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of v.replace(/!important/i, '').trim()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && !depth) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function oldPhysicalCount(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let n = PHYSICAL.reduce((t, re) => t + (bare.match(re) || []).length, 0);
  for (const m of bare.matchAll(FOUR_VALUE)) {
    const w = oldTopLevelWords(m[1]);
    if (w.length === 4 && w[1].toLowerCase() !== w[3].toLowerCase()) n++;
  }
  return n;
}

test('physicalCount: the same count as the regexes on every stylesheet in lib/', () => {
  const files = execFileSync('git', ['ls-files', 'lib/**/*.css'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(files.length > 100, `only ${files.length} stylesheets`);
  let physical = 0;
  for (const f of files) {
    const css = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const n = physicalCount(css);
    assert.equal(n, oldPhysicalCount(css), f);
    physical += n;
  }
  assert.ok(physical > 0, 'no stylesheet holds a physical declaration, so the comparison reached nothing');
});

test('physicalCount: what the rules reader counts as CSS does, and the regexes did not', () => {
  // A selector, a string and a comment are not declarations.
  const notDecls = 'p:is(.x) .left:hover{color:red}' + 'q::after{content:"left: 1px"}' + 'r{/* left: 0; */color:red}';
  assert.equal(physicalCount(notDecls), 0);
  assert.equal(oldPhysicalCount('q::after{content:"left: 1px"}'), 1);
  // The naive comment strip pairs a `/*` inside a string with the next real `*/` and hides what lies between.
  const hidden = 'a::after{content:"/*"} b{margin-left:4px} /* note */';
  assert.equal(physicalCount(hidden), 1);
  assert.equal(oldPhysicalCount(hidden), 0);
  // Declarations it counts: a physical longhand, a side value, a position, an uneven four-value shorthand.
  assert.equal(physicalCount('a{margin-left:0;text-align:right!important;background-position:left top;inset:0 auto 0 0;padding:1px 2px 1px 2px}'), 4);
});

test('surfaces: the rail-paint selector list names the same railed components the text scan did', () => {
  const accent = fs.readFileSync(path.join(ROOT, 'lib/base/base.accent-finish.css'), 'utf8');
  // The old read, as it stood: the selector text before the one block reading `var(--sp-card-img)`.
  const at = accent.indexOf('background-image: var(--sp-card-img)');
  const open = accent.lastIndexOf('{', at);
  const selectors = accent.slice(accent.lastIndexOf('}', open) + 1, open).replace(/\/\*[\s\S]*?\*\//g, '');
  const old = new Set([...selectors.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]));
  assert.ok(old.has('cards-grid') && old.has('pricing'), 'the rail rule moved; update this test');
  // Each class in that list reports the `card-rail` surface, and a class outside it does not.
  const rails = (name) => componentSurfaces({ name }, { dir: path.join(ROOT, 'lib/components', name), root: ROOT }).includes('card-rail');
  for (const name of old) assert.ok(rails(name), `${name} is in the rail rule's selector list`);
  assert.equal(rails('title'), false);
  assert.ok(!old.has('title'), 'title joined the rail rule; pick another component for this arm');
});
