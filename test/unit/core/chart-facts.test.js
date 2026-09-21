const test = require('node:test');
const assert = require('node:assert/strict');

const bullet = require('../../../lib/core/bullet-facts.js');
const graph = require('../../../lib/core/state-graph-facts.js');
const cloud = require('../../../lib/core/word-cloud-facts.js');

// ─────────────────────────────────────────────────────────────────────────────
// These three kernels exist so the PICTURE and the VOICE derive a chart's facts
// once. Every test below is written to FAIL on a specific wrong implementation,
// not to restate the code — each was checked by mutating the kernel and watching
// this file go red. Where a test could not be made to fail, it was deleted rather
// than kept as decoration.
// ─────────────────────────────────────────────────────────────────────────────

const row = (o) => ({ label: 'row', measure: NaN, target: NaN, floor: 0, bands: [], ...o });

test('bullet — attainment is measured FROM THE FLOOR, not as measure/target', () => {
  // The case the transform's own comment names: uptime 99.4 against a 99.9 target
  // on a 99.0 floor. The naive ratio reads 99% — "a rounding error away" — and the
  // bar is drawn 44% of the way to the tick. A kernel that dropped the floor term
  // would report 99 here and this is the arm that catches it.
  const at = bullet.attainment(row({ measure: 99.4, target: 99.9, floor: 99.0 }));
  assert.equal(at.pct, 44);
  assert.equal(at.cleared, false);

  // And with no floor the two agree, so the arm above is testing the floor term
  // rather than the rounding.
  assert.equal(bullet.attainment(row({ measure: 4.2, target: 5.0 })).pct, 84);
});

test('bullet — exactly at plan has CLEARED it but is not an overshoot', () => {
  const at = bullet.attainment(row({ measure: 5, target: 5 }));
  assert.equal(at.cleared, true, 'measure === target clears the tick');
  assert.equal(at.over, false, 'but draws no overshoot — the transform paints on strict >');
});

test('bullet — no attainment where the chart draws no tick', () => {
  // The SAME guard the target tick uses. A row with `Target 5` under `Floor 10`
  // draws no marker, so describing attainment against it would tell a listener
  // about a mark that is not on the slide.
  assert.equal(bullet.attainment(row({ measure: 12, target: 5, floor: 10 })), null);
  assert.equal(bullet.attainment(row({ measure: 4, target: NaN })), null, 'one pill: bare bar');
  assert.equal(bullet.attainment(row({ measure: NaN, target: 5 })), null);
});

test('bullet — a measure under its own floor is flagged, not silently clamped', () => {
  const at = bullet.attainment(row({ measure: 98, target: 99.9, floor: 99 }));
  assert.equal(at.under, true);
  assert.ok(at.pct < 0, 'and reports a negative attainment rather than zero');
});

test('bullet — derived cuts sit at 60/85 OF THE SPAN ABOVE THE FLOOR', () => {
  assert.deepEqual(bullet.zoneCuts(row({ measure: 1, target: 100 })), [60, 85]);
  // Floored: 99 + 0.60*(99.9-99) = 99.54, 99 + 0.85*0.9 = 99.765. Measuring the
  // fractions from ZERO instead would put both cuts far below the floor and off
  // the row's scale entirely.
  assert.deepEqual(bullet.zoneCuts(row({ measure: 99.4, target: 99.9, floor: 99 })), [99.54, 99.765]);
});

test('bullet — authored bands win, and the cuts NEAREST THE TARGET survive the cap', () => {
  // The SLO scale from the transform's own defect note: `50 · 70 · 85 · 90 · 93`
  // kept its lowest three once, discarding the two thresholds the slide was about.
  const cuts = bullet.zoneCuts(row({ measure: 91, target: 95, bands: [50, 70, 85, 90, 93] }));
  assert.deepEqual(cuts, [85, 90, 93]);
});

