/**
 * Inline run — a list item's label and the inline objects inside it stay ONE flex item.
 *
 * Two substrates, one rule (lib/core/inline-run.js): the string path (engine) and the DOM path
 * (runtime) must produce the same markup, so every fixture below runs through both and is compared.
 * The arms that matter most are the REFUSALS: an item that starts with a slot, a trailing slot, plain
 * text, and an item already wrapped are all left byte-identical, because the layouts that read those
 * children as structure (`li > .lat-pill`, `li > code`, `li > strong`) must keep matching them.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const run = require('../../../lib/core/inline-run.js');
const transformer = require('../../../lib/transformers/inline-run.js');
const catalog = require('../../../lib/core/inline-run-catalog.generated.js');

const PILL = '<span class="lat-pill" data-shape="pill">LIVE</span>';
const SLOTS = ['.lat-pill', 'code', 'strong'];

/** Run the DOM substrate over the same markup and return the section's serialized HTML. */
function viaDom(html, depths, slots) {
  const dom = new JSDOM(`<body><section>${html}</section></body>`);
  const section = dom.window.document.querySelector('section');
  run.wrapDom(section, depths, slots);
  return section.innerHTML;
}

const CASES = {
  'a mid-text pill is wrapped': [`<ul><li>Pilot ${PILL} now</li></ul>`, `<ul><li><span class="lat-run">Pilot ${PILL} now</span></li></ul>`],
  'a bold word mid-text is wrapped': ['<ul><li>one <b>two</b> three</li></ul>', '<ul><li><span class="lat-run">one <b>two</b> three</span></li></ul>'],
  'plain text is left alone': ['<ul><li>just words</li></ul>', '<ul><li>just words</li></ul>'],
  'elements with no text between are left alone': [`<ul><li>${PILL} ${PILL}</li></ul>`, `<ul><li>${PILL} ${PILL}</li></ul>`],
  'a trailing slot pill stays a sibling': [`<ul><li>Pen test ${PILL}</li></ul>`, `<ul><li>Pen test ${PILL}</li></ul>`],
  'text, a pill, then a trailing slot pill': [`<ul><li>A ${PILL} b ${PILL}</li></ul>`, `<ul><li><span class="lat-run">A ${PILL} b </span>${PILL}</li></ul>`],
  'two trailing slots both stay out': ['<ul><li>Vendor <code>$5</code> <strong>Hot</strong></li></ul>', '<ul><li>Vendor <code>$5</code> <strong>Hot</strong></li></ul>'],
  'an item that starts with a slot is left alone': ['<ul><li><strong>Title.</strong> body <b>x</b> more</li></ul>', '<ul><li><strong>Title.</strong> body <b>x</b> more</li></ul>'],
  'the run stops at the first block child': ['<ul><li>Label <b>x</b> y<ul><li>kid <b>z</b> w</li></ul></li></ul>', '<ul><li><span class="lat-run">Label <b>x</b> y</span><ul><li>kid <b>z</b> w</li></ul></li></ul>'],
  'an already wrapped item is left alone (idempotent)': ['<ul><li><span class="lat-run">a <b>b</b> c</span></li></ul>', '<ul><li><span class="lat-run">a <b>b</b> c</span></li></ul>'],
  'a loose item whose text sits in a <p> is left alone': ['<ul><li><p>a <b>b</b> c</p></li></ul>', '<ul><li><p>a <b>b</b> c</p></li></ul>'],
};

