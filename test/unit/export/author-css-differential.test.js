/**
 * Segno P5b, Family B: the author-CSS `:root` token copy (lib/export/author-css.js `rootTokenCopy`, which `packAuthorCss`
 * appends to a deck's own CSS) on the one CSS tokenizer, against the comment regex and the brace walk it replaced (frozen
 * in tools/segno-legacy/author-css.js).
 *
 * A #22 re-wrap site (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md §9): the copy goes back into a
 * `<style>`. On every shipped sheet and every shipped deck's own CSS the two hand back the same text. On a seeded corpus
 * they agree wherever none of the named cases is present: a comment or a string holds what the old walk read, a comment
 * sat between two tokens, a selector list holds a comma inside parentheses, or a block nests braces the old `;` split
 * cut through. In each, CSS reads it the new way.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const legacy = require('../../../tools/segno-legacy/author-css.js');
const { rootTokenCopy, packAuthorCss } = require('../../../lib/export/author-css.js');
const { readGlobalStyle } = require('../../../lib/export/export-scaffold');
const { prng } = require('../../fixtures/web-ref-fuzz.js');

const same = (css) => rootTokenCopy(css) === legacy.tokenCopy(css);
const ls = (glob) => execFileSync('git', ['ls-files', glob], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

/** Every deck's own CSS: its front-matter `style:` and each `<style>` body in its slides. */
function deckCss() {
  const out = [];
  for (const f of ls('*.md')) {
    const md = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
    if (fm) {
      const style = readGlobalStyle(fm[1]);
      if (style) out.push([`${f} style:`, style]);
    }
    for (const m of md.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) out.push([`${f} <style>`, m[1]]);
  }
  return out;
}

test('the two read every shipped sheet the same', () => {
  const files = ls('*.css');
  files.push('node_modules/katex/dist/katex.min.css');
  let copied = 0;
  for (const f of files) {
    const css = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (legacy.tokenCopy(css)) copied++;
    assert.ok(same(css), f);
  }
  assert.ok(copied >= 10, `sheets with a :root copy: ${copied}`);
});

// No shipped deck's own CSS sets a `:root` custom property today (measured: every block's copy is ''), so this pins the
// empty answer on all of them; the sheets above and the corpus below are what exercise a non-empty copy.
test("the two read every shipped deck's own CSS the same, so packAuthorCss writes the same bytes", () => {
  const all = deckCss();
  assert.ok(all.length >= 20, `deck CSS blocks: ${all.length}`);
  for (const [name, css] of all) {
    assert.equal(rootTokenCopy(css), legacy.tokenCopy(css), name);
    assert.equal(packAuthorCss(css), rootTokenCopy(css).trim() ? packAuthorCss(css) : String(css), name);
  }
});