test('bullet — every authored band under the floor falls back to the derived cuts', () => {
  // Not an empty range. A row that loses its qualitative band renders as a bare
  // track, so ADDING context would have deleted the chart's defining mark.
  const cuts = bullet.zoneCuts(row({ measure: 99.5, target: 99.9, floor: 99, bands: [10, 20] }));
  assert.deepEqual(cuts, [99.54, 99.765]);
  // cutsAreDerived asks what the AUTHOR wrote, and it must ask it THROUGH the floor
  // filter. A band the floor swallowed did not survive into the cuts, so the range
  // really is derived and really does carry the derived names — a check that only
  // asked `bands.length` would call this authored and silently drop the names. This
  // pair exists because that mutation survived the assertion below on its own.
  assert.equal(bullet.cutsAreDerived(row({ measure: 1, target: 100, bands: [10] })), false,
    'a live band makes the range authored');
  const swallowed = row({ measure: 99.6, target: 99.9, floor: 99, bands: [10, 20] });
  assert.equal(bullet.cutsAreDerived(swallowed), true,
    'every band under the floor — nothing authored survived, so the range is derived');
  assert.equal(bullet.zoneOf(swallowed).name, 'closing on plan',
    'and it is named, which is the observable the provenance flag actually drives');
});

test('bullet — the zone a measure landed in, named only when the cuts are derived', () => {
  const derived = row({ measure: 84, target: 100 });
  const z = bullet.zoneOf(derived);
  assert.equal(z.index, 1);
  assert.equal(z.count, 3);
  assert.equal(z.name, 'closing on plan');

  assert.equal(bullet.zoneOf(row({ measure: 40, target: 100 })).name, 'well short of plan');
  assert.equal(bullet.zoneOf(row({ measure: 120, target: 100 })).name, 'at or past plan');

  // An authored range gets NO name. Its zones mean whatever the author meant, and
  // "nearly there" would invent a grade the slide never claims.
  const authored = bullet.zoneOf(row({ measure: 91, target: 95, bands: [85, 90, 93] }));
  assert.equal(authored.name, null);
  assert.equal(authored.index, 2, 'but the index is still real — 91 sits between 90 and 93');
  assert.equal(authored.count, 4);

  // TWO authored bands, so the zone COUNT matches the derived range's and only
  // the provenance can tell them apart. This arm exists because the assertion
  // above survived dropping `derived &&` from the name guard: with three bands
  // the count check alone refuses the name, so the test was passing for the wrong
  // reason. A four-zone authored range proves nothing about a three-zone one.
  const twoBands = bullet.zoneOf(row({ measure: 72, target: 95, bands: [50, 80] }));
  assert.equal(twoBands.count, 3, 'same shape as the derived range');
  assert.equal(twoBands.index, 1, 'same index a derived range would report');
  assert.equal(twoBands.name, null, 'and STILL unnamed, because the author cut these');
});

test('bullet — a landing exactly ON a cut belongs to the zone ABOVE it', () => {
  // The band rects tile [cut, next), so a measure at 85 paints in the upper zone.
  // A `>` instead of `>=` in the walk would report the zone below and disagree
  // with the pixel a reader is looking at.
  assert.equal(bullet.zoneOf(row({ measure: 85, target: 100 })).index, 2);
  assert.equal(bullet.zoneOf(row({ measure: 84.99, target: 100 })).index, 1);
});

test('bullet — the chart summary counts only rows that HAVE a tick', () => {
  const rows = [
    row({ measure: 4.2, target: 5.0 }),
    row({ measure: 3.6, target: 3.0 }),
    row({ measure: 2.8, target: 2.6 }),
    row({ measure: 1.1, target: 1.8 }),
    row({ measure: 0.9, target: 1.4 }),
    row({ measure: 7 }), // one pill — a bare bar, neither cleared nor short
  ];
  const s = bullet.summarizeRows(rows);
  assert.equal(s.total, 6);
  assert.equal(s.scored, 5, 'the one-pill row is not scored');
  assert.equal(s.cleared, 2);
  assert.equal(s.short, 3);
  assert.equal(s.cleared + s.short, s.scored, 'and the two sides sum to the honest denominator');
});

// ─────────────────────────────────────────────────────────────────────────────

const st = (index, label, extra) => ({ index, label, ...extra });

test('state-graph — role inference is ALL-OR-NOTHING per chart', () => {
  const states = [st(1, 'A'), st(2, 'B'), st(3, 'C', { isStart: true })];
  const edges = [{ from: 3, to: 1 }];
  const roles = graph.inferRoles(states, edges);
  assert.equal(roles.startIndex, 3, 'a tagged start wins over the first authored state');
  assert.equal(roles.startInferred, false);
  // Nothing is tagged `end`, so terminals are inferred: every state with no exit.
  assert.deepEqual([...roles.terminalIndices].sort(), [1, 2]);

  // ONE explicit end suppresses inference for EVERY state — B keeps no ring even
  // though it has no way out. Per-state inference would draw a ring the slide
  // does not.
  const tagged = graph.inferRoles([st(1, 'A'), st(2, 'B'), st(3, 'C', { isTerminal: true })], [{ from: 1, to: 3 }]);
  assert.deepEqual([...tagged.terminalIndices], [3]);
});

