/**
 * Unit: the leading-`:is()` distribution kernel (lib/core/leading-is.js).
 *
 * The kernel exists because Marpit-family scopers key on a selector's leftmost
 * compound: a literal leading `section` IS the slide, anything else becomes a
 * slide DESCENDANT. Lattice's dual-surface head — `:is(section.x, figure.x)`, one
 * rule for the slide and the docs-site's re-hosted `<figure>` — is not a literal
 * `section`, so marp-core scoped ~835 selectors to a slide-inside-a-slide and
 * they matched nothing (#1256). Distributing the arms first fixes it.
 *
 * Three things are pinned here:
 *   1. the rewrite itself (arms, recursion, idempotence, what it must NOT touch);
 *   2. that it reads the stylesheet as CSS rather than as text — comments and
 *      string literals are not selectors;
 *   3. the PRECONDITION the rewrite rests on, checked against the real corpus:
 *      `:is()` takes the specificity of its most specific arm, so distributing is
 *      cascade-neutral only when the arms are EQUALLY specific. Every leading
 *      head in engine CSS is a pair like `section.map, figure.chart-frame` (0,1,1
 *      both). Nothing enforced that, so a head with a lopsided arm would have
 *      silently changed which rule wins.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  splitSelectorList, leadingIsArms, distributeSelector, distributeLeadingIs, stripCssComments,
} = require('../../../lib/core/leading-is');

const ROOT = path.join(__dirname, '..', '..', '..');

describe('leading-is — selector rewriting', () => {
  test('splitSelectorList splits on TOP-LEVEL commas only', () => {
    assert.deepEqual(splitSelectorList('a, b'), ['a', ' b']);
    assert.deepEqual(splitSelectorList(':is(a, b) c, d'), [':is(a, b) c', ' d']);
    assert.deepEqual(splitSelectorList('[data-x="a,b"], d').length, 2);
  });

  test('leadingIsArms reads the arms and the remainder, and refuses a broken head', () => {
    assert.deepEqual(leadingIsArms(':is(section.map, figure.chart-frame) .map-region'), {
      arms: ['section.map', ' figure.chart-frame'], rest: ' .map-region',
    });
    assert.equal(leadingIsArms('.map :is(a, b)'), null, 'a mid-selector :is() is already a descendant');
    assert.equal(leadingIsArms(':is(section.map'), null, 'unbalanced — left untouched, never guessed');
  });

  test('distributeSelector expands each arm with the remainder, recursively', () => {
    assert.equal(
      distributeSelector(':is(section.map, figure.chart-frame) .map-region'),
      'section.map .map-region, figure.chart-frame .map-region',
    );
    assert.equal(distributeSelector(':is(:is(a, b), c) d'), 'a d, b d, c d');
    assert.equal(distributeSelector('.plain > x'), '.plain > x');
  });

  test('a full stylesheet rewrite is idempotent', () => {
    const css = ':is(section.map, figure.chart-frame) .r{color:red}\n:is(section, figure) .s{color:blue}\n';
    const once = distributeLeadingIs(css);
    assert.equal(once, 'section.map .r, figure.chart-frame .r{color:red}\nsection .s, figure .s{color:blue}\n');
    assert.equal(distributeLeadingIs(once), once, 'a distributed sheet has no leading :is() left');
  });

  test('leaves declarations, at-rule preludes, and :where() heads alone', () => {
    const css = '@media (min-width:30em){:is(section.a, figure.a) .b{color:red}}\n'
      + ':where(section.c, figure.c) .d{color:red}\n'
      + '.e{background-image:url(x.svg)}\n';
    assert.equal(
      distributeLeadingIs(css),
      '@media (min-width:30em){section.a .b, figure.a .b{color:red}}\n'
      + ':where(section.c, figure.c) .d{color:red}\n'
      + '.e{background-image:url(x.svg)}\n',
    );
  });
});

describe('leading-is — it reads CSS, not text', () => {
  // Engine CSS comments freely DISCUSS the pattern; a rule after a doc comment
  // must still be recognized (`*​/` is not a rule boundary — missing that left 151
  // of the dead chart rules unfixed on the first attempt).
  test('comment prose is copied verbatim, and the rule after it is still rewritten', () => {
    const css = '/* Heads like :is(section.a, figure.a) scope wrong, so we distribute. */\n'
      + ':is(section.a, figure.a) .b{color:red}\n';
    const out = distributeLeadingIs(css);
    assert.match(out, /\/\* Heads like :is\(section\.a, figure\.a\) scope wrong, so we distribute\. \*\//);
    assert.match(out, /^section\.a \.b, figure\.a \.b\{color:red\}$/m);
  });

  // A `{` inside a string literal is not a rule opening. Read as one, everything
  // back to the previous `;` became a candidate prelude — so a `:is(` in that
  // window got "distributed" INSIDE the string.
  test('a brace inside a string literal does not open a rule', () => {
    const css = '.a::after{content:"{"; font-family:":is(x, y) z"}\n:is(section.b, figure.b) .c{color:red}\n';
    const out = distributeLeadingIs(css);
    assert.match(out, /content:"\{"; font-family:":is\(x, y\) z"/, 'the declarations are untouched');
    assert.match(out, /^section\.b \.c, figure\.b \.c\{color:red\}$/m, 'the real rule still distributes');
  });

  test('an escaped quote does not end the string early', () => {
    const css = '.a::after{content:"\\"{"}\n:is(section.b, figure.b) .c{color:red}\n';
    assert.match(distributeLeadingIs(css), /^section\.b \.c, figure\.b \.c\{color:red\}$/m);
  });

  test('stripCssComments removes comments and nothing else', () => {
    assert.equal(stripCssComments('a{b:c}/* x */d{e:f}'), 'a{b:c}d{e:f}');
    assert.equal(stripCssComments('a{b:c}/* unterminated'), 'a{b:c}', 'an unterminated comment runs to EOF');
    assert.equal(stripCssComments(''), '');
    assert.equal(stripCssComments(null), '');
  });
});

