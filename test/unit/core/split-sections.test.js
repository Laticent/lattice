/**
 * `splitSections` — the shared HTML-string section walker.
 *
 * The walker exists so every render path answers "where are this document's
 * top-level sections" the same way. It used to answer by scanning for the
 * literal string `<section`, which is not a question a browser ever asks.
 *
 * Most arms here check the walk against a real DOM parse, because that is the
 * standard the string scan was failing. It is NOT a blanket invariant: three
 * divergences are deliberate and are pinned as such (a never-closed section, an
 * unclosed `<style>`, `<template>` content) — see the module docblock for why.
 * Asserting DOM agreement everywhere would either be false or would force the
 * walker into a browser's catastrophic recovery, which for a document tool means
 * silently dropping a deck.
 *
 * The regression that motivated it: one HTML comment quoting `<section
 * class="title">` opened a phantom section whose close never balanced, so the
 * walk surrendered the whole remainder as a single gap and every caller
 * no-opped — `applyFormToHtml` stamped no `data-form`, no `data-frame` and no
 * `form` class on ANY slide. The DOM twin never had the bug, which is why a
 * deck got two different answers depending on which path rendered it
 * (`engineering/decisions/2026-09-20-form-is-not-configurable.md` § Known gaps).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const { splitSections } = require('../../../lib/core/split-sections');
const { applyFormToHtml } = require('../../../lib/integrations/markdown-it/plugins');

const sectionsOf = (html) => splitSections(html).filter((p) => p.type === 'section');
const classesOf = (html) => sectionsOf(html).map((p) => p.cls);

/** The same question, asked of a real parser: the body's DIRECT-CHILD sections. */
function domClassesOf(html) {
  const { document } = new JSDOM(`<body>${html}</body>`).window;
  return [...document.body.children]
    .filter((el) => el.tagName === 'SECTION')
    .map((el) => el.getAttribute('class') || '');
}

/** Round-tripping the pieces must reproduce the input byte for byte. */
function reassemble(html) {
  return splitSections(html)
    .map((p) => (p.type === 'gap' ? p.text : p.openTag + p.inner + '</section>'))
    .join('');
}

const SLIDES = '<section id="s1" class="lattice"><h1>One</h1></section>\n'
  + '<section id="s2" class="lattice"><h2>Two</h2></section>';

describe('splitSections — a tag-shaped string is not a tag', () => {
  // The exact shape that derailed the HTML-stage pass. `<section` inside a
  // comment is text; a browser never opens an element for it.
  test('a comment QUOTING a section tag does not open one', () => {
    const html = `<!-- a note quoting <section class="title"> for docs -->\n${SLIDES}`;
    assert.deepEqual(classesOf(html), ['lattice', 'lattice']);
    assert.deepEqual(classesOf(html), domClassesOf(html), 'string walk and DOM parse disagree');
  });

  // A comment that never closes swallows the rest of the document in a real
  // parser too, so BOTH must report nothing — the twins agree on the loss.
  test('an unterminated comment hides the slides from both walks', () => {
    const html = `<!-- opened and never closed\n${SLIDES}`;
    assert.deepEqual(classesOf(html), []);
    assert.deepEqual(classesOf(html), domClassesOf(html));
  });

  test('a <style> block mentioning a section tag does not open one', () => {
    const html = `<style>/* <section class="title"> */ section { color: red }</style>\n${SLIDES}`;
    assert.deepEqual(classesOf(html), ['lattice', 'lattice']);
    assert.deepEqual(classesOf(html), domClassesOf(html));
  });

  test('a <script> string mentioning a section tag does not open one', () => {
    const html = `<script>var t = "<section class=\\"title\\">";</script>\n${SLIDES}`;
    assert.deepEqual(classesOf(html), ['lattice', 'lattice']);
    assert.deepEqual(classesOf(html), domClassesOf(html));
  });

  // `indexOf('<section')` matched any tag whose name merely STARTS with it.
  test('<sectionfoo> is a different element, not a section', () => {
    const html = '<sectionfoo class="x">no</sectionfoo>\n' + SLIDES;
    assert.deepEqual(classesOf(html), ['lattice', 'lattice']);
  });

  test('a > inside a quoted attribute does not end the open tag early', () => {
    const html = '<section title="a>b" class="lattice"><p>one</p></section>';
    assert.deepEqual(classesOf(html), ['lattice']);
    assert.deepEqual(classesOf(html), domClassesOf(html));
  });
});

