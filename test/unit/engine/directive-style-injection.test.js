/**
 * DIRECTIVE VALUES CANNOT INJECT CSS DECLARATIONS.
 *
 * Every known directive is written into the section's inline `style` as a custom property
 * so CSS can read it (`--header`, `--footer`, …). Inline style is the highest cascade tier
 * short of `!important`, so a value that can close its own declaration and open a new one
 * can set ANY property on the slide — including a slide plane, which lifts the finish
 * sheet over every word and renders the deck with its body erased.
 *
 * This file exists because the first fix for that shipped WITHOUT tests and was bypassable
 * within hours. The documented case (`header: "Acme Q3; --z-canvas: 9"`) was closed; the
 * CLASS was not, because the scanner treated a quote as a string opener even inside an
 * unquoted `url(`. CSS does the opposite: `url(a"b)` is a bad-url-token ending at `)`, so
 * `url(a"b);--z-canvas:9` carried a live `;`.
 *
 * So the contract is asserted here, not in prose:
 *   1. no directive value can emit a second declaration, by any route;
 *   2. data URIs — the reason a naive `/;/` drop is wrong — still survive.
 *
 * If you change `sanitizeDeclValue`, add your case here FIRST and watch it fail.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { InlineStyle } = require('../../../lib/engine/slides');

/** Serialize one directive value the way the slide pipeline does. */
const emit = (value) => new InlineStyle().set('--footer', value).toString();

/** Does the emitted attribute contain a declaration separator the browser would honor? */
function emitsSecondDeclaration(attr) {
  let state = 0, quote = '';           // 0 outside · 1 string · 2 raw url · 3 quoted url
  let decls = 0;
  for (let i = 0; i < attr.length; i++) {
    const c = attr[i];
    if (state === 1 || state === 3) {
      if (c === '\\') { i++; continue; }
      if (c === quote) state = state === 3 ? 2 : 0;
      continue;
    }
    if (state === 2) { if (c === ')') state = 0; continue; }
    if (c === '"' || c === "'") { state = 1; quote = c; continue; }
    if (c === '(') {
      if (!/url\s*$/i.test(attr.slice(0, i))) continue;
      let j = i + 1; while (j < attr.length && /\s/.test(attr[j])) j++;
      if (attr[j] === '"' || attr[j] === "'") { state = 3; quote = attr[j]; i = j; } else state = 2;
      continue;
    }
    if (c === ';') decls++;
  }
  return decls > 1;                    // one trailing `;` is the declaration's own terminator
}

describe('a directive value cannot inject a CSS declaration', () => {
  // Each of these carries a `;` that a browser WOULD read as a separator. Every one must be
  // dropped whole — the directive still lands as its `data-*` attribute, which is where
  // anything reading it for content should look.
  const INJECTIONS = [
    ['the documented case', 'Acme Q3; --z-canvas: 9'],
    ['no space after the semicolon', 'Acme;--z-canvas:9'],
    ['bad-url-token — the bypass this file was written from', 'url(a"b);--z-canvas:9'],
    ['bad-url-token, single quote', "url(a'b);--z-canvas:9"],
    ['unterminated function then a separator', 'foo(;--z-canvas:9'],
    ['bare quote then a separator', '";--z-canvas:9'],
    ['quoted semicolon — safe in CSS, dropped deliberately (see below)', '"a;b"'],
    ['unbalanced open paren swallowing the rest', "a ( b; --z-canvas: 9"],
    ['closed url then a separator', 'url(ok.png);--z-canvas:9'],
    ['quoted url then a separator', 'url("ok.png");--z-canvas:9'],
    ['brace, to close an injected block', 'a}b'],
    ['angle bracket, for a downstream serializer', '<script>'],
    ['plane other than canvas', 'x; --z-mark: -1'],
    ['a non-plane property entirely', 'x; position: fixed'],
  ];

  for (const [label, value] of INJECTIONS) {
    test(`drops: ${label}`, () => {
      const attr = emit(value);
      assert.equal(
        attr, '',
        `\`${value}\` emitted \`${attr}\`. A directive value that can terminate its own ` +
        'declaration can set any property on the slide from ordinary markdown, at a cascade ' +
        'tier no stylesheet can defend against.',
      );
      assert.equal(emitsSecondDeclaration(attr), false, 'no second declaration may reach the attribute');
    });
  }
});

describe('legitimate directive values survive', () => {
  // The reason a naive `/;/` drop is wrong: a `;` inside a url token is inert, and data
  // URIs are full of them.
  const KEEPERS = [
    ['plain text', 'Acme Q3 Board Pack'],
    ['data URI — the case a naive drop breaks', 'url(data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)'],
    ['data URI, quoted', 'url("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")'],
    ['url with a semicolon in the path', 'url(a;b.png)'],
    ['balanced parens in prose', 'Acme (Q3) Board Pack'],
    ['an ordinary function', 'color-mix(in srgb, red 20%, blue)'],
    ['em dash and unicode', 'Acme — Q3 · Confidential'],
  ];

  for (const [label, value] of KEEPERS) {
    test(`keeps: ${label}`, () => {
      assert.equal(
        emit(value), `--footer:${value};`,
        `\`${value}\` is a legal declaration value and must reach the attribute intact`,
      );
    });
  }
});

describe('quotes are deliberately NOT tracked, and that is the point', () => {
  // The first version of this scanner tracked quote state so a `;` inside a string could be
  // kept. That is what made it bypassable: it checked for a quote BEFORE checking whether it
  // sat inside an unquoted `url(`, and CSS says a quote there cannot open a string at all.
  //
  // The rebuild ignores quotes entirely. A quote never changes whether a `;` terminates a
  // declaration — only a `url()` token does — so quote state was buying one rare case and
  // costing the whole guarantee.
  //
  // The rare case is a value like `"a;b"`, safe in CSS and now dropped. The cost of that is
  // a directive whose text is a quoted string containing a semicolon, which the corpus does
  // not contain and no author is likely to write. The benefit is a scanner small enough to
  // be obviously correct.

  test('an apostrophe in ordinary prose is untouched — the case a stricter scanner broke', () => {
    // Possessives are everywhere in header/footer copy. An earlier rebuild rejected any value
    // that ended mid-string, which dropped `Ladder's` and `the slide's depth axis` from two
    // committed example decks. Tracking no quote state at all fixes that for free.
    for (const v of [
      "Auto-split — the Fit Ladder's split move",
      "Lattice · the slide's depth axis",
      'She said "hello" and left',
      "it's a 'quoted' word",
    ]) {
      assert.equal(emit(v), `--footer:${v};`, `\`${v}\` is ordinary prose and must survive intact`);
    }
  });
});