test('state-graph — a self-loop is not a way OUT', () => {
  const f = graph.summarizeGraph({
    states: [st(1, 'Draft'), st(2, 'In Review'), st(3, 'Done')],
    transitions: [
      { from: 1, to: 2, event: 'submit' },
      { from: 2, to: 3, event: 'approve' },
      { from: 2, to: 'self', event: 'revise' },
    ],
  });
  assert.deepEqual(f.branchPoints, [], 'In Review has one exit and a loop — that is not a branch');
  assert.equal(f.selfLoops.length, 1);
  assert.equal(f.isChain, true, 'and the machine is still a chain');
});

test('state-graph — a state whose ONLY exit is a self-loop is a TRAP, not an end', () => {
  // The hazard nothing else in the tree names: the transform counts the self-loop
  // as an outgoing transition, so the state is never inferred terminal, and the
  // machine can enter it and never leave.
  const f = graph.summarizeGraph({
    states: [st(1, 'Running'), st(2, 'Stuck')],
    transitions: [{ from: 1, to: 2 }, { from: 2, to: 'self', event: 'retry' }],
  });
  assert.deepEqual(f.traps.map((s) => s.label), ['Stuck']);
  assert.deepEqual(f.terminals.map((s) => s.label), [], 'and it is NOT reported as an ending');
});

test('state-graph — branch points, back edges and the chain test', () => {
  const f = graph.summarizeGraph({
    states: [st(1, 'Draft'), st(2, 'Submitted'), st(3, 'In Review'), st(4, 'Approved'), st(5, 'Published')],
    transitions: [
      { from: 1, to: 2, event: 'submit' }, { from: 2, to: 3, event: 'review' },
      { from: 3, to: 4, event: 'approve' }, { from: 3, to: 1, event: 'reject' },
      { from: 3, to: 'self', event: 'revise' }, { from: 4, to: 5, event: 'publish' },
    ],
  });
  assert.equal(f.stateCount, 5);
  assert.equal(f.start.label, 'Draft');
  assert.deepEqual(f.terminals.map((s) => s.label), ['Published']);
  assert.deepEqual(f.branchPoints.map((b) => `${b.state.label}:${b.ways}`), ['In Review:2']);
  assert.deepEqual(f.backEdges.map((e) => e.event), ['reject']);
  assert.equal(f.isChain, false, 'a back edge alone disqualifies a chain');
});

test('state-graph — an unresolved target is not an exit', () => {
  // `parseStateChart` records a transition only when its target resolves; the
  // slide draws the rest as literal `typo => 9 (unresolved)` text. Counting one
  // would make a state look like a branch point on the strength of a typo, and
  // would keep a real ending off the terminal list.
  const f = graph.summarizeGraph({
    states: [st(1, 'A'), st(2, 'B')],
    transitions: [{ from: 1, to: 2 }, { from: 2, to: 9, event: 'typo' }],
  });
  assert.equal(f.edgeCount, 1);
  assert.deepEqual(f.terminals.map((s) => s.label), ['B']);
  assert.deepEqual(f.branchPoints, []);
});

test('state-graph — unreachable states and true dead ends', () => {
  const orphan = graph.summarizeGraph({
    states: [st(1, 'A'), st(2, 'B'), st(3, 'Orphan')],
    transitions: [{ from: 1, to: 2 }],
  });
  assert.deepEqual(orphan.unreachable.map((s) => s.label), ['Orphan']);

  // A dead end is only possible when ANOTHER state carries an explicit `end`,
  // which suppresses inference for this one — so the slide draws no ring and the
  // machine still stops there.
  const dead = graph.summarizeGraph({
    states: [st(1, 'A'), st(2, 'Stops here'), st(3, 'Done', { isTerminal: true })],
    transitions: [{ from: 1, to: 2 }, { from: 1, to: 3 }],
  });
  assert.deepEqual(dead.deadEnds.map((s) => s.label), ['Stops here']);
  assert.deepEqual(
    graph.summarizeGraph({ states: [st(1, 'A'), st(2, 'B')], transitions: [{ from: 1, to: 2 }] }).deadEnds,
    [], 'and with nothing tagged, a no-exit state is an inferred ENDING, not a dead end',
  );
});

