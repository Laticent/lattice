/**
 * topic-track — the derived sibling track, and the `_track` override.
 *
 * The behaviours pinned here are the ones whose failure is SILENT: a track that
 * lights the wrong column, a track that leaks across a section boundary, an
 * override that is ignored, and a second run that appends a second track. None
 * of them throws; each produces a plausible slide that lies.
 *
 * TWO ARMS, ALWAYS. Every case that can run on both runs on both (`bothAgree`),
 * because a divergence is the failure mode that ships a deck rendering one way
 * in the PDF and another in the runtime (HARD RULE #1).
 */
const test = require('node:test');
const assert = require('node:assert');
const tt = require('../../../lib/transformers/topic-track');
const { readTopLevelH2Text: readH2 } = require('../../../lib/core/top-level-h2');
// The kernel's own reader, not a hand-rolled regex. `/<[^>]+>/g` ends a tag at
// the first `>`, including one inside a quoted attribute — the defect family
// this suite exists to catch, so a test helper must not contain it. CodeQL flags
// the shape as incomplete sanitization for the same reason.
const { maskInert } = require('../../../lib/core/top-level-h2');

const S = (cls, inner) => `<section class="${cls}">${inner}</section>`;
/** A section that declares an override, the way the engine stamps it. */
const SD = (cls, spec, inner) => `<section class="${cls}" data-track="${spec}">${inner}</section>`;
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

// ── the two arms ──────────────────────────────────────────────────────────────
const { JSDOM } = require('jsdom');

/**
 * Read EVERY `topic` slide's own list — the emitted track, or a stray author
 * list — with its marker, using a real parser on both sides.
 *
 * `:scope > ul`, not `ul.tile-track`: a helper that reads only our own class
 * compares two EMPTY arrays on any slide whose list we did not write, and
 * asserts nothing. That is exactly how a green suite passed while the two arms
 * genuinely disagreed about an authored list (round four of #2245).
 */
function readTopics(html) {
  const dom = new JSDOM(`<body>${html}</body>`);
  return [...dom.window.document.querySelectorAll('section.topic')].map((s) => {
    const ul = s.querySelector(':scope > ul');
    if (!ul) return null;
    return [...ul.children]
      .filter((c) => c.tagName === 'LI')
      .map((li) => ({ name: li.textContent.replace(/\s+/g, ' ').trim(), on: li.classList.contains('on') }));
  });
}

const asSlides = (deckHtml) =>
  deckHtml.replace(/<section class="([^"]*)"/g, (_m, c) => `<section data-lattice-slide class="${c}"`);

const bothAgree = (deck) => {
  const stringArm = readTopics(tt.applyToHtml(asSlides(deck)));
  const dom = new JSDOM(`<body>${asSlides(deck)}</body>`);
  tt.applyToDom(dom.window.document.body);
  const domArm = readTopics(dom.window.document.body.innerHTML);
  assert.deepEqual(domArm, stringArm, 'the DOM arm must produce exactly what the HTML arm does');
  return stringArm;
};

test('DOM arm: both adapters agree on the ordinary deck', () => {
  const got = bothAgree(DECK);
  assert.deepEqual(got.map((x) => x.map((i) => i.name)), [
    ['Alpha', 'Beta'], ['Alpha', 'Beta'], ['Gamma', 'Delta'], ['Gamma', 'Delta'],
  ]);
});

test('both agree that a COMMENTED-OUT track is not a track', () => {
  // The string arm counted tag-like text inside `<!-- -->` as real markup while
  // `:scope > ul.tile-track` never could, so a commented-out draft made the
  // engine and the runtime disagree about the whole section — the engine
  // treated the slide as done and withheld its name from its siblings.
  const got = bothAgree(S('divider', '<h2>One</h2>') +
    S('topic', '<h2>Alpha</h2><p>x</p><!-- <ul class="tile-track"><li>d</li></ul> -->') +
    topic('Beta') + topic('Gamma'));
  assert.deepEqual(got[0].map((i) => i.name), ['Alpha', 'Beta', 'Gamma'],
    'the commented slide keeps its own name in the scale');
});