// ── The cascade precondition ──────────────────────────────────────────────────

/** Every `.css` file under the engine's own source trees. */
function sourceStylesheets() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!/node_modules/.test(p)) walk(p); }
      else if (entry.name.endsWith('.css')) out.push(p);
    }
  };
  for (const dir of ['lib', 'themes']) walk(path.join(ROOT, dir));
  return out;
}

/**
 * A compound selector's specificity as `[ids, classes, types]` — enough for the
 * shape an `:is()` arm takes here (a type, optionally with classes / attributes /
 * pseudo-classes). A nested functional pseudo takes its most specific arm, per
 * spec; anything this can't score returns null, which the test treats as a
 * failure rather than a pass — an unscorable arm is exactly the case a human
 * should look at.
 */
function specificity(sel) {
  const s = sel.trim();
  if (!s) return null;
  let ids = 0;
  let classes = 0;
  let types = 0;
  let rest = s;
  // Nested :is()/:not()/:has() — score their arms, take the max, then remove.
  const NESTED = /:(?:is|not|has)\(([^()]*)\)/;
  for (let guard = 0; guard < 8; guard++) {
    const m = NESTED.exec(rest);
    if (!m) break;
    const inner = splitSelectorList(m[1]).map((a) => specificity(a));
    if (inner.some((x) => x === null)) return null;
    const max = inner.reduce((a, b) => (cmp(a, b) >= 0 ? a : b), [0, 0, 0]);
    ids += max[0]; classes += max[1]; types += max[2];
    rest = rest.slice(0, m.index) + rest.slice(m.index + m[0].length);
  }
  if (/:(?:is|not|has)\(/.test(rest)) return null; // nesting deeper than we score
  rest = rest.replace(/::[\w-]+/g, () => { types += 1; return ' '; });
  rest = rest.replace(/#[\w-]+/g, () => { ids += 1; return ' '; });
  rest = rest.replace(/\[[^\]]*\]/g, () => { classes += 1; return ' '; });
  rest = rest.replace(/\.[\w-]+/g, () => { classes += 1; return ' '; });
  rest = rest.replace(/:[\w-]+(\([^()]*\))?/g, () => { classes += 1; return ' '; });
  rest = rest.replace(/[\w-]+/g, () => { types += 1; return ' '; });
  // Combinators, `*`, and whitespace are all that may remain.
  if (/[^\s>+~*]/.test(rest)) return null;
  return [ids, classes, types];
}

function cmp(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

describe('leading-is — the equal-specificity precondition holds in the corpus', () => {
  test('the specificity scorer itself is right on known shapes', () => {
    assert.deepEqual(specificity('section.map'), [0, 1, 1]);
    assert.deepEqual(specificity('figure.chart-frame'), [0, 1, 1]);
    assert.deepEqual(specificity('section'), [0, 0, 1]);
    assert.deepEqual(specificity('#a.b c'), [1, 1, 1]);
    assert.deepEqual(specificity('section:is(.a.b, .c)'), [0, 2, 1]);
    assert.deepEqual(specificity('a[href]::before'), [0, 1, 2]);
  });

  test('every leading :is() head in engine CSS has equally specific arms', () => {
    const offenders = [];
    const seen = new Set();
    for (const file of sourceStylesheets()) {
      const css = stripCssComments(fs.readFileSync(file, 'utf8'));
      for (const m of css.matchAll(/(^|[{};])([^{}@;]+)\{/g)) {
        for (const sel of splitSelectorList(m[2])) {
          const li = leadingIsArms(sel.trim());
          if (!li) continue;
          const key = li.arms.map((a) => a.trim()).join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          const scores = li.arms.map((a) => specificity(a));
          if (scores.some((s) => s === null)) {
            offenders.push(`${path.relative(ROOT, file)}: unscorable arm in :is(${key})`);
          } else if (scores.some((s) => cmp(s, scores[0]) !== 0)) {
            offenders.push(
              `${path.relative(ROOT, file)}: :is(${key}) arms differ — ${scores.map((s) => s.join(',')).join(' vs ')}`,
            );
          }
        }
      }
    }
    assert.deepEqual(offenders, [],
      'distributing a lopsided :is() head changes which rule wins — give the arms '
      + 'equal specificity, or scope the odd one out in its own rule');
    assert.ok(seen.size >= 10, `expected the dual-surface heads to be found; saw ${seen.size}`);
  });
});
