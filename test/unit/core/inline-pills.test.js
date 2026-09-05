/**
 * The `{LABEL}` inline-pill grammar.
 *
 * The arms that matter most here are the NEGATIVE ones. This grammar is universal —
 * it sees every single-backtick span in every deck — so its value is decided by what
 * it REFUSES, not by what it renders. The ADR's original bracket map was measured
 * capturing 147 spans in this repo that their authors meant literally; the guard arms
 * below are that measurement turned into tests.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const pills = require('../../../lib/core/inline-pills.js');

describe('inline-pills — what it renders', () => {
  test('a bare label is a capsule pill', () => {
    assert.equal(pills.pillHtml('{LIVE}'), '<span class="lat-pill" data-shape="pill">LIVE</span>');
  });

  test('every shape name in SHAPES is selectable, and none is unreachable', () => {
    for (const shape of pills.SHAPES) {
      const html = pills.pillHtml(`{X}:${shape}`);
      assert.ok(html, `${shape} did not parse`);
      assert.match(html, new RegExp(`data-shape="${shape}"`));
    }
    assert.equal(pills.SHAPES.length, 8);
  });

  test('all twelve color slots resolve, and c13 does not', () => {
    for (let i = 1; i <= 12; i++) {
      assert.match(pills.pillHtml(`{X}:c${i}`), new RegExp(`data-c="c${i}"`), `c${i}`);
    }
    assert.equal(pills.pillHtml('{X}:c13'), null);
    assert.equal(pills.pillHtml('{X}:c0'), null);
  });

  test('modifier order is free — the axes are sorted, not positional', () => {
    assert.equal(pills.pillHtml('{X}:tag:c4:lg'), pills.pillHtml('{X}:lg:c4:tag'));
    assert.equal(pills.pillHtml('{X}:c4:tag'), pills.pillHtml('{X}:tag:c4'));
  });

  test('a label is escaped, so it can never become markup', () => {
    // This one DOES parse — it is comma-free and trimmed, so it is a legal label. That
    // is the point: containment here is escaping, not refusal, because a grammar that
    // only refused what looked dangerous would be guessing. The `<` and `>` come back
    // as entities and no element is created on either path.
    const hostile = pills.pillHtml('{<img src=x onerror=alert(1)>}');
    assert.match(hostile, /&lt;img/);
    assert.doesNotMatch(hostile, /<img/);
    assert.match(pills.pillHtml('{A&B}'), /&amp;/);
    assert.match(pills.pillHtml('{<b>}'), /&lt;b&gt;/);
    assert.doesNotMatch(pills.pillHtml('{<b>}'), /<b>/);
  });
});

describe('inline-pills — what it refuses (the whole point)', () => {
  const LITERAL = [
    // our own vocabulary, quoted in decks that TEACH it
    '[x]', '[-]', '[ ]', '[/]', '[?]', '[!]',
    // ordinary code prose — the 29 non-marker collisions the bracket map would have taken
    '[data-mark]', '[data-anima-role]', '(0,2,2)', '(cont.)',
    '(slides, registry, lensId)', '{ ok, scene }', '{ canonical: true }',
    '{ act, instant: true, settle: 500 }', '{ start, end }',
    // plain code
    'getUserId()', ':root', '@media', '--accent', '#header', '!important',
    // malformed or over-specified
    '{}', '{X}abc', '{X}:c9:c4', '{X}:tag:chip', '{X}:sm:lg', '{X}:nope',
    '{unclosed', 'no braces at all',
  ];
  for (const text of LITERAL) {
    test(`leaves \`${text}\` literal`, () => {
      assert.equal(pills.pillHtml(text), null);
      assert.equal(pills.pillElement(new JSDOM().window.document, text), null);
    });
  }

  test('{X} alone is too short to be a label, but {XY} is not', () => {
    // `{X}` is 3 chars and passes the length floor; the floor exists to reject `{}`.
    assert.ok(pills.pillHtml('{A}'));
    assert.equal(pills.pillHtml('{}'), null);
  });

  test('a padded or comma-bearing value is a code literal, not a label', () => {
    assert.equal(pills.isLabel(' ok'), false);
    assert.equal(pills.isLabel('ok '), false);
    assert.equal(pills.isLabel('a, b'), false);
    assert.equal(pills.isLabel('STEP 2'), true); // a space INSIDE is fine — two words
  });
});

describe('inline-pills — the two render paths agree', () => {
  test('pillElement and pillHtml carry identical attributes and text', () => {
    const doc = new JSDOM().window.document;
    for (const src of ['{LIVE}', '{BETA}:tag:c4', '{3}:circle:c12:lg', '{!}:diamond', '{A&B}']) {
      const el = pills.pillElement(doc, src);
      const html = pills.pillHtml(src);
      assert.ok(el && html, src);
      assert.equal(el.className, 'lat-pill');
      for (const attr of ['data-shape', 'data-c', 'data-size']) {
        const inHtml = new RegExp(`${attr}="([^"]*)"`).exec(html);
        assert.equal(el.getAttribute(attr), inHtml ? inHtml[1] : null, `${src} ${attr}`);
      }
      // The element carries TEXT, never markup — that is what keeps the runtime path
      // out of HARD RULE #22's post-sanitize injection surface.
      assert.equal(el.textContent, /\{([^}]*)\}/.exec(src)[1]);
      assert.equal(el.children.length, 0);
    }
  });
});
