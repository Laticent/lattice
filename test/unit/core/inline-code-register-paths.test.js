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
const deck = (fm, body) => ['---', 'theme: indaco', ...fm, '---', '', body || `# Deck\n\n${BODY}`].join('\n');

const render = (fm, body) => new JSDOM(latticeEngine.createEngine().render(deck(fm, body)).html).window.document;
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


/**
 * THE RUNTIME HALF — added after an independent checker pointed out that this file's own
 * docblock claimed both paths and every arm above goes through `lib/engine`.
 *
 * That is the exact shape of defect the docblock cites: deleting
 * `if (isLiteralInlineCode(code)) continue;` from `lib/runtime/index.js` failed NOTHING in
 * the tree, and the e2e spec could not see it either — the Studio's engine has already
 * returned early, so the mirror has no pill left to skip. The checker also found the real
 * bug behind that blind spot: the register was never added to the runtime's own
 * deck-register mirror, so `inline-code: literal` never became a class there at all.
 *
 * Boots the REAL `dist/lattice-runtime.js` over marp-core-shaped markup, with the sibling
 * `.md` supplied the way `deckFrontMatterSource` fetches it — the path where the runtime is
 * the ONLY implementation and nothing of the engine's work is present.
 */

const fs = require('node:fs');
const MarkdownIt = require('markdown-it');
const RUNTIME_BUNDLE = path.join(ROOT, 'dist', 'lattice-runtime.js');

/** Boot the bundle over marp-shaped markup, with `fetch` answering the deck source. */
function renderRuntime(deckSource, markup) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${markup}</body></html>`, {
    url: 'https://example.test/deck.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  dom.window.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve(deckSource) });
  const el = dom.window.document.createElement('script');
  el.textContent = fs.readFileSync(RUNTIME_BUNDLE, 'utf8');
  dom.window.document.body.appendChild(el);
  return new Promise((r) => setTimeout(() => r(dom.window.document), 1000));
}

const marpShaped = () => `<section class="content">${new MarkdownIt().render(BODY)}</section>`;

test('the RUNTIME honors inline-code: literal, with the engine nowhere in the picture', async () => {
  const off = counts(await renderRuntime(deck(['inline-code: literal']), marpShaped()));
  const on = counts(await renderRuntime(deck([]), marpShaped()));

  // THE CONTROL FIRST — the same bundle, same markup, register absent. Without this the
  // arm below passes on a runtime that draws nothing at all.
  assert.equal(on.pills, 1, 'control: the grammar must run when the deck does not turn it off');
  assert.equal(on.marks, 1);

  assert.equal(off.pills, 0);
  assert.equal(off.marks, 0);
  // `\[y]` is not a valid escape target, so it survives with its backslash on both paths.
  assert.deepEqual(off.codes, ['{ALPHA}:c2', '[x]', '\\[y]', 'getUserId()']);
});

test('the runtime reaches the register through its own deck-register mirror', async () => {
  // The mirror is a SEPARATE list from the engine's, and the register was missing from it
  // while every gate in the tree stayed green. A sibling register in the same deck is the
  // control: if `eyebrow: dot` lands and `inline-code-literal` does not, the fetch worked
  // and this register specifically is absent — which is precisely how it was diagnosed.
  const doc = await renderRuntime(deck(['inline-code: literal', 'eyebrow: dot']), marpShaped());
  const section = doc.querySelector('section');
  assert.ok(section.classList.contains('eyebrow-dot'), 'control: a sibling register must land');
  assert.ok(
    section.classList.contains(INLINE_CODE_LITERAL),
    'inline-code: literal never reached the section — check the runtime deckTokens list',
  );
});


/**
 * THE THREE SHAPES THE FIRST CUT GOT WRONG, each an independent checker's failing input.
 *
 * All three came from one asymmetry: the engine gated on the deck's FRONT MATTER while the
 * runtime gated on the section CLASS. Both now gate on the class, so a per-slide `_class:`,
 * a deck-wide `class:` and the register itself are one mechanism rather than three.
 */

test('a per-slide `_class: inline-code-literal` turns the grammar off for that slide only', () => {
  const doc = render([], `# One\n\n${BODY}\n\n---\n\n<!-- _class: ${INLINE_CODE_LITERAL} -->\n\n# Two\n\n${BODY}`);
  const [first, second] = [...doc.querySelectorAll('section')];
  // The control is the FIRST slide: same body, same deck, grammar running.
  assert.equal(first.querySelectorAll('.lat-pill').length, 1, 'control: slide 1 must still draw');
  assert.equal(first.querySelectorAll('.lat-state').length, 1);
  assert.equal(second.querySelectorAll('.lat-pill').length, 0);
  assert.equal(second.querySelectorAll('.lat-state').length, 0);
});

test('a deck-wide `class: inline-code-literal` works on a Lattice deck too', () => {
  // The spelling the docs teach for raw Marp. Carried into a Lattice deck it used to stamp
  // the token and draw the pills anyway — the same three lines rendering two ways with no
  // warning on either.
  const off = counts(render([`class: ${INLINE_CODE_LITERAL}`]));
  assert.equal(off.pills, 0);
  assert.equal(off.marks, 0);
});

test('header and footer obey the register — chrome is a span like any other', () => {
  // `header:`/`footer:` render through `md.renderInline`, a fresh parse with no slide
  // tokens, so the per-slide gate cannot see them and the answer is handed down through
  // the env. Without that, a literal deck kept drawing pills in exactly the two directives
  // a foreign deck is most likely to carry.
  const fm = ['inline-code: literal', "header: 'hdr `{LABEL}` end'", "footer: 'ship `[x]` now'"];
  const doc = render(fm);
  const chrome = [...doc.querySelectorAll('header, footer')].map((e) => e.innerHTML.trim());
  assert.ok(chrome.length >= 2, 'anti-vacuity: the deck must actually have chrome');
  assert.equal(doc.querySelectorAll('header .lat-pill, footer .lat-pill').length, 0);
  assert.equal(doc.querySelectorAll('header .lat-state, footer .lat-state').length, 0);
  assert.ok(chrome.some((h) => h.includes('<code>{LABEL}</code>')), `header kept its code: ${chrome}`);

  // CONTROL: the same chrome with the register absent MUST draw, or this proves nothing.
  const on = render(fm.slice(1));
  assert.equal(on.querySelectorAll('header .lat-pill').length, 1, 'control: chrome draws when the deck says nothing');
  assert.equal(on.querySelectorAll('footer .lat-state').length, 1);
});