test('a tile-track quoted inside a COMMENT does not cost the section its names', () => {
  const deck = S('divider', '<h2>S</h2>') + topic('Alpha') +
    S('topic', '<h2>Beta</h2><!-- <ul class="tile-track"><li>x</li></ul> -->') + topic('Gamma');
  assert.deepEqual(
    tracks(tt.applyToHtml(deck)).map((t) => t.map((i) => i.name)),
    [['Alpha', 'Beta', 'Gamma'], ['Alpha', 'Beta', 'Gamma'], ['Alpha', 'Beta', 'Gamma']],
  );
});

test('the engine RECOGNIZES ITS OWN OUTPUT — the track is never the last element', () => {
  // The pipeline appends a pagination span and the berth divs AFTER the track,
  // so a tail-anchored idempotence test (`</ul>\s*$`) never matches real output.
  // Measured before this was fixed: a second pass over the rendered
  // `examples/topic.md` turned 6 tracks into 12 on the string arm while the DOM
  // arm's `:scope > ul.tile-track` was unmoved — a HARD RULE #1 split. Every
  // deck in this file is synthetic and ends at its track, which is the one shape
  // that cannot fail, so the shape below is the one the engine really emits.
  const emitted = '<h2>Beta</h2><p>x</p>'
    + '<ul class="tile-track" aria-hidden="true"><li class="on">Beta</li><li>z</li></ul>'
    + '<span class="lat-pagination">3</span>'
    + '<div class="marker-rail" data-lattice-berth aria-hidden="true"></div>';
  const deck = S('divider', '<h2>S</h2>') + topic('Alpha') + S('topic', emitted) + topic('Gamma');
  const once = tt.applyToHtml(deck);
  assert.equal((once.match(/<ul class="tile-track"/g) || []).length, 3,
    'the pre-tracked slide keeps ONE track, not two');
  assert.equal(tt.applyToHtml(once), once, 'and a further pass changes nothing');
  bothAgree(deck);
});

test('a `tile-track` quoted inside ANOTHER attribute is not our track', () => {
  // `section-walk`'s `readAttr` is quote-blind — `(?:^|\s)class="([^"]*)"` also
  // matches inside another attribute's VALUE — so an ordinary author list whose
  // tag carried ` class="tile-track"` in a `data-` attribute read as an emitted
  // track on the string arm: the slide lost its band AND its name left every
  // sibling's scale, while `:scope > ul.tile-track` was unmoved.
  const inner = '<h2>Alpha</h2><ul data-note=\' class="tile-track"\'><li>x</li></ul>';
  const deck = S('divider', '<h2>S</h2>') + S('topic', inner) + topic('Beta') + topic('Gamma');
  const got = bothAgree(deck);
  assert.deepEqual(got[1].map((i) => i.name), ['Alpha', 'Beta', 'Gamma'],
    "the quoted class must not cost Alpha its place in its siblings' scale");
});

test("the SECTION's own data-track is read the same guarded way", () => {
  // The other `tagAttr` call site, which nothing pinned: a quote-blind reader
  // finds `data-track` inside ANOTHER attribute's value, so a slide that declared
  // no override is treated as having one — it draws that phantom scale and stops
  // contributing its heading to its siblings.
  const decoy = '<section class="topic" data-note=\' data-track="X | [Y]"\'><h2>Alpha</h2></section>';
  const deck = S('divider', '<h2>S</h2>') + decoy + topic('Beta') + topic('Gamma');
  const got = bothAgree(deck);
  assert.deepEqual(got[0].map((i) => i.name), ['Alpha', 'Beta', 'Gamma'],
    'the decoy must not be read as an override');
});

test('an attribute NAME outside the plain charset cannot forge a class', () => {
  // `@class`, `9class`, `[class]` — a name the walker cannot match must not let
  // the `class` tail inside it match as an attribute of its own.
  for (const tag of ['<ul @class="tile-track">', '<ul 9class="tile-track">', '<ul [class]="tile-track">']) {
    const inner = `<h2>Alpha</h2>${tag}<li>x</li></ul>`;
    const deck = S('divider', '<h2>S</h2>') + S('topic', inner) + topic('Beta') + topic('Gamma');
    const got = bothAgree(deck);
    assert.deepEqual(got[1].map((i) => i.name), ['Alpha', 'Beta', 'Gamma'], tag);
  }
});

