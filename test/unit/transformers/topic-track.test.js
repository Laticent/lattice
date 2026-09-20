/**
 * topic-track — the derived sibling track.
 *
 * The behaviours pinned here are the ones whose failure is SILENT: a track that
 * marks the wrong item, a track that leaks across a section boundary, an
 * authored list that gets overwritten, and a second run that appends a second
 * track. None of them throws; each produces a plausible slide that lies.
 */
const test = require('node:test');
const assert = require('node:assert');
const tt = require('../../../lib/transformers/topic-track');
// The kernel's own readers, not hand-rolled regexes. `/<[^>]+>/g` ends a tag at
// the first `>`, including one inside a quoted attribute — which is the defect
// this suite exists to catch, so a test helper must not contain it. CodeQL flags
// the shape as incomplete sanitization for the same reason.
const { maskInert, stripTags } = require('../../../lib/core/top-level-h2');

const S = (cls, inner) => `<section class="${cls}">${inner}</section>`;
const topic = (name) => S('topic', `<h2>${name}</h2><p>A claim.</p>`);
// Comments are stripped first: a `<ul class="tile-track">` quoted inside one is
// not a track, and `querySelectorAll` on the DOM arm cannot see it either — so
// counting it here would report a parity failure the product does not have.
const tracks = (html) =>
  [...maskInert(String(html)).matchAll(/<ul class="tile-track"[^>]*>([\s\S]*?)<\/ul>/g)].map((m) =>
    [...m[1].matchAll(/<li( class="on")?>(.*?)<\/li>/g)].map((li) => ({
      name: li[2], on: Boolean(li[1]),
    })));

const DECK =
  S('title', '<h1>D</h1>') +
  S('divider', '<h2>One</h2>') + topic('Alpha') + S('content', '<h2>B</h2>') + topic('Beta') +
  S('divider', '<h2>Two</h2>') + topic('Gamma') + topic('Delta');

test('every topic slide in a section gets the whole section, marked at its own position', () => {
  const t = tracks(tt.applyToHtml(DECK));
  assert.deepEqual(t.map((x) => x.map((i) => i.name)), [
    ['Alpha', 'Beta'], ['Alpha', 'Beta'], ['Gamma', 'Delta'], ['Gamma', 'Delta'],
  ]);
  assert.deepEqual(t.map((x) => x.findIndex((i) => i.on)), [0, 1, 0, 1]);
});

test('a divider resets the section, so a track never leaks across one', () => {
  const t = tracks(tt.applyToHtml(DECK));
  assert.ok(!t[0].some((i) => i.name === 'Gamma'), 'section one must not list section two');
  assert.ok(!t[2].some((i) => i.name === 'Alpha'), 'section two must not list section one');
});

test('`divider light` resets too — matching how the progress rail counts sections', () => {
  const deck = S('divider', '<h2>One</h2>') + topic('Alpha') + topic('Beta') +
               S('divider light', '<h2>Sub</h2>') + topic('Gamma') + topic('Delta');
  const t = tracks(tt.applyToHtml(deck));
  assert.deepEqual(t.map((x) => x.map((i) => i.name)),
    [['Alpha', 'Beta'], ['Alpha', 'Beta'], ['Gamma', 'Delta'], ['Gamma', 'Delta']]);
});

test('idempotent — a second pass appends no second track', () => {
  const once = tt.applyToHtml(DECK);
  assert.equal(tt.applyToHtml(once), once);
});

test('an authored list is an override: left intact, and withheld from siblings', () => {
  const deck = S('divider', '<h2>One</h2>') +
    S('topic', '<h2>Alpha</h2><ul><li>mine</li></ul>') + topic('Beta') + topic('Gamma');
  const out = tt.applyToHtml(deck);
  assert.ok(out.includes('<li>mine</li>'), 'the authored list survives');
  const t = tracks(out);
  assert.ok(t.every((x) => !x.some((i) => i.name === 'Alpha')),
    'an overridden slide contributes no name, or siblings would list a topic whose own slide disagrees');
});