describe('inline-run — wrapping, on both substrates', () => {
  for (const [name, [input, expected]] of Object.entries(CASES)) {
    test(name, () => {
      assert.equal(run.wrapHtml(input, [1], SLOTS), expected, 'string path');
      assert.equal(viaDom(input, [1], SLOTS), expected, 'DOM path');
    });
  }

  test('both substrates agree on every fixture, and a second pass changes nothing', () => {
    for (const [name, [input]] of Object.entries(CASES)) {
      const once = run.wrapHtml(input, [1], SLOTS);
      assert.equal(run.wrapHtml(once, [1], SLOTS), once, `${name}: string path is not idempotent`);
      assert.equal(viaDom(once, [1], SLOTS), once, `${name}: DOM path is not idempotent`);
      assert.equal(run.wrapHtml(input, [1], SLOTS), viaDom(input, [1], SLOTS), `${name}: the substrates disagree`);
    }
  });

  test('only the declared depths are wrapped', () => {
    const html = '<ul><li>a <b>b</b> c<ul><li>d <b>e</b> f</li></ul></li></ul>';
    assert.equal(run.wrapHtml(html, [1], []), '<ul><li><span class="lat-run">a <b>b</b> c</span><ul><li>d <b>e</b> f</li></ul></li></ul>');
    assert.equal(run.wrapHtml(html, [2], []), '<ul><li>a <b>b</b> c<ul><li><span class="lat-run">d <b>e</b> f</span></li></ul></li></ul>');
    assert.equal(run.wrapHtml(html, [1, 2], []).match(/lat-run/g).length, 2);
    assert.equal(viaDom(html, [2], []), run.wrapHtml(html, [2], []));
  });

  test('a trailing pill and a trailing code are slots in every component, declared or not', () => {
    const pill = `<ul><li>Pilot ${PILL}</li></ul>`;
    const code = '<ul><li>Open <code>5</code></li></ul>';
    assert.equal(run.wrapHtml(pill, [1], []), pill);
    assert.equal(run.wrapHtml(code, [1], []), code);
    assert.equal(viaDom(pill, [1], []), pill);
    assert.deepEqual(run.DEFAULT_SLOTS, ['code', '.lat-pill']);
  });

  test('a trailing element that is NOT a slot joins the run', () => {
    const html = '<ul><li>Pilot <b>now</b></li></ul>';
    assert.equal(run.wrapHtml(html, [1], []), '<ul><li><span class="lat-run">Pilot <b>now</b></span></li></ul>');
    assert.equal(viaDom(html, [1], []), run.wrapHtml(html, [1], []));
    assert.equal(run.wrapHtml(html, [1], ['b']), html, 'declared as a slot, it stays out');
  });

  test('a slot is matched by tag name or class token, never by a substring', () => {
    const near = '<ul><li>a <span class="lat-pill-x">p</span> b</li></ul>';
    // `lat-pill-x` is not the class `lat-pill`, so it is not a slot and the run wraps normally.
    assert.match(run.wrapHtml(near, [1], []), /lat-run/);
    // `code` as a tag: `<codex>` is not it.
    assert.match(run.wrapHtml('<ul><li>a <codex>x</codex></li></ul>', [1], []), /lat-run/);
  });

  test('the decision table: blanks at the edges are ignored, and the range is the first to last real node', () => {
    const t = (...n) => run.decideRun(n);
    const text = { kind: 'text', blank: false };
    const blank = { kind: 'text', blank: true };
    const el = { kind: 'el', slot: false };
    const slot = { kind: 'el', slot: true };
    assert.deepEqual(t(blank, text, el, text, blank), { from: 1, to: 3 });
    assert.deepEqual(t(text, el), { from: 0, to: 1 });
    assert.equal(t(text), null, 'text alone');
    assert.equal(t(el), null, 'an element alone');
    assert.equal(t(text, slot), null, 'text then a trailing slot leaves only text');
    assert.deepEqual(t(text, el, text, slot, blank, slot), { from: 0, to: 2 }, 'several trailing slots peel in turn');
    assert.equal(t(slot, text, el), null, 'an item that starts with a slot is left alone');
  });
});

describe('inline-run — the manifest-driven transformer', () => {
  test('it serves exactly the components whose manifests declare inlineRun', () => {
    assert.ok(Object.keys(catalog).length >= 10);
    assert.ok(catalog['list-steps'] && catalog.pricing && catalog.checklist);
    for (const [name, row] of Object.entries(catalog)) {
      assert.ok(Array.isArray(row.depths) && row.depths.length, `${name} has depths`);
      assert.ok(row.depths.every((d) => Number.isInteger(d) && d >= 1), `${name} depths are positive integers`);
    }
  });

  test('the HTML path wraps inside a served section and leaves an unserved one byte-identical', () => {
    const served = `<section class="list-steps form"><ol><li>Pilot ${PILL} now</li></ol></section>`;
    const unserved = `<section class="statement form"><ul><li>Pilot ${PILL} now</li></ul></section>`;
    assert.match(transformer.applyToHtml(served), /<li><span class="lat-run">Pilot /);
    assert.equal(transformer.applyToHtml(unserved), unserved);
    assert.equal(transformer.applyToHtml(transformer.applyToHtml(served)), transformer.applyToHtml(served), 'idempotent');
  });

  test('the DOM path equals the HTML path on a served section', () => {
    const html = `<section class="checklist form"><ul><li class="state pass">Pen ${PILL} test</li><li>Load <b>x</b> y ${PILL}</li></ul></section>`;
    const dom = new JSDOM(`<body>${html}</body>`);
    transformer.applyToDom(dom.window.document.body);
    assert.equal(dom.window.document.body.innerHTML, transformer.applyToHtml(html));
  });

  test('the data-class trap: the RESOLVED class decides, not the raw _class payload', () => {
    // `data-class` carries the raw directive; `class` the resolved list. A section whose resolved
    // class names a served component but whose data-class does not must still be served.
    const html = `<section data-class="content" class="content list-steps form"><ol><li>a ${PILL} b</li></ol></section>`;
    assert.match(transformer.applyToHtml(html), /lat-run/);
  });
});
