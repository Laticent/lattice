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

const S = (cls, inner) => `<section class="${cls}">${inner}</section>`;
const topic = (name) => S('topic', `<h2>${name}</h2><p>A claim.</p>`);
const tracks = (html) =>
  [...html.matchAll(/<ul class="tile-track"[^>]*>([\s\S]*?)<\/ul>/g)].map((m) =>
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