// A tokenizer buys correctness on the shapes a string scan cannot see, and it can
// LOSE correctness on the shapes it models badly. Every arm here is a case an
// independent checker found the first cut of this change getting WRONG — each one
// returned zero sections for a whole document, which is the exact whole-deck no-op
// the change exists to remove, arriving through a different door.
describe('splitSections — a malformed tag does not eat the document', () => {
  test("an apostrophe in an UNQUOTED attribute value is an ordinary character", () => {
    // `<div data-tip=it's>` — a quote only opens a value directly after `=`.
    // Treating every quote as a delimiter opened one that never closed, so the
    // scan ran to EOF and every section after it vanished.
    const html = `<section class="a">x</section><div data-x=it's></div><section class="b">y</section>`;
    assert.deepEqual(classesOf(html), ['a', 'b']);
    assert.deepEqual(classesOf(html), domClassesOf(html));
  });

  test('an unbalanced quote in an unquoted value does not eat the rest', () => {
    const html = '<section class="a">x</section><p title=5">z</p><section class="b">y</section>';
    assert.deepEqual(classesOf(html), ['a', 'b']);
    assert.deepEqual(classesOf(html), domClassesOf(html));
  });

  // A browser reads an unclosed <style> as RAWTEXT to EOF. We deliberately do
  // not — see the module docblock. One sentence of prose mentioning the tag
  // otherwise turns the rest of the deck into text.
  test('an UNCLOSED <style> does not swallow the document', () => {
    const html = '<section class="a"><style>p{}</section><section class="b">z</section>';
    assert.deepEqual(classesOf(html), ['a', 'b']);
  });

  test('a section is still found after a tag with an unquoted value', () => {
    const html = '<div data-n=3><section class="a">x</section></div>';
    assert.deepEqual(classesOf(html), ['a']);
  });
});

describe('splitSections — the class attribute is an ATTRIBUTE, not a substring', () => {
  test("a ` class='…'` inside ANOTHER attribute's value is not read as the class", () => {
    const html = `<section data-tip="write class='x' here" class="lattice">y</section>`;
    assert.deepEqual(classesOf(html), ['lattice']);
    assert.deepEqual(classesOf(html), domClassesOf(html));
  });

  test('a single-quoted class is read', () => {
    assert.deepEqual(classesOf(`<section class='lattice'>y</section>`), ['lattice']);
  });

  test('an unquoted class is read', () => {
    assert.deepEqual(classesOf('<section class=lattice>y</section>'), ['lattice']);
  });
});

describe('splitSections — shapes the previous walk got right, preserved', () => {
  // A non-string is a LOUD TypeError, never a silent empty answer: a wrong
  // render instead of a crash is the trade lib/engine refuses at its own door.
  test('a non-string input throws rather than rendering nothing', () => {
    assert.throws(() => splitSections(undefined), TypeError);
  });

  test('a nested section is inner content, not a top-level piece', () => {
    const html = '<section class="outer"><section class="inner">x</section></section>';
    const got = sectionsOf(html);
    assert.equal(got.length, 1);
    assert.equal(got[0].cls, 'outer');
    assert.equal(got[0].inner, '<section class="inner">x</section>');
    assert.deepEqual(classesOf(html), domClassesOf(html));
  });

  test('a section that never closes is surrendered to the trailing gap', () => {
    const html = '<section class="a"><p>dangling';
    assert.deepEqual(sectionsOf(html), []);
    assert.equal(reassemble(html), html);
  });

  test('an unterminated open tag is surrendered to the trailing gap', () => {
    const html = '<section class="a"';
    assert.deepEqual(sectionsOf(html), []);
    assert.equal(reassemble(html), html);
  });

  // A counter that went negative here would report the NEXT close tag as
  // top-level and cut the document in the wrong place.
  test('a stray </section> does not push the depth below zero', () => {
    const html = `</section>\n${SLIDES}`;
    assert.deepEqual(classesOf(html), ['lattice', 'lattice']);
  });

  // The trailing slash is ignored for non-void elements, so a browser reads
  // this as an ordinary open tag — and so does the walk.
  test('<section/> reads as an open tag, as a browser reads it', () => {
    const html = '<section class="a"/><p>x</p></section>';
    assert.deepEqual(classesOf(html), ['a']);
    assert.deepEqual(classesOf(html), domClassesOf(html));
  });

  test('a section with no class reports the empty string', () => {
    assert.deepEqual(classesOf('<section id="x">y</section>'), ['']);
  });

  // KNOWN, ACCEPTED NORMALIZATION. The walker now matches close-tag spellings
  // the old one missed, and every caller reassembles with the literal
  // `'</section>'` (the contract at the top of the module), so an author's
  // `</section >` or `</SECTION>` comes back lowercase and unspaced. The HTML is
  // semantically identical, the engine never emits either spelling, and carrying
  // the close tag through would change the contract at a dozen call sites.
  test('a close tag is normalized on reassembly, and that is deliberate', () => {
    assert.equal(reassemble('<section class="a">x</section >'), '<section class="a">x</section>');
    assert.equal(reassemble('<section class="a">x</SECTION>'), '<section class="a">x</section>');
  });

  test('gaps and sections round-trip to the exact input', () => {
    const html = `lead\n${SLIDES}\ntail`;
    assert.equal(reassemble(html), html);
  });
});

