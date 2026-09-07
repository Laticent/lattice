// team-profile transformer — an authored people list becomes flat `.person` cards,
// and anyone with no photo gets a monogram drawn from their initials.
//
// The monogram is the reason this is a transform rather than CSS (`attr()` cannot
// slice a name into initials), so the initials rules are pinned here by content:
// the shape they take is a contract the CSS sizes against and the docs promise.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const t = require('../../../lib/components/inventory/team-profile/team-profile.transform');

const wrap = (cls, inner) => `<section id="1" class="${cls}"><div class="cell-stage">${inner}</div></section>`;
const person = (inner) => `<ul><li>${inner}</li></ul>`;

describe('team-profile — applyToRenderedHtml', () => {
  test('rebuilds an authored person into figure + text, in reading order', () => {
    const out = t.applyToRenderedHtml(wrap('team-profile form', person(
      'Ada Okafor<ul><li><img src="ada.svg" alt="Ada Okafor"></li>'
      + '<li><code>Executive Sponsor</code></li><li>Clears blockers.</li></ul>')));
    assert.match(out, /<ul class="team-roster"><li class="person">/);
    // The portrait leads, then the words — the order the card reads, not the order
    // the author typed (the name is the top-level bullet).
    assert.match(out, /<span class="person-figure"><img class="person-photo" src="ada\.svg" alt=""><\/span>/);
    assert.match(out, /<span class="person-text"><span class="person-name">Ada Okafor<\/span>/);
    assert.match(out, /<span class="person-role">Executive Sponsor<\/span>/);
    assert.match(out, /<span class="person-note">Clears blockers\.<\/span>/);
  });

  test('a photo-less person gets a monogram, marked aria-hidden', () => {
    const out = t.applyToRenderedHtml(wrap('team-profile', person(
      'Owen Adeyemi<ul><li><code>Revenue Ops</code></li></ul>')));
    assert.match(out, /class="person-figure person-figure--monogram" aria-hidden="true"/);
    assert.match(out, /<span class="person-initials">OA<\/span>/);
  });

  test('a name alone is a complete person — the whole QBR photo-less case', () => {
    const out = t.applyToRenderedHtml(wrap('team-profile sides', person('Nia Bello')));
    assert.match(out, /<span class="person-initials">NB<\/span>/);
    assert.match(out, /<span class="person-name">Nia Bello<\/span>/);
  });

  test('nested items are classified by SHAPE, not by the order they were written', () => {
    const authored = t.parsePerson(
      'Ada Okafor<ul><li>Clears blockers.</li><li><code>Sponsor</code></li>'
      + '<li><img src="a.svg"></li></ul>');
    assert.equal(authored.role, 'Sponsor');
    assert.equal(authored.photo.src, 'a.svg');
    assert.deepEqual(authored.notes, ['Clears blockers.']);
  });

  test('every top-level list is a roster — `sides` authors two under two headings', () => {
    const out = t.applyToRenderedHtml(wrap('team-profile sides',
      '<h3>Your team</h3><ul><li>Ada Okafor</li></ul>'
      + '<h3>Our team</h3><ul><li>Marcus Vale</li></ul>'));
    assert.equal((out.match(/class="team-roster"/g) || []).length, 2);
    assert.match(out, /<h3>Your team<\/h3><ul class="team-roster">/);
  });

  // The coda cell is a TOP-LEVEL sibling of `.cell-stage` (lib/core/coda.js runs
  // first in the registry and lifts the trailing beats out of the body), which is
  // the shape `peelCoda` scans for — so it is peeled before the roster walk and a
  // list inside it is never mistaken for a person.
  test('the coda cell belongs to the frame — a list inside it is not a person', () => {
    const coda = '<div class="cell-coda"><blockquote><ul><li>Key insight</li></ul></blockquote></div>';
    const out = t.applyToRenderedHtml(
      `<section id="1" class="team-profile"><div class="cell-stage">${person('Ada Okafor')}</div>${coda}</section>`);
    assert.match(out, /<div class="cell-coda"><blockquote><ul><li>Key insight<\/li><\/ul>/);
    assert.equal((out.match(/class="team-roster"/g) || []).length, 1);
  });

  test('an authored ordered list becomes a roster — no ordinal is drawn', () => {
    const out = t.applyToRenderedHtml(wrap('team-profile', '<ol><li>Ada Okafor</li></ol>'));
    assert.match(out, /<ul class="team-roster">/);
    assert.doesNotMatch(out, /<ol/);
  });

  // The name, role and note are ALREADY-RENDERED markdown, so the author's inline
  // markup is content and rides through as markup — the same contract every sibling
  // transform keeps. What must never happen is author text reaching an ATTRIBUTE
  // unescaped, or markup surviving into the derived initials.
  test('author inline markup survives in the name; nothing reaches an attribute raw', () => {
    const out = t.applyToRenderedHtml(wrap('team-profile',
      '<ul><li>Ada <em>A.</em> Okafor<ul><li><img src="a.svg"></li></ul></li></ul>'));
    assert.match(out, /<span class="person-name">Ada <em>A\.<\/em> Okafor<\/span>/);
    assert.match(out, /src="a\.svg" alt=""/);
    assert.equal(t.initialsOf('<img src=x onerror=alert(1)> Okafor'), 'O');
  });

  test('an empty list is left alone; a blank item degrades to an empty circle', () => {
    const empty = wrap('team-profile', '<ul></ul>');
    assert.equal(t.applyToRenderedHtml(empty), empty);
    const blank = t.applyToRenderedHtml(wrap('team-profile', '<ul><li></li></ul>'));
    assert.match(blank, /person-figure--monogram" aria-hidden="true"><\/span><\/li>/);
  });

  test('ignores sections that are not team-profile', () => {
    const html = wrap('cards-grid', person('Ada Okafor'));
    assert.equal(t.applyToRenderedHtml(html), html);
  });

  // The CLI renders against the on-disk deck dir and passes NO baseUrl, so the
  // author's relative path must survive untouched there (exported bytes unchanged).
  // A preview iframe's srcdoc has no deck-dir base, so the same path has to be
  // resolved or every face renders as a broken-image icon — which is exactly what
  // the docs-site preview showed before this was threaded through.
  test('resolves a relative portrait against ctx.baseUrl (web preview)', () => {
    const html = wrap('team-profile', person('Ada<ul><li><img src="ada.svg"></li></ul>'));
    assert.match(t.applyToRenderedHtml(html, { baseUrl: 'https://o/v/h/samples/' }),
      /src="https:\/\/o\/v\/h\/samples\/ada\.svg"/);
  });

  test('leaves the portrait relative with no baseUrl (CLI / export path)', () => {
    const html = wrap('team-profile', person('Ada<ul><li><img src="ada.svg"></li></ul>'));
    assert.match(t.applyToRenderedHtml(html), /src="ada\.svg"/);
  });

  test('an already-absolute portrait passes through unchanged', () => {
    const html = wrap('team-profile', person('Ada<ul><li><img src="https://x/y.svg"></li></ul>'));
    assert.match(t.applyToRenderedHtml(html, { baseUrl: 'https://o/v/' }), /src="https:\/\/x\/y\.svg"/);
  });

  test('idempotent: a second pass over rebuilt markup is a no-op', () => {
    const once = t.applyToRenderedHtml(wrap('team-profile', person('Ada Okafor')));
    assert.equal(t.applyToRenderedHtml(once), once);
  });
});

// Every one of these is a defect an independent checker confirmed against this
// kernel, with the input that reproduced it. They are pinned by that input.
describe('team-profile — the shapes an author actually writes', () => {
  test('a portrait URL with a query string is not double-escaped', () => {
    // The src is read out of ALREADY-escaped HTML, so escaping it again turned
    // `&amp;` into `&amp;amp;` and the image 404'd on any CDN or signed URL.
    const html = wrap('team-profile',
      person('Ada<ul><li><img src="https://cdn/x.jpg?w=200&amp;h=200"></li></ul>'));
    assert.match(t.applyToRenderedHtml(html), /src="https:\/\/cdn\/x\.jpg\?w=200&amp;h=200"/);
    assert.doesNotMatch(t.applyToRenderedHtml(html), /&amp;amp;/);
  });

  test('a quoted list is quoted material, not a roster', () => {
    const out = t.applyToRenderedHtml(wrap('team-profile',
      '<blockquote><p>Quote</p><ul><li>alpha</li></ul></blockquote>' + person('Ada Okafor')));
    assert.match(out, /<blockquote><p>Quote<\/p><ul><li>alpha<\/li><\/ul><\/blockquote>/);
    assert.equal((out.match(/class="team-roster"/g) || []).length, 1);
  });

  test('the coda cell keeps its place BEFORE the footer', () => {
    // Peeling it and re-appending put the cell after `.cell-footer` — the one
    // layout in the catalog to do that, and the order coda.test.js pins.
    const out = t.applyToRenderedHtml(
      `<section class="team-profile"><div class="cell-stage">${person('Ada Okafor')}</div>`
      + '<div class="cell-coda"><blockquote>Key insight</blockquote></div>'
      + '<div class="cell-footer">1</div></section>');
    assert.ok(out.indexOf('cell-coda') < out.indexOf('cell-footer'), 'coda must precede the footer');
    assert.match(out, /<div class="cell-coda"><blockquote>Key insight<\/blockquote><\/div>/);
  });

  test('a LOOSE list still yields a role, not an inline-code chip', () => {
    // A blank line inside a person makes markdown-it wrap each item in a <p>.
    const out = t.applyToRenderedHtml(wrap('team-profile',
      '<ul><li><p>Ada Okafor</p><ul><li><p><code>Executive Sponsor</code></p></li>'
      + '<li><p>Clears blockers.</p></li></ul></li></ul>'));
    assert.match(out, /<span class="person-name">Ada Okafor<\/span>/);
    assert.match(out, /<span class="person-role">Executive Sponsor<\/span>/);
    assert.doesNotMatch(out, /<p>/);
  });

  test('the words "team-roster" in a note do not disable the component', () => {
    // The guard was a bare substring, so author prose aborted the whole rebuild.
    const out = t.applyToRenderedHtml(wrap('team-profile',
      person('Ada Okafor<ul><li>We keep the team-roster in Notion.</li></ul>')));
    assert.match(out, /<ul class="team-roster">/);
    assert.match(out, /<span class="person-name">Ada Okafor<\/span>/);
  });

  test("a single-quoted src is read, not silently dropped", () => {
    // The engine runs `html: true`, so a hand-written tag is a live path.
    const out = t.applyToRenderedHtml(wrap('team-profile',
      person("Ada<ul><li><img src='ada.svg'></li></ul>")));
    assert.match(out, /class="person-photo" src="ada\.svg"/);
    assert.doesNotMatch(out, /person-figure--monogram/);
  });

  test('a portrait and a role in the SAME bullet keep both', () => {
    const out = t.applyToRenderedHtml(wrap('team-profile',
      person('Ada<ul><li><img src="a.svg"> <code>Sponsor</code></li></ul>')));
    assert.match(out, /class="person-photo"/);
    assert.match(out, /<span class="person-role">Sponsor<\/span>/);
  });
});

describe('team-profile — initials', () => {
  test('first word + last word, uppercased', () => {
    assert.equal(t.initialsOf('Ada Okafor'), 'AO');
    assert.equal(t.initialsOf('Marcus van der Berg'), 'MB');
  });

  test('a single name yields one letter', () => {
    assert.equal(t.initialsOf('Prince'), 'P');
  });

  test('a suffix or a parenthetical never becomes an initial', () => {
    // "Okafor, PhD" must not read as OP — the credential is not part of the name.
    assert.equal(t.initialsOf('Ada Okafor, PhD'), 'AO');
    assert.equal(t.initialsOf('Ada (Ada-Marie) Okafor'), 'AO');
  });

  test('reads whole code points, not half a surrogate pair', () => {
    assert.equal(t.initialsOf('Ýr Þórsdóttir'), 'ÝÞ');
    assert.equal(Array.from(t.initialsOf('𝐀da Okafor')).length, 2);
  });

  test('markup in the name is stripped before the initials are taken', () => {
    assert.equal(t.initialsOf('<strong>Ada</strong> Okafor'), 'AO');
  });

  test('a nameless entry yields no monogram rather than an empty box of nothing', () => {
    assert.equal(t.initialsOf('   '), '');
  });
});

describe('team-profile — applyToDom', () => {
  // A REAL DOM, not a hand-rolled fake. The fake this replaced answered
  // `querySelectorAll` with `[]`, which meant the riskiest line in the arm — the
  // `img.setAttribute('src', img.src)` pin — was never once executed by the suite.
  const { JSDOM } = require('jsdom');
  const mount = (html, url = 'https://s/deck/page.html') =>
    new JSDOM(`<article>${html}</article>`, { url }).window.document;

  test('rebuilds a live section and stays idempotent', () => {
    const doc = mount(wrap('team-profile', person('Ada Okafor')));
    t.applyToDom(doc);
    const sec = doc.querySelector('section.team-profile');
    assert.match(sec.innerHTML, /class="team-roster"/);
    assert.match(sec.innerHTML, /<span class="person-initials">AO<\/span>/);
    const after = sec.innerHTML;
    t.applyToDom(doc);
    assert.equal(sec.innerHTML, after);
  });

  test('pins the DOM-resolved portrait URL into the attribute', () => {
    // The browser resolved `ada.svg` against the document; the rebuild must carry
    // that absolute URL, not hand the author's relative path back to be resolved
    // a second time against whatever document the markup lands in.
    const doc = mount(wrap('team-profile', person('Ada<ul><li><img src="ada.svg"></li></ul>')));
    t.applyToDom(doc);
    assert.match(doc.querySelector('section.team-profile').innerHTML,
      /src="https:\/\/s\/deck\/ada\.svg"/);
  });

  test('leaves a section it declines to rebuild completely untouched', () => {
    const doc = mount(wrap('team-profile', '<p>No roster yet</p><img src="logo.svg">'));
    const sec = doc.querySelector('section.team-profile');
    const before = sec.innerHTML;
    t.applyToDom(doc);
    assert.equal(sec.innerHTML, before);
  });

  test('safely returns on a null / non-DOM root', () => {
    assert.doesNotThrow(() => t.applyToDom(null));
    assert.doesNotThrow(() => t.applyToDom({}));
  });
});

// CodeQL alerts 241 + 242 on PR #2102, both against `textOf`. Neither was
// reachable as a vulnerability here — the output is filtered to letters and
// truncated to two code points before it is escaped and emitted — but the
// function was genuinely broken as a text extractor, and a broken one gets
// reused. Both defects are pinned so they cannot come back.
describe('team-profile — textOf', () => {
  test('no tag survives, however it is nested (alerts 241/243)', () => {
    // A single `replace(/<[^>]*>/g,'')` leaves a tag behind here; a depth-counting
    // scanner consumes the whole run, so the NAME comes through intact rather than
    // the fragment the regex left.
    assert.equal(t.textOf('<<b>b>Ada Okafor'), 'Ada Okafor');
    assert.equal(t.initialsOf('<<b>b>Ada Okafor'), 'AO');
    assert.doesNotMatch(t.textOf('<<script>script>alert(1)'), /</);
  });

  test('an UNCLOSED tag swallows its run and emits no bracket', () => {
    assert.equal(t.textOf('<script src=x'), '');
    assert.doesNotMatch(t.textOf('a < b > c'), /[<>]/);
  });

  test('decodes entities in ONE pass (alert 242: double unescaping)', () => {
    // Chained replaces would turn `&amp;lt;` into `&lt;` and then into `<`,
    // manufacturing a character the author never wrote.
    assert.equal(t.textOf('&amp;lt;'), '&lt;');
    assert.equal(t.textOf('&amp;amp;'), '&amp;');
    assert.equal(t.textOf('&amp;'), '&');
  });

  test('still reads an ordinary name, markup and entities included', () => {
    assert.equal(t.textOf('<strong>Ada</strong>&nbsp;Okafor'), 'Ada Okafor');
    assert.equal(t.textOf('Ada &amp; Marcus'), 'Ada & Marcus');
    assert.equal(t.textOf('  Ada\n  Okafor '), 'Ada Okafor');
  });
});
