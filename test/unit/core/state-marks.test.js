/**
 * The inline `[x]` state mark, and the kernel both render paths now share.
 *
 * The negative arms carry the weight, for the same reason they do in the pill tests:
 * this grammar reads every single-backtick span in every deck, and `[` opens a CSS
 * attribute selector, an array index and a citation. Only the four exact
 * three-character forms may dispatch.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const marks = require('../../../lib/core/state-marks.js');

describe('state-marks — the four markers', () => {
  const EXPECTED = {
    '[x]': { sem: 'pass', shape: 'state-full', label: 'done' },
    '[-]': { sem: 'warn', shape: 'state-half', label: 'partial' },
    '[/]': { sem: 'skip', shape: 'state-slashed', label: 'skipped' },
    '[ ]': { sem: 'todo', shape: 'state-todo', label: 'to do' },
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

  test('`[ ]` takes the NEUTRAL reading inline, not verdict-grid\'s "not met"', () => {
    // A bare `[ ]` in a sentence is an unchecked box. verdict-grid keeps the red ✕ for
    // a criterion that was assessed and failed, which is a different claim.
    assert.equal(marks.parseInlineState('[ ]').sem, 'todo');
    assert.equal(marks.stateClassesFor(' ', false).sem, 'fail', 'the non-neutral reading still exists');
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
    '[?]', '[!]', '[*]', '[X]',          // near-misses; the vocabulary is these four, lowercase
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

  test('the marker set is exactly four, and nothing has crept in', () => {
    assert.deepEqual([...marks.MARKERS].sort(), [' ', '-', '/', 'x']);
  });
});

describe('state-marks — one kernel, no duplicate decision', () => {
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
    for (const src of ['\\[a-z]', '\\d+', '\\n', '\\{ ok, scene }', '\\[?]', '\\[0]']) {
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
