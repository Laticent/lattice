/**
 * THE DECLARATION CHANNEL'S DIFFERENTIAL (security spine P2; followups.d/3024): the two refusal readers that read a
 * channel `cssRefSpans` did not report, rebuilt on it, against the walks they replaced (frozen in tools/segno-legacy/).
 *
 *   - css-scan.js `findAddressStrings` (the theme, layout and package gates, through `findCssExfil`)
 *   - door-attr.mjs `cssRefTargets` (the code door)
 *
 * Compared as DECISIONS, not spellings: the old walks fold a carriage return before reading and the shared reader keeps
 * it inside a bad url token, so a value can be spelled differently while the refusal is the same. A refusal the old walk
 * made and the new one does not is allowed only where the reader says the string sits inside a `[…]` block, which CSS
 * reads whole: no declaration and no rule body opens inside it, so nothing there is fetched (the three-browser oracle in
 * the security spine note's "P2, as built" loaded every one of them, and none fetched). Everything else must hold.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const oldFind = require('../../../tools/segno-legacy/find-address-strings.js').findAddressStrings;
const oldDoor = require('../../../tools/segno-legacy/css-ref-targets.js').cssRefTargets;
const scan = require('../../../lib/core/css-scan.js');
const { fuzzInputs } = require('../../fixtures/web-ref-fuzz.js');
const { makeCssRefSpans } = require('../../../lib/core/css-ref-reader.js');
const declSpans = makeCssRefSpans(require('../../../lib/core/css-ref.generated.js'), require('../../../lib/core/css-token-readers.js'), { urlArg: true, decls: true });

const shipped = () => execFileSync('git', ['ls-files', '*.css'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => f && !f.startsWith('dist/')).map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
const fuzzed = (seed) => fuzzInputs(seed, 3000, 'http://127.0.0.1:9').filter((x) => x.kind === 'css').map((x) => [x.name, x.text]);

describe('declaration channel: the rebuilt refusal readers against the walks they replaced', async () => {
  const { maskCssComments } = await import('../../../lib/core/css-comments.mjs');
  const door = await import('../../../lib/core/door-attr.mjs');
  const corpus = [...shipped(), ...fuzzed(7), ...fuzzed(11)];
  const refuses = (items) => items.some((a) => a.kind === 'var' || !scan.urlIsLocal(a.value));
  const drops = (targets) => targets.some((t) => !door.isPageOwnRef(t));
  const inBrackets = (css) => declSpans(css).some((s) => s.selector);

  test('every theme, layout and package gate refusal stands, but one inside a `[…]` block', () => {
    const lost = [];
    let both = 0;
    for (const [name, css] of corpus) {
      const m = maskCssComments(css);
      const was = refuses(oldFind(m));
      const is = refuses(scan.findAddressStrings(m));
      if (was && is) both++;
      if (was && !is && !inBrackets(m)) lost.push(name);
    }
    assert.deepEqual(lost, []);
    assert.ok(both > 2000, `the corpus is not vacuous (${both} refused by both)`);
  });

  test('every code door refusal stands, but one inside a `[…]` block', () => {
    const lost = [];
    for (const [name, css] of corpus) if (drops(oldDoor(css)) && !drops(door.cssRefTargets(css)) && !inBrackets(css)) lost.push(name);
    assert.deepEqual(lost, []);
  });

  test('no shipped stylesheet changes its verdict', () => {
    for (const [name, css] of shipped()) {
      const m = maskCssComments(css);
      assert.equal(refuses(scan.findAddressStrings(m)), refuses(oldFind(m)), name);
      assert.equal(drops(door.cssRefTargets(css)), drops(oldDoor(css)), name);
    }
  });
});

describe('declaration channel: what each span says', () => {
  const at = (css) => declSpans(css).map((s) => [s.value, s.decl, s.inFunction]);

  test('the declaration a string sits in, as written for a custom property', () => {
    assert.deepEqual(at('--Q:"https://x";a{background:url("//y")}'), [['https://x', '--Q', false], ['//y', 'background', false]]);
    assert.deepEqual(at('@property --p{syntax:"*";initial-value:"//z"}'), [['*', 'syntax', false], ['//z', 'initial-value', false]]);
    // an escape spells the name (`\2d` is `-`), and a comment between name and colon does not hide it
    assert.deepEqual(at('\\2d-q/**/:"u"'), [['u', '--q', false]]);
  });

  test('the first name names the declaration; `;` inside a function does not end it; a block resets it', () => {
    assert.deepEqual(at('--a: b:"x"; c: foo("y"; "w") "z"'), [['x', '--a', false], ['y', 'c', true], ['w', 'c', true], ['z', 'c', false]]);
    assert.deepEqual(at('a:hover{"k"} --x:"v"'), [['k', '', false], ['v', '--x', false]]);
    // a string in an attribute selector sits in no declaration
    assert.deepEqual(at('a[x="s"]{--Q:\'t\'}'), [['s', '', false], ['t', '--Q', false]]);
  });

  test('the bypass the oracle found: an address-shaped string inside `image()`, now refused', () => {
    // Chromium, WebKit and Firefox fetched it; neither old walk named it in the theme gate.
    const css = '@font-face{font-family:q;src:image("\\68\tttp\\3a\f//1\\32 7.0.0.1:9/x")} p{font-family:q}';
    assert.deepEqual(oldFind(css).filter((a) => a.kind === 'var' || !scan.urlIsLocal(a.value)), []);
    assert.deepEqual(scan.findCssExfil(css).map((f) => f.rule), ['css-url-remote']);
    // a non-address string in a function is still text
    assert.deepEqual(scan.findCssExfil('@font-face{font-family:q;src:url(data:font/woff2;base64,AA) format("woff2")}'), []);
  });
});