test('state-graph — reachability, not in-degree, decides what is cut off', () => {
  // THE ISLAND IN-DEGREE CANNOT SEE. Alpha and Beta point at each other, so both
  // have an incoming edge and the old test called them reachable. Nothing gets to
  // either from the start, and no surface said so.
  const island = graph.summarizeGraph({
    states: [st(1, 'Draft'), st(2, 'Done'), st(3, 'Alpha'), st(4, 'Beta')],
    transitions: [{ from: 1, to: 2 }, { from: 3, to: 4 }, { from: 4, to: 3 }],
  });
  assert.deepEqual(island.unreachable.map((s) => s.label), ['Alpha', 'Beta']);

  // AND A TERMINAL THE MACHINE CANNOT ARRIVE AT IS NOT AN ENDPOINT. `terminals`
  // stays the honest "has no way out" set — a hazard clause wants it whole — and
  // `reachableTerminals` is what an endpoint claim may name. Reading the first as
  // the second made a narrator say "from Draft to Draft and Filed" and then
  // "nothing leads to Filed", asserting a route and denying it two sentences later.
  const cutOff = graph.summarizeGraph({
    states: [st(1, 'Draft'), st(2, 'Filed'), st(3, 'Closed')],
    transitions: [{ from: 3, to: 1 }],
  });
  assert.deepEqual(cutOff.terminals.map((s) => s.label), ['Draft', 'Filed']);
  assert.deepEqual(cutOff.reachableTerminals.map((s) => s.label), []);

  // LENGTH AT LEAST ONE: standing on the start does not reach it. A cycle back to
  // it does, and then it IS somewhere the machine arrives.
  const loop = graph.summarizeGraph({
    states: [st(1, 'A'), st(2, 'B')],
    transitions: [{ from: 1, to: 2 }, { from: 2, to: 1 }],
  });
  assert.ok(loop.reachable.has(1) && loop.reachable.has(2));
  assert.equal(
    graph.summarizeGraph({ states: [st(1, 'A'), st(2, 'B')], transitions: [{ from: 1, to: 2 }] }).reachable.has(1),
    false,
  );
});

test('state-graph — `target` and `to` are both accepted, and `self` resolves either way', () => {
  // The transform writes `to`; chart-narration.js's own parse writes `target` and
  // leaves the literal 'self' unresolved. One kernel, both dialects.
  const viaTarget = graph.summarizeGraph({
    states: [st(1, 'A'), st(2, 'B')],
    transitions: [{ from: 1, target: 2 }, { from: 2, target: 'self' }],
  });
  assert.equal(viaTarget.edgeCount, 2);
  assert.equal(viaTarget.selfLoops.length, 1);
  assert.deepEqual(viaTarget.traps.map((s) => s.label), ['B']);
});

// ─────────────────────────────────────────────────────────────────────────────

const w = (text, weight) => ({ text, weight });

test('word-cloud — equal weights are ONE tier, in source order', () => {
  const f = cloud.summarizeCloud([w('a', 5), w('b', 4), w('c', 4), w('d', 3)]);
  assert.deepEqual(f.tiers.map((t) => `${t.weight}:${t.words.join('/')}`), ['5:a', '4:b/c', '3:d']);
});

test('word-cloud — a TIED top is not a leader', () => {
  // `focal`'s whole claim is that one term dominates. With three equals the
  // picture shows three equals, and naming one of them would be arbitrary.
  const tied = cloud.summarizeCloud([w('a', 5), w('b', 5), w('c', 2)]);
  assert.equal(tied.soleLeader, false);
  assert.equal(tied.leader, null);
  assert.equal(tied.leaderWeight, 5, 'the weight is still known — only the singular NAME is refused');

  const clear = cloud.summarizeCloud([w('a', 5), w('b', 4)]);
  assert.equal(clear.soleLeader, true);
  assert.equal(clear.leader, 'a');
});

