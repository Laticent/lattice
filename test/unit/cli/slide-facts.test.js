/**
 * A code package's stable input, `slide.facts` (lib/packages/slide-facts.mjs; contract note §11):
 * the shape it promises, the directive list it reads, the token names it hands over, and its text
 * pinned against a real HTML parser on every slide of three galleries. The facts reaching a package
 * through both doors, with a network log, is test/integration/export/code-package-door.test.js and
 * docs/e2e/code-packages.spec.ts.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { slideFacts, parseTree, decodeEntities, FACTS_VERSION, FACT_DIRECTIVES, MAX_DEPTH } = require('../../../lib/packages/slide-facts.mjs');
const { slideInput } = require('../../../lib/packages/code-door-core.mjs');
const { splitSections } = require('../../../lib/core/split-sections.mjs');
const { APPLIED_DIRECTIVES } = require('../../../lib/engine/directives.js');
const { requiredTokenList } = require('../../../lib/theme/derive.js');
const engine = require('../../../lib/engine');

const ROOT = path.join(__dirname, '../../..');

/** Every section as the code-packages slot sees it (the door hands a package exactly this). */
function sectionsAtSlot(md) {
  const out = [];
  engine.createEngine().render(md, 'indaco', {
    codePackages: (html) => {
      for (const p of splitSections(html)) if (p.type === 'section') out.push(p.openTag + p.inner + p.close);
      return html;
    },
  });
  return out;
}

describe('slide facts', () => {
  // THE DRIFT ALARM. Rendered through the real engine, so an engine change that alters what a
  // package reads here (a new inline grammar, a moved block, a new wrapper) fails this deepEqual:
  // the facts are the promise, and a change to them is a decision (contract note §11), not a side
  // effect. The gallery sweep below cannot catch that; it compares two readers of the same HTML.
  const md = [
    '---', 'theme: indaco', 'header: Deck header', 'footer: Deck footer', '---', '',
    '<!-- _class: tally split -->', '<!-- _backgroundColor: red -->', '',
    '###### Eyebrow', '',
    '## Three *wins* &amp; more', '',
    'A lead with **bold**, a [link](https://x.test) and `code`.', '',
    '- Alpha `12`', '  - sub one', '- Kickoff `{DONE}` ~~old~~', '',
    '3. three', '', '   more of three', '4. four', '',
    '| Region | Q1 |', '|---|---|', '| North | 4 |', '',
    '> A quote', '',
    '```js', 'let x = 1 < 2;', '```', '',
    '![A picture](pic.png)', '',
    '<!-- a speaker note -->', '',
  ].join('\n');
  const [section] = sectionsAtSlot(md);
  const facts = slideFacts(section, { tokens: ['accent', '--cat-1-mark'] });
  const item = (text, runs, paragraphs = [text], items = []) => ({ text, runs, paragraphs, items });

  test('the whole shape, for one slide of every kind of block', () => {
    assert.deepEqual(facts, {
      version: FACTS_VERSION,
      classes: ['tally', 'split'],
      directives: { header: 'Deck header', footer: 'Deck footer', class: 'tally split', backgroundColor: 'red' },
      title: 'Three wins & more',
      blocks: [
        { type: 'heading', level: 6, text: 'Eyebrow', runs: [{ text: 'Eyebrow' }] },
        { type: 'heading', level: 2, text: 'Three wins & more', runs: [{ text: 'Three ' }, { text: 'wins', em: true }, { text: ' & more' }] },
        {
          type: 'paragraph',
          text: 'A lead with bold, a link and code.',
          runs: [{ text: 'A lead with ' }, { text: 'bold', strong: true }, { text: ', a ' }, { text: 'link', href: 'https://x.test' }, { text: ' and ' }, { text: 'code', code: true }, { text: '.' }],
        },
        {
          type: 'list',
          ordered: false,
          start: 1,
          items: [
            item('Alpha 12', [{ text: 'Alpha ' }, { text: '12', code: true }], ['Alpha 12'], [item('sub one', [{ text: 'sub one' }])]),
            // `{DONE}` is a Lattice pill: a state, marked as one, not the braces.
            item('Kickoff DONE old', [{ text: 'Kickoff ' }, { text: 'DONE', pill: true }, { text: ' ' }, { text: 'old', del: true }]),
          ],
        },
        // A loose item keeps each of its paragraphs.
        { type: 'list', ordered: true, start: 3, items: [item('three more of three', [{ text: 'three more of three' }], ['three', 'more of three']), item('four', [{ text: 'four' }])] },
        { type: 'table', caption: '', head: ['Region', 'Q1'], rows: [['North', '4']] },
        { type: 'quote', blocks: [{ type: 'paragraph', text: 'A quote', runs: [{ text: 'A quote' }] }] },
        { type: 'code', lang: 'js', text: 'let x = 1 < 2;' },
        // Moved by the engine into `div.cell-coda`; the facts look through the wrapper.
        { type: 'image', src: 'pic.png', alt: 'A picture' },
      ],
      // No "Deck header" / "Deck footer": the running chrome is in `directives`, not the content.
      text: 'Eyebrow\nThree wins & more\nA lead with bold, a link and code.\nAlpha 12\nsub one\nKickoff DONE old\nthree more of three\nfour\nRegion\tQ1\nNorth\t4\nA quote\nlet x = 1 < 2;\nA picture',
      tokens: ['--accent', '--cat-1-mark'],
    });
  });

  test('the engine’s own classes are markup, not facts', () => {
    assert.match(section, /class="tally split content form"/);
    assert.deepEqual(facts.classes, ['tally', 'split']);
  });

  test('it is plain data: it survives structured clone and JSON unchanged', () => {
    assert.deepEqual(structuredClone(facts), facts);
    assert.deepEqual(JSON.parse(JSON.stringify(facts)), facts);
  });

  test('the speaker note, a style block, an svg and the running chrome are not the slide’s words', () => {
    const f = slideFacts('<section><header>H</header><style>p{color:red}</style><p>Hi</p><!-- note --><svg><text>axis</text></svg><aside class="lattice-notes">n</aside><footer>F</footer></section>');
    assert.equal(f.text, 'Hi');
  });

  test('math reads as its TeX source, marked as math', () => {
    const [s] = sectionsAtSlot('---\ntheme: indaco\n---\n\n## Area $\\pi r^2$\n');
    const f = slideFacts(s);
    assert.equal(f.title, 'Area \\pi r^2');
    assert.deepEqual(f.blocks[0].runs, [{ text: 'Area ' }, { text: '\\pi r^2', math: true }]);
  });

  test('a table without a head row has an empty head', () => {
    const f = slideFacts('<section><table><tr><td>a</td><td>b</td></tr></table></section>');
    assert.deepEqual(f.blocks, [{ type: 'table', caption: '', head: [], rows: [['a', 'b']] }]);
  });

  test('a tolerant parser: a stray close, a quoted `>`, a bare `<`, an unknown entity', () => {
    const f = slideFacts('<section></div><p title="a > b">x &lt; y &bogus; &#x2014;</p><p>1 < 2</p></section>');
    assert.deepEqual(f.blocks.map((b) => b.text), ['x < y &bogus; —', '1 < 2']);
    assert.equal(decodeEntities('&#0;&#xD800;'), '��');
    assert.equal(parseTree('<p>a</b>b</p>').children[0].children.join(''), 'ab');
  });

  test('an attribute named __proto__ is only an attribute', () => {
    const f = slideFacts('<section __proto__="x" data-class="a"><p constructor="y">z</p></section>');
    assert.deepEqual(f.classes, ['a']);
    assert.equal({}.x, undefined);
  });
});