test('a class that merely CONTAINS the token is not our track', () => {
  const inner = '<h2>Alpha</h2><ul class="tile-tracker"><li>x</li></ul>';
  const deck = S('divider', '<h2>S</h2>') + S('topic', inner) + topic('Beta') + topic('Gamma');
  const got = bothAgree(deck);
  assert.deepEqual(got[1].map((i) => i.name), ['Alpha', 'Beta', 'Gamma']);
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
  bothAgree(deck);
});

/* ── THE `_track` OVERRIDE ────────────────────────────────────────────────────
 *
 * The override used to be a bare markdown `<ul>` on the slide, which made one
 * piece of markup answer two questions the engine had to INFER — is this list
 * the track, and which item is current — and roughly half the defects five
 * review rounds found on #2245 were one of those two answered differently by
 * the two arms. It is now a directive the engine stamps as `data-track`, read
 * once by `lib/core/track-spec.js`, with the track EMITTED by this kernel
 * exactly as a derived one is. These pin that the substitution is complete: the
 * override still draws, still withholds the slide from its siblings, and the
 * marker is the bracket rather than anything about the markup.
 */
test('an override draws its own labels and lights the bracketed one', () => {
  const deck = S('divider', '<h2>One</h2>') +
    SD('topic', 'Cost | Lifetime | [Payback]', '<h2>Payback</h2><p>A claim.</p>') +
    topic('Beta') + topic('Gamma');
  const got = bothAgree(deck);
  assert.deepEqual(got[0], [
    { name: 'Cost', on: false }, { name: 'Lifetime', on: false }, { name: 'Payback', on: true },
  ]);
});

test('an overridden slide contributes no name to its siblings', () => {
  // Otherwise the siblings' derived tracks would list a topic whose own slide
  // shows a different set.
  const deck = S('divider', '<h2>One</h2>') +
    SD('topic', 'mine | yours', '<h2>Alpha</h2><p>A claim.</p>') + topic('Beta') + topic('Gamma');
  const got = bothAgree(deck);
  assert.deepEqual(got[1].map((i) => i.name), ['Beta', 'Gamma']);
  assert.deepEqual(got[2].map((i) => i.name), ['Beta', 'Gamma']);
});

test('marking two lights the first, and neither label keeps its brackets', () => {
  const deck = S('divider', '<h2>S</h2>') +
    SD('topic', '[A] | [B] | C', '<h2>H</h2>');
  const got = bothAgree(deck);
  assert.deepEqual(got[0], [
    { name: 'A', on: true }, { name: 'B', on: false }, { name: 'C', on: false },
  ]);
});

test('marking nothing draws the scale with nothing lit — never a guessed column', () => {
  // The authored-list shape inferred a marker from the slide's own heading when
  // the author marked none. An unmarked directive is now exactly what it says:
  // the columns, none of them current. `lint:deck` says so (`topic-track-spec`).
  const got = bothAgree(S('divider', '<h2>S</h2>') + SD('topic', 'A | B | C', '<h2>B</h2>'));
  assert.deepEqual(got[0].filter((i) => i.on), []);
});

test('an override draws with NO divider in the deck — this is the gallery', () => {
  // The kernel used to return early when the deck had no sections at all, so
  // every gallery sample rendered with no band.
  const got = bothAgree(SD('topic', 'Cost to win | [Payback]', '<h2>Payback</h2>'));
  assert.deepEqual(got[0].map((i) => i.name), ['Cost to win', 'Payback']);
  assert.equal(got[0].findIndex((i) => i.on), 1);
});

test('an override is idempotent — a second pass appends no second track', () => {
  const deck = S('divider', '<h2>S</h2>') + SD('topic', 'A | [B]', '<h2>H</h2>') + topic('Beta');
  const once = tt.applyToHtml(deck);
  assert.equal(tt.applyToHtml(once), once);
});

test('a DEGENERATE override draws nothing, rather than falling back to the derived scale', () => {
  // Declaring `_track` is what opts the slide out of derivation. A single label
  // is not a scale, so the slide composes as one canvas — showing the author a
  // derived track they did not write would be worse, because it looks correct.
  const deck = S('divider', '<h2>S</h2>') +
    SD('topic', 'Only one', '<h2>Alpha</h2>') + topic('Beta') + topic('Gamma');
  const got = bothAgree(deck);
  assert.equal(got[0], null, 'the degenerate slide gets no list at all');
  assert.deepEqual(got[1].map((i) => i.name), ['Beta', 'Gamma'], 'and contributes no name');
});

