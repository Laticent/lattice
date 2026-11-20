// The list contract (lib/core/list-contract.js, W2 of
// engineering/decisions/2026-11-19-deterministic-authoring-audit.md): what `1.` versus `-` means.
//   1. every component that reads a list declares its contract, and the baked table matches;
//   2. on every `neutral` layout, a manifest sample renders the SAME HTML with its markers swapped,
//      top level and nested (R3) — the engine-side proof the gallery swap probe repeats in pixels;
//   3. a `numbered-tags` or register-styled `prose` slide records the author's marker (R1, R2);
//   4. the runtime's DOM mirror produces what the engine produces, and is idempotent.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadAll } = require('../../../lib/components');
const engine = require('../../../lib/engine');
const CATALOG = require('../../../lib/core/list-contract.generated.js');
const { listContractFor, normalizeListsDom } = require('../../../lib/core/list-contract');

const manifests = loadAll();
const hasListSlot = (slots) =>
  Object.values(slots || {}).some((s) => s && [].concat(s.match).some((mt) => mt?.kind === 'list'));

/** Swap `-` and `1.` on every list line (all depths), re-indenting what nests under a changed marker. */
function swapMarkers(md) {
  const out = [];
  const stack = [];
  let fence = false;
  for (const line of md.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence || !line.trim()) {
      out.push(line);
      continue;
    }
    const ind = line.match(/^\s*/)[0].length;
    while (stack.length && ind < stack.at(-1).oc) stack.pop();
    const shift = stack.length ? stack.at(-1).nc - stack.at(-1).oc : 0;
    const m = /^(\s*)([-*+]|\d+[.)])(\s+)(.*)$/.exec(line);
    if (m && !/^\s*(---|\*\*\*)\s*$/.test(line)) {
      const marker = /\d/.test(m[2]) ? '-' : '1.';
      const ni = ind + shift;
      stack.push({ oc: ind + m[2].length + m[3].length, nc: ni + marker.length + 1 });
      out.push(`${' '.repeat(ni)}${marker} ${m[4]}`);
    } else out.push(shift > 0 ? ' '.repeat(shift) + line : line);
  }
  return out.join('\n');
}

/** The first slide section of a render, with the attributes that record the author's marker cut. */
function section(md) {
  const html = String(engine.render(md).html);
  const s = html.match(/<section[\s\S]*?<\/section>/)?.[0] || '';
  // A `2.` start is a number, not a marker: it rides as the counter offset either way, so a sample
  // whose lists continue each other (`regulatory-update diff-bands`) differs from its swap by that.
  return s.replace(/ data-ordered="(true|false)"/g, '').replace(/ start="\d+"/g, '').replace(/ style="--lat-split-offset:\d+;"/g, '');
}

