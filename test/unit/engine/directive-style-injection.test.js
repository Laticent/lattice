/**
 * DIRECTIVE VALUES CANNOT INJECT CSS DECLARATIONS.
 *
 * Every known directive has its VALUE written into the slide `<section>`'s inline `style`:
 * once as a custom property (`--header`, `--footer`, …) and, for `color` /
 * `backgroundColor` / `backgroundImage`, also as a real declaration. Inline style is the
 * highest cascade tier short of `!important`, so a value that can terminate its own
 * declaration and open a second one sets arbitrary CSS on the slide from ordinary markdown
 * — a slide plane (`--z-canvas: 9`) erases the body under the finish sheet, and
 * `position: fixed` is just as reachable.
 *
 * THIS FILE EXISTS BECAUSE THREE FIXES FAILED, and the third failed in a way this file
 * caused. Each of the first two approximated CSS tokenization to decide whether a given
 * `;` was inert, and each was broken by a construct the author had not imagined:
 *
 *   v1  tracked quotes, not `url()`   →  `url(a"b);--z-canvas:9`
 *   v2  also rejected mid-token ends  →  dropped `Ladder's` from shipped decks
 *   v3  tracked `url()`, not quotes   →  `'url(';…` and a `url(` inside a comment
 *
 * The v3 test file — this one, in its previous form — asserted safety with a HAND-ROLLED
 * oracle that did not strip comments, so it agreed with the broken fix and certified it.
 * An independent check written by the author of the fix is not independent.
 *
 * So the oracle here is `css-tree`, a real CSS parser. It is asked the only question that
 * matters: **after parsing the emitted attribute, is there more than one declaration?**
 * That question has one right answer regardless of which construct the attacker reached
 * for, and no amount of cleverness in the fix can talk it out of noticing.
 *
 * If you change how directive values are serialized, add your case to INJECTIONS first and
 * watch it fail.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const csstree = require('css-tree');
const { InlineStyle } = require('../../../lib/engine/slides');

/** Serialize one directive value the way the slide pipeline does. */
const emit = (prop, value) => new InlineStyle().set(prop, value).toString();

/**
 * THE ORACLE. Parse the emitted attribute as a real declaration list and count what a
 * browser would actually apply. Anything above 1 means the value opened a declaration of
 * its own — the whole defect, by any route.
 */
function declarationsIn(styleAttr) {
  const names = [];
  csstree.walk(csstree.parse(styleAttr, { context: 'declarationList' }), {
    visit: 'Declaration',
    enter: (node) => names.push(node.property),
  });
  return names;
}

describe('a custom property cannot carry a second declaration', () => {
  // Every one of these is a live injection against at least one previous version of the
  // serializer. They are kept as a permanent record: each cost a round.
  const INJECTIONS = [
    ['v1 — the originally reported case', 'Acme Q3; --z-canvas: 9'],
    ['v1 — no space after the separator', 'Acme;--z-canvas:9'],
    ['v2 — bad-url-token, double quote', 'url(a"b);--z-canvas:9'],
    ['v2 — bad-url-token, single quote', "url(a'b);--z-canvas:9"],
    ['v3 — a string ending in url(', "'url(';--z-canvas:9"],
    ['v3 — a string ending in url(, double quoted', '"url(";--z-canvas:9'],
    ['v3 — url( inside a CSS comment', '/*url(*/;--z-canvas:9'],
    ['v3 — comment form, prose shaped', 'Acme /* url( */ ;--z-canvas:9'],
    ['v3 — whitespace between url and paren', "'url (';--z-canvas:9"],
    ['v3 — case insensitivity', "'URL(';--z-canvas:9"],
    ['v3 — identifier merely ending in url', "'xURL(';--z-canvas:9"],
    ['unterminated function then a separator', 'foo(;--z-canvas:9'],
    ['bare quote then a separator', '";--z-canvas:9'],
    ['brace, to close an injected block', 'a}b;--z-canvas:9'],
    ['angle bracket, for a downstream serializer', '<script>;--z-canvas:9'],
    ['a non-plane property entirely', 'x; position: fixed'],
    ['trailing backslash, to escape the terminator', 'Acme\\'],
  ];

  for (const [label, value] of INJECTIONS) {
    test(`inert: ${label}`, () => {
      const attr = emit('--footer', value);
      const decls = declarationsIn(attr);
      assert.deepEqual(
        decls, ['--footer'],
        `\`${value}\` emitted \`${attr}\`, which a real CSS parser reads as ` +
        `${decls.length} declaration(s): ${decls.join(', ')}. A directive value that can ` +
        'open a declaration sets arbitrary CSS on the slide from ordinary markdown.',
      );
    });
  }

  test('the text survives intact inside the string', () => {
    // Quoting is what makes the payload inert, so the value is NOT dropped — it is still
    // there, and a consumer reading it (or `content: var(--footer)`) gets the whole text.
    const attr = emit('--footer', 'Acme Q3; --z-canvas: 9');
    assert.match(attr, /Acme Q3; --z-canvas: 9/, 'the author\'s text is preserved, not discarded');
  });
});

