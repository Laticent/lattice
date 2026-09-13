/**
 * Unit: lib/core/relationship.js — the cross-slide RELATIONSHIP SIGNAL
 * (2026-07-22-structure-derived-split-patterns.md §0b, §8 rule 12a).
 *
 * The rule's own acceptance test is the DERIVATION one: "a test asserts editing member N+1
 * changes member N's emitted signal". That is the whole point of the mechanism — an authored
 * "…" line is a second copy of the next step's title, and the second copy is the one
 * that goes stale. The rest of this file pins the four kinds' texts, the terminal-page cases
 * (a sequence has no next; a cycle loops back; a hierarchy looks up), and the refusals.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { RELATIONSHIPS, relationshipSignals, membersIn, labelOf, criteriaOf, textOf, RELATION, stripTags } = require('../../../lib/core/relationship');
const { applyRelationshipSignals } = require('../../../lib/core/auto-split');

// Reads a signal as { mark, label } rather than matching its markup.
//
// These assertions were regexes of the shape `/data-mark="next">next: X</`, which pinned the fact
// that the label was a BARE TEXT NODE sitting directly after the div's opening tag. Wrapping it in
// a `.lat-split-label` span — so the pill can ellipsise, which needs an element — failed sixteen
// of them without one behavior changing. What they actually mean is "this page's signal is a NEXT
// pointing at X", and that is what they say now.
describe('core: relationship — textOf leaves no tag behind', () => {
  // The kernel's tag strip, pinned as a PROPERTY rather than as example outputs.
  //
  // THIS DOES NOT GUARD THE FIXPOINT LOOP, and saying otherwise would be the kind of claim this
  // suite exists to prevent. Mutation-tested: replacing the loop with a single pass leaves all of
  // these green, because `<[^>]*>` consumes from a `<` to the next `>`, so nothing here needs a
  // second pass. The loop is there for CodeQL's js/incomplete-multi-character-sanitization, which
  // keys on the one-pass SHAPE — it raised three high-severity alerts (206-208) on hand-rolled
  // copies of that line in this file and in auto-split.test.js, and the fix was to delete all
  // three and call the kernel.
  //
  // What these DO guard is the contract itself — whatever the implementation, nothing that comes
  // out of `textOf` carries a tag — so a future rewrite has a spec to meet.
  //
  // What "sanitized" means here is narrow and worth stating, because the obvious stronger claim is
  // false: `textOf('<<span>span>x')` is `'span>x'`, NOT `'x'`. It does not recover the text an
  // attacker meant to hide — it guarantees that what comes out carries no tag for a later parser
  // to act on. Asserting the recovered string would pin an accident of the regex; asserting the
  // property pins the contract.
  for (const payload of [
    '<span>Trial</span>',
    '<<span>span>Trial<</span>/span>',
    '<scr<script>ipt>alert(1)</scr</script>ipt>',
    '<b>a</b><b>b</b>',
    '<<<a>>>x',
    '<a<b<c>>>y',
    'plain — no markup at all',
  ]) {
    test(`no tag survives ${JSON.stringify(payload)}`, () => {
      assert.doesNotMatch(textOf(payload), /<[^>]*>/, 'a tag survived the strip');
    });
  }

  test('adjacent elements stay separate words', () => {
    // The separator is a space, not ''. `<b>a</b><b>b</b>` is two words; joining them makes one,
    // and every label assertion in this file compares text.
    assert.equal(textOf('<b>a</b><b>b</b>'), 'a b');
  });
});

/** An `<mo>`'s character content — KaTeX nests `<mi>` inside `<mo>` for some macros. The kernel's
 *  own `stripTags`, not a local copy: this file had grown a fourth hand-rolled tag strip, and
 *  `relationship.js` records that three CodeQL alerts came from exactly that accumulation. */
const stripInner = (html) => stripTags(html, '').trim();

const signalOf = (html) => {
  const m = /<div class="lat-split-rel" data-mark="([a-z]+)"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  return m && { mark: m[1], label: textOf(m[2]) };
};

const li = (title, body) => `<li><strong>${title}</strong><ul><li>${body}</li></ul></li>`;
const steps = (titles) => titles.map((t, k) => li(t, `body for ${t} ${k}`));
/** Each step on its own page — the `perPage: 1` pacing §0b gives a connected member. */
const oneEach = (titles) => steps(titles).map((m) => [m]);