test('a section with one topic gets no track — a scale of one is not a scale', () => {
  assert.equal(tracks(tt.applyToHtml(S('divider', '<h2>One</h2>') + topic('Alpha'))).length, 0);
});

test('a topic before any divider is in no section, so it gets no track', () => {
  assert.equal(tracks(tt.applyToHtml(topic('Alpha') + topic('Beta'))).length, 0);
});

test('the heading reader is depth-aware — a nested h2 is not the slide title', () => {
  const deck = S('divider', '<h2>One</h2>') +
    S('topic', '<div class="card"><h2>Inner</h2></div><h2>Real</h2>') + topic('Beta');
  const t = tracks(tt.applyToHtml(deck));
  assert.ok(t.every((x) => !x.some((i) => i.name === 'Inner')),
    'a heading inside a component card must never become the topic name');
  assert.ok(t[0].some((i) => i.name === 'Real'));
});

test('a list nested in a blockquote is NOT an override — both adapters agree', () => {
  // The string arm used a bare /<ul[\s>]/, which matched a `> - source note`
  // blockquote list; the DOM arm's `:scope > ul` did not. The two paths then
  // disagreed about whether the slide was overridden, and the string path
  // silently dropped the slide's track AND withheld its name from its siblings,
  // so the surviving tracks asserted a two-topic section that had three.
  const deck = S('divider', '<h2>One</h2>') +
    S('topic', '<h2>Alpha</h2><p>A claim.</p><blockquote><ul><li>Source: v9</li></ul></blockquote>') +
    topic('Beta') + topic('Gamma');
  const t = tracks(tt.applyToHtml(deck));
  assert.equal(t.length, 3, 'the blockquote slide still gets its own track');
  assert.deepEqual(t[0].map((i) => i.name), ['Alpha', 'Beta', 'Gamma'],
    'and every track lists all three topics');
  assert.equal(t[0].findIndex((i) => i.on), 0);
});

test('a topic slide with no heading gets no track, rather than lighting a sibling', () => {
  // It contributed '' to the section, which `shown` dropped — but the slide
  // still got a track whose `on` landed on the NEXT topic, so two consecutive
  // slides claimed to be the same one.
  const deck = S('divider', '<h2>One</h2>') +
    S('topic', '<p>No heading here.</p>') + topic('Beta') + topic('Gamma');
  const t = tracks(tt.applyToHtml(deck));
  assert.equal(t.length, 2, 'only the two named slides get a track');
  assert.deepEqual(t.map((x) => x.findIndex((i) => i.on)), [0, 1],
    'and each lights itself, not its neighbor');
});

// ── the DOM arm ───────────────────────────────────────────────────────────────
// HARD RULE #1 says the two adapters must agree, and until now only one of them
// was tested. Every case below runs BOTH and asserts they match, because a
// divergence is the failure mode that ships a deck rendering one way in the PDF
// and another in Marp.
const { JSDOM } = require('jsdom');

/** Run the DOM arm over the same deck and read its tracks back. */
function domTracks(deckHtml) {
  const slides = deckHtml.replace(/<section class="([^"]*)">/g,
    (_m, c) => `<section data-lattice-slide class="${c}">`);
  const dom = new JSDOM(`<body>${slides}</body>`);
  tt.applyToDom(dom.window.document.body);
  return [...dom.window.document.querySelectorAll('ul.tile-track')].map((ul) =>
    [...ul.children].map((li) => ({ name: li.textContent, on: li.classList.contains('on') })));
}
const bothAgree = (deck) => {
  const a = tracks(tt.applyToHtml(deck));
  const b = domTracks(deck);
  assert.deepEqual(b, a, 'the DOM arm must produce exactly what the HTML arm does');
  return a;
};