test('word-cloud — the lead margin and the head share', () => {
  const f = cloud.summarizeCloud([
    w('time-to-value', 5), w('security', 4), w('onboarding', 4), w('pricing', 3),
    w('integrations', 3), w('support', 2), w('roadmap', 2), w('contracts', 1), w('residency', 1),
  ]);
  assert.equal(f.count, 9);
  assert.equal(f.total, 25);
  assert.equal(f.leadMargin, 1);
  assert.equal(f.leadRatio, 1.25);
  assert.deepEqual(f.headWords.map((h) => h.text), ['time-to-value', 'security', 'onboarding']);
  assert.equal(f.headShare, 13 / 25, 'the top three words carry 13 of 25 — the concentration read');
  assert.deepEqual(f.tailWords, ['contracts', 'residency']);
});

test('word-cloud — the head is THREE WORDS, not three tiers', () => {
  // A tier-counting implementation would take 1+3+1 = five words here and
  // overstate the head. The docs' read is "the biggest words", which is a count
  // of words.
  const f = cloud.summarizeCloud([w('a', 9), w('b', 5), w('c', 5), w('d', 5), w('e', 1)]);
  assert.deepEqual(f.headWords.map((h) => h.text), ['a', 'b', 'c']);
  assert.equal(f.headShare, 19 / 25);
});

test('word-cloud — a non-finite weight is held OUT of the arithmetic, and named', () => {
  // The component's documented hazard: a typo is silently sized to the middle of
  // the scale rather than erroring. Folding it into a share would make narration
  // state a proportion the slide does not show.
  const f = cloud.summarizeCloud([w('a', 4), w('typo', Number.NaN), w('b', 1)]);
  assert.equal(f.count, 2);
  assert.equal(f.total, 5);
  assert.deepEqual(f.unweighted, ['typo']);
  assert.equal(f.leader, 'a');
});

test('word-cloud — a one-word cloud has no tail and no margin', () => {
  const f = cloud.summarizeCloud([w('only', 3)]);
  assert.equal(f.leadMargin, null);
  assert.equal(f.tailTier, null);
  assert.deepEqual(f.tailWords, []);
  assert.equal(f.headShare, 1);
});

test('word-cloud — an empty cloud degrades to nulls rather than throwing', () => {
  const f = cloud.summarizeCloud([]);
  assert.equal(f.count, 0);
  assert.equal(f.leader, null);
  assert.equal(f.headShare, null);
  assert.deepEqual(f.tiers, []);
});

// ─────────────────────────────────────────────────────────────────────────────

const { toSpokenText } = require('@laticent/cadenza');
const { spokenValue, parseValue } = require('../../../lib/core/chart-values.js');
const say = (raw) => spokenValue(raw, toSpokenText);

test('spoken value — the SAME QUANTITY reads the same way however it was spelled', () => {
  // This is the whole reason the function exists. Narration used to hand the
  // author's raw pill to the speech layer, so it was reading a SPELLING and two
  // decks with identical data narrated differently.
  for (const group of [
    ['900k', '0.9M'],
    ['1.2M', '1200k'],
    ['12k', '0.012M'],
    ['$4.2M', '$4200k'],
  ]) {
    const spoken = group.map(say);
    assert.equal(new Set(spoken).size, 1, `${group.join(' vs ')} -> ${JSON.stringify(spoken)}`);
    // …and the parser agrees they ARE the same quantity, so the test is not just
    // asserting that two strings map to one arbitrary output.
    assert.equal(new Set(group.map(parseValue)).size, 1, group.join(' vs '));
  }
});

test('spoken value — a EUROPEAN separator is not read a hundred times too big', () => {
  // THE SERIOUS ONE. `1,25M` is what a deck pasted out of a French, German, Italian
  // or Swedish spreadsheet contains. The PICTURE parses it correctly and draws
  // 1.25M; the voice read the comma as a thousands separator and said "one hundred
  // twenty-five million" over that chart. `normalizeSeparators` exists because this
  // repo has had those decks.
  assert.equal(parseValue('1,25M'), 1250000);
  assert.equal(say('1,25M'), 'one point two five million');
  assert.ok(!say('1,25M').includes('one hundred twenty-five'));
});

test('spoken value — it says it the way a person would', () => {
  assert.equal(say('0.9M'), 'nine hundred thousand', 'not "zero point nine million"');
  assert.equal(say('1200k'), 'one point two million', 'not "one thousand two hundred thousand"');
  assert.equal(say('$0.6M'), 'six hundred thousand dollars');
});