test('a STRAY list on a topic slide is content, not a track — both arms agree', () => {
  // The contract the directive bought: a `<ul>` is never the track, so the slide
  // derives like any other and the list is left exactly where the author put it.
  // `lint:deck` names it (`topic-track-list`).
  const deck = S('divider', '<h2>One</h2>') +
    S('topic', '<h2>Alpha</h2><ul><li>mine</li></ul>') + topic('Beta') + topic('Gamma');
  const out = tt.applyToHtml(deck);
  assert.ok(out.includes('<li>mine</li>'), 'the stray list is untouched');
  const t = tracks(out);
  assert.equal(t.length, 3, 'every slide, including that one, gets a derived track');
  assert.deepEqual(t[0].map((i) => i.name), ['Alpha', 'Beta', 'Gamma']);
  assert.equal(t[0].findIndex((i) => i.on), 0);
  bothAgree(deck);
});

test('a list nested in a blockquote changes nothing either', () => {
  // The string arm used a bare /<ul[\s>]/ for the old override test, which
  // matched a `> - source note` blockquote list while `:scope > ul` did not —
  // the slide lost its track AND its name on one arm only. Nothing reads a
  // `<ul>` now, so the shape is inert; pinned because it was not.
  const deck = S('divider', '<h2>One</h2>') +
    S('topic', '<h2>Alpha</h2><p>A claim.</p><blockquote><ul><li>Source: v9</li></ul></blockquote>') +
    topic('Beta') + topic('Gamma');
  const t = tracks(tt.applyToHtml(deck));
  assert.equal(t.length, 3);
  assert.deepEqual(t[0].map((i) => i.name), ['Alpha', 'Beta', 'Gamma']);
});

test('an override label carrying an entity reads the same on both arms', () => {
  // The string arm reads `data-track` still ENCODED (it is an attribute value in
  // rendered HTML) and re-emits it; the DOM arm reads it decoded and writes
  // textContent. Both must land on the same rendered text — a double-escape
  // would show `&amp;` on the slide.
  const deck = S('divider', '<h2>S</h2>') + SD('topic', 'R&amp;D | [Payback]', '<h2>H</h2>');
  const got = bothAgree(deck);
  assert.deepEqual(got[0].map((i) => i.name), ['R&D', 'Payback']);
});

test('an empty directive is no override — the slide derives', () => {
  // `<!-- _track: -->` emits no attribute at all (slides.js skips an empty
  // value), and a hand-written `data-track=""` must read the same way rather
  // than opting the slide out of a scale it can still be part of.
  const deck = S('divider', '<h2>S</h2>') + SD('topic', '', '<h2>Alpha</h2>') + topic('Beta');
  const got = bothAgree(deck);
  assert.deepEqual(got[0].map((i) => i.name), ['Alpha', 'Beta']);
});

/* ── THE SHAPES THE STRING ARM ALONE CAN HIT ─────────────────────────────────── */
test('a heading carrying raw HTML with a `>` in an attribute keeps clean labels', () => {
  const deck = S('divider', '<h2>S</h2>')
    + S('topic', '<h2>Alpha <span title="a > b">x</span></h2><p>c</p>')
    + topic('Beta');
  const names = tracks(tt.applyToHtml(deck))[0].map((i) => i.name);
  assert.deepEqual(names, ['Alpha x', 'Beta']);
});

