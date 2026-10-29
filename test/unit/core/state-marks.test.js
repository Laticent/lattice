/**
 * The inline `[x]` state mark, and the kernel both render paths now share.
 *
 * The negative arms carry the weight, for the same reason they do in the pill tests:
 * this grammar reads every single-backtick span in every deck, and `[` opens a CSS
 * attribute selector, an array index and a citation. Only the six exact
 * three-character forms may dispatch.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const marks = require('../../../lib/plugins/checks/shared/registry.js');
const leading = require('../../../lib/plugins/checks/shared/leading.js');

describe('state-marks — the six markers', () => {
  const EXPECTED = {
    '[x]': { sem: 'pass', shape: 'state-full', label: 'yes' },
    '[-]': { sem: 'warn', shape: 'state-half', label: 'partly' },
    '[!]': { sem: 'fail', shape: 'state-empty', label: 'no' },
    '[?]': { sem: 'unknown', shape: 'state-unknown', label: 'unknown' },
    '[ ]': { sem: 'todo', shape: 'state-todo', label: 'open' },
    '[/]': { sem: 'skip', shape: 'state-slashed', label: 'does not apply' },
  };

  for (const [src, want] of Object.entries(EXPECTED)) {
    test(`\`${src}\` decodes to ${want.sem}/${want.shape}`, () => {
      const got = marks.parseInlineState(src);
      assert.ok(got, `${src} did not parse`);
      assert.equal(got.sem, want.sem);
      assert.equal(got.shape, want.shape);
      assert.equal(got.label, want.label);
    });
  }

  test('one meaning per marker: `[ ]` is open everywhere, and "no" is `[!]`', () => {
    // `[ ]` used to be overloaded — "not met" in verdict-grid, "not yet" everywhere else —
    // behind a layout flag the author could not see. The flag is gone: a second argument
    // changes nothing, and the red cross belongs to `[!]` alone.
    assert.equal(marks.stateClassesFor(' ').sem, 'todo');
    assert.equal(marks.stateClassesFor(' ', false).sem, 'todo', 'no layout can flip `[ ]` to fail');
    assert.equal(marks.stateClassesFor('!').sem, 'fail');
    assert.equal(marks.stateClassesFor('X'), null, '`[X]` is GFM\'s CHECKED box, not a cross');
    assert.equal(marks.stateClassesFor('~'), null);
  });

  test('every marker has a spoken label, and the class list is exactly the markers', () => {
    assert.deepEqual(Object.keys(marks.MARKER_LABELS).sort(), [...marks.MARKERS].sort());
    for (const m of marks.MARKERS) {
      assert.deepEqual(leading.readLeadingMarker(`[${m}] rest`), { marker: m, rest: 'rest' }, `readLeadingMarker misses [${m}]`);
      assert.deepEqual(leading.leadingMarkerPrefix(`[${m}]`), { marker: m, length: 3 }, `leadingMarkerPrefix misses [${m}]`);
    }
    for (const bad of ['[X] a', '[~] a', '[>] a', ' [x] a', '[xx] a']) {
      assert.equal(leading.readLeadingMarker(bad), null, bad);
    }
  });

  test('the mark carries its name on aria-label, never as text', () => {
    const doc = new JSDOM().window.document;
    for (const src of Object.keys(EXPECTED)) {
      const el = marks.stateElement(doc, src);
      assert.equal(el.textContent, '', `${src} put a word in the document`);
      assert.equal(el.getAttribute('role'), 'img');
      assert.equal(el.getAttribute('aria-label'), EXPECTED[src].label);
      assert.equal(el.children.length, 0);
    }
  });

  test('the element and the HTML string carry the same classes and label', () => {
    const doc = new JSDOM().window.document;
    for (const src of Object.keys(EXPECTED)) {
      const el = marks.stateElement(doc, src);
      const html = marks.stateHtml(src);
      assert.match(html, new RegExp(`class="${el.className}"`), src);
      assert.match(html, new RegExp(`aria-label="${el.getAttribute('aria-label')}"`), src);
    }
  });

  test('an inline mark reuses the universal vocabulary, so checks-* reaches it', () => {
    // `state`, the semantic and the shape are the SAME classes checklist rows carry —
    // that is what makes `--state-mark`, `.state.todo`'s open ring and every `checks-*`
    // style variant apply to an inline mark without a line of new CSS. Only `lat-state`
    // is new, and it carries nothing but the box.
    const cls = marks.stateClassList({ sem: 'pass', shape: 'state-full' }).split(' ');
    assert.ok(cls.includes('state'));
    assert.ok(cls.includes('pass'));
    assert.ok(cls.includes('state-full'));
    assert.ok(cls.includes('lat-state'));
  });
});

describe('state-marks — what stays literal', () => {
  const LITERAL = [
    '[~]', '[>]', '[*]', '[X]',          // near-misses; the vocabulary is these six, lowercase
    '[data-mark]', '[data-anima-role]',  // CSS attribute selectors
    '[0]', '[i]', '[1..n]',              // indexes and ranges
    '[]', '[  ]', '[x ]', ' [x]', '[x',  // malformed or padded
    'x', '[x][y]', '`[x]`',
  ];
  for (const text of LITERAL) {
    test(`leaves \`${text}\` literal`, () => {
      assert.equal(marks.parseInlineState(text), null);
      assert.equal(marks.stateHtml(text), null);
      assert.equal(marks.stateElement(new JSDOM().window.document, text), null);
    });
  }

  test('the marker set is exactly six, and nothing has crept in', () => {
    assert.deepEqual([...marks.MARKERS].sort(), [' ', '!', '-', '/', '?', 'x']);
  });

  // Every reader of a leading marker, the Compose editor's included, walks the list-text grammar,
  // which spells the set as its own string: a seventh marker added here must reach it too.
  test('the list-text grammar reads exactly these markers', () => {
    const grammar = require('../../../lib/core/list-text-grammar.js');
    assert.deepEqual([...grammar.MARKERS].sort(), [...marks.MARKERS].sort());
  });
});

// THE CHECK REGISTRY (engineering/decisions/2026-10-18-checks.md §4 rule 4, §9 step 3). The six
// rows used to live in three places: the classes and words in this kernel, the drawings in
// base.modifiers.css (now the checks plugin's checks.styles.css), and the words again in the Studio picker. The kernel now holds them as one
// table and derives the rest; the stylesheet and the layout word maps cannot import it, so these
// tests pin them to it. A seventh row fails here until every surface knows it.
describe('state-marks — the check registry is the one table of six', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '../../..');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const COLUMNS = ['id', 'marker', 'shape', 'mark', 'tone', 'hollow', 'word', 'aliases', 'meaning'];

  test('six rows, every column, nothing shared between two rows', () => {
    assert.equal(marks.CHECKS.length, 6);
    for (const row of marks.CHECKS) {
      assert.deepEqual(Object.keys(row), COLUMNS, `${row.id} has the wrong columns`);
      assert.ok(Object.isFrozen(row), `${row.id} is mutable`);
    }
    for (const col of ['id', 'marker', 'shape', 'word']) {
      const vals = marks.CHECKS.map((r) => r[col]);
      assert.equal(new Set(vals).size, 6, `two rows share a ${col}`);
    }
  });

  test('the spoken aliases: one bare word each, owned by one answer, never another answer\'s id', () => {
    const ids = new Set(marks.CHECKS.map((r) => r.id));
    const seen = new Set();
    for (const row of marks.CHECKS) {
      assert.ok(Object.isFrozen(row.aliases), `${row.id}'s aliases are mutable`);
      for (const a of row.aliases) {
        assert.match(a, /^[a-z]+$/, `${row.id}: "${a}" must be one bare word, so Segno reads it unquoted`);
        assert.ok(!ids.has(a), `${row.id}: "${a}" is another answer's id`);
        assert.ok(!seen.has(a), `"${a}" is an alias of two answers`);
        seen.add(a);
      }
    }
  });

  test('every derived export reads the table, in its order', () => {
    assert.deepEqual([...marks.MARKERS], marks.CHECKS.map((r) => r.marker));
    for (const row of marks.CHECKS) {
      assert.equal(marks.MARKER_LABELS[row.marker], row.word);
      assert.deepEqual(marks.stateClassesFor(row.marker), { sem: row.id, shape: row.shape });
      assert.equal(marks.checkFor(row.marker), row);
      assert.ok(new RegExp(`^${marks.MARKER_CLASS}$`).test(row.marker), `MARKER_CLASS misses [${row.marker}]`);
    }
    assert.equal(marks.checkFor('X'), null);
  });

  test('every drawing the table names is a mask token base.tokens.css defines', () => {
    const tokens = read('lib/base/base.tokens.css');
    for (const { id, mark } of marks.CHECKS) {
      if (mark === null) continue;
      assert.match(tokens, new RegExp(`^\\s*--mark-${mark}:\\s*url\\(`, 'm'), `${id}: --mark-${mark} is not defined`);
    }
  });

  test('the drawing column: the plugin stylesheet maps each shape to the mask the table names', () => {
    const css = read('lib/plugins/checks/checks.styles.css');
    const rules = new Map();
    for (const m of css.matchAll(/^section \.(state-[a-z]+)\s*\{\s*--state-mark:\s*var\((--mark-[a-z]+)\);\s*\}/gm)) rules.set(m[1], m[2]);
    const want = new Map(marks.CHECKS.filter((r) => r.mark).map((r) => [r.shape, `--mark-${r.mark}`]));
    assert.deepEqual(Object.fromEntries(rules), Object.fromEntries(want));
  });

  test('the hollow column: exactly the hollow rows get the ring rule', () => {
    const css = read('lib/plugins/checks/checks.styles.css');
    const block = /((?:section \.(?:state|badge)\.[a-z]+,?\s*)+)\{\s*--state-fill-pct: 0%;/.exec(css);
    assert.ok(block, 'the hollow-ring rule moved');
    const ids = new Set([...block[1].matchAll(/\.state\.([a-z]+)/g)].map((m) => m[1]));
    assert.deepEqual([...ids].sort(), marks.CHECKS.filter((r) => r.hollow).map((r) => r.id).sort());
  });

  test('the tone column: the inline disc inks each answer with the table\'s tone', () => {
    const css = read('lib/plugins/checks/checks.styles.css');
    const ink = {};
    for (const m of css.matchAll(/((?:section \.lat-state\.[a-z]+,?\s*)+)\{[^}]*--state-ink:\s*var\((--[a-z-]+)\)/g)) {
      for (const id of m[1].matchAll(/\.lat-state\.([a-z]+)/g)) ink[id[1]] = m[2];
    }
    assert.deepEqual(ink, Object.fromEntries(marks.CHECKS.map((r) => [r.id, r.tone])));
  });

  test('every layout word map speaks all six answers, and only those', () => {
    const src = read('lib/transformers/prose-projection.mjs');
    const body = /const WORD_MAPS = \{([\s\S]*?)\n\};/.exec(src)[1];
    const maps = [...body.matchAll(/^\t'?([a-z-]+)'?: \{([^}]*)\}/gm)];
    assert.ok(maps.length >= 5, 'the WORD_MAPS shape moved');
    const ids = marks.CHECKS.map((r) => r.id).sort();
    for (const [, name, inner] of maps) {
      const keys = [...inner.matchAll(/([a-z]+):/g)].map((m) => m[1]).sort();
      assert.deepEqual(keys, ids, `WORD_MAPS.${name}`);
    }
  });

  test('narration\'s hand-typed shape and answer patterns name exactly the registry\'s rows', () => {
    // prose-projection imports no kernel, so it types its own copies. A seventh answer missing
    // here would narrate as nothing, with no other test to notice.
    const src = read('lib/transformers/prose-projection.mjs');
    const alts = (name) => new RegExp(`const ${name} = /\\\\b(?:state-)?\\(([a-z|]+)\\)\\\\b/;`).exec(src)?.[1].split('|').sort();
    assert.deepEqual(alts('STATE_SHAPE_RE'), marks.CHECKS.map((r) => r.shape.replace(/^state-/, '')).sort());
    for (const name of ['STATE_SEM_RE', 'KEY_SEM_RE']) assert.deepEqual(alts(name), marks.CHECKS.map((r) => r.id).sort(), name);
  });

  test('a manifest label set keyed by checks names only checks', () => {
    const shortcuts = new Set(marks.CHECKS.map((r) => `[${r.marker}]`));
    const dir = path.join(root, 'lib/components');
    for (const bucket of fs.readdirSync(dir)) {
      const b = path.join(dir, bucket);
      if (!fs.statSync(b).isDirectory()) continue;
      for (const name of fs.readdirSync(b)) {
        const f = path.join(b, name, `${name}.manifest.json`);
        if (!fs.existsSync(f)) continue;
        const members = JSON.parse(fs.readFileSync(f, 'utf8')).labelSet?.members || [];
        const keyed = members.filter((m) => /^\[.\]$/.test(m.key));
        for (const m of keyed) assert.ok(shortcuts.has(m.key), `${name}: ${m.key} is not a check`);
      }
    }
  });

  test('the Studio picker reads the table instead of retyping it', () => {
    const tsx = read('docs/src/components/studio/table-controls.tsx');
    assert.match(tsx, /stateMarks\.CHECKS/);
    for (const { word } of marks.CHECKS) {
      const label = word[0].toUpperCase() + word.slice(1);
      assert.doesNotMatch(tsx, new RegExp(`label: '${label}'`), `table-controls retypes "${label}"`);
    }
  });
});

describe('state-marks — one kernel, no duplicate decision', () => {
  test('no consumer retypes the marker character class — every pattern builds from MARKER_CLASS', () => {
    // The class used to be retyped as a private regex in eight places across five files
    // (engineering/decisions/2026-09-24-six-state-marks.md §6.1), plus three in the
    // docs-site editor and two in tools. A marker added to all but one would print raw
    // on that one surface. This fails on any private copy of the class — the current
    // six-marker one or the retired four-marker one — outside the kernel.
    //
    // matrix-grid is EXEMPT and named: its `[x]` `[-]` `[ ]` are a POSITIONAL grammar
    // (filled / reachable / not applicable), parsed by lib/core/matrix-grid-cells.js,
    // not status markers.
    const fs = require('node:fs');
    const path = require('node:path');
    const ROOT = path.resolve(__dirname, '../../..');
    // ORDER-BLIND: any bracket class holding `x`, `-`, `/` and a space, however written —
    // `[x\-/ ]`, `[ /x\-]`, `[-x/ !?]`. The first cut matched two spellings only, so a copy
    // with its members shuffled walked straight past it.
    const CLASS = /\[((?:\\.|[^\]\\\n]){3,16})\]/g;
    const isMarkerClass = (body) => {
      const chars = new Set(body.replace(/\\(.)/g, '$1'));
      return ['x', '-', '/', ' '].every((c) => chars.has(c));
    };
    const PRIVATE = { test: (src) => [...src.matchAll(CLASS)].some((m) => isMarkerClass(m[1])) };
    assert.ok(PRIVATE.test('const r = /[ /x\\-]/;'), 'the guard must catch a shuffled copy');
    assert.ok(!PRIVATE.test('const r = /[x\\- ]/;'), 'matrix-grid\'s three positional markers are not the class');
    // tools/segno-legacy/list-text.js is the FROZEN copy of the regex readers the list-text
    // grammar replaced (Segno phase 3): the oracle's source, which nothing in lib/ reads.
    const EXEMPT = new Set(['lib/plugins/checks/shared/registry.js', 'lib/core/matrix-grid-cells.js', 'tools/segno-legacy/list-text.js']);
    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'dist') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(?:js|mjs|cjs|ts|tsx)$/.test(e.name) || /generated/.test(e.name)) continue;
        const rel = path.relative(ROOT, p).split(path.sep).join('/');
        if (EXEMPT.has(rel) || /\.test\./.test(e.name)) continue;
        const src = fs.readFileSync(p, 'utf8');
        if (PRIVATE.test(src)) offenders.push(rel);
      }
    };
    for (const top of ['lib', 'tools', 'docs/src']) walk(path.join(ROOT, top));
    assert.deepEqual(offenders, [], `retyped marker class — build it from MARKER_CLASS in lib/plugins/checks/shared/registry.js:\n  ${offenders.join('\n  ')}`);
  });

  test('neither render path carries its own copy of stateClassesFor any more', () => {
    // It lived twice before this — plugins.js and runtime/index.js each had a private
    // copy, which is the drift HARD RULE #1 exists to stop. Adding a third consumer is
    // what forced the unification; this fails if one grows back.
    const fs = require('node:fs');
    for (const rel of ['../../../lib/integrations/markdown-it/plugins.js', '../../../lib/runtime/index.js']) {
      const src = fs.readFileSync(require.resolve(rel), 'utf8');
      assert.doesNotMatch(
        src,
        /function stateClassesFor\s*\(/,
        `${rel} defines its own stateClassesFor — import it from lib/plugins/checks/shared/registry.js`,
      );
      assert.match(src, /plugins\/checks\/shared\/registry/, `${rel} should import the kernel`);
    }
  });
});

describe('inline-code-directives — the escape, on both paths', () => {
  const d = require('../../../lib/core/inline-code-directives.js');

  test('a backslash escapes what would have dispatched, and shows the literal', () => {
    assert.equal(d.escapedText('\\{LIVE}'), '{LIVE}');
    assert.equal(d.escapedText('\\[x]'), '[x]');
    assert.equal(d.escapedText('\\{BETA, tag, c4}'), '{BETA, tag, c4}');
  });

  test('it does NOT strip a backslash that was never an escape — regexes are safe', () => {
    // `\[a-z]` is a character class and `\d+` is a regex. Stripping unconditionally
    // would have corrupted both, which is why the rule is "escape only what would
    // otherwise dispatch" rather than "a leading backslash means escape".
    for (const src of ['\\[a-z]', '\\d+', '\\n', '\\{ ok, scene }', '\\[~]', '\\[0]']) {
      assert.equal(d.escapedText(src), null, src);
    }
  });

  test('an escaped span never renders a mark or a pill', () => {
    const { JSDOM: J } = require('jsdom');
    const doc = new J().window.document;
    for (const src of ['\\{LIVE}', '\\[x]']) {
      assert.equal(d.renderHtml(src), null, src);
      assert.equal(d.renderElement(doc, src), null, src);
    }
  });

  test('the escape is visible in TEXT, not in the backtick run', () => {
    // The previous escape read the backtick count off `token.markup`, which exists only
    // on the markdown-it side. marp-core renders `` `{LIVE}` `` and ``` ``{LIVE}`` ``` to
    // the same `<code>{LIVE}</code>`, so the DOM mirror could not tell them apart and
    // converted both — the fidelity probe caught it. A backslash survives into the DOM,
    // which is the whole reason it replaced that form; this asserts the property the fix
    // depends on rather than the fix itself.
    assert.equal(d.escapedText('{LIVE}'), null, 'no backslash, no escape');
    assert.ok(d.renderHtml('{LIVE}'), 'the unescaped form still dispatches');
  });
});

describe('inline-code-directives — the mirror is a no-op on its own output', () => {
  const { JSDOM: J } = require('jsdom');
  const d = require('../../../lib/core/inline-code-directives.js');

  /** The runtime's transformInlinePills, reproduced exactly. */
  function pass(doc) {
    for (const code of [...doc.querySelectorAll('section code')]) {
      if (code.closest('pre')) continue;
      if (code.hasAttribute(d.ESCAPED_ATTR)) continue;
      const text = code.textContent || '';
      const unescaped = d.escapedText(text);
      if (unescaped !== null) {
        code.textContent = unescaped;
        code.setAttribute(d.ESCAPED_ATTR, '');
        continue;
      }
      const el = d.renderElement(doc, text);
      if (el) code.replaceWith(el);
    }
  }

  test('an escaped span survives repeated passes', () => {
    // THE DEFECT THIS PINS. Stripping the backslash is destructive: `\\{LIVE}` becomes
    // `{LIVE}`, which is a valid INPUT to this same grammar. Before the guard, pass 2
    // turned the literal the author asked for into the pill they asked to avoid — and
    // `runAllContentTransforms()` runs many times per document, so the literal existed
    // for one frame.
    //
    // A SINGLE-PASS TEST CANNOT SEE THIS, which is why it is here and not in the fidelity
    // probe: that harness boots the runtime once, so engine output and
    // runtime-after-one-pass agree and the arm is green while the escape is broken.
    const doc = new J('<section><ul><li><code>\\{LIVE}</code></li><li><code>\\[x]</code></li></ul></section>').window.document;
    const after = [];
    for (let i = 0; i < 4; i++) { pass(doc); after.push(doc.querySelector('ul').innerHTML); }
    assert.equal(after[0], after[1], 'pass 2 changed what pass 1 produced');
    assert.equal(after[1], after[2]);
    assert.equal(after[2], after[3]);
    assert.match(after[0], /<code[^>]*>\{LIVE\}<\/code>/, 'the escaped pill did not stay literal');
    assert.doesNotMatch(after[3], /lat-pill/, 'an escaped span became a pill');
    assert.doesNotMatch(after[3], /lat-state/, 'an escaped span became a mark');
  });

  test('the mirror is a no-op on markup the ENGINE already resolved', () => {
    // The second surface, and the one a repeat-pass test alone would miss: the docs Studio
    // composes engine-rendered HTML and the runtime into ONE document, so the backslash is
    // already gone before the mirror's FIRST pass. Without a mark on the element there is
    // nothing left to distinguish "already resolved" from "a live directive".
    const engineOutput = `<section><p><code ${d.ESCAPED_ATTR}="">{LIVE}</code> and <code ${d.ESCAPED_ATTR}="">[x]</code></p></section>`;
    const doc = new J(engineOutput).window.document;
    const before = doc.querySelector('p').innerHTML;
    pass(doc); pass(doc);
    assert.equal(doc.querySelector('p').innerHTML, before, 'the mirror rewrote engine output');
  });

  test('a LIVE directive still converts — the guard is not a blanket skip', () => {
    const doc = new J('<section><p><code>{LIVE}</code> <code>[x]</code></p></section>').window.document;
    pass(doc);
    const html = doc.querySelector('p').innerHTML;
    assert.match(html, /lat-pill/);
    assert.match(html, /lat-state/);
  });
});

