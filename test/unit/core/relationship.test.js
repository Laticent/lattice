/**
 * Unit: lib/core/relationship.js — the cross-slide RELATIONSHIP SIGNAL
 * (2026-07-22-structure-derived-split-patterns.md §0b, §8 rule 12a).
 *
 * The rule's own acceptance test is the DERIVATION one: "a test asserts editing member N+1
 * changes member N's emitted signal". That is the whole point of the mechanism — an authored
 * "next: …" line is a second copy of the next step's title, and the second copy is the one
 * that goes stale. The rest of this file pins the four kinds' texts, the terminal-page cases
 * (a sequence has no next; a cycle loops back; a hierarchy looks up), and the refusals.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { RELATIONSHIPS, relationshipSignals, membersIn, labelOf, criteriaOf } = require('../../../lib/core/relationship');
const { applyRelationshipSignals } = require('../../../lib/core/auto-split');

const li = (title, body) => `<li><strong>${title}</strong><ul><li>${body}</li></ul></li>`;
const steps = (titles) => titles.map((t, k) => li(t, `body for ${t} ${k}`));
/** Each step on its own page — the `perPage: 1` pacing §0b gives a connected member. */
const oneEach = (titles) => steps(titles).map((m) => [m]);

describe('core: relationship — the four kinds', () => {
  const TITLES = ['Draft the policy', 'Circulate for comment', 'Sign off', 'Publish'];

  test('sequence: every non-terminal page names the NEXT member; the last has no next', () => {
    const out = relationshipSignals('sequence', oneEach(TITLES));
    assert.equal(out.length, 4);
    assert.match(out[0], /class="lat-split-rel">&rarr; next: Circulate for comment</);
    assert.match(out[1], /&rarr; next: Sign off</);
    assert.match(out[2], /&rarr; next: Publish</);
    assert.equal(out[3], '', 'the terminal page of a sequence has nothing to point at');
  });

  test('cycle: flows forward, then the LAST page loops back to stage 1 (never dropped)', () => {
    const out = relationshipSignals('cycle', oneEach(TITLES));
    assert.match(out[0], /&rarr; next: Circulate for comment</);
    assert.match(out.at(-1), /&#8635; back to Draft the policy</);
  });

  test('hierarchy: governs ↓ down the chain, under ↑ on the last tier — never a temporal "next"', () => {
    const out = relationshipSignals('hierarchy', oneEach(TITLES));
    assert.match(out[0], /governs &darr; Circulate for comment</);
    assert.match(out.at(-1), /under &uarr; Sign off</);
    for (const s of out) assert.doesNotMatch(s, /next/, 'a hierarchy is not a sequence');
  });

  test('comparison: Option N of M, with the shared criteria read from the first member', () => {
    const withBadges = (t, badges) =>
      `<li><strong>${t}</strong><ul>${badges.map((b) => `<li><span class="badge pass state-full">${b}</span></li>`).join('')}<li>the verdict line</li></ul></li>`;
    const pages = [
      [withBadges('Build', ['Residency', 'Self-serve', 'SOC 2'])],
      [withBadges('Buy', ['Residency', 'Self-serve', 'SOC 2'])],
      [withBadges('Delay', ['Residency', 'Self-serve', 'SOC 2'])],
    ];
    const out = relationshipSignals('comparison', pages);
    assert.match(out[0], /Option 1 of 3 &middot; comparing Residency &middot; Self-serve &middot; SOC 2</);
    assert.match(out[1], /Option 2 of 3 /);
    assert.match(out[2], /Option 3 of 3 /, 'the last option still reads as part of the compared set');
  });

  test('comparison with no badges degrades to the bare count, never an empty "comparing"', () => {
    const out = relationshipSignals('comparison', oneEach(['A', 'B']));
    assert.match(out[0], /Option 1 of 2</);
    assert.doesNotMatch(out[0], /comparing/);
  });

  test('comparison counts MEMBERS, not pages, when a page holds more than one', () => {
    const ms = steps(['A', 'B', 'C', 'D', 'E']);
    const out = relationshipSignals('comparison', [[ms[0], ms[1]], [ms[2], ms[3]], [ms[4]]]);
    assert.match(out[0], /Options 1&ndash;2 of 5</);
    assert.match(out[1], /Options 3&ndash;4 of 5</);
    assert.match(out[2], /Option 5 of 5</);
  });
});

describe('core: relationship — DERIVED, never authored (§8 rule 12a)', () => {
  // THE rule-12a acceptance test. If the signal were authored (a literal "next: …" line in the
  // markdown, or a value copied into a manifest) this assertion could not hold: editing the
  // NEXT member would leave the previous page's text untouched, and the deck would ship a
  // confident pointer to a step that no longer exists under that name.
  test('editing member N+1 changes member N\'s emitted signal', () => {
    const before = relationshipSignals('sequence', oneEach(['Draft', 'Circulate', 'Publish']));
    const after = relationshipSignals('sequence', oneEach(['Draft', 'Circulate for comment', 'Publish']));
    assert.match(before[0], /next: Circulate</);
    assert.match(after[0], /next: Circulate for comment</);
    assert.notEqual(before[0], after[0], 'member 1\'s signal did NOT follow the edit to member 2');
    // …and only the signal that READS the edited member moves. Page 2's own signal points at
    // page 3, which did not change.
    assert.equal(before[1], after[1]);
  });

  test('a cycle\'s loop-back follows an edit to the FIRST member', () => {
    const before = relationshipSignals('cycle', oneEach(['Observe', 'Orient', 'Act']));
    const after = relationshipSignals('cycle', oneEach(['Observe the market', 'Orient', 'Act']));
    assert.match(before.at(-1), /back to Observe</);
    assert.match(after.at(-1), /back to Observe the market</);
  });

  test('a hierarchy\'s "under ↑" follows an edit to the PREVIOUS member', () => {
    const before = relationshipSignals('hierarchy', oneEach(['Statute', 'Regulation', 'Case law']));
    const after = relationshipSignals('hierarchy', oneEach(['Statute', 'Implementing regulation', 'Case law']));
    assert.match(before.at(-1), /under &uarr; Regulation</);
    assert.match(after.at(-1), /under &uarr; Implementing regulation</);
  });
});

describe('core: relationship — refusals and reading', () => {
  test('an unknown or absent kind produces NO signal (never a guess)', () => {
    for (const kind of [undefined, null, '', 'sequenceish', 'toString', 'process']) {
      assert.equal(relationshipSignals(kind, oneEach(['A', 'B'])), null, String(kind));
    }
  });

  test('a run of fewer than two pages has no cross-slide relationship to signal', () => {
    assert.equal(relationshipSignals('sequence', [[li('Only', 'x')]]), null);
    assert.equal(relationshipSignals('sequence', []), null);
  });

  test('RELATIONSHIPS is exactly §0b\'s four kinds, and frozen', () => {
    assert.deepEqual([...RELATIONSHIPS], ['sequence', 'cycle', 'hierarchy', 'comparison']);
    assert.ok(Object.isFrozen(RELATIONSHIPS));
  });

  test('labelOf reads a card title, a subheading, or the leading text — and clips a long one', () => {
    assert.equal(labelOf(li('Draft the policy.', 'body')), 'Draft the policy');
    assert.equal(labelOf('<li><h3>Tier one</h3><p>body</p></li>'), 'Tier one');
    assert.equal(labelOf('<li>Just leading text<ul><li>nested</li></ul></li>'), 'Just leading text');
    const long = labelOf(li('A step whose authored title runs on well past the adornment budget', 'b'));
    assert.ok(long.length <= 42, `clipped to ${long.length}`);
    assert.match(long, /…$/);
  });

  test('criteriaOf reads the badge labels a verdict/pricing member carries', () => {
    const m = '<li><strong>Build</strong><ul><li><span class="badge pass state-full">Residency</span></li>' +
      '<li><span class="badge warn state-half">Self-serve</span></li><li>rationale</li></ul></li>';
    assert.deepEqual(criteriaOf(m), ['Residency', 'Self-serve']);
    assert.deepEqual(criteriaOf(li('Build', 'no badges here')), []);
  });

  test('membersIn reads the page\'s real members on the item axis and the row axis', () => {
    const page = `<h2>T</h2><ul>${steps(['A', 'B']).join('')}</ul>`;
    assert.equal(membersIn(page, 'item').length, 2);
    assert.match(membersIn(page, 'item')[0], /<strong>A<\/strong>/);
    const table = '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>';
    assert.equal(membersIn(table, 'row').length, 2, 'the header row is not a member');
    assert.equal(membersIn('<h2>no collection</h2>', 'item').length, 0);
  });
});

describe('core: relationship — through the real emission path (post-convergence)', () => {
  // The signal is stamped by `applyRelationshipSignals`, NOT by `splitEnvelope`, because it is a
  // RUN-level fact: page k's adornment names page k+1's first member, so it is only correct once
  // the run's membership is final. Stamped at split time it went stale AND doubled on a real
  // render (a 5-tier authority-chain cut 3/2 on pass 1, re-cut 2/1 on pass 2, carried
  // "governs ↓ Case law" on two pages, one naming a tier that was no longer its neighbor).
  const CAP = { 'list-steps': { axis: 'item', perPage: 1, relationship: 'sequence' } };
  const page = (n, cls, titles) =>
    `<section data-split-run="r1" data-split-role="${n === 0 ? 'cover' : 'body'}" ` +
    `data-lattice-slide="${n + 1}" class="${cls}">` +
    `<h2>T</h2><ul>${steps(titles).join('')}</ul></section>`;
  const deck = (perPage) => [
    page(0, 'content lat-split-cover form', ['ignored']),
    ...perPage.map((titles, k) => page(k + 1, 'list-steps form lat-split-native', titles)),
  ].join('');

  test('stamps one signal per body page; never the cover', () => {
    const out = applyRelationshipSignals(deck([['Draft'], ['Circulate'], ['Publish']]), CAP);
    const sections = out.split('<section').slice(1);
    assert.doesNotMatch(sections[0], /lat-split-rel/, 'the accent cover is not a member');
    assert.match(sections[1], /&rarr; next: Circulate</);
    assert.match(sections[2], /&rarr; next: Publish</);
    assert.doesNotMatch(sections[3], /lat-split-rel/, 'the last step has no next');
  });

  test('the cover\'s swapped `content` class does not hijack the contract', () => {
    // roleOpenTag rewrites the cover's class to `content lat-split-cover form`, and `content`
    // carries a capacity contract of its own — resolving the run's relationship from the run's
    // FIRST member therefore found the wrong component (relationship null) and silently emitted
    // nothing at all. Caught on a real render, not by a unit test.
    const withContent = { ...CAP, content: { axis: 'item', relationship: null } };
    const out = applyRelationshipSignals(deck([['Draft'], ['Publish']]), withContent);
    assert.match(out, /&rarr; next: Publish</);
  });

  test('IDEMPOTENT — a second call re-derives rather than appending a second signal', () => {
    const once = applyRelationshipSignals(deck([['Draft'], ['Circulate'], ['Publish']]), CAP);
    const twice = applyRelationshipSignals(once, CAP);
    assert.equal(twice, once);
    assert.equal((twice.match(/lat-split-rel/g) || []).length, 2);
  });

  test('a re-split page gets a FRESH signal, not the stale one it inherited', () => {
    // Simulate the two-pass case: page 1 held [Draft, Circulate] and pointed at [Publish];
    // a later pass split it, so page 1 now holds [Draft] and its neighbor is [Circulate].
    const stale = applyRelationshipSignals(deck([['Draft', 'Circulate'], ['Publish']]), CAP);
    assert.match(stale.split('<section')[2], /&rarr; next: Publish</);
    const recut = applyRelationshipSignals(stale.replace(
      /<section data-split-run="r1" data-split-role="body"[\s\S]*?<\/section>/,
      page(1, 'list-steps form lat-split-native', ['Draft']) + page(2, 'list-steps form lat-split-native', ['Circulate']),
    ), CAP);
    assert.match(recut.split('<section')[2], /&rarr; next: Circulate</,
      'the re-split page kept a signal pointing past its real neighbor');
    assert.equal((recut.match(/lat-split-rel/g) || []).length, 2, 'and it is not doubled');
  });

  test('a layout that declares no relationship gets no signal at all', () => {
    const out = applyRelationshipSignals(deck([['Draft'], ['Publish']]), { 'list-steps': { axis: 'item' } });
    assert.doesNotMatch(out, /lat-split-rel/);
  });

  test('an unsplit deck (no run ids) and an empty capacity map are no-ops', () => {
    const plain = '<section data-lattice-slide="1" class="list-steps form"><h2>T</h2><ul><li>a</li></ul></section>';
    assert.equal(applyRelationshipSignals(plain, CAP), plain);
    assert.equal(applyRelationshipSignals(deck([['Draft'], ['Publish']]), {}), deck([['Draft'], ['Publish']]));
  });

  test('the signal lands inside the content cell, after the trailing note', () => {
    const noted = deck([['Draft'], ['Publish']])
      .replace('</ul></section>', '</ul><p class="lat-split-note">A footnote.</p></section>');
    const out = applyRelationshipSignals(noted, CAP);
    const body = out.split('<section')[2];
    assert.ok(body.indexOf('lat-split-note') < body.indexOf('lat-split-rel'),
      'the wayfinding signal must read after the footnote, not before it');
  });
});

describe('core: relationship — degenerate inputs say nothing rather than lie', () => {
  test('a table with no <tbody> does not count its HEADER row as a member', () => {
    // markdown-it always emits a `<tbody>`, so this is the raw-HTML / hand-authored path. Left
    // unguarded, the scan started at 0 and swept the `<thead>` row in: a three-option table
    // signalled "Option 1 of 4", and the count disagreed with `countAxis`, which sees none.
    const html = '<table><thead><tr><th>Criterion</th></tr></thead>'
      + '<tr><td>A</td></tr><tr><td>B</td></tr></table>';
    const ms = membersIn(html, 'row');
    assert.equal(ms.length, 2);
    assert.ok(ms.every((m) => !m.includes('<th')), 'the header row is criteria, never a member');
  });

  test('a <tbody> table is unchanged by that guard', () => {
    const html = '<table><thead><tr><th>C</th></tr></thead><tbody><tr><td>A</td></tr></tbody></table>';
    assert.equal(membersIn(html, 'row').length, 1);
  });

  test('no members on any page → no signal, never "Option 1 of 0"', () => {
    // Reachable whenever the resolved axis finds no collection on the page. The comparison
    // branch floors its range at one member, so an empty matrix used to print a human-visible
    // count of zero on every page.
    assert.deepEqual(relationshipSignals('comparison', [[], []]), ['', '']);
    assert.deepEqual(relationshipSignals('sequence', [[], []]), ['', '']);
  });

  test('labelOf reads a LEADING <strong>, not a bolded phrase in the body', () => {
    const leading = '<li><strong>Sign off</strong><ul><li>The chair signs the policy hash.</li></ul></li>';
    assert.equal(labelOf(leading), 'Sign off');
    // A flat member whose emphasis sits mid-sentence must fall through to the clause reader.
    const buried = '<li>Sign off — the chair signs the <strong>policy hash</strong>.</li>';
    assert.equal(labelOf(buried), 'Sign off');
  });

  test('labelOf handles the LOOSE list form markdown-it wraps in a <p>', () => {
    assert.equal(labelOf('<li><p><strong>Build in region</strong></p><p>body</p></li>'), 'Build in region');
  });
});