describe('the reader holds on hostile HTML (the red team and the checker)', () => {
  const timed = (html) => {
    const t = performance.now();
    const f = slideFacts(html);
    return { f, ms: performance.now() - t };
  };

  test('a character whose lowercase is longer (`İ`) does not shift what a raw element hides', () => {
    const { f } = timed(`<section><p>${'İ'.repeat(40)}<title>t</title>Visible words here</p><textarea>q</textarea><p>After</p></section>`);
    assert.deepEqual(f.blocks.map((b) => b.text), [`${'İ'.repeat(40)}tVisible words here`, 'After']);
  });

  test('deep nesting neither overflows the stack nor nests the facts past MAX_DEPTH', () => {
    for (const open of ['<div>', '<span>', '<ul><li>', '<blockquote>']) {
      const { f, ms } = timed(`<section><p>${open.repeat(20000)}deep</p></section>`);
      assert.match(f.text, /deep/, open);
      assert.ok(ms < 2000, `${open}: ${ms} ms`);
      let depth = 0;
      const walk = (v, d) => {
        depth = Math.max(depth, d);
        if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], d + 1);
      };
      walk(f, 0);
      assert.ok(depth <= MAX_DEPTH * 3 + 10, `${open}: facts nest ${depth} deep`);
    }
  });

  test('no scan is quadratic: each of these 100+ KB slides reads in well under a second', () => {
    const cases = {
      'a `<` that opens no tag': `<section><p>${'<"'.repeat(60000)}</p></section>`,
      'raw elements': `<section>${'<xmp></xmp>'.repeat(40000)}</section>`,
      'closes that match nothing': `<section>${'<svg>'.repeat(40000)}${'</b>'.repeat(40000)}</section>`,
      'an unterminated quote': `<section><p a="${'<b>'.repeat(40000)}</p></section>`,
    };
    for (const [label, html] of Object.entries(cases)) {
      const { ms } = timed(html);
      assert.ok(ms < 1000, `${label}: ${Math.round(ms)} ms for ${html.length} characters`);
    }
  });
});