describe('ordinary prose is untouched', () => {
  // v2 broke these. Possessives and quotes are everywhere in header/footer copy, and a
  // string token holds them without any analysis at all.
  const PROSE = [
    'Acme Q3 Board Pack',
    "Auto-split — the Fit Ladder's split move",
    "Lattice · the slide's depth axis",
    'She said "hello" and left',
    'Charts — sketch reskins the heading; the SVG marks stay clean',
    'Acme (Q3) · Confidential',
    'url(data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)',
  ];

  for (const value of PROSE) {
    test(`keeps: ${value.slice(0, 44)}`, () => {
      const attr = emit('--footer', value);
      assert.deepEqual(declarationsIn(attr), ['--footer'], 'exactly one declaration');
      // Decode the string token rather than substring-matching it: the emitted form escapes
      // `"` and `\\`, so a raw match would fail on legitimate prose containing a quote.
      const parsed = csstree.parse(attr, { context: 'declarationList' });
      let raw = '';
      csstree.walk(parsed, { visit: 'Declaration', enter: (n) => { raw = csstree.generate(n.value); } });
      const decoded = raw.slice(1, -1).replace(/\\(["\\])/g, '$1');
      assert.equal(decoded, value, 'the author\'s text must survive the quoting exactly');
    });
  }
});

describe('a real declaration is validated, not quoted', () => {
  // `color: "red"` is not a color, so these cannot be made inert by quoting. They are held
  // to a narrow allowlist instead, with one carve-out so data URIs keep their semicolons.
  const KEEP = [
    ['a keyword', 'color', 'red'],
    ['a hex', 'color', '#ffffff'],
    ['a function', 'color', 'rgb(1, 2, 3)'],
    ['a data URI — the reason a blanket `;` ban is wrong', 'background-image', 'url(data:image/svg+xml;base64,AAA)'],
    ['a plain url', 'background-image', 'url(photo.png)'],
    ['a url with a semicolon in the path', 'background-image', 'url(a;b.png)'],
  ];
  const DROP = [
    ['the v3 bypass, on a real property', 'color', "'url(';position:fixed"],
    ['the v2 bypass, on a real property', 'background-image', 'url(a"b);--z-canvas:9'],
    ['a separator after a closed url', 'background-image', 'url(x);--z-mark:0'],
    ['an unbalanced function, which swallows later declarations', 'color', 'myurl('],
    ['a comment carrying a separator', 'color', '/*url(*/;position:fixed'],
    ['a plain separator', 'color', 'red;position:fixed'],
  ];

  for (const [label, prop, value] of KEEP) {
    test(`keeps: ${label}`, () => {
      assert.deepEqual(declarationsIn(emit(prop, value)), [prop], `\`${value}\` is legitimate`);
    });
  }
  for (const [label, prop, value] of DROP) {
    test(`drops: ${label}`, () => {
      const attr = emit(prop, value);
      assert.equal(attr, '', `\`${value}\` emitted \`${attr}\` — it must be dropped whole`);
      assert.deepEqual(declarationsIn(attr), [], 'nothing reaches the attribute');
    });
  }
});

describe('the whole attribute, as the pipeline actually builds it', () => {
  // The unit above tests one declaration at a time. This is the real shape: engine-written
  // declarations before and after an author-controlled one. A value that swallows the rest
  // of the attribute deletes the engine's own declarations, which is a defect even when it
  // injects nothing.
  const HOSTILE = [
    'Acme Q3; --z-canvas: 9',
    "'url(';--z-canvas:9",
    '/*url(*/;--z-canvas:9',
    'Acme\\',
    'myurl(',
  ];

  for (const value of HOSTILE) {
    test(`later engine declarations survive: ${value.slice(0, 28)}`, () => {
      const attr = new InlineStyle()
        .set('--theme', 'indaco')
        .set('--footer', value)
        .set('color', 'red')
        .toString();
      const decls = declarationsIn(attr);
      assert.deepEqual(
        decls, ['--theme', '--footer', 'color'],
        `\`${value}\` produced ${JSON.stringify(decls)} from \`${attr}\` — every engine ` +
        'declaration must survive, in order, with nothing added.',
      );
    });
  }
});
