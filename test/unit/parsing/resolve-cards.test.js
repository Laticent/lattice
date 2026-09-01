/**
 * Unit: the `cards:` register resolver (lib/core/resolve-cards.js).
 *
 * Where a sparse CARD ROW puts the height it does not need. `stretch` is the default —
 * the behavior every deck has always had — and carries NO token, so an absent register
 * changes nothing. `center` / `top` / `spread` each map to a `cards-*` class the render
 * paths append to every section; a per-slide `_class: cards-*` overrides the deck value,
 * including `cards-stretch`, which is how one slide opts back out.
 * Sibling of resolve-lift / resolve-finish / resolve-mode.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CARDS_NAMES,
  CARDS_TOKENS,
  readFrontMatterCards,
  isKnownCards,
  cardsClass,
  cardsClassFromSource,
} = require('../../../lib/core/resolve-cards');

const read = (p) => fs.readFileSync(path.join(__dirname, '../../../', p), 'utf8');

describe('resolve-cards', () => {
  test('the three non-default values map to their tokens; stretch maps to none', () => {
    assert.equal(cardsClass('center'), 'cards-center');
    assert.equal(cardsClass('top'), 'cards-top');
    assert.equal(cardsClass('spread'), 'cards-spread');
    assert.equal(cardsClass('stretch'), '', 'stretch is the baseline — no class');
  });

  test('omitted / unrecognized resolve to no class (stretch)', () => {
    assert.equal(cardsClass(''), '');
    assert.equal(cardsClass('   '), '');
    assert.equal(cardsClass('centre'), '', 'typo → stretch (deck-lint flags it)');
    assert.equal(cardsClass('flex-start'), '', 'the CSS value is not the author-facing name');
    assert.equal(cardsClass(undefined), '');
    assert.equal(cardsClass(null), '');
  });

  test('value is case- and whitespace-insensitive', () => {
    assert.equal(cardsClass('  CENTER  '), 'cards-center');
    assert.equal(cardsClass('Top'), 'cards-top');
  });

  test('isKnownCards recognizes the four names only', () => {
    for (const n of CARDS_NAMES) assert.ok(isKnownCards(n), `${n} should be known`);
    assert.ok(!isKnownCards('cards-center'), 'the class token is not a deck value');
    assert.ok(!isKnownCards(''));
    assert.ok(!isKnownCards(undefined));
  });

  test('CARDS_NAMES / CARDS_TOKENS list the recognized + override sets', () => {
    assert.deepEqual([...CARDS_NAMES], ['stretch', 'center', 'top', 'spread']);
    // The override set carries `cards-stretch` even though the DECK value `stretch`
    // stamps nothing: a slide inside a `cards: center` deck needs a way back out.
    assert.deepEqual([...CARDS_TOKENS], ['cards-stretch', 'cards-center', 'cards-top', 'cards-spread']);
  });

  test('readFrontMatterCards extracts the value from the front-matter block only', () => {
    const md = '---\nmarp: true\ncards: center\n---\n\n# H\n\n`cards: not-this` in body\n';
    assert.equal(readFrontMatterCards(md), 'center');
    assert.equal(cardsClassFromSource(md), 'cards-center');
  });

  test('readFrontMatterCards accepts quotes and returns null when absent', () => {
    assert.equal(readFrontMatterCards('---\ncards: "top"\n---\n'), 'top');
    assert.equal(readFrontMatterCards("---\ncards: 'spread'\n---\n"), 'spread');
    assert.equal(readFrontMatterCards('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterCards(''), null);
  });

  // Rot-guard 1: every token the resolver can emit must have an activation rule, and
  // `--cards-align` must NOT carry a :root default — a global default would flatten each
  // component's own per-family value, which is the whole point of the var() fallback.
  test('base.tokens.css: every cards token activates, and there is no :root default', () => {
    const css = read('lib/base/base.tokens.css');
    for (const t of CARDS_TOKENS) {
      const rule = css.match(new RegExp(`section\\.${t}\\s*\\{[^}]*\\}`));
      assert.ok(rule, `section.${t} activation rule missing`);
      assert.match(rule[0], /--cards-align:\s*\S/, `${t} must set --cards-align`);
    }
    // Strip comments first: this file DISCUSSES `--cards-align` a few lines above the
    // rules, and a naive scan walks a `:root {` opener straight into that prose.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const rootBlocks = (bare.match(/:root[^{]*\{[^}]*\}/g) || [])
      .filter((b) => /--cards-align\s*:/.test(b));
    assert.equal(rootBlocks.length, 0,
      'a :root --cards-align default would override every component fallback');
    assert.match(bare, /section\.cards-center\s*\{/, 'comment-stripping must not eat the rules');
  });

  // Rot-guard 2: a consumer that hard-codes `align-content` is deaf to the register. Pin
  // that the two wired components read the variable on EVERY container rule they have —
  // cards-grid has three (one per emit path) plus its family arm.
  test('the wired components consume --cards-align on every card-row container', () => {
    const cg = read('lib/components/inventory/cards-grid/cards-grid.styles.css');
    const vg = read('lib/components/comparison/verdict-grid/verdict-grid.styles.css');
    assert.equal((cg.match(/align-content:\s*var\(--cards-align,\s*stretch\)/g) || []).length, 3,
      'cards-grid has three emit paths; all three must read the register');
    assert.match(cg, /align-content:\s*var\(--cards-align,\s*space-evenly\)/,
      'the family arm must keep ITS default in the fallback, not the base rule\'s');
    assert.equal((vg.match(/align-content:\s*var\(--cards-align,\s*stretch\)/g) || []).length, 1,
      'verdict-grid\'s card row must read the register');
  });

  // Rot-guard 3: the two render paths must append the same token, or a deck renders one
  // way through the CLI and another in the browser (HARD RULE #1).
  test('both render paths resolve and append the cards token', () => {
    for (const p of ['lib/integrations/markdown-it/plugins.js', 'lib/runtime/index.js']) {
      const src = read(p);
      assert.match(src, /require\((['"]).*resolve-cards\1\)/, `${p} must load the resolver`);
      assert.match(src, /cardsClass\(cardsName\)/, `${p} must map the front-matter value`);
      assert.match(src, /\.\.\.cardsTokens\]/, `${p} must append the token to deckTokens`);
      assert.match(src, /slideHasOwnCards && CARDS_TOKENS\.includes\(t\)/,
        `${p} must let a per-slide cards-* token evict the deck one`);
    }
  });
});
