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

  test('idempotent: a second pass over rebuilt markup is a no-op', () => {
    const once = t.applyToRenderedHtml(wrap('team-profile', person('Ada Okafor')));
    assert.equal(t.applyToRenderedHtml(once), once);
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
  test('rebuilds a live section and stays idempotent', () => {
    const sections = [];
    const make = (cls, html) => {
      const el = {
        className: cls,
        innerHTML: html,
        querySelector: (sel) => (el.innerHTML.includes('team-roster') && sel.includes('team-roster') ? {} : null),
      };
      sections.push(el);
      return el;
    };
    const sec = make('team-profile', person('Ada Okafor'));
    const root = { querySelectorAll: (sel) => (sel === 'section.team-profile' ? sections : []) };
    t.applyToDom(root);
    assert.match(sec.innerHTML, /class="team-roster"/);
    const after = sec.innerHTML;
    t.applyToDom(root);
    assert.equal(sec.innerHTML, after);
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
  test('strips tags to a FIXPOINT (alert 241: incomplete multi-character sanitization)', () => {
    // One pass removes the inner `<b>` and closes the halves into a live tag the
    // pass has already walked past.
    assert.doesNotMatch(t.textOf('<<b>b>Ada'), /</);
    assert.doesNotMatch(t.textOf('<<script>script>alert(1)'), /</);
  });

  test('leaves no bare angle bracket, even from an UNCLOSED tag', () => {
    assert.doesNotMatch(t.textOf('<script src=x'), /[<>]/);
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
