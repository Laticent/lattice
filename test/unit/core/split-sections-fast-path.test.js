/**
 * `splitSections` walks literal section tags on stretches it can prove clean and
 * hands every other stretch to the `scanTags` tokenizer (the fast path is
 * explained above `walkFast` in lib/core/split-sections.js). The claim is that
 * this is an OPTIMIZATION: the pieces are identical to the tokenizer-only walk on
 * every input. This file is where that claim is held, over a seeded corpus built
 * from the shapes that make a `<section` literal something other than a tag.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitSections } = require('../../../lib/core/split-sections');

const FRAGMENTS = [
  '<section>', '<section class="a">', "<section class='b'>", '<section title="a>b" class="c">',
  '</section>', '</section >', '</SECTION>', '</section', '<section/>', '<SECTION id=x>',
  '<sectionfoo>', '<section-x>', '<section:x>', '<!-- ', ' -->', '<!-- <section> -->', '<!-->',
  '<!doctype html>', '<!x', '<?php ', '?>', '<![CDATA[ <section> ]]>',
  '<style>', '</style>', '<style>/* <section> */</style>', '<script>', '</script>',
  '<textarea>', '</textarea>', '<template>', '</template>',
  '<p title="', '<p title=\'', '">', "'>", '"', "'", '=', '= "', '<p ', '<p a=', '>', '<', '< ',
  '<div data-tip=it\'s>', '<p title="<section>">', '<p title="a>b">', '<p <section>',
  '<p x=<section>', 'a<b', '<br/>', '<svg><title>t</title></svg>', 'text ', '\n', ' ', '</div>', '<div>',
];

// A small deterministic PRNG, so a failure names a seed that reproduces.
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

function doc(seed) {
  const r = rng(seed);
  const len = 1 + Math.floor(r() * 40);
  let out = '';
  for (let k = 0; k < len; k++) out += FRAGMENTS[Math.floor(r() * FRAGMENTS.length)];
  return out;
}

test('the fast path returns the tokenizer-only pieces on 20,000 seeded documents', () => {
  for (let seed = 1; seed <= 20000; seed++) {
    const html = doc(seed);
    assert.deepEqual(splitSections(html), splitSections(html, { tokenizerOnly: true }), `seed ${seed}: ${JSON.stringify(html)}`);
  }
});

test('the fast path returns the tokenizer-only pieces on a real rendered deck', () => {
  const { createEngine } = require('../../../lib/engine');
  const fs = require('node:fs');
  const path = require('node:path');
  const md = fs.readFileSync(path.join(__dirname, '..', '..', 'integration', 'baseline-decks', 'gallery.md'), 'utf8');
  const html = createEngine().render(md, 'indaco').html;
  const fast = splitSections(html);
  assert.ok(fast.filter((p) => p.type === 'section').length > 50, 'the deck should render many slides');
  assert.deepEqual(fast, splitSections(html, { tokenizerOnly: true }));
});
