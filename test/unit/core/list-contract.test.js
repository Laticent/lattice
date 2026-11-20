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

/**
 * Swap `-` and `1.` on every list line down to `maxDepth` (the deepest level the layout reads; deeper
 * lists are the author's and keep their marker), re-indenting what nests under a changed marker.
 */
function swapMarkers(md, maxDepth = Infinity) {
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
      const marker = stack.length + 1 > maxDepth ? m[2] : /\d/.test(m[2]) ? '-' : '1.';
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
    // contract that rewrote that list to `ul` left the selector matching nothing. Base slots and
    // each variant's slots (merged as the build merges them) against that variant's row; a selector
    // names an element after any combinator (`h2+ol`, `section ol`), never inside a word (`.col`).
    const names = (sel, el) => new RegExp(`(^|[\\s>,(+~])${el}\\b`).test(sel);
    const bad = [];
    for (const m of manifests) {
      if (!CATALOG[m.name] || CATALOG[m.name].lists === 'prose') continue;
      const views = [[m.name, m.slots || {}, listContractFor(m.name)]];
      for (const [v, over] of Object.entries(m.variantSlots || {})) {
        const slots = { ...(m.slots || {}) };
        for (const [k, sl] of Object.entries(over)) {
          if (sl === null) delete slots[k];
          else slots[k] = { ...(slots[k] || {}), ...sl };
        }
        views.push([`${m.name} ${v}`, slots, listContractFor(`${m.name} ${v}`)]);
      }
      for (const [label, slots, c] of views) {
        if (c.lists === 'prose') continue;
        for (const [k, sl] of Object.entries(slots)) {
          const mt = [].concat(sl?.match).find((x) => x?.kind === 'list');
          if (!mt || !sl.selector) continue;
          const d = mt.depth || 1;
          const want = c.lists === 'numbered-tags' && d === 1 ? c.markers[0] : c.markers[d - 1] || 'ul';
          if (!want) continue; // numbered-tags with no named marker: the author's element is kept
          const ol = names(sl.selector, 'ol');
          const ul = names(sl.selector, 'ul');
          if ((want === 'ul' && ol && !ul) || (want === 'ol' && ul && !ol)) bad.push(`${label}.${k} '${sl.selector}' vs ${want}`);
        }
      }
    }
    assert.deepEqual(bad, []);
    assert.ok(names('h2+ol > li', 'ol') && names('section ol li', 'ol') && !names('.col > li', 'ol'), 'the selector reading');
  });
  test('no neutral layout\'s guidance tells an author one marker breaks it (HARD RULE #6 sends agents there)', () => {
    // Before W2 these entries described real breakage ("a `ul` renders as plain unstyled text", "detail
    // sublists must be bullet lists"). On a neutral layout either marker renders the same, so such
    // advice is false. Read: commonMistakes, antiPatterns and every list slot's description (base and
    // variant). "A table instead of a bullet list" is a different choice, not a marker, and passes.
    const SWAP = [
      /(instead of|rather than)[^.]{0,40}(`1\.`|`-`|numbered list|ordered list)/i,
      /(\bul\b|\bol\b|`-`|`1\.`)[^.]{0,60}(doesn't match|isn't recognized|renders as (a )?plain)/i,
      /must be (a )?(bullet|numbered|ordered)/i,
      /not numbered\b/i,
      /only (picks up|reads|matches) (bullet|numbered|ordered)/i,
    ];
    const hits = [];
    const look = (where, text) => { if (SWAP.some((re) => re.test(text))) hits.push(`${where}: ${text.slice(0, 90)}`); };
    for (const m of manifests) {
      if (m.lists !== 'neutral') continue;
      for (const field of ['commonMistakes', 'antiPatterns']) for (const e of m[field] || []) look(`${m.name}.${field}`, JSON.stringify(e));
      const slotSets = [m.slots || {}, ...Object.values(m.variantSlots || {})];
      for (const set of slotSets) {
        for (const [k, sl] of Object.entries(set)) {
          if (sl?.description && [].concat(sl.match).some((x) => x?.kind === 'list')) look(`${m.name}.slots.${k}`, sl.description);
        }
      }
    }
    assert.deepEqual(hits, []);
    assert.ok(!SWAP.some((re) => re.test('Use a table instead of a bullet list when the rows compare.')), 'a non-marker choice passes');
  });
  // The list contract reaches as deep as a component's deepest list slot; below that a list is the
  // author's (owner, #3330), and so is an aside. A stylesheet must not reach past that:
  //   (a) a one-marker selector reaches the stage's list only through the stage scope
  //       (`ol:where(.cell-stage > :not([data-list="aside"]))`), never by a descendant combinator, so it
  //       cannot restyle a nested list, an aside or a quoted list as the layout's own;
  //   (b) no selector styles `ul` and `ol` differently at a depth the manifest does not declare
  //       (a list reached through an `li` is one level deeper);
  //   (c) a one-marker list never reaches its items by a descendant combinator (`ol li` reaches nested items);
  //   (d) a rule that picks the stage's list as a direct child excludes an aside
  //       (`:where(:not([data-list="aside"]))`), or the aside is drawn as more cards, tiles or steps.
  // Found by review of #3330 (list-steps and agenda drew a nested `1.` as STEP cards and ledger rows;
  // cards-grid drew an aside as a second row of cards). Every tracked stylesheet under lib/ and themes/
  // is read, and a selector counts for every layout whose class it names.
  const SCOPE = ':where(.cell-stage > :not([data-list="aside"]))';
  const ASIDE_OUT = ':where(:not([data-list="aside"]))';
  const excludesAside = (rest) => rest.startsWith(ASIDE_OUT) || rest.startsWith(SCOPE) || rest.startsWith(':not([data-list="aside"])');
  /** Split a stylesheet into normalized selectors, comments dropped, commas inside brackets kept. */
  function cssSelectors(css) {
    const out = [];
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{};]+)\{/g)) {
      if (m[1].trim().startsWith('@')) continue;
      let depth = 0;
      let cur = '';
      for (const ch of m[1]) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && !depth) { out.push(cur); cur = ''; } else cur += ch;
      }
      out.push(cur);
    }
    return out
      .map((x) => x.replace(/\s+/g, ' ').trim())
      .filter((x) => x && !/^(from|to|\d+%)$/.test(x))
      .map((x) => x.replace(/:(is|where)\(\s*(ul|ol)\s*\)/g, '$2').replace(/:(is|where)\(\s*(ul\s*,\s*ol|ol\s*,\s*ul)\s*\)/g, 'L'));
  }
  /** Drop every bracketed group, so `section:not(.a, .b).x` reads as one compound. */
  const flat = (s) => { let t = s; let prev; do { prev = t; t = t.replace(/\([^()]*\)/g, ''); } while (t !== prev); return t; };
  /** The layouts a selector belongs to: the classes on its subject `section` compound, outside `:not()`. */
  function layoutsOf(sel, names) {
    const head = /^(?:section)?((?:[.:[][^\s>+~]*)?)/.exec(sel);
    if (!head || !head[0]) return [];
    const compound = head[1].replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '');
    return [...compound.matchAll(/\.([\w-]+)/g)].map((c) => c[1]).filter((c) => names.has(c));
  }
  /** What a selector does wrong for a layout row, per (a)–(d) above; `set` holds every selector, for the flip test. */
  function listFindings(name, row, sel, set) {
    const bad = [];
    const flipAt = (at, el) => sel.slice(0, at) + (el === 'ul' ? 'ol' : 'ul') + sel.slice(at + 2);
    let depth = 0;
    let first = true;
    for (const t of sel.matchAll(/(^|[\s>+~(])(ul|ol|L)(?=[\s>.:[)#+~]|$)/g)) {
      const at = t.index + t[1].length;
      const before = sel.slice(0, at).trimEnd();
      const open = (sel.slice(0, at).match(/\(/g) || []).length - (sel.slice(0, at).match(/\)/g) || []).length;
      if (open > 0) continue; // inside a pseudo-class argument (`:has(> ul)`): not the subject chain
      const descendant = !/[>+~]$/.test(before) && before.length > 0;
      if (!/[+~]$/.test(before)) depth++;
      if (first && /(^|[\s>])li(?=[\s>.:[]|$)/.test(flat(before))) depth++; // reached through an item: nested
      const rest = sel.slice(at + (t[2] === 'L' ? 1 : 2));
      const directChild = /(\.cell-stage|^section\S*) >$/.test(flat(before));
      // A list with a class (`ul.team-roster`, `ul.tile-track`) is one a transform builds, never the author's.
      const built = /^\.[\w-]/.test(rest);
      // (d) the stage's own list, picked as a direct child, must leave an aside alone.
      if (first && directChild && !built && !excludesAside(rest)) bad.push(`${name}: stage list without the aside exclusion in '${sel}'`);
      // A list reached by a sibling combinator sits where an aside can (`p + ol`, `ol ~ ol`). Straight
      // after a heading or another list it cannot: an aside follows prose.
      const prev = before.replace(/\s*[+~]$/, '').split(/[\s>+~]+/).pop() || '';
      const safePrev = /[+]$/.test(before) && /^(h[1-6]|ul|ol|L)(?![\w-])/.test(prev);
      if (/[+~]$/.test(before) && !safePrev && !built && !excludesAside(rest)) bad.push(`${name}: sibling list without the aside exclusion in '${sel}'`);
      first = false;
      if (t[2] === 'L') continue; // `:is(ul, ol)` styles both markers alike
      if (sel[at + 2] === '.') continue; // `ul.team-roster`: a list a transform builds, not the author's
      if (set.has(flipAt(at, t[2]))) continue; // the other marker is styled the same way
      // (a) one marker only, reached by a descendant combinator rather than the stage scope.
      if (depth === 1 && descendant && !rest.startsWith(SCOPE) && !rest.startsWith(':not(:where(li *')) bad.push(`${name}: one-marker descendant selector '${sel}'`);
      // (c) one marker only, then a descendant step to items: it reaches nested lists' items too.
      const after = rest.replace(/^(:where\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)|:not\((?:[^()]|\([^()]*\))*\)|[.:[][^\s>+~]*)*/, '');
      if (/^ li\b/.test(after)) bad.push(`${name}: one-marker list reaches its items by a descendant combinator in '${sel}'`);
      // (b) one marker only, at a depth the manifest does not read.
      if (depth > row.depths) bad.push(`${name}: depth ${depth} styles only \`${t[2]}\` in '${sel}' (manifest reads ${row.depths})`);
    }
    return bad;
  }
  test('a layout\'s CSS reads lists only where its manifest says it does', () => {
    const { execSync } = require('node:child_process');
    const fs = require('node:fs');
    const path = require('node:path');
    const ROOT = path.join(__dirname, '..', '..', '..');
    const files = execSync('git ls-files "lib/**/*.css" "themes/**/*.css"', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
    assert.ok(files.length > 100, `read ${files.length} stylesheets`);
    const names = new Set(Object.keys(CATALOG));
    const all = files.flatMap((f) => cssSelectors(fs.readFileSync(path.join(ROOT, f), 'utf8')).map((sel) => ({ f, sel })));
    const set = new Set(all.map((x) => x.sel));
    const bad = [];
    let checked = 0;
    for (const { f, sel } of all) {
      const named = layoutsOf(sel, names);
      // A prose layout renders every native list, by design; a variant word on one (`list principles bullet`)
      // is not another layout.
      if (named.some((n) => CATALOG[n].lists === 'prose')) continue;
      for (const name of named) {
        const row = CATALOG[name];
        checked++;
        for (const b of listFindings(name, row, sel, set)) bad.push(`${f}: ${b}`);
      }
    }
    assert.ok(checked > 2000, `checked ${checked} layout selectors`);
    assert.deepEqual(bad, []);
  });
  test('the CSS guard can fail: each shape the #3330 review slipped past it is caught', () => {
    const row = { lists: 'neutral', depths: 1 };
    const names = new Set(['agenda', 'a', 'b', 'cards-grid']);
    const caught = (sel) => {
      const [s] = cssSelectors(`${sel} { color: red; }`);
      return layoutsOf(s, names).length > 0 && listFindings('agenda', row, s, new Set([s])).length > 0;
    };
    for (const sel of [
      'section.agenda ol > li',
      'section.agenda:not(.circles, .checks) ol > li',
      'section:is(.a, .b).agenda ol > li',
      'section.agenda > .cell-stage ol > li',
      'section.agenda li > ol',
      'section.agenda :is(ol) > li',
      `section.agenda ol${SCOPE} li`,
      'section.agenda > .cell-stage > :is(ul, ol) > li',
      'section.cards-grid > .cell-stage > ol > li::before',
      'section.agenda > .cell-stage > p + ol > li',
      `section.agenda > .cell-stage > ol${ASIDE_OUT} ~ ol > li`,
      '.agenda > .cell-stage > ol > li',
    ]) assert.ok(caught(sel), `missed '${sel}'`);
    for (const sel of [
      `section.agenda ol${SCOPE} > li`,
      `section.agenda > .cell-stage > :is(ul, ol)${ASIDE_OUT} > li`,
      `section.agenda:not(.circles, .checks) ol${SCOPE} > li::before`,
      'section.agenda > .cell-stage > :is(ul, ol):not([data-list="aside"]) > li',
    ]) assert.ok(!caught(sel), `flagged a scoped selector '${sel}'`);
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
        const swapped = swapMarkers(md, listContractFor(md.match(/_class:\s*([^>]*)-->/)?.[1] || '').depths);
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
    // The card's body is a level the layout reads and draws as plain lines, so a `1.` body is a `ul`
    // (no numbers announced that a reader never sees); one level further down is the author's again.
    assert.deepEqual(lists('<!-- _class: cards-grid -->\n\n## S\n\n1. A\n   1. a\n      1. deep\n'), ['ol data-ordered="true"', 'ul', 'ol']);
  });
  test('below the deepest level a layout reads, a list is the author\'s: a nested `1.` stays numbered (owner, #3330)', () => {
    // agenda reads one level; a numbered sub-list under a section keeps its `ol` (and a screen reader hears numbers).
    assert.deepEqual(lists('<!-- _class: agenda -->\n\n## A\n\n- One\n  1. first\n  2. then\n- Two\n'), ['ol', 'ol']);
    // decision reads two (its card body), so a nested `1.` there is the layout's and reads like `-`.
    assert.deepEqual(lists('<!-- _class: decision -->\n\n## D\n\n- Option A\n  1. first\n  2. then\n'), ['ul', 'ul']);
    // kpi reads two levels (the value, then its label lines): its second level is still normalized.
    assert.deepEqual(lists('<!-- _class: kpi -->\n\n## K\n\n- 94%\n  1. Gross retention\n'), ['ol', 'ul']);
    // gantt reads three levels (a chart consumes them, so read the kernel): a fourth is the author's.
    const { targetElement } = require('../../../lib/core/list-contract');
    assert.deepEqual([1, 2, 3, 4].map((d) => targetElement(listContractFor('gantt'), d)), ['ul', 'ul', 'ul', null]);
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

describe('which lists are the layout\'s (the trio review of #3330)', () => {
  const lists = (md) => [...String(engine.render(md).html).matchAll(/<(ul|ol)([^>]*)>/g)].map((x) => `${x[1]}${x[2]}`);
  test('a deck-wide variant in front matter sets the contract, as a slide\'s own class does', () => {
    // `deck_class_propagate` runs after this pass; the pass reads the deck's class itself.
    assert.deepEqual(lists('---\nclass: steps\n---\n\n<!-- _class: split-panel -->\n\n## H\n\n1. **Plan** it\n2. **Build** it\n'), ['ol data-ordered="true"']);
    assert.deepEqual(lists('---\nclass: principles\n---\n\n<!-- _class: list -->\n\n## H\n\n- One\n- Two\n'), ['ol data-ordered="false"']);
  });
  test('a list after prose is an aside, left as written; one after a heading is a section of the body', () => {
    assert.deepEqual(lists('<!-- _class: list-steps -->\n\n## H\n\n1. A\n   - a\n2. B\n   - b\n\nOpen risks:\n\n- Lock-in\n- Budget\n'), ['ol data-ordered="true"', 'ul', 'ul', 'ul data-list="aside"']);
    assert.deepEqual(lists('<!-- _class: agenda -->\n\n## H\n\n- One\n- Two\n\nAlso:\n\n1. aside\n   1. deeper\n'), ['ol', 'ol data-list="aside"', 'ol']);
    assert.deepEqual(lists('<!-- _class: regulatory-update -->\n\n## H\n\n### Added\n\n- A\n  - `x`\n\n### Amended\n\n- B\n  - `y`\n'), ['ol', 'ul', 'ol', 'ul']);
  });
  test('a pane reads the deck class; a list wrapped in raw HTML is the author\'s; a marker change or a comment is not prose', () => {
    assert.deepEqual(lists('---\nclass: principles\n---\n\n<!-- _class: columns -->\n\n## H\n\n<!-- _pane: list -->\n\n- Alpha\n- Beta\n\n<!-- _pane: content -->\n\nText.\n'), ['ol data-ordered="false"']);
    assert.deepEqual(lists('<!-- _class: kpi -->\n\n## H\n\n<div class="note">\n\n- in div\n\n</div>\n\n- real a\n  - x\n'), ['ul', 'ol', 'ul']);
    assert.deepEqual(lists('<!-- _class: agenda -->\n\n## H\n\n- one\n- two\n* three\n'), ['ol', 'ol']);
    assert.deepEqual(lists('<!-- _class: list-steps -->\n\n## H\n\n1. A\n   - a\n\n<!-- note -->\n\n1. B\n   - b\n'), ['ol data-ordered="true"', 'ul', 'ol data-ordered="true"', 'ul']);
  });
  test('the slot-label lift bolds the layout\'s items only: an aside and a quoted list keep their weight (engine)', () => {
    const html = String(engine.render('<!-- _class: decision -->\n\n## H\n\n- Build\n  - why\n- Buy\n  - why\n\n> - quoted item\n\nOpen risks:\n\n1. Lock-in\n2. Budget\n').html);
    assert.match(html, /<li><strong>Build<\/strong>/, 'the layout\'s own items are lifted');
    assert.match(html, /<li>Lock-in<\/li>/, 'an aside item is not');
    assert.match(html, /<li>quoted item<\/li>/, 'a quoted item is not');
  });
  test('the slot-label lift skips an aside in the runtime too', async () => {
    const { bootRuntime } = require('../../helpers/runtime-boot');
    const dom = new JSDOM('<!doctype html><body><section class="decision"><h2>H</h2><ul><li>Build<ul><li>why</li></ul></li><li>Buy<ul><li>why</li></ul></li></ul>'
      + '<p>Open risks:</p><ol><li>Lock-in</li><li>Budget</li></ol></section></body>', { runScripts: 'dangerously' });
    await bootRuntime(dom);
    const items = [...dom.window.document.querySelectorAll('section li')].map((li) => li.firstElementChild?.tagName === 'STRONG' ? `*${li.firstElementChild.textContent}` : li.firstChild.textContent);
    assert.ok(items.includes('*Build') && items.includes('*Buy'), `the layout's items are lifted: ${items}`);
    assert.ok(items.includes('Lock-in') && items.includes('Budget'), `the aside's are not: ${items}`);
  });
  test('the runtime walks the same lists: not an aside, not raw HTML', () => {
    const doc = new JSDOM('<body><section class="agenda"><h2>H</h2><ul><li>x</li></ul><p>Also:</p><ul><li>aside</li></ul>'
      + '<div><ul><li>raw</li></ul></div><div class="cell-stage"><h3>S</h3><ul><li>y</li></ul></div></section></body>').window.document;
    normalizeListsDom(doc);
    assert.deepEqual([...doc.querySelectorAll('section ul, section ol')].map((e) => `${e.tagName}:${e.textContent}`), ['OL:x', 'UL:aside', 'UL:raw', 'OL:y']);
  });
});

describe('the runtime mirror agrees with the engine', () => {
  const dom = (html) => new JSDOM(`<body>${html}</body>`).window.document;
  test('a Marp-shaped slide gets the engine\'s lists, and a second pass changes nothing', () => {
    const doc = dom('<section class="list-steps"><h2>S</h2><ul><li>A<ol><li>a</li></ol></li></ul></section>'
      + '<section class="agenda"><ul><li>One</li></ul></section>'
      + '<section class="content"><ol start="3"><li>x</li></ol></section>');
    // list-steps reads two levels (the step, then its body), so the body's nested `1.` reads like `-`.
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