test('an unclosed raw <h2> still contributes its NAME to every sibling', () => {
  // The reader required a `</h2>` and returned null without one, so the engine
  // saw no heading where the runtime saw one and every sibling's track came out
  // a column short on that path alone. A parser lets the heading run to the end,
  // so both arms now read the same name.
  const deck = S('divider', '<h2>S</h2>')
    + S('topic', '<h2>Raw heading<p>A claim.</p>')
    + topic('Beta') + topic('Gamma');
  const names = tracks(tt.applyToHtml(asSlides(deck))).map((t) => t.map((i) => i.name));
  assert.deepEqual(names, [
    ['Raw headingA claim.', 'Beta', 'Gamma'],
    ['Raw headingA claim.', 'Beta', 'Gamma'],
  ]);

  // The malformed slide itself gets NO track, and that is deliberate: appending
  // to a section that leaves an element open puts the track inside it, where it
  // would render as heading text. `appendChild` cannot hit that, so this one
  // shape is the documented limit of a string rewriter against a DOM mutator —
  // the string arm declines instead of emitting a visible defect.
  const out = tt.applyToHtml(asSlides(deck));
  const firstTopic = out.slice(out.indexOf('Raw heading'), out.indexOf('Beta'));
  assert.ok(!firstTopic.includes('tile-track'), 'no track inside the open heading');
});

test('an override declines the same way inside an unclosed element', () => {
  const deck = S('divider', '<h2>S</h2>') + SD('topic', 'A | [B]', '<h2>Raw heading');
  assert.ok(!tt.applyToHtml(deck).includes('tile-track'),
    'the string arm declines rather than parse the track inside the heading');
});

test('a heading start tag closes an open heading, and never nests', () => {
  assert.equal(readH2('<h2>Outer<h2>Inner</h2></h2>'), 'Outer');
  assert.equal(readH2('<h2>A</h3><p>b</p>'), 'A');
  // …and the close tag is found through the tokenizer, so a comment or an
  // attribute value holding `</h2>` does not end it early.
  assert.equal(readH2('<h2>A<!-- </h2> -->B</h2>'), 'AB');
  assert.equal(readH2('<h2><span title="</h2>">A</span></h2>'), 'A');
});

/* ── END TO END, THROUGH THE REAL ENGINE ─────────────────────────────────────
 *
 * The transformer tests above hand it `data-track` directly, so every one of
 * them passes whether or not `track` is a registered directive. This renders the
 * DIRECTIVE, which is what an author writes, and is the only arm that fails if
 * the registration is dropped from lib/engine/directives.js.
 */
test('idempotent against the REAL pipeline, end to end', () => {
  // The guard on the guard: run the engine over the shipped demo deck and hand
  // its output straight back to the transform. Anything that makes the kernel
  // stop recognizing its own emitted track shows up here as a doubled band,
  // whatever the synthetic decks above say.
  const { render } = require('../../../lib/engine');
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '../../../examples/topic.md'), 'utf8');
  const out = render(src, {});
  const html = typeof out === 'string' ? out : out.html;
  const bands = (h) => (h.match(/<ul class="tile-track"/g) || []).length;
  assert.ok(bands(html) > 0, 'the demo deck draws tracks at all');
  assert.equal(bands(tt.applyToHtml(html)), bands(html), 'a second pass appends none');
  assert.equal(tt.applyToHtml(html), html, 'and changes nothing at all');
});

test('the `_track` directive reaches the slide, and its comment does not', () => {
  const { render } = require('../../../lib/engine');
  const md = [
    '<!-- _class: divider -->', '', '## Section', '', '---', '',
    '<!-- _class: topic -->',
    '<!-- _track: Cost to win | Lifetime value | [Payback] -->', '',
    '## Payback', '', 'A claim.', '', '---', '',
    '<!-- _class: topic -->', '', '## Cost to win', '', 'A claim.', '', '---', '',
    '<!-- _class: topic -->', '', '## Lifetime value', '', 'A claim.', '',
  ].join('\n');
  const out = render(md, {});
  const html = typeof out === 'string' ? out : out.html;

  const t = tracks(html);
  assert.deepEqual(t[0].map((i) => i.name), ['Cost to win', 'Lifetime value', 'Payback']);
  assert.equal(t[0].findIndex((i) => i.on), 2);
  assert.ok(!html.includes('_track:'),
    'the directive is consumed, not left in the body as a comment to leak into an export');
  // The siblings derive from their own headings, and list neither the
  // overridden slide nor its labels.
  assert.deepEqual(t[1].map((i) => i.name), ['Cost to win', 'Lifetime value']);
  assert.equal(t[1].findIndex((i) => i.on), 0);
  assert.equal(t[2].findIndex((i) => i.on), 1);
});