test('DOM arm: both adapters agree on the ordinary deck', () => {
  const got = bothAgree(DECK);
  assert.deepEqual(got.map((x) => x.map((i) => i.name)), [
    ['Alpha', 'Beta'], ['Alpha', 'Beta'], ['Gamma', 'Delta'], ['Gamma', 'Delta'],
  ]);
});

test('DOM arm: both agree that a blockquote list is not an override', () => {
  bothAgree(S('divider', '<h2>One</h2>') +
    S('topic', '<h2>Alpha</h2><blockquote><ul><li>note</li></ul></blockquote>') +
    topic('Beta') + topic('Gamma'));
});

test('both agree that a COMMENTED-OUT list is not an override', () => {
  // The string arm counted tag-like text inside `<!-- -->` as real markup while
  // `:scope > ul` never could, so a commented-out draft list made the engine and
  // the runtime disagree about the whole section — the engine dropped the
  // slide's track AND withheld its name from its siblings.
  const got = bothAgree(S('divider', '<h2>One</h2>') +
    S('topic', '<h2>Alpha</h2><p>x</p><!-- draft: <ul><li>d</li></ul> -->') +
    topic('Beta') + topic('Gamma'));
  assert.deepEqual(got[0].map((i) => i.name), ['Alpha', 'Beta', 'Gamma'],
    'the commented slide keeps its own name in the scale');
});

test('both agree when a section mixes an override and a headingless slide', () => {
  bothAgree(S('divider', '<h2>One</h2>') +
    S('topic', '<h2>Over</h2><ul><li>mine</li></ul>') +
    S('topic', '<p>no heading</p>') + topic('Gamma') + topic('Delta'));
});

/* ── THE AUTHORED MARKER ─────────────────────────────────────────────────────
 *
 * These pin the fix for a track that LIT THE WRONG COLUMN on a rendered slide.
 * The marker used to be read in CSS by `li:has(> strong:only-child)`, which
 * looks like "the item is nothing but bold" and is not: `:only-child` counts
 * ELEMENT siblings, so the text node in `- Cost to **win**` is invisible to it
 * and that item lit. Every gate was green while a `topic` headed "Overridden"
 * drew its accent under the column reading "Cost to win", because nothing in
 * `test/` pinned any selector behavior for this component.
 */
const authored = (heading, items) =>
  S('topic', `<h2>${heading}</h2><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`);
const lit = (html) =>
  [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
    .filter((m) => /<li[^>]*\sclass="[^"]*\bon\b/.test(m[0]))
    .map((m) => stripTags(m[1]));

test('emphasis INSIDE a label is not a marker', () => {
  const deck = S('divider', '<h2>S</h2>') +
    authored('Overridden', ['Cost to <strong>win</strong>', 'Payback', 'Overridden']);
  // Lights the heading match, NOT the partly-emphasized label.
  assert.deepEqual(lit(tt.applyToHtml(deck)), ['Overridden']);
});

test('a WHOLLY bold item is the marker, and marking two still lights one', () => {
  const one = S('divider', '<h2>S</h2>') + authored('X', ['<strong>A</strong>', 'B']);
  assert.deepEqual(lit(tt.applyToHtml(one)), ['A']);
  const two = S('divider', '<h2>S</h2>') +
    authored('X', ['<strong>A</strong>', '<strong>B</strong>']);
  assert.deepEqual(lit(tt.applyToHtml(two)), ['A']);
});

test('a LOOSE authored list marks through its <p> wrapper', () => {
  const deck = S('divider', '<h2>S</h2>') +
    authored('X', ['<p>A</p>', '<p><strong>B</strong></p>']);
  assert.deepEqual(lit(tt.applyToHtml(deck)), ['B']);
});

test('an author who marks nothing gets the item matching this slide heading', () => {
  const deck = S('divider', '<h2>S</h2>') + authored('Payback', ['Cost to win', 'Payback']);
  assert.deepEqual(lit(tt.applyToHtml(deck)), ['Payback']);
});