test('spoken value — a BARE number is never re-scaled', () => {
  // The narrowing that matters, and it is here because the first draft got it wrong:
  // a bare `2024` — which the pill grammar documents as legitimate data ("Closed
  // `2024` plots at 2024") — came out as "two point zero two four thousand". A YEAR.
  // A bare number has only one spelling, so there is nothing to canonicalize.
  assert.equal(say('2024'), 'two thousand twenty-four');
  assert.equal(say('0.6'), 'zero point six');
  assert.equal(say('900000'), toSpokenText('900000'), 'left exactly as the speech layer reads it');
});

test('spoken value — a UNIT suffix is not a magnitude, and is left alone', () => {
  // `150 ms` carries a unit the author wrote, not a scale this function may rewrite.
  assert.equal(say('150 ms'), toSpokenText('150 ms'));
  assert.equal(say('99.4%'), 'ninety-nine point four percent');
});

test('spoken value — the sign rides in FRONT of a currency prefix', () => {
  // Rebuilding it after the prefix produced the literal string "$-800k", which the
  // speech layer cannot read and passed through as glyphs. All four spellings of
  // "down" that `parseValue` accepts have to survive.
  assert.equal(say('-$0.8M'), 'down eight hundred thousand dollars');
  assert.equal(say('(1.2M)'), 'down one point two million');
  assert.equal(say('\u22121.2M'), 'down one point two million', 'U+2212, what a spreadsheet paste gives');
  // AND WRITTEN INSIDE THE PREFIX, which is the second place an author puts it and
  // the one the first fix missed: stripping the sign only from the front left
  // `$-0.8M` rebuilding as "-$-800k" — two signs, one of them mid-token — and the
  // speech layer passed the whole thing through as glyphs.
  assert.equal(say('$-0.8M'), 'down eight hundred thousand dollars');
  assert.equal(say('$-0.8M'), say('-$0.8M'), 'the two spellings are one quantity');
  // THE VOICE FOLLOWS THE PARSER, WHICH IS WHAT THE PICTURE PLOTS. `parseValue` reads
  // a U+2212 in FRONT of a currency symbol and not behind it, so `$\u22120.8M` plots
  // POSITIVE and is spoken positive. That asymmetry is the parser's and it is shared
  // with every chart in the family, so it is filed rather than fixed from here — but
  // it is pinned, because the one thing that must never drift is the voice saying
  // "down" over a bar the chart drew up.
  assert.equal(parseValue('$\u22120.8M') > 0, true);
  assert.equal(say('$\u22120.8M'), 'eight hundred thousand dollars');
});

test('spoken value — under the smallest magnitude the LETTER goes, not the rewrite', () => {
  // `0.5k` is five hundred. Handing the pill back untouched read it as "zero point
  // five thousand" — the exact shape this function exists to remove, surviving
  // because the magnitude table starts at a thousand and 500 is under it.
  assert.equal(say('0.5k'), 'five hundred');
  assert.equal(say('0.5k'), say('500'), 'and it agrees with the plain spelling');
  assert.equal(say('0.05M'), 'fifty thousand');
  // Zero used to take an early return and say "zero million".
  assert.equal(say('0M'), 'zero');
  assert.equal(say('0k'), 'zero');
});

test('spoken value — a non-value pill is handed straight through', () => {
  // `at-risk` is a status pill, `PROJ-42` is a ticket id. Neither is a number, and
  // `parseValue` would read the second as -42.
  for (const p of ['at-risk', 'PROJ-42', 'on-track', '']) {
    assert.equal(say(p), toSpokenText(p), p);
  }
  // PROSE WITH A NUMBER AND A MAGNITUDE LETTER is the arm that actually tests the
  // guard, and it took two tries to find one. The four above bail at the magnitude
  // check whether or not `isValuePill` runs, so they certified nothing; `v1.2M`
  // certified nothing either, because the rebuild happens to reconstruct the
  // identical string. Ungarded, `rev 1.5M` loses the space to the rebuild and comes
  // out as the unreadable literal "rev1.5M".
  assert.equal(say('rev 1.5M'), toSpokenText('rev 1.5M'));
  assert.equal(say('rev 1.5M'), 'rev one point five million');
  assert.equal(say('up 0.9M'), toSpokenText('up 0.9M'));
});