const PIECES = [
  ':root{', ':root ', 'section:root{', ':is(:root, .x){', '@media print{', '@supports (x:y){', '@font-face{', 'h1{', '}', '{',
  ';', ',', '--accent:#f00;', '--bg: var(--x, red);', '--grid:{a;b};', 'color:red;', 'content:"/*";', "content:'}';",
  '--note:"cut\n;', '--esc:a\\};', '/* } */', '/**/', '</', 'style>', 'url(a{b)', ' ', '\n',
];
const corpus = (seed, count) => {
  const rnd = prng(seed);
  return Array.from({ length: count }, (_, n) => {
    let s = '';
    const len = 2 + Math.floor(rnd() * 14);
    for (let k = 0; k < len; k++) s += PIECES[Math.floor(rnd() * PIECES.length)];
    return [`pieces#${seed}.${n}`, s];
  });
};
// Each named case is one piece, so a disagreement on an input that holds none of them is a regression, never hidden.
const NAMED = [
  ['content:"/*";', 'a "/*" in a string opened a comment for the old regex'],
  ["content:'}';", 'a "}" in a string: the old walk was quote-aware, but the comment regex ran first'],
  ['/* } */', 'the old regex took a comment out whole, so its neighbours joined'],
  ['/**/', 'the old regex took a comment out whole, so its neighbours joined'],
  [':is(:root, .x){', 'the old walk split the arm at the comma inside :is()'],
  ['url(a{b)', 'an unquoted url( holds a brace'],
  ['--grid:{a;b};', "a custom property's own {} block, which the old ; split cut through"],
  ['--note:"cut\n;', 'a bad string: CSS ends it at the newline and drops the declaration'],
  ['--esc:a\\};', 'an escaped "}" is text, not the end of the block'],
];
// One structural case: a `:root` rule whose body opens a block before it closes (CSS nesting). The declarations inside that
// block are the nested rule's, not the `:root` rule's; the old `;` split counted them. A group rule AROUND a `:root` rule
// is not this case, so a regression in the group walk stays visible.
const NESTS_IN_ROOT = /:root\{[^}]*\{/;
const explained = (css) => NAMED.some(([piece]) => css.includes(piece)) || NESTS_IN_ROOT.test(css);

test('on the seeded corpus, every disagreement is a named case', () => {
  let agree = 0;
  let fixed = 0;
  const unexplained = [];
  for (const [name, css] of [...corpus(8, 4000), ...corpus(16, 4000)]) {
    if (same(css)) agree++;
    else if (explained(css)) fixed++;
    else unexplained.push(`${name}: ${JSON.stringify(css)}`);
  }
  assert.deepEqual(unexplained.slice(0, 5), []);
  assert.ok(agree > 1500, `agreed on ${agree}`);
  assert.ok(fixed > 100, `fixed ${fixed}`);
});

test('failing arm: a "/*" inside a string no longer hides every token after it', () => {
  const css = ':root{content:"/*";--accent:#f00}h1{color:red}/* note */';
  assert.equal(legacy.tokenCopy(css), '');
  assert.equal(rootTokenCopy(css), ':root{--accent:#f00}');
});

test('failing arm: a comma inside :is() no longer splits the selector into a broken arm', () => {
  const css = ':is(:root, .brand){--accent:#f00}';
  assert.equal(legacy.tokenCopy(css), ':is(:root{--accent:#f00}');
  assert.equal(rootTokenCopy(css), ':is(:root, .brand){--accent:#f00}');
});

test('#22: a comment between "<" and "/style>" never joins them into a closing tag', () => {
  const css = ':root{--x:<//**/style><b>}';
  assert.ok(legacy.tokenCopy(css).includes('</style>'));
  const now = rootTokenCopy(css);
  assert.equal(/<\/style/i.test(now), false, now);
  assert.equal(now, ':root{--x:</ style><b>}');
});

test('a bad string drops its own declaration and nothing after it, as CSS reads it', () => {
  const css = ':root{--brand:#123;--note:"draft\n;--accent:#f00}';
  assert.equal(rootTokenCopy(css), ':root{--brand:#123;--accent:#f00}');
  assert.equal(rootTokenCopy(":root{--a:1;--b:'q\n}h1{x:y}"), ':root{--a:1}');
  assert.equal(rootTokenCopy(':root{--u:url(a.png);--v:url(b\n}'), ':root{--u:url(a.png)}');
  assert.equal(rootTokenCopy(':root{--a:"x\\\\";--b:2}'), ':root{--a:"x\\\\";--b:2}', 'an escaped backslash still closes');
});

test('group rules nest: every level that holds a :root copy is kept, in order', () => {
  assert.equal(rootTokenCopy('@media a{@media b{:root{--a:1}}}'), '@media a{@media b{:root{--a:1}}}');
  assert.equal(
    rootTokenCopy('@media a{h1{--x:0}:root{--a:1}@supports (b:c){:root{--b:2}}:root{--c:3}}'),
    '@media a{:root{--a:1}@supports (b:c){:root{--b:2}}:root{--c:3}}',
  );
  assert.equal(legacy.tokenCopy('@media a{@media b{:root{--a:1}}}'), '@media a{@media b{:root{--a:1}}}');
});

test('failing arm: a sheet nested 20,000 groups deep is read, not thrown on', () => {
  const n = 20000;
  const css = `${'@media x{'.repeat(n)}:root{--a:1}${'}'.repeat(n)}`;
  assert.throws(() => legacy.tokenCopy(css), RangeError);
  assert.equal(rootTokenCopy(css), css);
  assert.equal(rootTokenCopy(`${'@media x{'.repeat(n)}h1{--a:1}`), '');
});

test('failing arm: an escaped space at the end of a name or value keeps its space', () => {
  const css = ':root{--a:x\\ }h1{--c:3}';
  assert.equal(legacy.tokenCopy(css), ':root{--a:x\\}');
  assert.equal(rootTokenCopy(css), ':root{--a:x\\ }');
  assert.equal(legacy.tokenCopy(':root\\ {--a:1}'), ':root\\{--a:1}', 'the old trim left a \\ that escapes the {');
  assert.equal(rootTokenCopy(':root\\ {--a:1}'), ':root\\ {--a:1}');
  const arms = 'section:root .a\\ , :root{--a:1}';
  assert.equal(legacy.tokenCopy(arms), 'section:root .a\\, :root{--a:1}', 'the old trim escaped the joining comma');
  assert.equal(rootTokenCopy(arms), arms);
});