describe('core: relationship — the four kinds', () => {
  const TITLES = ['Draft the policy', 'Circulate for comment', 'Sign off', 'Publish'];

  test('sequence: every non-terminal page names the NEXT member; the last has no next', () => {
    const out = relationshipSignals('sequence', oneEach(TITLES));
    assert.equal(out.length, 4);
    assert.deepEqual(signalOf(out[0]), { mark: 'next', label: 'Circulate for comment' });
    assert.deepEqual(signalOf(out[1]), { mark: 'next', label: 'Sign off' });
    assert.deepEqual(signalOf(out[2]), { mark: 'next', label: 'Publish' });
    assert.equal(out[3], '', 'the terminal page of a sequence has nothing to point at');
  });

  test('cycle: flows forward, then the LAST page loops back to stage 1 (never dropped)', () => {
    const out = relationshipSignals('cycle', oneEach(TITLES));
    assert.deepEqual(signalOf(out[0]), { mark: 'next', label: 'Circulate for comment' });
    assert.deepEqual(signalOf(out.at(-1)), { mark: 'loop', label: 'back to Draft the policy' });
  });

  // ── EVERY kind has an un-labeled form ────────────────────────────────────────────────
  //
  // '' emits NO ELEMENT (`auto-split.js`: `if (signals[k])`), so a kind that returns '' for a
  // missing label does not degrade — it DISAPPEARS. `sequence` has always said "continues";
  // `cycle` and `hierarchy` said nothing, and the cycle's closing "back to {stage 1} ↻" is the one
  // thing §0b names as that kind's whole point. A HARD RULE #25 checker rendered the loss on a real
  // deck: a cycle whose first stage was `- $A \to B$` printed no closing chip at all, because the
  // shape-glyph rule declines that label.
  const NAMELESS = ['<li>A sentence with no name in it that runs on well past the adornment budget</li>'];

  test('cycle: a missing FIRST label still closes the loop', () => {
    const out = relationshipSignals('cycle', [NAMELESS, ...oneEach(['Review', 'Publish'])]);
    assert.deepEqual(signalOf(out.at(-1)), { mark: 'loop', label: 'back to the start' },
      'the closing chip vanished: an empty signal emits no element at all');
    assert.ok(out.every((h) => h !== ''), 'no page of a cycle may be signal-less');
  });

  test('hierarchy: a missing tier label still names the DIRECTION', () => {
    const out = relationshipSignals('hierarchy', [NAMELESS, NAMELESS]);
    assert.deepEqual(signalOf(out[0]), { mark: 'down', label: 'governs the tier below' });
    assert.deepEqual(signalOf(out.at(-1)), { mark: 'up', label: 'under the tier above' });
  });

  test('hierarchy: governs ↓ down the chain, under ↑ on the last tier — never a temporal "next"', () => {
    const out = relationshipSignals('hierarchy', oneEach(TITLES));
    assert.deepEqual(signalOf(out[0]), { mark: 'down', label: 'governs Circulate for comment' });
    assert.deepEqual(signalOf(out.at(-1)), { mark: 'up', label: 'under Sign off' });
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
  // THE rule-12a acceptance test. If the signal were authored (a literal "…" line in the
  // markdown, or a value copied into a manifest) this assertion could not hold: editing the
  // NEXT member would leave the previous page's text untouched, and the deck would ship a
  // confident pointer to a step that no longer exists under that name.
  test('editing member N+1 changes member N\'s emitted signal', () => {
    const before = relationshipSignals('sequence', oneEach(['Draft', 'Circulate', 'Publish']));
    const after = relationshipSignals('sequence', oneEach(['Draft', 'Circulate for comment', 'Publish']));
    assert.match(before[0], /Circulate</);
    assert.match(after[0], /Circulate for comment</);
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
    assert.deepEqual(signalOf(before.at(-1)), { mark: 'up', label: 'under Regulation' });
    assert.deepEqual(signalOf(after.at(-1)), { mark: 'up', label: 'under Implementing regulation' });
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

  test('labelOf reads a card title, a subheading, or the leading text', () => {
    assert.equal(labelOf(li('Draft the policy.', 'body')), 'Draft the policy');
    assert.equal(labelOf('<li><h3>Tier one</h3><p>body</p></li>'), 'Tier one');
    assert.equal(labelOf('<li>Just leading text<ul><li>nested</li></ul></li>'), 'Just leading text');
  });

  test('a NAMED member declines rather than clipping — every path, not just the flat run', () => {
    // Was: the `<strong>` path clipped to 41 chars + `…`. `<strong>` was read as "the author
    // named this, so it is short", but a component TRANSFORM can wrap a member's whole text in
    // it — `list-criteria` does — so the named path clipped full sentences. The committed
    // `examples/split-structure.pdf` carried "A heading that says which run it belongs…"
    // and "A way back to the whole — the k-of-N rail…", which is character-for-character
    // the shape the decision record claims was removed. Found by the independent checker,
    // against the shipped artifact.
    const long = labelOf(li('A step whose authored title runs on well past the adornment budget', 'b'));
    assert.equal(long, '', 'a name with no clause break and no end must decline, not clip');
    assert.ok(!/…/.test(long));
    assert.equal(labelOf('<li><h3>A subheading that also runs on well past the adornment budget</h3></li>'), '',
      'the subheading path declines the same way');
  });

  test('a clause break is cut FIRST, so a long member still yields a real name', () => {
    // The fix must not trade truncated labels for no labels: this is the two-step the flat path
    // already used, now applied to the named paths too.
    assert.equal(labelOf(li('A way back to the whole — the k-of-N rail in the footer band', 'b')),
      'A way back to the whole');
    assert.equal(labelOf(li('The one thing it holds, set at full size — not shrunk to share', 'b')),
      'The one thing it holds, set at full size');
  });

  test('a FIGURE is not a name — the member\'s own text is preferred when it yields one', () => {
    // `stats` and `kpi` lead a member with the VALUE, the metric name nested under it, so taking
    // the leading `<strong>` pointed a whole run at its own numbers: measured on
    // `examples/adaptive-sizing.pdf`, every page read "$0.9M" and the cover lead-in was
    // "$48.2M". The reader was told which figure came next, never which metric.
    assert.equal(labelOf('<li><strong>119%</strong><ul><li>Net revenue retention</li></ul></li>'),
      'Net revenue retention');
    assert.equal(labelOf('<li><strong>4.2x</strong> Pipeline coverage</li>'), 'Pipeline coverage');
  });

  test('a figure with NOTHING after it keeps the figure; one with an unusable follow declines', () => {
    // A roadmap horizon authored as `2026` alone still points at 2026 — there the numeral IS the
    // name, which is why this is not a blanket ban on numeric labels.
    assert.equal(labelOf('<li><strong>2026</strong></li>'), '2026');
    // But a bullet led by a bolded COUNT falls through to its own sentence, which is not a name,
    // and declines rather than claiming a number is the next page's subject. This is the
    // "31" case the decision record carries.
    assert.equal(labelOf('<li><strong>31</strong> keep whole and ring on overflow, each for a recorded reason</li>'), '');
  });

  test('an ordinary named card is untouched by the figure rule', () => {
    assert.equal(labelOf('<li><strong>Draft the policy.</strong><ul><li>body</li></ul></li>'), 'Draft the policy');
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
    assert.deepEqual(signalOf(sections[1]), { mark: 'next', label: 'Circulate' });
    assert.deepEqual(signalOf(sections[2]), { mark: 'next', label: 'Publish' });
    assert.doesNotMatch(sections[3], /lat-split-rel/, 'the last step has no next');
  });

  test('the cover\'s swapped `content` class does not hijack the contract', () => {
    // roleOpenTag rewrites the cover's class to `content lat-split-cover form`, and `content`
    // carries a capacity contract of its own — resolving the run's relationship from the run's
    // FIRST member therefore found the wrong component (relationship null) and silently emitted
    // nothing at all. Caught on a real render, not by a unit test.
    const withContent = { ...CAP, content: { axis: 'item', relationship: null } };
    const out = applyRelationshipSignals(deck([['Draft'], ['Publish']]), withContent);
    assert.deepEqual(signalOf(out), { mark: 'next', label: 'Publish' });
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
    assert.deepEqual(signalOf(stale.split('<section')[2]), { mark: 'next', label: 'Publish' });
    const recut = applyRelationshipSignals(stale.replace(
      /<section data-split-run="r1" data-split-role="body"[\s\S]*?<\/section>/,
      page(1, 'list-steps form lat-split-native', ['Draft']) + page(2, 'list-steps form lat-split-native', ['Circulate']),
    ), CAP);
    assert.deepEqual(signalOf(recut.split('<section')[2]),
      { mark: 'next', label: 'Circulate' },
      'the re-split page kept a signal pointing past its real neighbor');
    assert.equal((recut.match(/lat-split-rel/g) || []).length, 2, 'and it is not doubled');
  });

  test('a layout that declares NO relationship still gets one — sequence is the default', () => {
    // The carousel is universal as of 2026-09-01. This test asserted the opposite until then:
    // the signal required `capacity.relationship`, which four of sixty-one components declare,
    // so every other split run's pages ended with nothing joining them. `sequence` is the
    // default because it is the relationship a split run HAS — the pages were one slide.
    const out = applyRelationshipSignals(deck([['Draft'], ['Publish']]), { 'list-steps': { axis: 'item' } });
    assert.deepEqual(signalOf(out), { mark: 'next', label: 'Publish' });
    assert.equal((out.match(/lat-split-rel/g) || []).length, 1, 'the last body page has no next member');
  });

  test('an UNNAMED member points forward without inventing a label', () => {
    // A member with no `<strong>`, no subheading and no clause break has only a sentence. The
    // budget would clip it to "→ next: A page carries one structural element; no…", which reads
    // as a bug rather than wayfinding — seen on the first real render after the carousel went
    // universal, and the reason `labelOf` now returns '' rather than a truncated fragment.
    const long = 'A page carries one structural element and nothing else at all';
    const bare = (n, label) => `<section data-split-run="r1" data-split-role="body" data-lattice-slide="${n}" `
      + `class="list-steps form lat-split-native"><h2>T</h2><ul><li>${label}</li></ul></section>`;
    const out = applyRelationshipSignals(bare(1, long) + bare(2, `${long} again`), { 'list-steps': { axis: 'item' } });
    assert.deepEqual(signalOf(out), { mark: 'next', label: 'continues' }, 'it still points forward');
    assert.doesNotMatch(out, /…/, 'and never with a truncated sentence');
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

describe('core: relationship — a clause break is not an ABBREVIATION', () => {
  // `named()` and the flat path each carried their own copy of the clause-break regex, and both
  // ended the sentence arm at `\.\s+` — which fires on any abbreviation. A shipped deck printed
  // "→ next: FTC v" for a member named "FTC v. Avast": a truncated, mis-spelled party name shown
  // as wayfinding. Three reviewers found it independently on three different decks; none of the
  // unit tests did, because none carried an abbreviation.
  const li = (t) => `<li>${t}</li>`;

  test('an abbreviation does not end the name', () => {
    assert.equal(labelOf(li('FTC v. Avast')), 'FTC v. Avast');
    assert.equal(labelOf(li('Acme Inc. filing')), 'Acme Inc. filing');
    assert.equal(labelOf(li('Reg. 4 disclosure')), 'Reg. 4 disclosure');
  });

  test('a real sentence still ends the name', () => {
    assert.equal(labelOf(li('Draft the policy. Then circulate it to the council')), 'Draft the policy');
  });

  test('the other two clause breaks are unchanged', () => {
    assert.equal(labelOf(li('Sequence — each page names the step that follows')), 'Sequence');
    assert.equal(labelOf(li('Recency: the decay half-life')), 'Recency');
  });
});

describe('core: relationship — a RE-AUTHORED member carries a labeled title slot', () => {
  // `coverWindow` (lib/core/carousel.js) rebuilds each member of the five cover strategies as
  // `<span class="split-pt-t">title</span><span class="split-pt-b">body</span>`. That title is not
  // inferred from shape, it is LABELED — so `labelOf` reads it rather than falling through to the
  // flat-run path, which took the whole member ("Recency Time-decay against a configurable
  // half-life."), found no clause break, ran past the budget and declined.
  //
  // Measured on a real `list-tabular` split before this: every page read "→ continues" while the
  // page it pointed at was plainly named. That is §0b's own failure — atomised members with no
  // adornment joining them — on the five strategies that re-author their body.
  const member = (title, body) =>
    `<li><span class="split-pt-t">${title}</span><span class="split-pt-b">${body}</span></li>`;

  test('the slot title becomes the pointer label', () => {
    assert.equal(labelOf(member('Recency', 'Time-decay against a configurable half-life.')), 'Recency');
    assert.equal(labelOf(member('Why not buy', 'Every vendor contract assumed a schema we do not have.')), 'Why not buy');
  });

  test('an over-long slot title still DECLINES rather than clipping', () => {
    // The budget is the same one every other path applies: a truncated fragment reads as a
    // rendering bug, so the pointer says nothing rather than something broken.
    assert.equal(labelOf(member('A title that is far too long to serve as a wayfinding label at all', 'b')), '');
  });

  test('a slot title with a clause break is cut at the break, not clipped', () => {
    assert.equal(labelOf(member('Recency — the decay half-life', 'b')), 'Recency');
  });

  test('trailing sentence punctuation is dropped', () => {
    assert.equal(labelOf(member('Draft the policy.', 'b')), 'Draft the policy');
  });
});

describe('core: relationship — degenerate inputs say nothing rather than lie', () => {
  test('a table with no <tbody> does not count its HEADER row as a member', () => {
    // markdown-it always emits a `<tbody>`, so this is the raw-HTML / hand-authored path. Left
    // unguarded, the scan started at 0 and swept the `<thead>` row in: a three-option table
    // signaled "Option 1 of 4", and the count disagreed with `countAxis`, which sees none.
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

describe('core: the signal resolves its axis from the PAGE, not the manifest (§8 rule 1)', () => {
  // The cut is made on the DERIVED axis. If the signal resolves its own axis from the manifest
  // instead, the two disagree exactly where rule 1 says they can — a component that authors one
  // shape and renders another — and `membersIn` then searches for a collection that is not on the
  // page: the three narrative kinds go silent and `comparison` prints a count of zero.
  //
  // SYNTHETIC on purpose, and worth stating plainly: all four components that declare
  // `capacity.relationship` today author `item` AND render `<ul>`/`<ol>`, so no shipped deck can
  // exercise this. Without a fixture the guard is unpinned — reverting it to `cap.split?.axis ||
  // cap.axis` passed all 4363 tests.
  const CAP = { 'pivot-grid': { axis: 'item', perPage: 1, relationship: 'comparison' } };
  const row = (name) => `<tr><td><strong>${name}</strong></td><td><span class="badge b">Residency</span></td></tr>`;
  const page = (n, rows) =>
    `<section data-split-run="r1" data-split-role="${n === 0 ? 'cover' : 'body'}" ` +
    `data-lattice-slide="${n + 1}" class="${n === 0 ? 'content lat-split-cover form' : 'pivot-grid form lat-split-native'}">` +
    `<h2>T</h2><table><tbody>${rows.map(row).join('')}</tbody></table></section>`;

  test('an `item`-declaring component that RENDERS a table still counts its rows', () => {
    const deck = [page(0, ['x']), page(1, ['Build']), page(2, ['Buy']), page(3, ['Delay'])].join('');
    const out = applyRelationshipSignals(deck, CAP);
    assert.match(out, /Option 1 of 3/, 'the members are the rendered rows, not the authored items');
    assert.match(out, /Option 2 of 3/);
    assert.match(out, /Option 3 of 3/);
    assert.doesNotMatch(out, /of 0/, '"Option 1 of 0" is the failure this guards');
    assert.match(out, /comparing Residency/, 'the criteria still read off the first member');
  });
});

// ── textOf over TYPESET MATH — a pointer must read SYMBOLS, not source ────────────────
//
// KaTeX writes its content THREE times: a MathML `<mi>` mirror, an `<annotation encoding=
// "application/x-tex">` holding the TeX the author typed, and a visual half built from one
// `<span>` per glyph box padded with a zero-width space. Each of the three has shipped in the
// forward pointer of a `math` legend page and each was wrong in its own way: all three together
// read `$X$` as "X X X"; the visual half alone read `$y_i$` as "y i ␀"; the annotation alone put
// a literal `\\sigma →` on the slide.
//
// The MathML mirror is the one that is neither duplicated nor source, so it wins. Its tokens are
// character-level and are joined WITHOUT a separator, which is what keeps `X^\\top X` from
// re-acquiring the "X ⊤ X" spacing.
//
// Real KaTeX output, not a hand-built fixture: the whole point is that the markup shape is
// the library's, not ours.
describe('core: relationship — textOf reads typeset math as rendered symbols', () => {
  const katex = require('katex');
  const typeset = (tex, opts = {}) => katex.renderToString(tex, { throwOnError: false, ...opts });

  // [ TeX the author typed, what the pointer must read ]
  const SYMBOLS = [
    ['\\sigma', 'σ'],
    ['\\ell', 'ℓ'],
    ['X^\\top X', 'X⊤X'],
    ['n \\times p', 'n×p'],
    ['\\text{ARR}', 'ARR'],
    // Honestly imperfect and deliberately not special-cased: an accent is written base-then-mark
    // and a subscript loses its level. Both are the right GLYPHS, which is the bar for a chrome
    // chip — and pinning them here means a future change to the join has to say so.
    ['\\hat\\beta', 'β^'],
    ['y_i', 'yi'],
  ];

  for (const [tex, want] of SYMBOLS) {
    test(`inline $${tex}$ reads back as \`${want}\``, () => {
      assert.equal(textOf(`${typeset(tex)} — a legend line`), `${want} — a legend line`);
    });
  }

  test('NO backslash command reaches the text — that is the defect this replaced', () => {
    // The regression that put `\sigma →` and `X^\top X →` on examples/math-split-structure.md
    // was a passing test away from shipping again: reading the annotation is a plausible fix.
    for (const [tex] of SYMBOLS) {
      assert.doesNotMatch(textOf(typeset(tex)), /\\/, `TeX source leaked for ${tex}`);
    }
  });

  test('a DISPLAY equation reads the same way', () => {
    assert.equal(textOf(typeset('a = b + c', { displayMode: true })), 'a=b+c');
  });

  test('math with the MathML mirror suppressed still degrades to the visual half, not to nothing', () => {
    // NOT what any shipping path passes — this comment used to claim it was. `lattice-emulator.js`
    // sets `htmlAndMathml`, and `'html'` was removed there for accessibility. It is asserted
    // anyway because it is the shape a differently-configured caller would produce, and because
    // the annotation cannot rescue it: the annotation lives INSIDE the MathML, so a render with no
    // `<math>` has neither source. The glyph boxes are all there is, and the contract is that the
    // text SURVIVES, not that it is pretty. (The claim was corrected by the HARD RULE #25
    // checker, which measured both halves of it.)
    const out = textOf(typeset('ab', { output: 'html' }));
    assert.match(out, /a/);
    assert.match(out, /b/);
  });

  // ── labelOf: an EQUATION is not a name ──────────────────────────────────────────────
  //
  // A `derivation` row is `| equation | what you did |`, and the flat path took the whole row:
  // the pointer on examples/math-split-structure.md p5.3 read
  // `limh→0f(x+h)−f(x)h=f′(x) take the limit →`. It fits the 42-character budget, so nothing
  // declined it — which is why the rule is about SHAPE, not length.
  const tr = (...cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;

  test('a leading equation is dropped and the member prose becomes the name', () => {
    const row = tr(typeset('\\lim_{h\\to 0} \\frac{f(x+h)-f(x)}{h} = f\'(x)'), 'take the limit');
    assert.equal(labelOf(row), 'take the limit');
  });

  test('a leading SYMBOL is kept — if the deck can SET it', () => {
    // A symbol names a thing and an equation makes a claim, so `- $n$ — the sample size` still
    // points at `n`. But that only holds for a symbol the chip can print: the pill is `--fs-meta`
    // in the deck's TEXT face, and `σ` / `X⊤X` are not in it. The committed demo PDF proved it —
    // pages 10, 13 and 18 embed `DejaVuSans-Bold` and no other page does, and page 10's chip reads
    // `XTX` at 300dpi, a DIFFERENT EXPRESSION from the equation above it. An untypeable symbol is
    // a wrong name, and the description beside it is a right one, so it hands the name over.
    for (const [tex, want] of [['n', 'n'], ['a + b', 'a+b'], ['\\log x', 'logx']]) {
      assert.equal(labelOf(`<li>${typeset(tex)} — a description of it</li>`), want);
    }
    for (const tex of ['\\sigma', 'X^\\top X', 'n \\times p', '\\beta']) {
      assert.equal(labelOf(`<li>${typeset(tex)} — a description of it</li>`), 'a description of it',
        `\`${tex}\` kept a name the deck's text face cannot set`);
    }
  });

  test('a member that is ONLY an equation keeps the equation', () => {
    // Same shape as "a figure with NOTHING after it keeps the figure": dropping the lead would
    // leave no label at all, which is strictly worse than a terse one.
    assert.equal(labelOf(`<li>${typeset('a = b')}</li>`), 'a=b');
  });

  test('a relation written as `<` is still a relation — the escape does not hide it', () => {
    // markdown-it escapes `<` to `&lt;` and nothing decodes on the way to the label, because the
    // signal writes it into markup raw and the browser decodes it there. The DETECTION has to
    // decode or `$f(x) < y$` looks like a symbol run and keeps its equation.
    assert.equal(labelOf(tr(typeset('f(x) < y'), 'strictly below')), 'strictly below');
  });

  test('a RELATION is whatever KaTeX says it is — the census, re-derived', () => {
    // THE POINT OF THIS ARM. The relation set has been wrong twice: an enumeration that missed five
    // everyday commands, then hand-cut Unicode ranges that missed 69 of KaTeX's 219 relation atoms.
    // A third hand-built set would have been wrong a third time, so the constant is mechanical and
    // this re-derives it from the SAME installed KaTeX. A version bump that adds a relation fails
    // here instead of shipping a chip full of operators.
    // NAMED, so neither sweep's silence is the only evidence. `\eqcolon` is here because the
    // hand-written supplement it replaced missed it.
    const NAMED_MACROS = [['\\ne', '≠'], ['\\notin', '∉'], ['\\notni', '∌'],
      ['\\coloneqq', '≔'], ['\\eqqcolon', '≕'], ['\\Coloneqq', '∷'], ['\\eqcolon', '∹']];
    const src = fs.readFileSync(require.resolve('katex/dist/katex.mjs'), 'utf8');
    const declared = new Set();
    // The symbol strings in katex.mjs are `"\\u2260"` shaped — no embedded quotes — so a plain
    // `"[^"]*"` reads them, and `JSON.parse` turns the escape into the character.
    const re = /defineSymbol\(\s*math\s*,\s*\w+\s*,\s*rel\s*,\s*("[^"]*")/g;
    for (let m = re.exec(src); m; m = re.exec(src)) {
      const ch = JSON.parse(m[1]);
      if ([...ch].length === 1) declared.add(ch);
    }
    assert.ok(declared.size > 200, `expected KaTeX's rel table, found ${declared.size} entries`);
    const missing = [...declared].filter((c) => !RELATION.test(c));
    assert.deepEqual(missing, [], 'RELATION no longer covers every `rel` atom KaTeX declares');
    // AND THE REVERSE. A one-directional census certifies a set that has quietly grown — a stray
    // range, an operator slipping in — and `n×p` stops being a name without a test saying so.
    // Derived from the same NAMED_MACROS the forward half asserts, so the two cannot drift, plus
    // nothing else. The first cut listed eleven characters by hand and four of them (`= < > :`) are
    // declared `rel` atoms — inert entries with no stale check, which is the shape every
    // `SANCTIONED_*` allowlist in tools/check-ownership.js is careful to reject.
    const supplement = new Set(NAMED_MACROS.map(([, ch]) => ch));
    const inert = [...supplement].filter((ch) => declared.has(ch));
    assert.deepEqual(inert, [], 'a macro supplement entry is now a declared rel atom — drop it');
    const extra = [];
    for (let c = 0; c < 0x10000; c += 1) {
      const ch = String.fromCharCode(c);
      if (RELATION.test(ch) && !declared.has(ch) && !supplement.has(ch)) extra.push(ch);
    }
    assert.deepEqual(extra, [], 'RELATION carries characters KaTeX calls neither a rel atom nor a macro relation');

    // The SECOND half: relations KaTeX builds with a MACRO, so no `rel` line mentions them.
    // Deriving from the table alone loses `≠`, which is not a set anyone should ship — and the
    // first cut of this half was a hand-written six, which is the same failure mode one rung down.
    // So it is swept: every `defineMacro` name, rendered, and any single character KaTeX sets as a
    // relation (`<mo>` inside an `mrel`-classed row) must be in RELATION. That is what found `∹`.
    const macros = new Set();
    for (const m of src.matchAll(/defineMacro\(\s*("[^"]*")/g)) {
      const name = JSON.parse(m[1]);
      if (/^\\[a-zA-Z]+$/.test(name)) macros.add(name);
    }
    assert.ok(macros.size > 200, `expected KaTeX's macro table, found ${macros.size} entries`);
    // THE FIRST CUT OF THIS SWEEP WAS VACUOUS, in two independent ways, and it shipped as the fix
    // for a hand-written list:
    //   · it rendered with `output: 'mathml'` and then looked for `mrel` INSIDE the `<math>` row.
    //     `mrel` is a `katex-html` class — that half is not even emitted under `output: 'mathml'` —
    //     so the gate was always false and every character was skipped;
    //   · `<mo[^>]*>([^<]*)</mo>` cannot see `∹`, because KaTeX writes `\eqcolon` as
    //     `<mo><mi mathvariant="normal">∹</mi></mo>` and `[^<]*` captures the empty string.
    // Either alone made the result unconditionally empty.
    //
    // SO THE SWEEP IS A FUNCTION, CALLED TWICE. The first cut of the self-test re-implemented the
    // loop instead of re-running it, which guarded the copy and not the original: all three ways of
    // making the real sweep vacuous again left the suite green. Calling one function with the real
    // set and with a blinded one is the difference between checking the sweep and checking a
    // paraphrase of it. (HARD RULE #25 checker, sixth pass.)
    const sweep = (relationRe) => {
      const found = new Set();
      for (const name of macros) {
        let html;
        try { html = katex.renderToString(`a ${name} b`, { throwOnError: true }); } catch { continue; }
        // `mrel` on the WHOLE render — the html half is where KaTeX stamps the atom class.
        if (!/mrel/.test(html)) continue;
        const row = /<math[\s\S]*?<\/math>/.exec(html);
        if (!row) continue;
        const body = row[0].replace(/<annotation[\s\S]*?<\/annotation>/, '');
        for (const mo of body.matchAll(/<mo[^>]*>([\s\S]*?)<\/mo>/g)) {
          const ch = stripInner(mo[1]);
          if ([...ch].length !== 1 || ch.codePointAt(0) < 0x2000) continue;
          if (!relationRe.test(ch)) found.add(`${ch} (${name})`);
        }
      }
      return [...found];
    };
    assert.deepEqual(sweep(RELATION), [], 'a KaTeX macro renders a relation RELATION does not carry');
    // The SAME sweep against a set with `∹` blinded out must report it — otherwise "zero uncovered"
    // and "looked at nothing" are the same reading, which is what the first cut was. The constant's
    // SOURCE spells its ranges as literal `\uXXXX` text, so blind it by that text; replacing the
    // character itself is a no-op and would leave this self-test unable to fail in its turn.
    const blinded = new RegExp(RELATION.source.replace('\\u2239', ''));
    assert.notEqual(blinded.source, RELATION.source, 'blinding the census did nothing');
    assert.deepEqual(sweep(blinded), ['∹ (\\eqcolon)', '∹ (\\minuscolon)'],
      'the macro sweep cannot report a missing relation — it is not looking at anything');

    for (const [cmd, want] of NAMED_MACROS) {
      // The annotation goes (it carries the author's TeX, not the rendered character); NO tag strip
      // follows it. Markup here is ASCII, so a relation character cannot hide inside a tag — and a
      // one-shot `<[^>]*>` strip is the very shape CodeQL flags and `stripTags` exists to avoid.
      const body = /<math[\s\S]*?<\/math>/.exec(katex.renderToString(`a ${cmd} b`, { output: 'mathml' }))[0]
        .replace(/<annotation[\s\S]*?<\/annotation>/, '');
      assert.ok(body.includes(want), `${cmd} no longer renders ${want} — the supplement is stale`);
      assert.ok(RELATION.test(want), `${want} (${cmd}) is not in RELATION`);
    }
  });

  test('the relations that were MISSED, each by name', () => {
    // Every one of these shipped the run-together chip under a previous cut of the set. They are
    // spelled out rather than left to the census because the census proves coverage, not intent.
    for (const tex of ['c \\equiv d', 'c \\implies d', 'c \\longrightarrow d', 'c \\simeq d',
      'c \\supset d', 'c \\coloneqq d', 'c \\le d', 'c \\mapsto d', 'c \\in D',
      'c \\nleq d', 'c \\ngeq d', 'L \\triangleq S', 'u \\parallel v', 'd \\mid n',
      'f \\lesssim g', 'A \\sqsubseteq B', 'P \\therefore Q', 'a \\ne b']) {
      assert.equal(labelOf(tr(typeset(tex), 'the step')), 'the step', `\`${tex}\` was not read as a relation`);
    }
  });

  test('an OPERATOR is not a relation — three deliberate holes in the range', () => {
    // `n×p` and `X⊤X` are NAMES, and a range wide enough to be tidy swallowed both: the whole
    // 22A2–22AF turnstile block takes U+22A4, which is how this repo writes transpose, and the
    // whole 2A00–2AFF block takes the n-ary operators.
    // `\\top` is the one that matters: KaTeX classifies it `ord`, so taking KaTeX's word keeps
    // `X^\\top X` out of the relation set for free — a hand-cut turnstile range had to be patched
    // after it did not.
    //
    // ASSERTED ON `RELATION` DIRECTLY, not through `labelOf`, and the indirection is why: five of
    // these six are untypeable, so the type-face rule above now drops them for a reason that has
    // nothing to do with relations. Reading the classification off the label would have made this
    // arm pass for the wrong reason the moment that rule landed — which is exactly what happened
    // to its first cut.
    for (const [tex, glyphs] of [['n \\times p', '×'], ['X^\\top X', '⊤'], ['a + b', '+'],
      ['\\bigoplus_i V', '⨁'], ['a \\oplus b', '⊕'], ['\\sum_i x_i', '∑']]) {
      for (const c of glyphs) {
        assert.ok(!RELATION.test(c), `${c} (\`${tex}\`) is an OPERATOR and RELATION claims it`);
      }
      // …and the drop is not firing on a relation it does not have: a member whose leading math is
      // an operator keeps its own name whenever the face can set it.
      assert.equal(labelOf(`<li>${typeset(tex)} — a description</li>`),
        /[^\x20-\x7E]/.test(glyphs) ? 'a description' : 'a+b');
    }
  });

  test('the clause separator goes with the equation it separated', () => {
    // `- $<math>$ — <description>` is the legend authoring form. Removing the span alone leaves
    // the dash leading and `CLAUSE_BREAK` cannot fire on a dash with nothing before it, so the
    // chip shipped reading `— its right adjoint →`.
    assert.equal(labelOf(`<li>${typeset('L \\dashv R')} — its right adjoint</li>`), 'its right adjoint');
    assert.equal(labelOf(`<li>${typeset('a = b')}, so it holds — the reason</li>`), 'so it holds');
  });

  test('the shape-glyph decline is scoped by a real KaTeX span, not by the word "katex"', () => {
    // The scope test was `src.includes('katex')`, which fires on PROSE — "Enable katex → then
    // rebuild" declined its label. Harmless-sounding until a cycle's closing chip depends on it.
    // No arm pinned it, which is how it survived a full mutation pass. (HARD RULE #25, third.)
    assert.equal(labelOf('<li>Enable katex → then rebuild</li>'), 'Enable katex → then rebuild');
    assert.equal(labelOf('<li>The katex ✓ pass — a note</li>'), 'The katex ✓ pass');
  });

  test('a math label carrying a CURATED SHAPE GLYPH declines (HARD RULE #29)', () => {
    // The chip is set in the deck's TEXT face, so an author's `\to` read out of the MathML lands
    // beside the engine-drawn `--shape-arrow-right` in a different face. Declining degrades to the
    // un-labeled pointer, which still points.
    assert.equal(labelOf(`<li>${typeset('F: A \\to B')}</li>`), '');
    // Scoped to MATH: an author's typed arrow in prose is #29's `lint:deck` warning, which
    // coaches rather than refuses, and silently dropping their wayfinding would coach nothing.
    assert.equal(labelOf('<li>Ship → launch — the plan</li>'), 'Ship → launch');
    // `≠` is in NOT_SHAPES, so `mathSafe` lets it through — and then the TYPE-FACE rule declines it
    // anyway, on the separate ground that the chip cannot set it. That is the same page-18
    // `DejaVuSans-Bold` chip. Dropping the math is not on the table here: it is mid-sentence, and
    // `divide by 0` would be a lie. So the chip degrades to the un-labeled `continues →`.
    assert.equal(labelOf(tr(typeset('a = b'), `divide by ${typeset('h \\neq 0')}`)), '');
  });

  test('one untypeable character deep in the description does not cost the whole name', () => {
    // `- $X^\\top X$ — Gram matrix, $p \\times p$, must be invertible` is a real legend member on
    // `examples/adaptive-sweep.md`. The lead drops (untypeable), leaving `Gram matrix, p × p, must
    // be invertible` — and then the `×`, four words in, declined ALL of it, so the chip read
    // `continues` where `Gram matrix` was sitting right there. Found on the golden-diff montage CI
    // produced for this branch, not by a test: the rule was right and its granularity was wrong.
    const gram = `<li>${typeset('X^\\top X')} — Gram matrix, ${typeset('p \\times p')}, must be invertible</li>`;
    assert.equal(labelOf(gram), 'Gram matrix');

    // A REAL CLAUSE BOUNDARY, not a word break. `divide by h≠0` has no comma, dash or colon before
    // the `≠`, and cutting at the space would ship `divide by h` — which reads as a complete
    // instruction and is a DIFFERENT one, because the condition is the whole point of the step.
    assert.equal(labelOf(tr(typeset('a = b'), `divide by ${typeset('h \\neq 0')}`)), '');
    // Same shape with a comma in front of the math: now there is a thought that ended.
    assert.equal(labelOf(tr(typeset('a = b'), `divide through, given ${typeset('h \\neq 0')}`)),
      'divide through');
    // A boundary AFTER the character does not rescue it — the cut is what precedes the offender.
    assert.equal(labelOf(`<li>maps ${typeset('\\alpha')}, onto the unit interval</li>`), '');
    // …and `\\mathbb{R}` is worth an arm of its own, because it looks like a counter-example and is
    // not: KaTeX's MathML mirror writes it as a plain ASCII `R` with a `mathvariant`, so it is
    // typeable and the label survives whole. A first draft of this arm asserted the opposite.
    // …and the comma sits against the `R`, not a space away from it: `stripMathMirror` pads every
    // extracted span on both sides, so this read `maps R , onto …` and the chip printed the gap.
    assert.equal(labelOf(`<li>maps ${typeset('\\mathbb{R}')}, onto the unit interval</li>`),
      'maps R, onto the unit interval');
  });

  test('an UNDEFINED CONTROL SEQUENCE is not a symbol — the error mirror is refused', () => {
    // KaTeX renders `\\dfracc{a}{b}` as `<mstyle mathcolor="#cc0000"><mtext>\\dfracc</mtext></mstyle>` —
    // the author's SOURCE, in red, with no error CLASS anywhere — and reading that as "the same
    // symbols as Unicode" put a literal `\\dfraccab` in a chip, which is precisely the defect the
    // MathML read exists to remove. The refusal shipped with no arm: mutating it to
    // `const errored = false` passed 2,251 core+engine tests. (HARD RULE #25 checker, on this fold.)
    const bad = typeset('\\dfracc{a}{b}');
    assert.match(bad, /mathcolor="#cc0000"/, 'the fixture must actually render the error form');
    assert.doesNotMatch(bad, /katex-error/, '…and carry no error class, or it pins nothing');
    assert.doesNotMatch(labelOf(`<li>${bad}</li>`), /dfracc/, 'and with nothing beside it, decline');
    const label = labelOf(`<li>${bad} — a description of it</li>`);
    // `/\\/`, ONE backslash. This read `/\\\\/` — two — for two commits, so it could not fail on
    // `\frac{a`, the exact string the branch shipped to a slide.
    //
    // AND IT GOES FIRST, which the fold that fixed the escaping did not do. `node:assert` throws at
    // the first failing call, so an assertion that sits BELOW a strictly stronger one can never be
    // the one that reports: over eleven mutations that leaked raw TeX into the label, this
    // message appeared ZERO times and `doesNotMatch(/dfracc/)` reported every one. Non-vacuous is
    // not the same as reachable, and the commit message claimed the first while meaning the
    // second. (HARD RULE #25 checker, twelfth pass, which measured it.)
    assert.doesNotMatch(label, /\\/, 'no backslash command may reach a rendered label');
    assert.doesNotMatch(label, /dfracc/, "the author's broken SOURCE reached the chip");
    // A WELL-FORMED sibling still reads its symbols, so the refusal is scoped to the ERROR render
    // rather than to "math with a `\\dfrac` in it" — and what it reads is `ab`, which is worth
    // asserting rather than hiding. The mirror is symbols, not structure, so a fraction loses its
    // bar exactly as an accent is written base-then-mark (`\\hat\\beta` → `β^`) and a subscript
    // loses its level (`y_i` → `yi`). Same known family, pinned so a future change has to say so.
    assert.equal(labelOf(`<li>${typeset('\\dfrac{a}{b}')} — a description of it</li>`), 'ab');
  });

  test('the 42-character budget counts what a READER sees, not what the escape costs', () => {
    // The label travels entity-ESCAPED — it is written into the signal's markup raw and the
    // browser decodes it there — so `&amp;` is five characters in this string and one in the pill.
    // `Research & development & ops & tools` is 36 characters to a reader and 48 here, and it
    // declined. The stamp path used to decode before measuring; that decode was an XSS sink and
    // removing it was right, but the budget accounting went with it.
    const amp = '<li><strong>Research &amp; development &amp; ops &amp; tools</strong> body</li>';
    assert.equal(labelOf(amp), 'Research &amp; development &amp; ops &amp; tools');
    // …and the budget still BITES on a genuinely long name, so this is an accounting fix and not
    // a hole: 44 visible characters, no entities, declines.
    const long = `<li><strong>${'x'.repeat(44)}</strong> body</li>`;
    assert.equal(labelOf(long), '');
  });

  test('a character the author typed as PROSE is not judged by math elsewhere in the member', () => {
    // `labelOf` wrapped its answer in a SECOND `typeSafe` with the whole member as the math
    // source, after `safeName` had already run it with the correctly-scoped one. So an `α` typed
    // in the title declined whenever an `\alpha` happened to appear in the body — the identical
    // member with `alpha` spelled out kept its name. That is a guard deciding on markup the label
    // does not contain, which is the defect `safeName`'s own docblock says it removed.
    const gate = (tail) => `<li><strong>α-release gate</strong> the cutover, where ${tail}</li>`;
    assert.equal(labelOf(gate(`${typeset('\\alpha')} is the shrink factor`)), 'α-release gate');
    assert.equal(labelOf(gate('alpha is the shrink factor')), 'α-release gate');
    assert.equal(labelOf(`<li><strong>Cost × volume</strong> the driver, see ${typeset('c \\times v')}</li>`),
      'Cost × volume');
    // The rule it must NOT weaken: a character that came out of THIS label's own math still
    // declines, because that is the one the chip cannot set.
    assert.equal(labelOf(`<li>${typeset('F: A \\to B')}</li>`), '');
  });

  test('the type-face decline reads the characters MATH produced, not the whole label', () => {
    // Two shortcuts were tried in one revision and both are wrong the same way. `src.includes('katex')`
    // is the scope error `mathSafe` had already been taught (arm above). And testing the WHOLE label
    // for non-ASCII declines prose the text face sets perfectly well — a legend member is allowed an
    // accent. The mirror reader hands back what it took out of each span, so the test is membership.
    assert.equal(labelOf(`<li>${typeset('a = b')} — Café results</li>`), 'Café results');
    assert.equal(labelOf('<li>Café results — the katex run</li>'), 'Café results');
    // And it still declines when the character DID come out of the math.
    assert.equal(labelOf(tr(typeset('a = b'), `bound by ${typeset('\\varepsilon')}`)), '');
  });

  // ── the four label paths are ONE path ────────────────────────────────────────────────
  //
  // Four readers (carousel slot title, leading `<strong>`, `<h3>`+, flat run) fed two copies of
  // the same four steps, and the copies disagreed. `safeName` is the single definition now
  // (HARD RULE #1); these arms are what says so. All from the HARD RULE #25 checker's final pass.

  test('the NAMED and FLAT paths agree — identical content, identical chip', () => {
    // The only difference was what `mathSafe` was handed as its source: the named path bounded it
    // to the title element, the flat path to the whole leading run. So `- **Recency** — decays
    // toward $A \to B$` kept its name and `- Recency — decays toward $A \to B$` declined, for
    // content that renders the same chip either way.
    const tail = `— decays toward ${typeset('A \\to B')}`;
    assert.equal(labelOf(`<li><strong>Recency</strong> ${tail}</li>`), 'Recency');
    assert.equal(labelOf(`<li>Recency ${tail}</li>`), 'Recency');
    assert.equal(labelOf(`<li><h3>Recency</h3> ${tail}</li>`), 'Recency');
  });

  test('a glyph in the DISCARDED half does not decline the label', () => {
    // `mathSafe` ran before the clause break, so an arrow in the description — which the chip
    // never carries — killed a perfectly good name. Zero corpus members hit it, which is exactly
    // why it needed a reader rather than a render.
    assert.equal(labelOf(`<li><strong>Recency — decays ${typeset('A \\to B')}</strong></li>`), 'Recency');
    assert.equal(labelOf(`<li>Recency: maps ${typeset('A \\to B')} onto the unit interval</li>`), 'Recency');
  });

  test('a DROPPED equation does not poison the prose that survives it', () => {
    // `dropLeadEquations` and `mathSafe`'s span-scoped source were each right alone. Together they
    // made the #29 decline depend on markup the label no longer contains: two derivation rows with
    // identical prose disagreed, one because it happened to lead with an equation.
    assert.equal(labelOf(tr(typeset('a = b'), 'then A → B')), 'then A → B');
    assert.equal(labelOf(tr('plain', 'then A → B')), 'plain then A → B');
  });

  test('the carousel SLOT TITLE is read depth-aware, like everything else in this file', () => {
    // `/<span class="split-pt-t">([\s\S]*?)<\/span>/` was here, on the read that is checked FIRST,
    // in a file that bans that lazy pair twice over. KaTeX nests `<span>`s, so a slot title
    // carrying math captured up to the first inner close, left unbalanced spans behind, and both
    // of `stripMathMirror`'s loops bailed: the chip shipped `X ⊤ X X^\top X` — the visual half AND
    // the raw TeX — on a rendered slide. Pre-existing on `origin/main`; on-path here (#18).
    const slot = (t, b) => `<div class="split-pt"><span class="split-pt-t">${t}</span><span class="split-pt-b">${b}</span></div>`;
    assert.equal(labelOf(slot('Recency', 'Time-decay against a configurable half-life.')), 'Recency');
    // The math title declines (its characters are untypeable) — what it must NEVER do is print
    // KaTeX's internals, so assert the shape rather than only the value.
    const math = labelOf(slot(typeset('X^\\top X'), 'the Gram matrix'));
    assert.doesNotMatch(math, /\\top|span|katex/);
    // A TYPEABLE math title still names its page, which is what proves the read itself works.
    assert.equal(labelOf(slot(typeset('R'), 'the reals')), 'R');
  });

  test('KaTeX has TWO failure renderings and the CLASSED one has no `.katex` wrapper', () => {
    // A ParseError renders as `<span class="katex-error" style="color:#cc0000">\\frac{a</span>` —
    // no `.katex` wrapper and no MathML anywhere — so a scan for `katex` alone walked past it,
    // `stripMathMirror` never touched it, and `stripTags` flattened the author's raw TeX into the
    // chip: a rendered slide read `\\frac{a →`. `mathSafe` keys on the same scan, so the #29
    // shape-glyph guard was off for these members too.
    //
    // `lib/engine/math.js` had ALREADY learned this — its docblock says so and it tests both. This
    // file learned half of it twice: first by reading the error mirror as symbols, then by
    // refusing that mirror while leaving the classed rendering invisible.
    for (const tex of ['\\frac{a', '\\left( a', '\\begin{foo}x\\end{foo}']) {
      const err = typeset(tex);
      assert.match(err, /katex-error/, `${tex} must render the CLASSED failure`);
      const label = labelOf(`<li>${err} — a description of it</li>`);
      // Before the equality, so that a leaked backslash is what REPORTS — see the note on the
      // same pair in the `\dfracc` arm above. `biome`'s formatter is off in this repo, so the
      // mis-indented block this replaces was invisible to `npm run lint` as well.
      assert.doesNotMatch(label, /\\/, 'no backslash command may reach a rendered label');
      assert.equal(label, 'a description of it', `\`${tex}\` reached the chip`);
    }
    // AND THE SEPARATOR GOES WITH IT. `decoded` is '' for a failed render, and returning early
    // there left the em dash leading: the chip shipped `— a description of it`, which is
    // character-for-character the defect this file records as fixed for `L \\dashv R`.
    for (const sep of ['—', '–', ',', ':']) {
      assert.equal(labelOf(`<li>${typeset('\\frac{a')} ${sep} a description of it</li>`),
        'a description of it', `the \`${sep}\` separator survived the drop`);
    }
  });

  test('the ERROR span is classified by the same tag bound as everything else', () => {
    // The first cut tested `/^<span[^>]*\\sclass="[^"]*…katex-error…/`, and `[^>]*` before a quoted
    // attribute is the exact shape this file spent three commits removing: it bounds the tag at
    // the first `>`, which Chromium does not. A `katex-error` span carrying `title="a>b"` BEFORE
    // its `class` was FOUND by the scan and then not CLASSIFIED by the test, so `errored` came
    // back false and the author's raw `\\frac{a` flattened into the pointer pill — the very defect
    // the commit that added the regex claims to close. Reachable from `html: true`, which is the
    // same reachability this file has twice accepted as reason enough to fix.
    const err = (attrs) => `<li><span ${attrs}>\\frac{a</span> — the unclosed one</li>`;
    for (const attrs of [
      'class="katex-error" style="color:#cc0000"',
      'title="a>b" class="katex-error" style="color:#cc0000"',
      "title='a>b' class=\"katex-error\"",
      'class="katex-error" title="a>b"',
    ]) {
      const label = labelOf(err(attrs));
      assert.doesNotMatch(label, /\\/, 'no backslash command may reach a rendered label');
      assert.equal(label, 'the unclosed one', `attrs \`${attrs}\` leaked the source`);
    }
    // And it does NOT fire on a span that merely mentions the string — the `^` anchor and the
    // token test, both of which the regex claimed and no arm held.
    // `x`, not `desc`: the clause break cuts at ` — `, and reading it as an ERROR would have
    // dropped the span AND its separator, leaving `desc`. The difference between the two answers
    // is exactly the distinction under test.
    assert.equal(labelOf('<li><span class="katex" title="katex-error">x</span> — desc</li>'), 'x');
    for (const cls of ['katex-errors', 'my-katex-error']) {
      assert.match(labelOf(`<li><span class="${cls}">zz</span> — desc</li>`), /zz/,
        `\`${cls}\` was treated as the error rendering`);
    }
  });

  test('a GOOD span before an errored one is still read — the scan takes the EARLIER', () => {
    // `findKatexSpan` returns the MIN of the `.katex` and `.katex-error` scans, and that `Math.min`
    // is load-bearing: hand it the error span when a good one comes first and `stripMathMirror`
    // skips the good one, so the label falls back to KaTeX's per-glyph visual half — which is the
    // `X ⊤ X` spacing and the `y i ␀` padding this whole thread exists to remove. It shipped with
    // no arm, and both directions of the mutation survived all 9,329 tests.
    const mixed = `${typeset('X^\\top X')} and ${typeset('\\frac{a')} — desc`;
    assert.doesNotMatch(textOf(mixed), /X ⊤ X/, 'the visual half reached the text');
    assert.equal(textOf(mixed), 'X⊤X and — desc');
    // …and with the subscript shape, whose failure is the one that reads worst.
    const sub = `${typeset('y_i')} and ${typeset('\\frac{a')} — desc`;
    assert.doesNotMatch(textOf(sub), /[\u200B\u2061-\u2064]/, 'an invisible operator reached the text');
    assert.equal(textOf(sub), 'yi and — desc');
  });

  test('the EMPTINESS test bounds a tag the same way the rest of the file does', () => {
    // `hasVisibleText` is the cheap "would dropping this leave nothing" check, and it was the last
    // reader in the file still using `indexOf('>')` — added by the same fold that converted every
    // other one. A quoted attribute carrying a `>` made it answer "yes" on attribute text, so
    // `dropLeadEquation` dropped a lead it should have kept and the chip was lost silently.
    const eq = typeset('f(x) = y');
    assert.equal(labelOf(`<li>${eq}<span title="a>b"></span></li>`), 'f(x)=y');
    // The control: the same member without the attribute already worked, so the arm pins the
    // BOUND rather than the emptiness rule.
    assert.equal(labelOf(`<li>${eq}<span></span></li>`), 'f(x)=y');
  });

  test('a `>` inside a quoted attribute value is not the end of the tag', () => {
    // Chromium parses `<td title="a>b">x</td>` as one TD with both attributes; `<[^>]*>` stops at
    // the first `>` and leaves `b">` behind, so a chip read `b"> f(x)=y the limit step` — raw
    // attribute text plus the un-dropped equation, on a slide. `tagEnd` is the bound this file
    // already worked out; three readers use it now (the strip, the drop walk, the outer-tag slice).
    const step = `${typeset('f(x) = y')} the limit step`;
    assert.equal(labelOf(`<td>${step}</td>`), 'the limit step');
    assert.equal(labelOf(`<td title="a>b">${step}</td>`), 'the limit step');
    assert.equal(stripTags('<td title="a>b">x</td>', ' ').trim(), 'x');
  });

  test('the CLASS reader is quote-agnostic, in both directions', () => {
    // `/\sclass="([^"]*)"/` was the class reader, and double-quote-only is wrong TWICE over.
    // Chromium reads `class='katex-error'` and `class=katex-error` as that class and this file read
    // neither, so `isErrorSpan` said false and the author's raw `\frac{a` flattened into the pill —
    // the blocker the commit before this one closed, one quoting style over. And it matched INSIDE
    // another attribute's VALUE, so `<span title=" class='katex-error'">` was classified as the
    // error rendering and its visible words were dropped instead. Both rendered before the fix.
    // (HARD RULE #25 checker, twelfth pass.)
    const err = (attrs) => labelOf(`<li><span ${attrs}>\\frac{a</span> — the unclosed one</li>`);
    for (const attrs of [
      'class="katex-error"',
      "class='katex-error' style=\"color:#cc0000\"",
      'class=katex-error style="color:#cc0000"',
      "style='color:#cc0000' class=katex-error",
    ]) {
      assert.doesNotMatch(err(attrs), /\\/, `attrs \`${attrs}\` leaked the source`);
      assert.equal(err(attrs), 'the unclosed one', `attrs \`${attrs}\` was not read as the error`);
    }
    // The mirror: a `class=` that lives inside ANOTHER attribute's value is not a class. Chromium
    // reads no class at all here, so the span is ordinary markup and its words are the name.
    // The quoting is load-bearing and a first draft got it backwards — a SINGLE-quoted `title`
    // around a DOUBLE-quoted `class` is what the old reader matched, and the reverse shape it
    // was written with could not have failed.
    const Q = String.fromCharCode(39);
    assert.equal(
      labelOf(`<li><span title=${Q} class="katex-error"${Q}>visible words</span> — the description</li>`),
      'visible words', 'a `class=` inside another attribute VALUE was read as a class');
    // …and the FIRST `class` wins when a tag carries two, which is what Chromium keeps.
    assert.equal(labelOf('<li><span class="katex" class="katex-error">zz</span> — desc</li>'), 'zz');
  });

  test('every STRUCTURAL reader bounds its tag the same way — five of them did not', () => {
    // `<h[3-6][^>]*>`, `<(?:ul|ol)\b[^>]*>`, `<li[^>]*>`, `<math\b[^>]*>` and the leading-tag run
    // in front of `<strong>` were all still bounding a tag at the first `>`. Three put ATTRIBUTE
    // TEXT straight onto a chip. The fifth is worse than the "missed match, harmless fallback" it
    // was first written up as: when the run does not match, the FIGURE RULE never runs, so
    // `<p title="a>b"><strong>31</strong> deals closed this quarter` labeled its page
    // `31 deals closed this quarter` — the whole run WITH the numeral, which is the exact shape
    // `isFigure` exists to refuse. A first draft of this arm asserted only the harmless shape and
    // SURVIVED the mutation; the two figure shapes below are what makes it a pin.
    // Each pair is the same member with and without a `>` in an attribute value, and the answers
    // must agree. (HARD RULE #25 checker, twelfth pass, each rendered.)
    const pairs = [
      ['a heading', '<div><h3 A>Ridge regression</h3><p>body</p></div>', 'Ridge regression'],
      ['a nested list item', '<li><strong>31</strong><ul><li A>Keep whole</li></ul></li>', 'Keep whole'],
      ['the nested list itself', '<li><strong>31</strong><ul A><li>Keep whole</li></ul></li>', 'Keep whole'],
      ['a leading tag before <strong>', '<li><p A><strong>Ridge.</strong> a description</p></li>', 'Ridge'],
      ['a figure, named by its nested item',
        '<li><p A><strong>31</strong><ul><li>Keep whole and ring</li></ul></p></li>', 'Keep whole and ring'],
      ['a figure, named by the run after it',
        '<li><p A><strong>31</strong> deals closed this quarter</li>', 'deals closed this quarter'],
      ['the labeled title slot', '<li><span class="split-pt-t" A>Named by the splitter</span> rest</li>',
        'Named by the splitter'],
    ];
    for (const [what, shape, want] of pairs) {
      assert.equal(labelOf(shape.replace(' A', ' title="x"')), want, `${what}: the control moved`);
      assert.equal(labelOf(shape.replace(' A', ' title="a>b"')), want, `${what}: the tag bound leaked`);
    }
    // The MathML mirror, which is the reader the whole math label path rests on.
    const mirror = '<semantics><mrow><mi>σ</mi></mrow>'
      + '<annotation encoding="application/x-tex">\\sigma</annotation></semantics>';
    const span = (attrs) => `<span class="katex"><span class="katex-mathml"><math ${attrs}>${mirror}</math></span></span>`;
    assert.equal(textOf(span('display="block"')), 'σ');
    assert.equal(textOf(span('title="a>b" display="block"')), 'σ');
    // And the annotation is read in either quoting style, since the tag is bounded before the
    // `encoding` test rather than by it.
    const noMathml = (q) => `<span class="katex-error">x</span><span class="katex"><span class="katex-mathml">`
      + `<annotation encoding=${q}application/x-tex${q}>\\sigma</annotation></span></span>`;
    assert.equal(textOf(noMathml('"')), textOf(noMathml("'")));
  });

  test('a dropped equation takes its separator with it, whatever tags sit between', () => {
    // The strip was `(?:\s|<[^>]*>)*` then the separator, and that `<[^>]*>` is the same bound:
    // one tag carrying a `>` in an attribute defeated it and the chip shipped
    // `— the Gram matrix of the design`, character-for-character the defect this function's own
    // comment records as fixed for `L \dashv R`. (HARD RULE #25 checker, twelfth pass.)
    const eq = typeset('X^\\top X');
    const member = (attrs) => `<li>${eq} <span ${attrs}></span> — the Gram matrix of the design</li>`;
    assert.equal(labelOf(member('title="x"')), 'the Gram matrix of the design');
    assert.equal(labelOf(member('title="a>b"')), 'the Gram matrix of the design');
    // No separator, no change: the strip must not eat a leading word.
    assert.equal(labelOf(`<li>${eq} <span title="a>b"></span> the Gram matrix</li>`), 'the Gram matrix');
  });

  test('the nested-list read keeps the LAZY, EXACT-NAME close the regexes had', () => {
    // Two regressions from one line, and the first lands on STRAIGHT AUTHORED MARKDOWN — the shape
    // the commit that caused it claimed could not be affected. Routing the `<li>` read through
    // `findMatchingClose` swapped a lazy `([\s\S]*?)</li>` for a DEPTH-AWARE close, so a `stats`
    // member whose first sub-bullet carries its own sub-list AND further text handed the whole
    // item to the label, blew the budget and declined — the pointer stopped naming the next page.
    // This fixture is what markdown-it really emits for:
    //   - **119%**
    //     - Net revenue retention
    //       - measured yearly
    //
    //       across cohorts
    const deep = '<li><strong>119%</strong>\n<ul>\n<li>\n<p>Net revenue retention</p>\n<ul>\n'
      + '<li>measured yearly</li>\n</ul>\n<p>across cohorts</p>\n</li>\n</ul>\n</li>';
    assert.equal(labelOf(deep), 'Net revenue retention measured yearly');
    // …and `findMatchingClose` PREFIX-matches its tag name, so `<li` counts `<line>`, `<link>` and
    // `<listing>` as nested items. One `<svg><line/></svg>` inside a metric name ran the reader
    // past its own `</li>` and swallowed the NEXT item: the chip read `Keep whole Second item
    // entirely`. (`<annotation>` counts `<annotation-xml>` the same way — a real MathML element.)
    // Both halves of that need a CLOSE tag to bite, and they bite in different readers: the
    // depth-aware walk miscounts a self-closing `<line/>` as an open `<li>`, while a lazy scan for
    // `</li` stops at a `</line>` or `</listing>`. One fixture per mechanism, or one of the two
    // rides on the other — the first draft of this arm used a self-closing `<line/>` only, and the
    // boundary test's mutation SURVIVED it.
    // Both halves of that need a CLOSE tag to bite, and they bite in DIFFERENT readers: the
    // depth-aware walk miscounts a self-closing `<line/>` as an open `<li>`, while a lazy scan for
    // `</li` stops at a `</line>` or `</listing>`. Two fixtures, and the second needs a TAIL after
    // the offending close or both readings give the same answer — a first draft asserted a shape
    // where they agreed and the boundary test's mutation SURVIVED it twice.
    const nested = (mark) => `<li><strong>31</strong><ul><li>Keep whole ${mark}and more text</li>`
      + '<li>Second item entirely</li></ul></li>';
    assert.equal(labelOf(nested('<svg width="10"><line x1="0" y1="0" x2="9" y2="9"/></svg> ')),
      'Keep whole and more text', 'a self-closing <line/> was counted as a nested <li>');
    assert.equal(labelOf(nested('<listing>x</listing> ')),
      'Keep whole x and more text', 'a </listing> close was read as this item\'s own </li>');
    // The control, so the arm pins the CLOSE rule rather than the markup inside it.
    assert.equal(labelOf(nested('')), 'Keep whole and more text');
  });

  test('a tag name is matched case-INSENSITIVELY, on both halves of the element', () => {
    // Chromium reads `<H3>` and `</H3>` as `h3`. `firstOpenTag` folds the OPEN name and a first cut
    // handed the raw-case name to the close finder, so `<H3>x</h3>` — legal, and what a hand-written
    // member can carry under `html: true` — found its open tag and then no close, and the reader
    // returned nothing. Both halves fold now, and the arm holds all four casings.
    for (const [open, close] of [['h3', 'h3'], ['H3', 'H3'], ['H3', 'h3'], ['h3', 'H3']]) {
      assert.equal(labelOf(`<div><${open}>Ridge regression</${close}><p>body</p></div>`),
        'Ridge regression', `<${open}>…</${close}> was not read as a heading`);
    }
  });

  test('the x-tex annotation is SEARCHED for, not assumed to be the first', () => {
    // The regex scanned FOR `encoding="application/x-tex"`. A first cut of the bounded reader took
    // the FIRST `<annotation>` and tested it, so a legal `application/mathml` sibling sitting
    // before it left the author's source unstripped — `\sigma` riding into the text, which is the
    // defect this file exists to close, reintroduced by the commit closing another one.
    const mirror = (first) => '<span class="katex"><span class="katex-mathml"><math><semantics>'
      + '<mrow><mi>s</mi></mrow>'
      + (first ? `<annotation encoding="${first}">S</annotation>` : '')
      + '<annotation encoding="application/x-tex">\\sigma</annotation>'
      + '</semantics></math></span></span>';
    assert.doesNotMatch(textOf(mirror('application/mathml')), /\\/, 'raw TeX reached the text');
    assert.equal(textOf(mirror('application/mathml')), 'sS');
    assert.equal(textOf(mirror(null)), 's');
  });

  test('the leading-tag run before <strong> is {1,3} — at least ONE, at most three', () => {
    // The `1,` half has no arm otherwise: re-widening the run to allow ZERO leading tags survives
    // the whole suite, because every real caller hands `labelOf` a member wrapped in its own
    // `<li>`/`<td>`. This is the one input that tells the two apart — with the widening,
    // `leadingStrong` matches, the FIGURE rule fires, and the label becomes `deals closed this
    // quarter`. (HARD RULE #25 checker, thirteenth pass, which found the hole by mutating it.)
    assert.equal(labelOf('<strong>31</strong> deals closed this quarter'),
      '31 deals closed this quarter');
    // …and at most three: a fourth wrapper is not a leading run.
    const wrap = (n) => `${'<div>'.repeat(n)}<strong>31</strong> deals closed${'</div>'.repeat(n)}`;
    assert.equal(labelOf(wrap(3)), 'deals closed');
    assert.equal(labelOf(wrap(4)), '31 deals closed');
  });

  test('EVERY leading equation is dropped, not just the first', () => {
    assert.equal(labelOf(tr(`${typeset('a = b')} ${typeset('c = d')}`, 'combine')), 'combine');
    // The limit, asserted rather than left to be discovered: an equation that is not LEADING
    // stays, because removing it would mean deleting math from the middle of a sentence.
    assert.equal(labelOf(tr(`${typeset('a = b')} and ${typeset('c = d')}`, 'combine')), 'and c=d combine');
  });

  test('KaTeX\'s INVISIBLE math operators never ride into the label', () => {
    // `\log x` is `log⁡x` with a U+2061 FUNCTION APPLICATION between. A label carrying one looks
    // right and is not — and it would be written into the signal's markup raw.
    const log = labelOf(`<li>${typeset('\\log x')} — the log</li>`);
    assert.equal(log, 'logx');
    assert.doesNotMatch(log, /[\u200B\u2061-\u2064]/);
  });

  test('the <strong> and <h3> label paths get the rule too', () => {
    // "An equation is not a name" was scoped to the flat run at first, so a card-shaped or
    // subheading-shaped math member still labeled its neighbor page with an equation.
    assert.equal(labelOf(`<li><h3>${typeset('a = b')} the identity</h3></li>`), 'the identity');
    // Only an equation and nothing else still keeps the equation, on this path as on the flat one.
    assert.equal(labelOf(`<li><strong>${typeset('a = b')}</strong> body</li>`), 'a=b');
  });

  test('dropping the equation does not exempt the prose from the budget', () => {
    const row = tr(typeset('a = b'), 'a step whose authored description runs on well past the budget');
    assert.equal(labelOf(row), '', 'a sentence still declines to the un-labeled pointer');
  });

  test('prose with no math is untouched', () => {
    assert.equal(textOf('<li><strong>Plain</strong> body</li>'), 'Plain body');
    assert.equal(textOf('a paragraph mentioning katex-mathml in prose'), 'a paragraph mentioning katex-mathml in prose');
  });

  test('a tag that never closes costs LINEAR time, not quadratic', () => {
    // `<[a-zA-Z][\w-]*[^>]*>` has two overlapping quantifiers, so a tag with no `>` made the engine
    // re-split the name at every position — twice over, because the `<strong>` path repeats the run
    // `{1,3}` times. Measured through `labelOf`: 6.0s for a 40,000-character unclosed tag before,
    // 1ms after. The bound is deliberately loose (a wall clock in a merge train is not a stopwatch)
    // and still leaves a 3x margin UNDER the old cost, which is what makes it a regression guard
    // rather than a benchmark.
    // A RATIO, not a wall clock. The first cut of this arm asserted `< 2000ms` and claimed a "3x
    // margin under the old cost"; re-measured on the sandbox runner the old cost was 2254ms, so the
    // margin was 1.13x and hardware 15% faster would have passed the exact regression it names.
    // Scaling is the property that actually matters and it is machine-independent: quadratic gives
    // ~16x for 4x the input, linear gives ~4x. (HARD RULE #25 checker, third pass.)
    // The inputs MUST reach the katex scan. The first cut used `<` + 40,000 `a`s and `<span` + spaces
    // — both short-circuit on `stripMathMirror`'s `if (!html.includes('katex')) return html`, so the
    // arm never touched the code it was written to guard, and reverting `findKatexSpan` to the exact
    // quadratic regex it replaced passed all 9302 tests. `'katex' + '<span x='.repeat(n) + '>'` is
    // the shape that bites: MANY candidate tags sharing one far-away `>`, not one long tag.
    const once = (n) => {
      const at = process.hrtime.bigint();
      labelOf(`<${'a'.repeat(n)}`);
      textOf(`katex${'<span x='.repeat(n)}>`);
      return Number(process.hrtime.bigint() - at) / 1e6;
    };
    // MEDIAN of five, not one sample. A single `hrtime` pair over a ~1ms workload is one scheduler
    // preemption away from a 30x reading, and `node --test` runs files in parallel — measured at
    // 3 failures in 12 runs under heavy oversubscription, 0 in 35 otherwise.
    const cost = (n) => {
      const runs = [];
      for (let i = 0; i < 5; i += 1) runs.push(once(n));
      return runs.sort((a, b) => a - b)[2];
    };
    cost(2000);
    const small = Math.max(cost(10000), 0.05);
    const big = cost(40000);
    assert.ok(big / small < 8, `4x the input cost ${(big / small).toFixed(1)}x the time — superlinear`);
  });

  test('a span TAG is bounded by parsing it, quotes and all', () => {
    // `tagEnd` decides where every span tag ends and had NO arm at all: gutting it to a naive
    // `indexOf('>')` left all 79 tests green, which reverted two commits' fixes unnoticed. Both
    // shapes below come from checkers that found the code wrong in opposite directions.
    const mirror = '<span class="katex-mathml">'
      + '<math><mi>Q</mi><annotation encoding="application/x-tex">Q</annotation></math></span>';
    // A `<` inside a QUOTED VALUE. Legal HTML — Chromium parses this as one SPAN with both
    // attributes — and a `indexOf('>')`/`lastIndexOf('<')` bound walks straight past the span.
    assert.equal(textOf(`<span class="katex" title="a<b">${mirror}</span> tail`), 'Q tail');
    // A quote OUTSIDE value position, which is what "track quote state" has to mean. An `alt`
    // holding `<span` and an odd quote count sent the whole scan to -1, so `stripMathMirror`
    // no-opped and every one of KaTeX's three copies printed: `X ⊤ X X^\top X X ⊤ X` on a slide.
    // The mirror has to sit inside a real `.katex` span here, as KaTeX emits it — a bare mirror is
    // STRIPPED (that is the second loop's job), so `Q` would vanish for the right reason and the
    // arm would pass without exercising anything.
    assert.equal(textOf(`<li><img alt="<span q" src="x.png"> <span class="katex">${mirror}</span> tail</li>`),
      'Q tail');
    // An unquoted value containing a quote, the mirror case: the tag still ends at its own `>`.
    assert.equal(textOf(`<span class="katex" data-x=a"b>${mirror}</span> tail`), 'Q tail');
    // A `>` INSIDE a quoted value, with the class AFTER it — the one shape that separates parsing
    // the tag from `indexOf('>')`. Naive bounding stops at the inner `>`, sees no class, and walks
    // past the span; the three cases above all pass under it, which is how `tagEnd` shipped with no
    // arm that could fail. Class-first would pass too: the class has to sit beyond the trap.
    assert.equal(textOf(`<span title="a>b" class="katex">${mirror}</span> tail`), 'Q tail');
  });

  test('the katex scan reads a real span, and a `<spanfoo>` does not become one', () => {
    // The regex `findKatexSpan` replaced (`<span[^>]*\\sclass="…`) matched `<spanfoo class="katex">`
    // because `[^>]*` swallowed the `foo`. The scan bounds the tag and tests `^<span[\\s>]`, so it
    // does not. This is the ONLY behavioral difference between the two over eleven tag shapes.
    // It does NOT on its own catch a revert to that regex — measured: the tag strip downstream
    // flattens both readings to the same text, so only the cost arm above kills that mutation.
    // It is here to pin the scan's contract, not as a second guard.
    // THIS ARM SAID "NO TEST CAN PIN THE `[\s>]` GUARD" FOR ONE COMMIT, AND THAT WAS FALSE.
    // The reasoning was that `findMatchingClose` will not pair `<spanfoo` with a `</span>` — but it
    // prefix-matches `'<' + tagName`, so it pairs them happily. The claim generalized from the one
    // input this arm used, where the close tag was `</spanfoo>` and the pairing genuinely failed.
    // A sixth checker found two inputs that distinguish the guard in opposite directions, and both
    // are below. "A stated gap beats a test that pretends" was the right principle applied to a
    // premise that did not hold.
    const mirror = '<span class="katex-mathml">'
      + '<math><mi>Q</mi><annotation encoding="application/x-tex">Q</annotation></math></span>';
    assert.equal(textOf(`<spanfoo class="katex">${mirror}</spanfoo> tail`), 'tail',
      'a prefix of `span` was read as a span');
    assert.equal(textOf(`<span class="katex">${mirror}</span> tail`), 'Q tail',
      'a real katex span is still read');
    // The two that DISCRIMINATE. Drop the `[\s>]` and the first reads `Q tail` (the prefix is
    // treated as a katex span and its mirror is read) while the second reads `tail` (the prefix is
    // treated as the katex-mathml span and stripped).
    assert.equal(textOf(`<spanfoo class="katex">${mirror}</span> tail`), 'tail',
      'a `<spanfoo>` gained a real span reading');
    assert.equal(textOf(`<spanfoo class="katex-mathml"><math><mi>Q</mi></math></span> tail`), 'Q tail',
      'a `<spanfoo>` was stripped as if it were the mirror');
  });

  test('an unbalanced author span returns the input rather than looping', () => {
    assert.equal(textOf('<span class="katex">unclosed'), 'unclosed');
  });
});
