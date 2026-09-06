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

/** Boot the bundle with the deck's front matter BAKED into the document, as an export does. */
function renderRuntimeBaked(deckSource, markup) {
  const { frontMatterBlock } = require(path.join(ROOT, 'lib/core/deck-front-matter.js'));
  const block = frontMatterBlock(deckSource);
  assert.ok(block, 'anti-vacuity: the baked block must be non-empty, or this is the fetch path in disguise');
  return bootRuntime(`${markup}${block}`, () => Promise.reject(new Error('baked: no fetch expected')));
}

/** Boot the bundle with NO baked block, so it falls back to fetching the sibling `.md`. */
function renderRuntimeFetched(deckSource, markup) {
  return bootRuntime(markup, () => Promise.resolve({ ok: true, text: () => Promise.resolve(deckSource) }));
}

function bootRuntime(body, fetchImpl) {
  return renderRuntime(body, fetchImpl);
}

/** Boot the bundle over marp-shaped markup with a supplied `fetch`. */
function renderRuntime(markup, fetchImpl) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${markup}</body></html>`, {
    url: 'https://example.test/deck.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  dom.window.fetch = fetchImpl;
  const el = dom.window.document.createElement('script');
  el.textContent = fs.readFileSync(RUNTIME_BUNDLE, 'utf8');
  dom.window.document.body.appendChild(el);
  return new Promise((r) => setTimeout(() => r(dom.window.document), 1000));
}

const marpShaped = () => `<section class="content">${new MarkdownIt().render(BODY)}</section>`;

test('the RUNTIME honors inline-code: literal on the BAKED path, engine nowhere in the picture', async () => {
  // BAKED, not fetched, and the distinction is the whole design. Every path that carries a
  // deck today has the front matter here synchronously: the engine reads the source, the
  // Studio renders through the engine first, and an export BAKES its front matter into the
  // document (lib/core/marp-bundle.js). This arm is that third one — the runtime as the
  // only implementation, reading a baked block.
  const off = counts(await renderRuntimeBaked(deck(['inline-code: literal']), marpShaped()));
  const on = counts(await renderRuntimeBaked(deck([]), marpShaped()));

  assert.equal(on.pills, 1, 'control: the grammar must run when the deck does not turn it off');
  assert.equal(on.marks, 1);
  assert.equal(off.pills, 0);
  assert.equal(off.marks, 0);
  assert.deepEqual(off.codes, ['{ALPHA}:c2', '[x]', '\\[y]', 'getUserId()']);
});

test('the fetch fallback draws first — a KNOWN limit of a pre-bake export, pinned deliberately', async () => {
  // An `.html` served beside its `.md` with no baked block is the legacy shape this file's
  // `deckFrontMatterSource` docblock describes: "a deck whose export predates the bake".
  // There the answer arrives after first paint, and this transform replaces the `<code>`
  // before it can know — so the register does NOT take effect.
  //
  // THIS IS PINNED AS A LIMIT RATHER THAN FIXED, and the measurement is the reason. Making
  // the runtime wait for that answer cost EVERY other path a full extra transform pass —
  // 1 pass to 3 on a 40-slide deck with no register in it, 61-170ms to 769-1078ms — and
  // needed a wall-clock deadline that produced a wrong render at 3.2s, then at 10.2s once
  // the guess was enlarged. Re-exporting bakes the front matter and the deck is correct.
  //
  // If this arm ever goes GREEN, someone has made the fetch path work: delete the arm and
  // the caveat in base.registers.docs.md rather than "fixing" the test.
  const off = counts(await renderRuntimeFetched(deck(['inline-code: literal']), marpShaped()));
  assert.equal(off.pills, 1, 'the pre-bake fetch path draws before the register arrives');
});

test('the runtime reaches the register through its own deck-register mirror', async () => {
  // The mirror is a SEPARATE list from the engine's, and the register was missing from it
  // while every gate in the tree stayed green. A sibling register in the same deck is the
  // control: if `eyebrow: dot` lands and `inline-code-literal` does not, the fetch worked
  // and this register specifically is absent — which is precisely how it was diagnosed.
  const doc = await renderRuntimeBaked(deck(['inline-code: literal', 'eyebrow: dot']), marpShaped());
  const section = doc.querySelector('section');
  assert.ok(section.classList.contains('eyebrow-dot'), 'control: a sibling register must land');
  assert.ok(
    section.classList.contains(INLINE_CODE_LITERAL),
    'inline-code: literal never reached the section — check the runtime deckTokens list',
  );
});


test('the RUNTIME gates the deck CHROME too, and gates it on the same class the body uses', async () => {
  // The engine needs a special case for chrome (see `slideIsInlineCodeLiteral` in
  // lib/engine/slides.js: `header:` is rendered by `renderInline`, eleven ruler steps
  // before the deck class exists, so it re-reads the front matter). The runtime needs
  // none — marp-core has already emitted `<header>`/`<footer>` as children of the section,
  // so `closest('section')` finds the class from inside chrome exactly as it does from
  // inside the body. This arm is what lets the docs say the two paths agree on chrome
  // WITHOUT anyone having to trust that reasoning.
  const chrome = (cls) =>
    `<section class="${cls}"><header><code>{HEAD}</code> <code>[x]</code></header>` +
    `<p>Body <code>{ALPHA}:c2</code></p><footer><code>{FOOT}</code></footer></section>`;

  const on = await renderRuntimeBaked(deck([]), chrome('content'));
  const off = await renderRuntimeBaked(deck([]), chrome(`content ${INLINE_CODE_LITERAL}`));

  const inChrome = (doc, sel) => doc.querySelectorAll(`${sel} .lat-pill, ${sel} .lat-state`).length;

  // CONTROL: without the class the grammar runs in chrome, so the arm below measures the
  // gate rather than a header the transform never reached.
  assert.equal(inChrome(on, 'header'), 2, 'control: a rich deck draws a pill and a mark in its header');
  assert.equal(inChrome(on, 'footer'), 1, 'control: and a pill in its footer');

  assert.equal(inChrome(off, 'header'), 0, 'a literal section must leave its header text alone');
  assert.equal(inChrome(off, 'footer'), 0, 'and its footer');
  assert.equal(
    off.querySelectorAll('p .lat-pill').length, 0,
    'control on the other side: the body of the same section is literal too, so the gate ' +
      'is the section class and not something specific to chrome',
  );
});


/**
 * THE THREE SHAPES THE FIRST CUT GOT WRONG, each an independent checker's failing input.
 *
 * All three came from one asymmetry: the engine gated on the deck's FRONT MATTER while the
 * runtime gated on the section CLASS. Both now gate on the class, so a per-slide `_class:`,
 * a deck-wide `class:` and the register itself are one mechanism rather than three.
 *
 * ONE PLACE STILL READS THE SOURCE, and it is not an exception to that: the engine's
 * `header:` / `footer:` chrome is built at the 15th core ruler rule and the deck class is
 * propagated at the 26th, so at the moment chrome is rendered the deck-level token is not
 * on the section yet. `slideIsInlineCodeLiteral` therefore checks the section class FIRST (which
 * is how a per-slide `_class:` reaches chrome) and falls back to re-deriving the
 * deck-level answer from the front matter. Same three inputs, same answer, one ruler step
 * too early to read it off the class.
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

/**
 * THE CLASS BRANCH OF THE CHROME RECONSTRUCTION — the fifth mutant, which survived
 * everything in the tree until a checker went looking for it.
 *
 * The arm above builds its front matter as `['inline-code: literal', 'header: …']`, so
 * `slideIsInlineCodeLiteral` answers on `isLiteralFromSource` and RETURNS before it ever
 * reads a class. Deleting the rest of that function — the half that handles `_class:` and
 * the deck-wide `class:` — failed nothing: 9/9 green with the mutant live and chrome
 * visibly drawing pills. A well-controlled arm covering half a function is still half a
 * function.
 *
 * Both inputs below reach the class branch because the register spelling is absent.
 */

test('chrome obeys a per-slide `_class: inline-code-literal`', () => {
  const body = [
    '# One', '', BODY, '', '---', '',
    `<!-- _class: ${INLINE_CODE_LITERAL} -->`,
    '<!-- _header: "H `{HDR}`" -->',
    '<!-- _footer: "F `[x]`" -->', '',
    '# Two', '', BODY,
  ].join('\n');
  const doc = render(['header: "H `{HDR}`"', 'footer: "F `[x]`"'], body);
  const chrome = [...doc.querySelectorAll('header, footer')];
  assert.ok(chrome.length >= 4, 'anti-vacuity: both slides must carry chrome');
  // Slide 1 is the CONTROL: same chrome text, no token, so it must draw.
  const first = doc.querySelectorAll('section')[0];
  assert.ok(first.querySelector('header .lat-pill'), 'control: slide 1 chrome must draw');
  // Slide 2 carries the token and must not.
  const second = doc.querySelectorAll('section')[1];
  assert.equal(second.querySelectorAll('header .lat-pill, footer .lat-state').length, 0);
});

test('chrome obeys a deck-wide `class:` even on a slide that sets its own `_class:`', () => {
  // Marpit's local directive REPLACES the global one, and the rule that puts the deck-wide
  // token back runs ELEVEN rules after chrome is built — so reading the slide's class alone
  // gave a literal BODY and drawn CHROME inside one section. Measured, then fixed by reading
  // the deck's front matter the same way `deckClassPropagate` does.
  const body = ['# One', '', BODY, '', '---', '', '<!-- _class: content -->', '', '# Two', '', BODY].join('\n');
  const doc = render([`class: ${INLINE_CODE_LITERAL}`, 'header: "H `{HDR}`"', 'footer: "F `[x]`"'], body);
  assert.ok(doc.querySelectorAll('header, footer').length >= 4, 'anti-vacuity: chrome on both slides');
  assert.equal(doc.querySelectorAll('.lat-pill').length, 0, 'no pill anywhere — body or chrome, either slide');
  assert.equal(doc.querySelectorAll('.lat-state').length, 0);
  // And the token really is on both sections, so this is the reconstruction being right
  // rather than the deck being empty.
  for (const s of doc.querySelectorAll('section')) {
    assert.ok(s.classList.contains(INLINE_CODE_LITERAL), `section missing the token: ${s.className}`);
  }
});

/**
 * THE CHROME ENV IS ONE FLAG, NOT THE WHOLE RENDER ENV — the ninth mutant, and the only
 * one that survived a full battery.
 *
 * `lib/engine/slides.js` hands chrome a single boolean. An earlier cut spread
 * `{ ...state.env }` alongside it, which handed `md.renderInline` markdown-it's
 * `references` map — populated by the block parse of the deck BODY. So a `header:` began
 * resolving link-reference definitions written a hundred lines away and rendering as an
 * anchor, on decks that do not use this register at all. That is HARD RULE #18's exact
 * shape: a render change on a surface the feature never set out to touch.
 *
 * It was fixed and then nothing pinned it. Restoring the spread — a one-token edit any
 * author would make while adding a second flag — left all 8,284 tests green.
 */
test('chrome does not resolve link-reference definitions from the deck body', () => {
  const body = ['# One', '', 'Body.', '', '[docs]: https://example.com/evil'].join('\n');
  const doc = render(['header: "See [docs] for detail"'], body);
  const header = doc.querySelector('header');
  assert.ok(header, 'anti-vacuity: the deck must actually render a header');

  assert.equal(header.querySelector('a'), null, `chrome resolved a body link definition: ${header.innerHTML}`);
  assert.match(header.textContent, /See \[docs\] for detail/);

  // CONTROL: a link written INLINE in the chrome still works, so this pins the leak
  // rather than breaking chrome markdown wholesale.
  const inline = render(['header: "See [docs](https://example.com/ok) now"'], body);
  assert.ok(inline.querySelector('header a'), 'an inline chrome link must still render');
});
