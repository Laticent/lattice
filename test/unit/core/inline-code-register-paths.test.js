/**
 * BOTH RENDER PATHS HONOR `inline-code: literal`, AND THEY AGREE (HARD RULE #1).
 *
 * The register is only worth having if it works on the path the deck actually takes, and
 * the two paths reach it differently on purpose: the engine reads the deck's front matter,
 * the runtime reads the class the engine stamps — which is the one signal that also exists
 * on a raw Marp preview, where marp-core's own `class:` directive supplies it and nothing
 * of ours can see front matter at all.
 *
 * A SEPARATE FILE FROM resolve-inline-code.test.js because these are different claims.
 * That one pins the kernel's decisions; this one pins that the decisions are actually
 * WIRED — a kernel returning the right answer into a call site nobody added is exactly the
 * shape of defect the name-match assertion in marp-fidelity-render.test.js used to let
 * through.
 *
 * EVERY CASE CARRIES ITS CONTROL. "No pills" is trivially true of a document with no pill
 * in it, so each arm renders the same body twice — once literal, once rich — and asserts
 * the difference.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..', '..');
const latticeEngine = require(path.join(ROOT, 'lib/engine'));
const { INLINE_CODE_LITERAL } = require(path.join(ROOT, 'lib/core/resolve-inline-code.js'));

const BODY = 'Prose with `{ALPHA}:c2` and `[x]` and `\\[y]` and plain `getUserId()`.';
const deck = (fm) => ['---', 'theme: indaco', ...fm, '---', '', '# Deck', '', BODY].join('\n');

const render = (fm) => new JSDOM(latticeEngine.createEngine().render(deck(fm)).html).window.document;
const counts = (doc) => ({
  pills: doc.querySelectorAll('.lat-pill').length,
  marks: doc.querySelectorAll('.lat-state').length,
  codes: [...doc.querySelectorAll('section code')].map((e) => e.textContent),
});

test('the engine renders every span literally under inline-code: literal', () => {
  const off = counts(render(['inline-code: literal']));
  const on = counts(render([]));

  // THE CONTROL FIRST: without the register the grammar runs, so the arm below is
  // measuring the register rather than an empty document.
  assert.equal(on.pills, 1);
  assert.equal(on.marks, 1);

  assert.equal(off.pills, 0);
  assert.equal(off.marks, 0);
  assert.deepEqual(off.codes, ['{ALPHA}:c2', '[x]', '\\[y]', 'getUserId()']);
});

test('a literal deck keeps a backslash the author typed', () => {
  // Deliberate, and worth pinning because the opposite is defensible until you think
  // about it: with no grammar running there is nothing to escape FROM, so stripping the
  // backslash would silently edit the author's text. `\[y]` is not a valid escape target
  // anyway (`[y]` is not a marker), so it survives on BOTH settings — which is the
  // regex-safety property the grammar promises.
  assert.ok(counts(render(['inline-code: literal'])).codes.includes('\\[y]'));
  assert.ok(counts(render([])).codes.includes('\\[y]'));
});

test('the register stamps the class every section, which is what the runtime gates on', () => {
  const doc = render(['inline-code: literal']);
  const sections = [...doc.querySelectorAll('section')];
  assert.ok(sections.length > 0, 'anti-vacuity: the deck must have rendered a section');
  for (const s of sections) {
    assert.ok(
      s.classList.contains(INLINE_CODE_LITERAL),
      'every section needs the token — the runtime reads it per section via closest()',
    );
  }
  // And the default deck carries no trace of the register.
  for (const s of render([]).querySelectorAll('section')) {
    assert.equal(s.classList.contains(INLINE_CODE_LITERAL), false);
  }
});

test('an unknown value leaves the deck rendering, and stamps nothing', () => {
  // The failure `unknown-inline-code` warns about: `off` looks like it worked and did not.
  const bogus = counts(render(['inline-code: off']));
  assert.equal(bogus.pills, 1, "'off' is not a known value — the grammar must keep running");
  assert.equal(bogus.marks, 1);
  for (const s of render(['inline-code: off']).querySelectorAll('section')) {
    assert.equal(s.classList.contains(INLINE_CODE_LITERAL), false);
  }
});