describe('what the facts promise', () => {
  test('the directives are the ones the engine applies to a section', () => {
    assert.deepEqual([...FACT_DIRECTIVES].sort(), [...APPLIED_DIRECTIVES].sort());
  });

  test('every token name handed over is defined by every shipped theme', () => {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.css') ? [path.join(d, e.name)] : []));
    const engineCss = walk(path.join(ROOT, 'lib')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    const themeCss = (name) => {
      const file = path.join(ROOT, 'themes', `${name}.css`);
      if (!fs.existsSync(file)) return '';
      const css = fs.readFileSync(file, 'utf8');
      // A dark or a11y variant wraps its base with `@import '<base>'`.
      return css + [...css.matchAll(/^@import\s+['"]([\w-]+)['"]/gm)].map((m) => themeCss(m[1])).join('');
    };
    const themes = fs.readdirSync(path.join(ROOT, 'themes')).filter((f) => f.endsWith('.css')).map((f) => f.slice(0, -4));
    assert.ok(themes.length >= 30, `found ${themes.length} themes`);
    const tokens = requiredTokenList();
    for (const t of themes) {
      const css = themeCss(t) + engineCss;
      const missing = tokens.filter((n) => !new RegExp(`--${n}\\s*:`).test(css));
      assert.deepEqual(missing, [], `${t} defines every token name a package is handed`);
    }
  });

  test('slideInput hands the section, its facts and the render’s three facts', () => {
    const claim = { html: '<section class="tally"><h2>T</h2></section>', index: 3, idPrefix: 'p-', baseUrl: '/b/' };
    const input = slideInput(claim, ['accent']);
    assert.deepEqual(Object.keys(input), ['html', 'facts', 'index', 'idPrefix', 'baseUrl']);
    assert.equal(input.facts.title, 'T');
    assert.deepEqual(input.facts.tokens, ['--accent']);
  });
});

describe('the facts’ text matches a real HTML parser on every gallery slide', () => {
  // jsdom's text of the section, leaving out what the facts leave out (module note), with each
  // KaTeX render read as its TeX. Compared as a sequence of words, since the facts put one block
  // per line and jsdom's text keeps the source's white space.
  const words = (s) => s.split(/[\s ]+/).filter(Boolean);
  function referenceText(section) {
    const doc = new JSDOM(`<!doctype html><body>${section}</body>`).window.document;
    for (const k of doc.querySelectorAll('.katex')) {
      const tex = k.querySelector('annotation[encoding*="tex"]')?.textContent ?? '';
      k.replaceWith(doc.createTextNode(k.classList.contains('katex-display') ? ` ${tex} ` : tex));
    }
    for (const n of doc.querySelectorAll('script,style,template,svg,noscript,iframe,object,textarea,select,button,aside,body > section > header,body > section > footer')) n.remove();
    for (const n of doc.querySelectorAll('br')) n.replaceWith(doc.createTextNode(' '));
    // Block boundaries are word boundaries in the facts (one block per line).
    for (const n of doc.querySelectorAll('p,li,td,th,h1,h2,h3,h4,h5,h6,div,pre,blockquote,tr,dt,dd,figcaption,caption')) {
      n.before(doc.createTextNode(' '));
      n.after(doc.createTextNode(' '));
    }
    return doc.body.textContent;
  }
  const withoutImages = (blocks) => blocks.filter((b) => b.type !== 'image').map((b) => (b.type === 'quote' ? { ...b, blocks: withoutImages(b.blocks) } : b));

  for (const deck of ['test/integration/baseline-decks/gallery.md', 'examples/data-viz-gallery.md', 'examples/gallery-jargon.md']) {
    test(deck, () => {
      const sections = sectionsAtSlot(fs.readFileSync(path.join(ROOT, deck), 'utf8'));
      assert.ok(sections.length > 10, `${deck} renders ${sections.length} sections`);
      let n = 0;
      for (const [k, s] of sections.entries()) {
        const f = slideFacts(s);
        // Image alt text is a fact jsdom's text does not hold.
        const ours = withoutImages(f.blocks);
        const got = words(
          ours
            .map(function t(b) {
              if (b.type === 'list') return b.items.map(function it(i) { return [i.text, ...i.items.map(it)].join(' '); }).join(' ');
              if (b.type === 'table') return [b.caption, ...b.head, ...b.rows.flat()].join(' ');
              if (b.type === 'quote') return b.blocks.map(t).join(' ');
              return b.text;
            })
            .join(' '),
        );
        assert.deepEqual(got, words(referenceText(s)), `${deck}, slide ${k + 1}`);
        // Every node's runs join to exactly its text.
        const check = (v) => {
          if (Array.isArray(v)) return v.forEach(check);
          if (!v || typeof v !== 'object') return;
          if (Array.isArray(v.runs)) assert.equal(v.runs.map((r) => r.text).join(''), v.text, `${deck}, slide ${k + 1}: runs of "${v.text}"`);
          for (const x of Object.values(v)) check(x);
        };
        check(f.blocks);
        n++;
      }
      assert.equal(n, sections.length);
    });
  }
});