test('the marker is stamped with NO divider in the deck — this is the gallery', () => {
  // `applyToHtml` used to return early when the deck had no sections at all, so
  // every gallery sample rendered a scale with nothing lit.
  const gallery = authored('Payback', ['Cost to win', '<strong>Payback</strong>']);
  assert.deepEqual(lit(tt.applyToHtml(gallery)), ['Payback']);
});

test('marking is idempotent and both adapters pick the same item', () => {
  const deck = S('divider', '<h2>S</h2>') +
    authored('Overridden', ['Cost to <strong>win</strong>', '<strong>Payback</strong>', 'Overridden']);
  const once = tt.applyToHtml(deck);
  assert.equal(tt.applyToHtml(once), once);
  assert.deepEqual(lit(once), ['Payback']);

  const dom = new JSDOM(`<body>${deck.replace(/<section /g, '<section data-lattice-slide ')}</body>`);
  tt.applyToDom(dom.window.document.body);
  const domLit = [...dom.window.document.querySelectorAll('li.on')].map((li) => li.textContent);
  assert.deepEqual(domLit, ['Payback']);
});

test('a tile-track quoted inside a COMMENT is not our track — both adapters agree', () => {
  // The idempotence sentinel used to be a raw `inner.includes('class="tile-track"')`
  // over the whole section, so a commented-out track made the engine treat the
  // slide as overridden and withhold its name from every sibling, while the DOM
  // arm's `:scope > ul.tile-track` was unmoved.
  const deck = S('divider', '<h2>S</h2>') + topic('Alpha') +
    S('topic', '<h2>Beta</h2><!-- <ul class="tile-track"><li>x</li></ul> -->') + topic('Gamma');
  assert.deepEqual(
    tracks(tt.applyToHtml(deck)).map((t) => t.map((i) => i.name)),
    [['Alpha', 'Beta', 'Gamma'], ['Alpha', 'Beta', 'Gamma'], ['Alpha', 'Beta', 'Gamma']],
  );
  assert.ok(bothAgree(deck));
});

/* ── THE SHAPES ROUND FOUR FOUND ─────────────────────────────────────────────
 *
 * Every one of these produced a visibly wrong slide or an engine↔runtime split
 * while the whole gate suite was green, so each is pinned by the behavior a
 * reader would see rather than by the internals that produce it.
 */
test('a SUB-BULLET is never the marker — the nested li CSS cannot reach', () => {
  // The mark used to land on the nested `<li>`, which `section.topic > ul > li.on`
  // never matches. The pick was spent, so the heading fallback never ran either
  // and the slide lit NOTHING — strictly worse than having no marker rule.
  const inner = '<h2>Other</h2><ul>'
    + '<li>Cost<ul><li>detail</li><li><strong>Payback</strong></li></ul></li>'
    + '<li>Other</li></ul>';
  const out = tt.applyToHtml(S('divider', '<h2>S</h2>') + S('topic', inner));
  const marked = [...out.matchAll(/<li[^>]*\sclass="[^"]*\bon\b[^"]*"[^>]*>([\s\S]*?)<\/li>/g)]
    .map((m) => stripTags(m[1]).trim());
  assert.deepEqual(marked, ['Other']);
  assert.ok(bothAgree(S('divider', '<h2>S</h2>') + S('topic', inner)) !== undefined);
});

test('a slide that already carries a track does not cost its SIBLINGS theirs', () => {
  // `hasTrack` returned before `ti += 1` while `collectSections` still pushed a
  // slot, so the counter and the name array fell out of register and every later
  // topic slide in the section silently lost its whole band — engine only.
  const pre = '<h2>Beta</h2><ul class="tile-track" aria-hidden="true">'
    + '<li class="on">Beta</li><li>z</li></ul>';
  const deck = S('divider', '<h2>Sec</h2>') + topic('Alpha') + S('topic', pre) + topic('Gamma');
  const got = tracks(tt.applyToHtml(deck)).map((t) => t.map((i) => i.name));
  assert.deepEqual(got, [['Alpha', 'Gamma'], ['Beta', 'z'], ['Alpha', 'Gamma']]);
});

