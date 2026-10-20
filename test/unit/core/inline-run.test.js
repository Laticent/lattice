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

describe('inline-run — raw HTML the tokenizer must survive', () => {
  test('a tag-shaped word inside an HTML comment is not markup', () => {
    // A speaker note that mentions `<p>` or `<ul>` used to end the run inside the comment, close the
    // wrapper there, and make every later item read as nested one level deeper.
    const note = '<ul><li>Pilot <b>in</b> the EU <!-- check the <p> copy --> now</li><li>next <b>x</b> y</li></ul>';
    const out = run.wrapHtml(note, [1], []);
    assert.equal(out, '<ul><li><span class="lat-run">Pilot <b>in</b> the EU <!-- check the <p> copy --> now</span></li><li><span class="lat-run">next <b>x</b> y</span></li></ul>');
    assert.equal(viaDom(note, [1], []), out, 'the DOM path wraps the same range');
    const list = '<ul><li>a <b>b</b> c <!-- <ul> note --> d</li><li>e <b>f</b> g</li></ul>';
    assert.equal((run.wrapHtml(list, [1], []).match(/lat-run/g) || []).length, 2, 'the item after a comment holding <ul> is still depth 1');
  });

  test('a comment before the run is not text, on either substrate', () => {
    const html = '<ul><li><!-- c --><b>A</b><b>B</b></li></ul>';
    assert.equal(run.wrapHtml(html, [1], []), html);
    assert.equal(viaDom(html, [1], []), html);
  });

  test('class quoting and tag case do not hide a slot or an item', () => {
    const single = "<ul><li>a <b>b</b> c <span class='lat-pill'>X</span></li></ul>";
    assert.equal(run.wrapHtml(single, [1], []), "<ul><li><span class=\"lat-run\">a <b>b</b> c </span><span class='lat-pill'>X</span></li></ul>");
    const upper = '<UL><LI>a <B>b</B> c</LI></UL>';
    assert.match(run.wrapHtml(upper, [1], []), /lat-run/);
  });

  test('a missing </li> ends the run at the next item', () => {
    const out = run.wrapHtml('<ul><li>a <b>b</b> c<li>d <b>e</b> f</ul>', [1], []);
    assert.equal(out, '<ul><li><span class="lat-run">a <b>b</b> c</span><li><span class="lat-run">d <b>e</b> f</span></ul>');
  });

  test('an item whose first node is already a wrapper is left alone, with text after it too', () => {
    const html = '<ul><li><span class="lat-run">a <b>b</b></span> tail <i>x</i></li></ul>';
    assert.equal(run.wrapHtml(html, [1], []), html);
    assert.equal(viaDom(html, [1], []), html);
  });
});

