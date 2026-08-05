/**
 * Unit: the attribute helpers in lib/core/collections.js.
 *
 * `mergeClass` is EXPORTED and had no direct test, which is how it acquired a
 * boundary bug during #1358 and shipped as far as review: guarding the read on
 * `\sclass=` alone missed a BARE attribute string (`class="a"`, no leading
 * space), fell through to the append branch, and emitted a SECOND `class`
 * attribute — of which a browser keeps the first and silently drops the merged
 * token. No caller hits that today, which is exactly why it needed a test and
 * not a comment.
 *
 * `readAttr` moved to lib/core/section-walk.js in the same change (HARD RULE
 * #15 — the class-only reader added there was a duplicate of this one), so the
 * re-export's contract is pinned here too.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { mergeClass, addClassToFirstTag, setAttr } = require('../../../lib/core/collections');
const { readAttr, readClassAttr } = require('../../../lib/core/section-walk');

describe('collections — class/attribute helpers', () => {
  describe('mergeClass', () => {
    test('merges into an existing class list, leading space or not', () => {
      assert.equal(mergeClass(' class="a"', 'b'), ' class="a b"');
      assert.equal(mergeClass('class="a"', 'b'), 'class="a b"', 'a bare attribute string must MERGE, not append a second class');
    });

    test('never emits two class attributes', () => {
      for (const attrs of ['class="a"', ' class="a"', ' id="x" class="a"', 'class="a" id="x"']) {
        const out = mergeClass(attrs, 'b');
        assert.equal((out.match(/(?:^|\s)class="/g) || []).length, 1, `two class attributes from ${attrs}`);
        assert.match(out, /class="a b"/);
      }
    });

    test('adds the attribute when there is none', () => {
      assert.equal(mergeClass(' id="x"', 'b'), ' id="x" class="b"');
    });

    test('is idempotent on a token already present', () => {
      assert.equal(mergeClass(' class="a b"', 'b'), ' class="a b"');
      assert.equal(mergeClass(' class="b"', 'b'), ' class="b"');
    });

    test('does not merge into `data-class`', () => {
      // The #1358 defect, in its WRITE direction: an unguarded `class="` matches
      // `data-class="` first, so the added token lands in a data attribute and the
      // element never gets the class.
      const out = mergeClass(' data-class="a"', 'b');
      assert.equal(out, ' data-class="a" class="b"');
      assert.match(out, /data-class="a"/, 'the data attribute is left alone');
    });

    test('addClassToFirstTag still merges through it', () => {
      assert.equal(addClassToFirstTag('<li class="x">a</li>', 'y'), '<li class="x y">a</li>');
      assert.equal(addClassToFirstTag('<li>a</li>', 'y'), '<li class="y">a</li>');
      assert.equal(
        addClassToFirstTag('<section data-class="dark" class="dark image">a</section>', 'y'),
        '<section data-class="dark" class="dark image y">a</section>',
      );
    });
  });

  describe('readAttr / readClassAttr', () => {
    const TAG = '<section id="1" data-class="content" class="content no-note form" style="--class:content;">';

    test('reads the resolved class list past a leading data-class', () => {
      assert.equal(readAttr(TAG, 'class'), 'content no-note form');
      assert.equal(readClassAttr(TAG), 'content no-note form');
      assert.equal(readAttr(TAG, 'data-class'), 'content', 'the data attribute is still readable by name');
    });

    test('absent attribute: null from readAttr, empty string from readClassAttr', () => {
      assert.equal(readAttr(TAG, 'nope'), null);
      assert.equal(readClassAttr('<section>'), '');
      assert.equal(readClassAttr(undefined), '');
      assert.equal(readAttr(undefined, 'class'), null);
    });

    test('a bare attribute string with no leading whitespace still reads', () => {
      assert.equal(readClassAttr('class="a b"'), 'a b');
      assert.equal(readAttr('id="x" class="a"', 'id'), 'x');
    });
  });

  describe('setAttr treats the VALUE as literal, never as a replacement pattern', () => {
    // `String.replace` with a string replacement expands `$&`, `` $` ``, `$'` and `$n`.
    // While `setAttr` only ever CREATED attributes that was unreachable; the moment a
    // caller merged into an existing one (#1404's logo vars into the section's style) an
    // author's front matter could splice the surrounding tag into the attribute value.
    // `footer: "Q3 · $'25 plan"` cost the section its `class` and rendered the rest of
    // the open tag as body text on the slide. Found by the HARD RULE #25 red team.
    const WITH_STYLE = '<section id="1" style="--footer:x;">';

    test('$-prefixed sequences survive verbatim on the REPLACE branch', () => {
      for (const val of ["--a:$'", '--a:$&', '--a:$`', '--a:$1', "--a:$'$&$`"]) {
        assert.equal(
          setAttr(WITH_STYLE, 'style', val),
          `<section id="1" style="${val}">`,
          `REGRESSION: setAttr expanded a $-sequence in ${JSON.stringify(val)} — pass a FUNCTION to `
          + 'String.replace, or an author value carrying $\' splices the tag into itself.',
        );
      }
    });

    test('and on the CREATE branch, which was always safe and must stay so', () => {
      const val = "--a:$'";
      assert.equal(setAttr('<section id="1">', 'style', val), `<section id="1" style="${val}">`);
    });

    test('a raw double quote in the value cannot open a sibling attribute', () => {
      // CodeQL `js/incomplete-html-attribute-sanitization`, raised on this PR. A `"` inside
      // a `"`-quoted attribute ENDS it, so an unescaped value lets the remainder become
      // sibling attributes — and `setAttr`'s callers include author-derived text
      // (`data-build-axis`). Escaping is what the HTML grammar requires, not just defense.
      const out = setAttr('<section id="1">', 'data-x', 'a" onload=alert(1) b');
      assert.match(out, /data-x="a&quot; onload=alert\(1\) b"/);
      // The injection shape is a RAW quote followed by what would parse as a new attribute.
      assert.doesNotMatch(out, /"\s+onload=/, 'the payload must not break out into a sibling attribute');
      assert.equal((out.match(/"/g) || []).length, 4, 'exactly two quoted attributes, no stray quote');
    });

    test('an ALREADY-escaped value is preserved, not double-encoded', () => {
      // `prior` values are read back OUT of a tag, so an embedded quote is already `&quot;`.
      // Escaping `&` too would turn that into `&amp;quot;` and corrupt a value this function
      // exists to preserve — which is why only `"` is escaped.
      const out = setAttr('<section style="--f:&quot;q&quot;;">', 'style', '--a:1;--f:&quot;q&quot;;');
      assert.match(out, /style="--a:1;--f:&quot;q&quot;;"/);
      assert.doesNotMatch(out, /&amp;quot;/);
    });

    test('the replace branch still replaces rather than duplicating', () => {
      const out = setAttr(WITH_STYLE, 'style', '--b:2');
      assert.equal((out.match(/style="/g) || []).length, 1);
      assert.match(out, /style="--b:2"/);
    });
  });
});