test('a commented-out track followed by a real list is not our track', () => {
  // The tail regex is greedy and comment-blind, so a quoted track plus ANY later
  // `</ul>` matched and the engine skipped a slide the DOM arm marked.
  const inner = '<h2>Alpha</h2><!-- <ul class="tile-track"><li>old</li></ul> -->'
    + '<ul><li>Alpha</li><li>Beta</li></ul>';
  const out = tt.applyToHtml(S('divider', '<h2>S</h2>') + S('topic', inner));
  assert.match(out, /<li class="on">Alpha<\/li>/);
  bothAgree(S('divider', '<h2>S</h2>') + S('topic', inner));
});

test('an existing class on an item is extended, never duplicated', () => {
  // A second `class` attribute is ignored by HTML — first one wins — so the mark
  // silently never applied on `class='x'` or `class=x`.
  for (const attr of ['class="x"', "class='x'", 'class=x']) {
    const inner = `<h2>H</h2><ul><li ${attr}><strong>A</strong></li><li>B</li></ul>`;
    const out = tt.applyToHtml(S('divider', '<h2>S</h2>') + S('topic', inner));
    const li = out.match(/<li[^>]*><strong>A<\/strong><\/li>/)[0];
    assert.equal((li.match(/class\s*=/g) || []).length, 1, li);
    assert.match(li, /class="x on"/);
  }
});

test('an unrelated class containing "on" does not read as the marker', () => {
  const inner = '<h2>H</h2><ul><li class="on-hold">X</li><li><strong>Y</strong></li></ul>';
  const out = tt.applyToHtml(S('divider', '<h2>S</h2>') + S('topic', inner));
  assert.match(out, /<li class="on"><strong>Y<\/strong><\/li>/);
});

test('a comment inside an item does not hide its marker from the string arm', () => {
  const inner = '<h2>H</h2><ul><li>A</li><li><!-- keep --><strong>G</strong></li></ul>';
  bothAgree(S('divider', '<h2>S</h2>') + S('topic', inner));
  const out = tt.applyToHtml(S('divider', '<h2>S</h2>') + S('topic', inner));
  assert.match(out, /class="on"><!-- keep --><strong>G<\/strong>/);
});

test('an unmatched inline end tag in the list does not abandon the slide', () => {
  // `topLevelUlRange` used a naive depth counter, went negative on `</b>` and
  // returned null, so the whole list was skipped without a mark.
  const inner = '<h2>H</h2><ul><li>a</b></li><li><strong>B</strong></li></ul>';
  const out = tt.applyToHtml(S('divider', '<h2>S</h2>') + S('topic', inner));
  assert.match(out, /<li class="on"><strong>B<\/strong><\/li>/);
});

test('a heading carrying raw HTML with a `>` in an attribute keeps clean labels', () => {
  const deck = S('divider', '<h2>S</h2>')
    + S('topic', '<h2>Alpha <span title="a > b">x</span></h2><p>c</p>')
    + topic('Beta');
  const names = tracks(tt.applyToHtml(deck))[0].map((i) => i.name);
  assert.deepEqual(names, ['Alpha x', 'Beta']);
});

test('markdown-it\'s inline-list shape reads the same on both arms', () => {
  // `<p>text <ul>…</ul></p>` is what markdown-it emits for an inline list, and a
  // browser closes the paragraph so the list IS a direct child. A walk that kept
  // the `<p>` open derived a track here and honored an override there.
  const inner = '<h2>Alpha</h2><p>A claim: <ul><li>inline</li></ul></p>';
  bothAgree(S('divider', '<h2>S</h2>') + S('topic', inner) + topic('Beta'));
});