// THE SECOND SET (engineering/decisions/2026-10-18-checks.md §8, §12 decision 4, §19): the ten chart statuses are the
// registry's `progress` set, in the same shape as the six checks. The chart family's stylesheet cannot import the
// registry, so these hold its paint to the table, as the tests above hold the check's.
describe('state-marks — the statuses are the registry\'s second set, in one shape', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const css = fs.readFileSync(path.resolve(__dirname, '../../../lib/plugins/chart-family/chart-family.styles.css'), 'utf8');
  const { STATUSES, SETS, SHARED_COLUMNS, DRAWINGS, CHECKS } = marks;

  test('both sets carry the shared columns, every mark is one of the drawings, ids are unique per set', () => {
    assert.deepEqual(Object.keys(SETS), ['answers', 'progress']);
    for (const [name, rows] of Object.entries(SETS)) {
      for (const row of rows) {
        for (const col of SHARED_COLUMNS) assert.ok(col in row, `${name}.${row.id} lacks ${col}`);
        assert.ok(row.mark === null || DRAWINGS.includes(row.mark), `${name}.${row.id}: ${row.mark} is not a drawing`);
        assert.ok(Object.isFrozen(row), `${name}.${row.id} is mutable`);
      }
      assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, `${name}: duplicate id`);
    }
  });

  test('the chart status kernels are read from the registry, unchanged', () => {
    const { CHART_STATUS, SPOKEN_STATUS } = require('../../../lib/core/chart-status.js');
    const { STATUS_MARK, MARK_PATH } = require('../../../lib/core/status-marks.js');
    // The legend order and the words, as they shipped before the join.
    assert.deepEqual([...CHART_STATUS], ['on-track', 'done', 'live', 'at-risk', 'warn', 'blocked', 'fail', 'pilot', 'decision', 'deferred']);
    assert.equal(SPOKEN_STATUS.warn, 'warning');
    assert.equal(SPOKEN_STATUS.decision, 'a decision point');
    for (const s of STATUSES) {
      assert.equal(STATUS_MARK[s.id], s.mark, s.id);
      assert.ok(MARK_PATH[s.mark], `${s.id}: no SVG path for ${s.mark}`);
    }
    assert.equal(STATUS_MARK.pass, 'check', 'the check id a chart may stamp draws its check');
  });

  test('the chart family draws each status with the registry\'s mark and paints it in its role', () => {
    const markRules = [...css.matchAll(/:is\(section\.chart-frame, figure\.chart-frame\) (:is\([^{]*\)|\[data-s="[a-z-]+"\]) \{ --status-mark: var\(--mark-([a-z]+)-bold\); \}/g)];
    const drawnWith = {};
    for (const [, sel, mark] of markRules) for (const [, id] of sel.matchAll(/data-s="([a-z-]+)"/g)) drawnWith[id] = mark;
    const hueRules = [...css.matchAll(/((?::is\(section\.chart-frame, figure\.chart-frame\) \.chart-status\[data-s="[a-z-]+"\],?\s*)+)\{\s*--chart-status-hue: var\(--state-([a-z]+)-hue\)/g)];
    const painted = {};
    for (const [, sels, role] of hueRules) for (const [, id] of sels.matchAll(/data-s="([a-z-]+)"/g)) painted[id] = role;
    for (const s of STATUSES) {
      assert.equal(drawnWith[s.id], s.mark, `${s.id}: the chart family draws ${drawnWith[s.id]}, the registry says ${s.mark}`);
      assert.equal(painted[s.id], s.role, `${s.id}: the chart family paints ${painted[s.id]}, the registry says ${s.role}`);
    }
  });

  // §8 asked for the overlap to be TESTED, not decided. `sharesDrawingWith` records it, and this holds it to the drawings: a
  // status shares an answer's drawing exactly when it names that answer. The result: done and on-track draw yes;
  // warn and at-risk draw partly; fail and blocked draw no; deferred draws does-not-apply (a slash), although in
  // meaning it is closer to open, "not yet". live, pilot and decision draw a dot, which no answer has.
  test('the overlap: a status names the answer whose drawing it shares, and no other', () => {
    for (const s of STATUSES) {
      const same = CHECKS.filter((c) => c.mark === s.mark).map((c) => c.id);
      assert.deepEqual(s.sharesDrawingWith ? [s.sharesDrawingWith] : [], same, `${s.id}: drawn as ${s.mark}, shared by ${same.join(', ') || 'no answer'}`);
    }
  });
});
