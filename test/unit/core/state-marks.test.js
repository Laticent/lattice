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
const marks = require('../../../lib/core/state-marks.js');

describe('state-marks — the six markers', () => {
  const EXPECTED = {
    '[x]': { sem: 'pass', shape: 'state-full', label: 'done' },
    '[-]': { sem: 'warn', shape: 'state-half', label: 'partial' },
    '[!]': { sem: 'fail', shape: 'state-empty', label: 'no' },
    '[?]': { sem: 'unknown', shape: 'state-unknown', label: 'unknown' },
    '[ ]': { sem: 'todo', shape: 'state-todo', label: 'to do' },
    '[/]': { sem: 'skip', shape: 'state-slashed', label: 'skipped' },
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
      assert.ok(marks.LEADING_MARKER_RE.test(`[${m}] rest`), `LEADING_MARKER_RE misses [${m}]`);
      assert.ok(marks.LEADING_MARKER_PREFIX_RE.test(`[${m}]`), `LEADING_MARKER_PREFIX_RE misses [${m}]`);
    }
    for (const bad of ['[X] a', '[~] a', '[>] a', ' [x] a', '[xx] a']) {
      assert.equal(marks.LEADING_MARKER_RE.test(bad), false, bad);
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
    const PRIVATE = /\[x\\-(?:!\? )?\/ ?\]|\[x\\-\/ \]/;
    const EXEMPT = new Set(['lib/core/state-marks.js', 'lib/core/matrix-grid-cells.js']);
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
    assert.deepEqual(offenders, [], `retyped marker class — build it from MARKER_CLASS in lib/core/state-marks.js:\n  ${offenders.join('\n  ')}`);
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
        `${rel} defines its own stateClassesFor — import it from lib/core/state-marks.js`,
      );
      assert.match(src, /state-marks/, `${rel} should import the kernel`);
    }
  });
});

describe('inline-code-directives — the escape, on both paths', () => {
  const d = require('../../../lib/core/inline-code-directives.js');

  test('a backslash escapes what would have dispatched, and shows the literal', () => {
    assert.equal(d.escapedText('\\{LIVE}'), '{LIVE}');
    assert.equal(d.escapedText('\\[x]'), '[x]');
    assert.equal(d.escapedText('\\{BETA}:tag:c4'), '{BETA}:tag:c4');
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