describe('inline-run — what the second review found', () => {
  test('an unclosed inline element never lets the wrapper cross </li>', () => {
    const html = '<section><ul><li><em>x</em> a <b>b c</li><li>d <b>e</b> f</li></ul></section>';
    const out = run.wrapHtml(html, [1], []);
    // The open <b> is dropped from the run, and so is everything after it; the second item is whole.
    assert.equal((out.match(/<span class="lat-run">/g) || []).length, (out.match(/<\/span>/g) || []).length, 'every wrapper is closed');
    assert.ok(out.indexOf('</span>') < out.indexOf('</li>'), 'the first wrapper closes before its item ends');
    assert.match(out, /<li><span class="lat-run">d <b>e<\/b> f<\/span><\/li>/);
  });

  test('a <script> body that looks like a tag is not markup', () => {
    const html = '<ul><li>a <i>z</i> <script>if(a<b){}</script> c</li><li>d <b>e</b> f</li></ul>';
    assert.equal((run.wrapHtml(html, [1], []).match(/lat-run/g) || []).length, 2);
    assert.equal(viaDom(html, [1], []), run.wrapHtml(html, [1], []));
  });

  test('`<!-->` and `<!--->` are complete comments, so a later `-->` cannot swallow real items', () => {
    const html = '<ul><li>a <!--> <b>b</b> c</li><li>d <b>e</b> f</li><li>g <b>h</b> i <!-- note --></li></ul>';
    assert.equal((run.wrapHtml(html, [1], []).match(/<span class="lat-run">/g) || []).length, 3);
    const dash = '<ul><li>a <!---> <b>b</b> c</li><li>d <b>e</b> f</li></ul><p><!-- x --></p>';
    assert.equal((run.wrapHtml(dash, [1], []).match(/<span class="lat-run">/g) || []).length, 2);
  });

  test('a `<!--` inside an attribute value is not a comment', () => {
    const html = '<ul><li>a <b title="<!--">x</b> c</li><li>d <b>e</b> f</li></ul><ul><li>g <b>h</b> i --></li></ul>';
    assert.equal((run.wrapHtml(html, [1], []).match(/<span class="lat-run">/g) || []).length, 3);
  });

  test('a comment at the edge of a run is outside the wrapper on both substrates', () => {
    for (const html of [
      '<ul><li>a<b>x</b>a<!-- c --></li></ul>',
      '<ul><li><!-- c --> a<b>x</b>a</li></ul>',
      '<ul><li>a <!-- c --><b>x</b> a <!-- d --></li></ul>',
    ]) {
      assert.equal(run.wrapHtml(html, [1], []), viaDom(html, [1], []), html);
    }
    assert.equal(run.wrapHtml('<ul><li>a<b>x</b>a<!-- c --></li></ul>', [1], []), '<ul><li><span class="lat-run">a<b>x</b>a</span><!-- c --></li></ul>');
  });

  test('differential fuzz: the string path and the DOM path agree on 600 generated items', () => {
    // A seeded generator over the pieces authors and engines produce. Every mismatch the review found
    // involved a comment; this keeps the two substrates from drifting on any of them again.
    let seed = 20261020;
    const rnd = (n) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
    const pieces = ['word ', ' more', 'x', '<b>b</b>', '<i>i</i>', `${PILL}`, '<code>c</code>', '<strong>s</strong>', '<!-- note -->', '<!-->', '<br>', ' ', '<em>e</em>'];
    const items = ['<ul>', '<li>', '</li>', '</ul>'];
    for (let i = 0; i < 600; i++) {
      let body = '';
      for (let n = 1 + rnd(7); n > 0; n--) body += pieces[rnd(pieces.length)];
      const nested = rnd(4) === 0 ? `${items[0]}<li>k <b>q</b> r</li>${items[3]}` : '';
      const html = `<ul><li>${body}${nested}</li><li>tail <b>t</b> end</li></ul>`;
      // A DOM serializes the empty comments `<!-->` and `<!--->` as `<!---->`; that is spelling, not structure.
      const spell = (h) => h.replace(/<!--->|<!-->/g, '<!---->');
      for (const slots of [[], ['strong']]) {
        assert.equal(spell(run.wrapHtml(html, [1, 2], slots)), spell(viaDom(html, [1, 2], slots)), `${JSON.stringify(slots)} ${html}`);
      }
    }
  });
});

describe('inline-run — the manifest-driven transformer', () => {
  test('it serves exactly the components whose manifests declare inlineRun', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const declared = {};
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.manifest.json')) {
          const m = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (m.inlineRun) declared[m.name] = m.inlineRun.depths;
        }
      }
    })(path.join(__dirname, '../../../lib/components'));
    assert.deepEqual(Object.fromEntries(Object.entries(catalog).map(([n, r]) => [n, r.depths])), declared);
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

  test('a section carrying two served names is wrapped under ONE of them, the same one on both paths', () => {
    // `cards-grid` declares `strong` a slot; `list` does not. Wrapping once per name on the DOM path
    // would take the title out from under cards-grid's `li > strong` rules.
    const html = `<section class="cards-grid list form"><ul><li><strong>T</strong> body <b>x</b> more</li></ul></section>`;
    const viaHtml = transformer.applyToHtml(html);
    const dom = new JSDOM(`<body>${html}</body>`);
    transformer.applyToDom(dom.window.document.body);
    assert.equal(dom.window.document.body.innerHTML, viaHtml);
    assert.doesNotMatch(viaHtml, /lat-run/, 'cards-grid is first in catalog order and treats a leading strong as a slot');
  });

  test('the data-class trap: the RESOLVED class decides, not the raw _class payload', () => {
    // `data-class` carries the raw directive; `class` the resolved list. A section whose resolved
    // class names a served component but whose data-class does not must still be served.
    const html = `<section data-class="content" class="content list-steps form"><ol><li>a ${PILL} b</li></ol></section>`;
    assert.match(transformer.applyToHtml(html), /lat-run/);
  });
});