describe('every component that reads a list declares its contract', () => {
  for (const m of manifests) {
    if (!hasListSlot(m.slots) && !Object.values(m.variantSlots || {}).some(hasListSlot)) continue;
    test(m.name, () => {
      assert.ok(m.lists, `${m.name} has a list slot but no \`lists\``);
      assert.equal(CATALOG[m.name]?.lists, m.lists, `${m.name}: list-contract.generated.js is stale — run node tools/build-stage-catalog.js`);
    });
  }
  test('every list slot selector names the element the engine hands the layout', () => {
    // The semantic-invariant suite executes these selectors (`ol > li` on authority-chain): a
    // contract that rewrote that list to `ul` left the selector matching nothing.
    const bad = [];
    for (const m of manifests) {
      const c = CATALOG[m.name];
      if (!c || c.lists === 'prose') continue;
      for (const [k, s] of Object.entries(m.slots || {})) {
        const mt = [].concat(s?.match).find((x) => x?.kind === 'list');
        if (!mt || !s.selector) continue;
        const d = mt.depth || 1;
        const want = c.lists === 'numbered-tags' && d === 1 ? c.markers[0] : c.markers[d - 1] || 'ul';
        if (!want) continue; // numbered-tags with no named marker: the author's element is kept
        const ol = /(^|[\s>,(])ol\b/.test(s.selector);
        const ul = /(^|[\s>,(])ul\b/.test(s.selector);
        if ((want === 'ul' && ol && !ul) || (want === 'ol' && ul && !ol)) bad.push(`${m.name}.${k} '${s.selector}' vs ${want}`);
      }
    }
    assert.deepEqual(bad, []);
  });
  test('the owner settled the R2 layouts (decision 1, 2026-11-19)', () => {
    for (const name of ['cards-grid', 'cards-stack', 'list-steps']) assert.equal(listContractFor(name).lists, 'numbered-tags', name);
    assert.equal(listContractFor('split-panel steps').lists, 'numbered-tags');
    for (const name of ['agenda', 'list-tabular', 'stats', 'kpi', 'premise']) assert.equal(listContractFor(name).lists, 'neutral', name);
    for (const name of ['content', 'list']) assert.equal(listContractFor(name).lists, 'prose', name);
  });
});

describe('R3: a neutral layout renders either marker the same (manifest samples, swapped)', () => {
  let probes = 0;
  for (const m of manifests) {
    if (m.lists !== 'neutral') continue;
    const samples = [['sample', m.sample], ...Object.entries(m.variantDocs || {}).map(([k, v]) => [`variant ${k}`, v.sample])]
      .filter(([label, md]) => md && /^\s*(?:-|\d+\.) /m.test(md) && listContractFor(md.match(/_class:\s*([^>]*)-->/)?.[1] || '')?.lists === 'neutral' && label);
    for (const [label, md] of samples) {
      test(`${m.name} ${label}`, () => {
        probes++;
        const swapped = swapMarkers(md);
        assert.notEqual(swapped, md, 'the swap changed nothing');
        assert.equal(section(swapped), section(md));
      });
    }
  }
  test('the sweep reached the layouts the audit measured', () => assert.ok(probes >= 40, `probes: ${probes}`));
});

describe('R1, R2: the author marker is recorded where a layout reads it', () => {
  const lists = (md) => [...String(engine.render(md).html).matchAll(/<(ul|ol)([^>]*)>/g)].map((x) => `${x[1]}${x[2]}`);
  test('list-steps: `-` is the same `ol` cards, marked unnumbered; `1.` is marked numbered', () => {
    assert.deepEqual(lists('<!-- _class: list-steps -->\n\n## S\n\n- A\n  - a\n- B\n  - b\n'), ['ol data-ordered="false"', 'ul', 'ul']);
    assert.deepEqual(lists('<!-- _class: list-steps -->\n\n## S\n\n1. A\n   - a\n2. B\n   - b\n'), ['ol data-ordered="true"', 'ul', 'ul']);
  });
  test('cards-grid keeps the element the author wrote: `ol` draws the corner tags', () => {
    assert.deepEqual(lists('<!-- _class: cards-grid -->\n\n## S\n\n- A\n  - a\n'), ['ul data-ordered="false"', 'ul']);
    assert.deepEqual(lists('<!-- _class: cards-grid -->\n\n## S\n\n1. A\n   1. a\n'), ['ol data-ordered="true"', 'ul']);
  });
  test('list principles: `-` becomes a dotted `ol`; content and plain list render as written', () => {
    assert.deepEqual(lists('<!-- _class: list principles -->\n\n## S\n\n- A\n- B\n'), ['ol data-ordered="false"']);
    assert.deepEqual(lists('<!-- _class: list takeaway -->\n\n## S\n\n- A\n  1. a\n'), ['ul', 'ol']);
    assert.deepEqual(lists('## S\n\n1. A\n   - a\n'), ['ol', 'ul']);
  });
  test('a `1.` list that starts past 1 keeps its offset when it becomes a `ul`', () => {
    assert.deepEqual(lists('<!-- _class: cycle -->\n\n## C\n\n3. A\n4. B\n'), ['ul style="--lat-split-offset:2;"']);
  });
});

describe('what the contract leaves alone', () => {
  const lists = (md) => [...String(engine.render(md).html).matchAll(/<(ul|ol)([^>]*)>/g)].map((x) => `${x[1]}${x[2]}`);
  test('a list inside a blockquote callout stays as written, on the engine and in the mirror', () => {
    assert.deepEqual(lists('<!-- _class: agenda -->\n\n## A\n\n- One\n- Two\n\n> - caveat one\n> - caveat two\n'), ['ol', 'ul']);
    assert.deepEqual(lists('<!-- _class: list-steps -->\n\n## S\n\n1. A\n2. B\n\n> 1. aside\n'), ['ol data-ordered="true"', 'ol']);
    const doc = new JSDOM('<body><section class="agenda"><ul><li>x</li></ul><blockquote><ul><li>c</li></ul></blockquote></section></body>').window.document;
    normalizeListsDom(doc);
    assert.deepEqual([...doc.querySelectorAll('ul, ol')].map((e) => e.tagName), ['OL', 'UL']);
  });
  test('an auto-split moves the offset of a `4.` list that became a `ul` (collections.js)', () => {
    const { partitionAxis } = require('../../../lib/core/collections.js');
    const pages = partitionAxis('<h2>H</h2><ul style="--lat-split-offset:3;"><li>a</li><li>b</li><li>c</li><li>d</li></ul>', 'item', 2);
    assert.match(pages[0], /--lat-split-offset:3;/);
    assert.match(pages[1], /--lat-split-offset:5;/);
  });
});

describe('the runtime mirror agrees with the engine', () => {
  const dom = (html) => new JSDOM(`<body>${html}</body>`).window.document;
  test('a Marp-shaped slide gets the engine\'s lists, and a second pass changes nothing', () => {
    const doc = dom('<section class="list-steps"><h2>S</h2><ul><li>A<ol><li>a</li></ol></li></ul></section>'
      + '<section class="agenda"><ul><li>One</li></ul></section>'
      + '<section class="content"><ol start="3"><li>x</li></ol></section>');
    assert.equal(normalizeListsDom(doc), 3);
    assert.deepEqual([...doc.querySelectorAll('ul, ol')].map((e) => e.outerHTML.match(/^<[^>]*>/)[0]), [
      '<ol data-ordered="false">', '<ul>', '<ol>', '<ol start="3">',
    ]);
    assert.equal(normalizeListsDom(doc), 0);
  });
  test('an engine render is already in shape', () => {
    const html = String(engine.render('<!-- _class: journey -->\n\n## J\n\n1. Stage\n   1. Step `3`\n').html);
    const doc = dom(html);
    assert.equal(normalizeListsDom(doc), 0);
  });
  test('an `ol` that becomes a `ul` keeps its start as the counter offset', () => {
    const doc = dom('<section class="kpi"><ul><li>a</li></ul></section><section class="cycle"><ol start="4"><li>a</li></ol></section>');
    normalizeListsDom(doc);
    assert.deepEqual([...doc.querySelectorAll('section > *')].map((e) => e.outerHTML.match(/^<[^>]*>/)[0]), ['<ol>', '<ul style="--lat-split-offset:3;">']);
  });
});