describe('applyFormToHtml — the stamp the derailed walk skipped', () => {
  const stamped = (html) => (html.match(/data-form="2d"/g) || []).length;

  test('every slide is stamped when a comment quotes a section tag', () => {
    const html = `<!-- quoting <section class="title"> -->\n${SLIDES}`;
    // The measured regression was 0 of 2 — no attribute and no `form` class.
    assert.equal(stamped(applyFormToHtml(html)), 2);
    assert.match(applyFormToHtml(html), /class="lattice form"/);
  });

  // The walker now READS a single-quoted class, so the rewrite has to match the
  // same quoting — testing only for `class="` sent this tag down the INSERT
  // branch and appended a second class attribute to the open tag.
  test("a single-quoted class is rewritten, not duplicated", () => {
    const out = applyFormToHtml("<section id='s' class='lattice'><h1>One</h1></section>");
    assert.equal((out.match(/\sclass=/g) || []).length, 1, 'duplicate class attribute');
    assert.equal(stamped(out), 1);
  });

  // The rewrite has to land on the class ATTRIBUTE. Matching a regex over the
  // whole tag rewrote inside a neighboring value instead, which both tore that
  // value open into bogus attributes AND left the real class without `form`, so
  // the slide silently lost its chrome.
  test("a ` class='…'` inside another attribute's value is left alone", () => {
    const out = applyFormToHtml(`<section data-tip="write class='x' here" class="lattice"><h1>A</h1></section>`);
    assert.match(out, /data-tip="write class='x' here"/, 'the neighboring value was rewritten');
    assert.match(out, /\sclass="lattice form"/, 'the real class never got `form`');
  });

  // HTML tag names are case-insensitive and the walker reads them that way, so
  // the stamp must too. A case-SENSITIVE stamp left `<SECTION>` carrying the
  // `form` class but no `data-frame` — the half-stamped state the frame-identity
  // invariant forbids (chrome claimed, Frame identity missing).
  test('an UPPERCASE section is stamped, not half-stamped', () => {
    const out = applyFormToHtml('<SECTION id="s"><h1>A</h1></SECTION>');
    assert.match(out, /data-frame="standard"/, 'no Frame identity');
    assert.match(out, /class="form"/, 'no chrome class');
    assert.match(out, /^<SECTION /, "the author's own spelling was rewritten");
  });

  // The strip that clears a prior stamp must be as case-insensitive as the stamp
  // itself. It was not, so a forged UPPERCASE `DATA-FORM=` survived the strip and
  // the tag came out carrying the attribute twice — the duplicate-attribute
  // hazard the strip exists to close, reopened by making the stamp case-blind.
  test('a forged UPPERCASE data-form is stripped, not duplicated', () => {
    const out = applyFormToHtml('<SECTION DATA-FORM="spatial" DATA-FRAME="evil" class="content">x</SECTION>');
    assert.equal((out.match(/data-form=/gi) || []).length, 1, 'duplicate data-form');
    assert.equal((out.match(/data-frame=/gi) || []).length, 1, 'duplicate data-frame');
    assert.match(out, /data-frame="standard"/, 'the forged value survived');
  });

  // `String.replace` with a replacement STRING gives `$&` its special meaning,
  // so a class value containing it injected the match back into itself.
  test('a `$&` in a class value is not a replacement pattern', () => {
    const out = applyFormToHtml('<section class="a$&b"><h1>A</h1></section>');
    assert.match(out, /class="a\$&b form"/);
  });
});
