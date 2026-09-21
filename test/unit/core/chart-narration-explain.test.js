const test = require('node:test');
const assert = require('node:assert/strict');
const { narrateBullet, narrateWordCloud, narrateStateChart, narrateChart } = require('../../../lib/core/chart-narration.js');

// ─────────────────────────────────────────────────────────────────────────────
// THE EXPLAIN LAYER. These three components were read rather than explained: the
// numbers reached the voice and what they MEANT did not. Each test below pins one
// thing the narration now says that it did not before, or one thing it must still
// refuse to say. Every one was mutation-checked against the implementation.
//
// The fixtures are the SHIPPED GALLERIES' own slides, not a model of them — the
// gallery is what a reviewer looks at, and a fixture invented to suit the code
// proves only that the code agrees with itself.
// ─────────────────────────────────────────────────────────────────────────────

const slide = (cls, body) => `<!-- _class: ${cls} -->\n\n${body}`;

// ── bullet ───────────────────────────────────────────────────────────────────

// lib/components/chart/bullet/bullet.gallery.md, the default-variant slide.
const BULLET_GALLERY = [
  '## Are we on plan.',
  '',
  '- New ARR `4.2M` `5.0M`',
  '- Expansion ARR `3.6M` `3.0M`',
  '- Gross renewal `2.8M` `2.6M`',
  '- Services revenue `1.1M` `1.8M`',
  '- Partner-sourced ARR `0.9M` `1.4M`',
].join('\n');

test('bullet — says WHAT THE TWO NUMBERS ARE before reading any of them', () => {
  const out = narrateBullet(slide('bullet', BULLET_GALLERY));
  assert.ok(out.includes('Each row shows where we landed against where we planned'), out);
  // …and it says it BEFORE the first row, which is the whole point: a frame that
  // arrives after the numbers explains nothing.
  assert.ok(
    out.indexOf('Each row shows') < out.indexOf('New ARR'),
    'the frame must precede the first value',
  );
});

test('bullet — reads a row as a RELATIONSHIP, with attainment and the target named', () => {
  const out = narrateBullet(slide('bullet', BULLET_GALLERY));
  assert.ok(out.includes('New ARR, four point two million against a five million target'), out);
  assert.ok(out.includes('eighty-four percent of plan'), out);
  // The old floor reading — two bare numbers in a row — must be gone.
  assert.ok(!/New ARR, four point two million, five million/.test(out), 'the un-framed pair must not survive');
});

test('bullet — counts how many cleared the line', () => {
  const out = narrateBullet(slide('bullet', BULLET_GALLERY));
  assert.ok(out.includes('Two of five cleared the plan line'), out);
});

test('bullet — does NOT repeat a tally the author already wrote into the heading', () => {
  // The shipped gallery heading is "Two of five KPIs cleared the plan line." — the
  // `title` slot instructs authors to put the verdict there, so a narrator that
  // recites it back is talking over the slide.
  const authored = narrateBullet(slide('bullet', BULLET_GALLERY.replace('## Are we on plan.', '## Two of five KPIs cleared the plan line.')));
  assert.equal(authored.match(/cleared the plan line/g).length, 1, authored);
  // The guard is narrow on purpose: a heading naming only ONE of the two numbers
  // is not stating the tally, and the clause must still be spoken.
  const partial = narrateBullet(slide('bullet', BULLET_GALLERY.replace('## Are we on plan.', '## Five KPIs this quarter.')));
  assert.ok(partial.includes('Two of five cleared the plan line'), partial);
});

test('bullet — attainment is measured FROM THE FLOOR on a floored row, and says so', () => {
  const out = narrateBullet(slide('bullet', [
    '## Service levels.',
    '',
    '- Uptime `99.4%` `99.9%`',
    '  - Floor `99.0%`',
    '- Deflection `94%` `62%`',
  ].join('\n')));
  // 99.4 against a 99.9 target on a 99.0 floor is 44% of the way to the tick. The
  // naive ratio reads 99% — the failure the `Floor` register exists to prevent.
  assert.ok(out.includes('forty-four percent of plan'), out);
  assert.ok(!out.includes('ninety-nine percent of plan'), 'the naive ratio must not appear');
  assert.ok(out.includes('on a scale starting at ninety-nine percent'), out);
});

test('bullet — a structural Floor/Band/Target line is ABSORBED, not read back as prose', () => {
  // Measured on the gallery's stress slide before this narrator: the floor's
  // leftover pass read "Band 70%. Band 85%." aloud at the end of the slide —
  // rendering inputs spoken as if they were content.
  const out = narrateBullet(slide('bullet', [
    '## Coverage.',
    '',
    '- Expansion pipeline `86%` `90%`',
    '  - Band `70%`',
    '  - Band `85%`',
    '- Win rate `112%` `100%`',
  ].join('\n')));
  assert.ok(!/\bBand\b/.test(out), out);
});

test('bullet — an UNRECOGNIZED nested value stays the author\'s, and is still spoken', () => {
  // `- Organic `60%`` is context, not a phantom band — the transform says so and so
  // do the docs. Absorbing it would delete the author's words; treating it as a
  // band would describe a zone the chart never drew.
  const out = narrateBullet(slide('bullet', [
    '## Mix.',
    '',
    '- New ARR `4.2M` `5.0M`',
    '  - Organic `60%`',
    '- Expansion ARR `3.6M` `3.0M`',
  ].join('\n')));
  assert.ok(out.includes('Organic'), out);
});

test('bullet — no target means no invented relationship', () => {
  const out = narrateBullet(slide('bullet', '## Raw.\n\n- New ARR `4.2M`\n- Expansion `3.6M` `3.0M`'));
  assert.ok(out.includes('New ARR, four point two million'), out);
  assert.ok(!/New ARR[^.]*of plan/.test(out), 'a one-pill row draws no tick, so there is nothing to attain');
});

test('bullet — a spoken number starting in a vowel sound takes "an"', () => {
  // "against a eighty percent target" is what a listener actually hears when the
  // article is hard-coded. The numbers that need `an` are a short closed list, and
  // the check runs on the SPOKEN string because that is what reaches the voice.
  const out = narrateBullet(slide('bullet', '## Onboarding.\n\n- Completion `58%` `80%`\n- Win rate `112%` `100%`'));
  assert.ok(out.includes('against an eighty percent target'), out);
  assert.ok(!out.includes('against a eighty'), out);
});

test('bullet — a hundred-percent target does not read its own number back twice', () => {
  // "one hundred twenty-eight percent against a one hundred percent target — one
  // hundred twenty-eight percent of plan" is every OKR deck. The verdict replaces
  // the echo.
  const out = narrateBullet(slide('bullet', '## OKR.\n\n- Qualified pipeline `128%` `100%`\n- Ramped reps `96%` `100%`'));
  assert.ok(out.includes('Qualified pipeline, one hundred twenty-eight percent against a one hundred percent target — above plan'), out);
  assert.ok(out.includes('Ramped reps, ninety-six percent against a one hundred percent target — short of plan'), out);
});

test('bullet — a band name is never spoken where it could contradict the tick', () => {
  // The top derived band runs from 85% of target UPWARD, so it holds "just short"
  // and "past plan" alike. Naming it on a short row produced a sentence that argued
  // with itself: "ninety-six percent of plan, at or past plan".
  const out = narrateBullet(slide('bullet', '## Close.\n\n- Coverage `86%` `90%`\n- Other `50%` `90%`'));
  assert.ok(!out.includes('at or past plan'), out);
  assert.ok(out.includes('fifty-six percent of plan, well short of plan'), out);
});

test('bullet — does not hijack a `list … bullet` slide', () => {
  // `list principles bullet` is a shipped deck shape. Membership matching would
  // fire this narrator on it; the first-token gate is what stops that.
  //
  // THE PILLS ARE NUMBERS ON PURPOSE. A first draft used `One \`a\`` / `Two \`b\``,
  // and that test passed under a deliberately broken gate: non-value pills leave
  // nothing scored, so the narrator bailed for an unrelated reason and certified
  // nothing. Only a card list whose pills WOULD parse can prove the gate is what
  // stopped it.
  // TWO value pills per row, because ONE is not enough either: a single pill leaves
  // no target, so attainment is null, nothing is scored and the narrator bails on
  // that instead. The fixture has to be a slide this narrator WOULD fully narrate
  // if the gate let it through.
  const hijackable = slide('list principles bullet', '## Principles.\n\n- Ship early `4.2` `5.0`\n- Measure it `3.6` `3.0`');
  assert.ok(narrateBullet(slide('bullet', '## X.\n\n- Ship early `4.2` `5.0`\n- Measure it `3.6` `3.0`')),
    'the same body under `bullet` narrates — so the fixture is not bailing for some other reason');
  assert.equal(narrateBullet(hijackable), null, 'the first-token gate must refuse a `list` slide');
});

// ── word-cloud ───────────────────────────────────────────────────────────────

const CLOUD_GALLERY = [
  '## Weight is meaning in a word cloud.',
  '',
  '- time-to-value `5`',
  '- security `4`',
  '- onboarding `4`',
  '- pricing `3`',
  '- integrations `3`',
  '- support `2`',
  '- roadmap `2`',
  '- contracts `1`',
  '- residency `1`',
].join('\n');

test('word-cloud — names the encoding, then reads RANK rather than reciting counts', () => {
  const out = narrateWordCloud(slide('word-cloud', CLOUD_GALLERY));
  assert.ok(out.includes('Sized by how often each came up'), out);
  // AND NO CENSUS. The frame sentence opened on a term count until a checker found
  // it wrong on a shipped deck: the packer seats words on a spiral and drops the
  // ones it cannot fit, so the source lists thirteen where the canvas draws twelve.
  // Narration runs on markdown and cannot see which. See the arm below.
  assert.ok(!/[Nn]ine terms/.test(out), out);
  assert.ok(out.includes('Time-to-value is the biggest at five, one clear of security and onboarding at four each'), out);
  // The old floor reading was nine flat sentences of counts. None may survive.
  assert.ok(!/pricing, three\./.test(out), 'the flat count list must be gone');
});

test('word-cloud — past the cap it NAMES the remainder instead of reading a wall', () => {
  // The gallery's stress slide is twenty terms. It used to read twenty numbers
  // aloud; the docs call eight to twenty the working range, so this is the NORMAL
  // case for this component rather than an edge one.
  const twenty = ['## Stress.', ''].concat(
    ['component 512', 'variant 327', 'manifest 261', 'gallery 204', 'function 168', 'form 139',
      'substance 116', 'transform 94', 'selector 77', 'palette 63', 'cascade 51', 'bundle 42',
      'scaffolder 34', 'token 28', 'normalize 22', 'packer 17', 'spiral 13', 'footer 9',
      'eyebrow 7', 'watermark 5'].map((r) => {
      const [w, n] = r.split(' ');
      return `- ${w} \`${n}\``;
    }),
  ).join('\n');
  const out = narrateWordCloud(slide('word-cloud', twenty));
  assert.ok(out.includes('Component is the biggest at five hundred twelve'), out);
  // The remainder is NAMED as a remainder, so nothing is silently truncated (§7) —
  // but NOT counted. `f.count` counts what the SOURCE lists and the canvas can hold
  // fewer (see the census note in `narrateWordCloud`), so "eighteen more follow" is
  // the same checkable-and-wrong number the opening census was.
  assert.ok(out.includes('The rest follow'), out);
  assert.ok(!/\bmore follow\b/.test(out), out);
  assert.ok(out.includes('down to watermark at five'), out);
  assert.ok(!out.includes('scaffolder'), 'a mid-tail term must not be enumerated past the cap');
});

test('word-cloud — a small cloud IS enumerated, in tiers that group ties', () => {
  const out = narrateWordCloud(slide('word-cloud', [
    '## Themes.', '',
    '- component `5`', '- manifest `4`', '- function `3`', '- form `3`', '- substance `2`', '- gallery `1`',
  ].join('\n')));
  assert.ok(out.includes('Then function and form at three each'), out);
  assert.ok(!out.includes('function at three; form at three'), 'a tie is one rank, said once');
});

test('word-cloud — a TIED top is not given a leader', () => {
  const out = narrateWordCloud(slide('word-cloud', [
    '## Tie.', '', '- component `5`', '- manifest `5`', '- function `3`', '- form `2`',
  ].join('\n')));
  assert.ok(out.includes('Two terms tie at the top: component and manifest at five each'), out);
  assert.ok(!/is the biggest/.test(out), 'naming one of two equals would pick arbitrarily');
});

test('word-cloud — never states a SHARE of the total', () => {
  // "The top three carry half of everything said" is only true when the weights are
  // counts, and the docs allow a 1-5 rating in the same slot. A share of a rating
  // total is a proportion the slide does not show.
  const out = narrateWordCloud(slide('word-cloud', CLOUD_GALLERY));
  assert.ok(!/percent|share|half|third|of the total/i.test(out), out);
});

test('word-cloud — does not hijack a slide that merely MENTIONS word-cloud', () => {
  // Same first-token discipline as bullet. The positive control matters as much as
  // the negative one: without it the cell passes under a broken gate whenever the
  // body happens not to narrate.
  const body = '## Themes.\n\n- component `5`\n- manifest `4`\n- function `3`';
  assert.ok(narrateWordCloud(slide('word-cloud', body)), 'positive control');
  assert.equal(narrateWordCloud(slide('list dense word-cloud', body)), null);
});

test('word-cloud — a weight the packer cannot read is named, not priced', () => {
  // The docs call the silent mid-size fallback "the actual hazard". Narration must
  // not drop the word, and must not invent a weight for it either.
  const out = narrateWordCloud(slide('word-cloud', [
    '## Typo.', '', '- velocity `12`', '- ownership `9`', '- handoffs `sevn`',
  ].join('\n')));
  assert.ok(out.includes('Handoffs carries no readable weight'), out);
});

// ── state-chart ──────────────────────────────────────────────────────────────

const MACHINE = [
  '## Document approval flow.',
  '',
  '1. Draft `start`',
  '   - `submit => 2`',
  '2. Submitted `on-track`',
  '   - `review => 3`',
  '3. In Review',
  '   - `approve => 4`',
  '   - `reject => 1`',
  '   - `revise => self`',
  '4. Approved',
  '   - `publish => 5`',
  '5. Published `end`',
].join('\n');

test('state-chart — opens with the machine\'s SHAPE, before the edge-by-edge reading', () => {
  const out = narrateStateChart(slide('state-chart', MACHINE));
  assert.ok(out.includes('A five-state machine from Draft to Published'), out);
  assert.ok(out.includes('In Review is where it decides, with two ways out'), out);
  assert.ok(
    out.indexOf('A five-state machine') < out.indexOf('From Draft'),
    'the glance must arrive before the edges a listener has to place',
  );
});

test('state-chart — names what comes BACK, which is the difference between progress and circling', () => {
  const out = narrateStateChart(slide('state-chart', MACHINE));
  assert.ok(out.includes('One transition steps back'), out);
  assert.ok(out.includes('In Review loops on itself'), out);
});

test('state-chart — a SELF-LOOP is not counted as a way out', () => {
  // In Review has three nested transitions and only TWO exits: approve and reject.
  // `revise => self` keeps the document where it is. Counting it would be wrong in
  // the one place a listener is trying to count exits.
  const out = narrateStateChart(slide('state-chart', MACHINE));
  assert.ok(out.includes('with two ways out'), out);
  assert.ok(!out.includes('three ways out'), out);
});

test('state-chart — speaks TOPOLOGY, never LAYOUT', () => {
  // A skip edge gives a state two successors while dagre still ranks the machine as
  // a single column, so "the diagram fans out" would contradict the drawn slide.
  // Nothing here may claim anything about the picture.
  const skip = narrateStateChart(slide('state-chart', [
    '## Skip.', '', '1. A `start`', '   - `go => 2`', '   - `jump => 4`',
    '2. B', '   - `go => 3`', '3. C', '   - `go => 4`', '4. D `end`',
  ].join('\n')));
  assert.ok(skip.includes('A is where it decides, with two ways out'), skip);
  assert.ok(!/fans? out|branches on the|column|diagram (fans|splits)/i.test(skip), skip);
});

test('state-chart — a straight chain says so', () => {
  const out = narrateStateChart(slide('state-chart', [
    '## Chain.', '', '1. Source `start`', '   - `compile => 2`', '2. Compiled', '   - `test => 3`', '3. Tested `end`',
  ].join('\n')));
  assert.ok(out.includes('It runs as a straight chain with no forks'), out);
});

test('state-chart — names a TRAP, which no other surface does', () => {
  // A state whose only exit is a self-loop is never inferred terminal, because the
  // loop IS an outgoing transition. The machine can enter it and never leave, and
  // nothing in the tree said a word about it before.
  const out = narrateStateChart(slide('state-chart', [
    '## Retry.', '', '1. Running `start`', '   - `fail => 2`', '2. Stuck', '   - `retry => self`',
  ].join('\n')));
  assert.ok(out.includes('Stuck has no way out but to stay'), out);
});

test('state-chart — names an UNREACHABLE state', () => {
  const out = narrateStateChart(slide('state-chart', [
    '## Orphan.', '', '1. A `start`', '   - `go => 2`', '2. B `end`', '3. Forgotten',
  ].join('\n')));
  assert.ok(out.includes('Nothing leads to Forgotten'), out);
});

test('state-chart — names a state that STOPS but was not marked an ending', () => {
  // Only possible because ANOTHER state carries an explicit `end`, which suppresses
  // terminal inference for every state — so the slide draws no ring on this one and
  // the machine still stops there. Without this arm nothing covered `deadEnds` at
  // all, and deleting the clause left every test green.
  const out = narrateStateChart(slide('state-chart', [
    '## Intake.', '',
    '1. New `start`', '   - `accept => 2`', '   - `bounce => 3`',
    '2. Closed `end`',
    '3. Parked',
  ].join('\n')));
  assert.ok(out.includes('Parked stops without being marked an ending'), out);
});

test('state-chart — does not say the start twice', () => {
  // The shape sentence names both endpoints on EVERY machine, so the older
  // "This flow starts at Draft." is now a duplicate rather than an addition.
  const untagged = narrateStateChart(slide('state-chart', '## Flow.\n\n1. Draft\n   - `submit => 2`\n2. Done'));
  assert.ok(untagged.includes('A two-state machine from Draft to Done'), untagged);
  assert.ok(!untagged.includes('This flow starts at'), untagged);
});

// ── what an independent checker found, each arm named for its finding ────────
//
// A checker pass blocked this diff with eight confirmed defects. Every one is a
// test below, because a defect a reviewer found once and nothing pins will come
// back. Each arm states the WRONG output it used to produce, so a future reader
// can see what the assertion is for.

test('CHECKER 1 — a bullet slide in the NESTED form keeps its authored lines', () => {
  // THE WORST OF THE EIGHT. `parseDataRows` marks every row's children consumed as
  // soon as SOME row has no pills of its own — which is the documented nested form
  // (`- Uptime` / `  - Actual …`). These pilots never speak `items`, so one row
  // written that way deleted every authored nested line on the slide. Measured by
  // the checker over 400 generated decks: 299 lost at least one line the base
  // flattener spoke.
  const out = narrateBullet(slide('bullet', [
    '## Mix.', '',
    '- New ARR `4.2M` `5.0M`',
    '  - Organic `60%`',
    '- Expansion ARR',
    '  - Actual `3.6M`',
    '  - Target `3.0M`',
  ].join('\n')));
  assert.ok(out.includes('Organic'), `the author's line was deleted: ${out}`);
  // …and the nested form still yields a real relationship, so the fix did not buy
  // the line back by giving up the reading.
  assert.ok(out.includes('Expansion ARR, three point six million against a three million target'), out);
});

test('CHECKER 3 — a word cloud in the same shape keeps its authored lines too', () => {
  const out = narrateWordCloud(slide('word-cloud', [
    '## What customers said', '',
    '- security `5`', '- pricing', '  - raised in Q3 `3`', '- onboarding `2`',
  ].join('\n')));
  assert.ok(out.includes('raised in Q3'), `the author's line was deleted: ${out}`);
});

test('CHECKER 4 — a TWO-pill nested line is detail, not a band', () => {
  // `parseBullet`'s regex takes everything before the LAST code span as the key, so
  // `- Band `99.5%` `99.7%`` keys as "Band 99.5%", matches no keyword and becomes
  // mark detail — the chart DERIVES its zones. Reading `pills[0]` recorded a band
  // the picture never drew and swallowed the line.
  const out = narrateBullet(slide('bullet', [
    '## Two thresholds on one line.', '',
    '- Uptime `99.4%` `99.9%`',
    '  - Band `99.5%` `99.7%`',
    '- Latency `180` `150`',
  ].join('\n')));
  assert.ok(out.includes('Band 99.5% 99.7%'), `the detail line was absorbed and never spoken: ${out}`);
});

test('CHECKER 5 — an all-clear tally is not suppressed by a heading that only COUNTS', () => {
  // When every row clears, `cleared` and `scored` are the same number, so both
  // probes read one token and "Three regions, one plan" suppressed the verdict —
  // the one summary fact an all-clear slide has.
  const body = ['## Three regions, one plan.', '',
    '- North America `5.2M` `5.0M`', '- EMEA `3.6M` `3.0M`', '- APAC `2.8M` `2.6M`'].join('\n');
  assert.ok(narrateBullet(slide('bullet', body)).includes('All three cleared their target'),
    narrateBullet(slide('bullet', body)));
  // But a heading that really does report it is still not said twice.
  const reported = narrateBullet(slide('bullet', body.replace('Three regions, one plan.', 'All three cleared their target.')));
  assert.equal(reported.match(/cleared their target/g).length, 1, reported);
});

test('CHECKER 6 — a word with an unreadable weight is NAMED, not dropped', () => {
  // A non-finite weight is sized to the middle of the scale, not dropped, so the
  // word is on the slide. This arm was written against the term COUNT — "two terms"
  // over a picture showing three — and the count is gone (see the census note in
  // `narrateWordCloud`). What it was really protecting is the property asserted
  // here, and the stronger one: the word reaches the listener by NAME.
  const out = narrateWordCloud(slide('word-cloud', [
    '## Typo.', '', '- velocity `12`', '- ownership `9`', '- handoffs `sevn`',
  ].join('\n')));
  assert.ok(out.includes('Handoffs carries no readable weight'), out);
  assert.ok(out.includes('Velocity is the biggest at twelve'), out);
});

test('CHECKER 7 — the echo branch does not stutter its verdict', () => {
  // A shipped gallery row read "zero percent against a twelve percent target —
  // short of plan, well short of plan".
  const out = narrateBullet(slide('bullet', '## Deflection.\n\n- Self-serve conversion `0%` `12%`\n- Win rate `112%` `100%`'));
  assert.ok(out.includes('against a twelve percent target — well short of plan'), out);
  assert.ok(!out.includes('short of plan, well short'), out);
});

test('CHECKER 2 — a CONVERGING machine is not a straight chain', () => {
  // Two states stepping into a third satisfies "no state has two forward exits and
  // no back edge", and the picture plainly shows a merge.
  const out = narrateStateChart(slide('state-chart', [
    '## Two paths converge.', '',
    '1. Web signup', '   - `verify => 3`', '2. Sales-led', '   - `verify => 3`', '3. Active',
  ].join('\n')));
  assert.ok(!/straight chain/i.test(out), out);
  assert.ok(out.includes('Nothing leads to Sales-led'), out);
});

test('CHECKER 2 — two DISCONNECTED chains are not one chain', () => {
  const out = narrateStateChart(slide('state-chart', [
    '## Two machines.', '',
    '1. Draft', '   - `submit => 2`', '2. Filed', '3. Appeal', '   - `escalate => 4`', '4. Closed',
  ].join('\n')));
  assert.ok(!/straight chain/i.test(out), out);
});

test('CHECKER 2 — a list of states with NO transitions claims no shape at all', () => {
  // Every state is inferred terminal, the first one included, so the endpoint clause
  // read "A three-state machine from Draft to Draft, Filed, and Closed" — and then
  // called it a chain. With no edges there is no machine to describe, so the older
  // inference sentence speaks instead, exactly as it did before this pass.
  const out = narrateStateChart(slide('state-chart', '## No transitions yet.\n\n1. Draft\n2. Filed\n3. Closed'));
  assert.ok(!/straight chain/i.test(out), out);
  assert.ok(!out.includes('from Draft to Draft'), out);
  assert.ok(out.includes('This flow starts at Draft'), out);
});

test('CHECKER 2 — a CYCLE is not a straight chain', () => {
  // THE ARM WHOSE ABSENCE LET THE GUARD VANISH. `isChain` has four conditions and
  // three of them are provably redundant; the back-edge check is the only
  // load-bearing one, and nothing pinned it. A second checker mutating the shared
  // tree during a commit of mine swept the line out inside a DOCS-ONLY commit, and
  // the whole suite stayed green — 10139 pass — while a two-state cycle narrated as
  // "it runs as a straight chain with no forks; one transition steps back", two
  // claims in one sentence that cannot both be true.
  const out = narrateStateChart(slide('state-chart', [
    '## Ping pong.', '', '1. Draft', '   - `submit => 2`', '2. Review', '   - `reject => 1`',
  ].join('\n')));
  assert.ok(!/straight chain/i.test(out), out);
  assert.ok(out.includes('One transition steps back'), out);
});

test('CHECKER 2 — a real chain is still called one', () => {
  // The fix must not buy correctness by never making the claim.
  const out = narrateStateChart(slide('state-chart', [
    '## Chain.', '', '1. Source `start`', '   - `compile => 2`', '2. Compiled', '   - `test => 3`', '3. Tested `end`',
  ].join('\n')));
  assert.ok(out.includes('It runs as a straight chain with no forks'), out);
  // …and a self-loop does not disqualify one: "In Review can hold" is not a fork.
  const looped = narrateStateChart(slide('state-chart', [
    '## Loop.', '', '1. A `start`', '   - `go => 2`', '2. B', '   - `hold => self`', '   - `go => 3`', '3. C `end`',
  ].join('\n')));
  assert.ok(looped.includes('It runs as a straight chain with no forks'), looped);
});

test('CHECKER 8 — a missing frame is never spoken as the word "null"', () => {
  // `frameFor` returns null for an unframed component. Today's roster gate catches a
  // missing frame, but only for a component inside PICTURE_DATA_LAYOUTS — a future
  // pilot on a `flow` component sits outside that filter, so the guard has to be at
  // the interpolation.
  const CN = require('../../../lib/core/chart-narration.js');
  const { PROJECTION } = require('../../../lib/core/projection-catalog.generated.mjs');
  const saved = PROJECTION['word-cloud'].frame;
  try {
    delete PROJECTION['word-cloud'].frame;
    const out = CN.narrateWordCloud(slide('word-cloud', '## X.\n\n- a `5`\n- b `4`\n- c `1`'));
    assert.ok(!/\bnull\b/.test(out), out);
    // The frame sentence is now the frame and nothing else, so a missing frame
    // means NO sentence rather than a sentence with a hole in it.
    assert.ok(!/sized by/i.test(out), out);
    assert.ok(out.includes('A is the biggest at five'), 'and the rest of the read is untouched');
  } finally {
    PROJECTION['word-cloud'].frame = saved;
  }
});

// ── the SECOND checker's findings ────────────────────────────────────────────

test('CHECKER2 — the tally is not suppressed by a heading that states it WITHOUT "cleared"', () => {
  // A regression I introduced fixing the first checker's finding 5: requiring a
  // clearing VERB made 7 of 12 realistic verdict headings speak the tally twice.
  // Two distinct numbers ARE the tally, whatever verb carries them.
  const d = ['## H.', '', '- A `4.2M` `5.0M`', '- B `3.6M` `3.0M`', '- C `2.8M` `2.6M`',
    '- D `1.1M` `1.8M`', '- E `0.9M` `1.4M`'].join('\n');
  for (const h of ['Two of five exceeded plan.', 'Two of five passed their target.', 'Two of five came in over target.']) {
    const out = narrateBullet(slide('bullet', d.replace('## H.', `## ${h}`)));
    assert.ok(!out.includes('cleared the plan line'), `${h} -> ${out}`);
  }
  // …and a heading that names neither still gets it.
  assert.ok(narrateBullet(slide('bullet', d)).includes('Two of five cleared the plan line'));
});

test('CHECKER2 — an all-clear verdict survives a heading that merely counts', () => {
  // The verb test now applies ONLY where the two numbers are the same and cannot
  // distinguish. Bare `short`, `hit` and `behind` were in the list once and matched
  // "short-form", "hit products" and "three months behind us".
  const d = ['## H.', '', '- A `5.2M` `5.0M`', '- B `3.6M` `3.0M`', '- C `2.8M` `2.6M`'].join('\n');
  for (const h of ['Three regions, one plan.', 'Three short-form metrics.', 'Three hit products this quarter.', 'Three months behind us.']) {
    const out = narrateBullet(slide('bullet', d.replace('## H.', `## ${h}`)));
    assert.ok(out.includes('All three cleared their target'), `${h} -> ${out}`);
  }
  // But a heading that really does report it is still not doubled.
  const stated = narrateBullet(slide('bullet', d.replace('## H.', '## All three cleared their target.')));
  assert.equal(stated.match(/cleared their target/g).length, 1, stated);
});

test('CHECKER2 — a row the PARSER drops is still spoken, because the picture draws it', () => {
  // `parseDataRows` drops a row with no pill, and one whose whole label sits inside
  // its code span. The chart draws both. This arm asserted the term COUNT saw them;
  // the count is gone (see the census note in `narrateWordCloud`), so it asserts the
  // thing the count was standing in for — the word is not silently deleted.
  const noPill = narrateWordCloud(slide('word-cloud', '## X.\n\n- security `5`\n- pricing\n- onboarding `2`'));
  assert.ok(/pricing/i.test(noPill), noPill);
  const codeSpan = narrateWordCloud(slide('word-cloud', '## X.\n\n- `residency` `1`\n- security `5`\n- onboarding `2`'));
  assert.ok(/residency/i.test(codeSpan), codeSpan);
});

test('CHECKER2 — no bullet tally at all when a drawn row could not be scored', () => {
  // Better to say nothing than "one of two cleared the plan line" over a three-row
  // chart whose `<desc>` scores all three. The per-row readings stay, and the row the
  // parser could not read is still spoken by the leftover pass.
  const out = narrateBullet(slide('bullet', '## Y.\n\n- `residency` `1` `2`\n- A `5` `4`\n- B `2` `4`'));
  assert.ok(!/cleared the plan line/.test(out), out);
  assert.ok(out.includes('A, five against a four target'), out);
  assert.ok(out.includes('residency'), 'and the unparsed row is not deleted');
  // A chart whose rows ALL parse still gets its tally.
  assert.ok(narrateBullet(slide('bullet', '## Y.\n\n- A `5` `4`\n- B `2` `4`')).includes('One of two cleared the plan line'));
});

test('CHECKER2 — an AUTHORED band is voiced as a position, not silently swallowed', () => {
  // This narrator absorbs `Band` lines so they are not read back as rendering
  // inputs — and then never voiced them, so an authored range reached no surface at
  // all. A checker found `Band 70%` / `Band 85%` missing from the shipped stress
  // slide's exported VTT. A position is not a grade and does not pretend to be one.
  const out = narrateBullet(slide('bullet', [
    '## Z.', '', '- Coverage `86%` `90%`', '  - Band `70%`', '  - Band `85%`', '- Win `112%` `100%`',
  ].join('\n')));
  assert.ok(out.includes('in band three of three'), out);
  assert.ok(!/\bBand 70\b/.test(out), 'and it is still not read back as a raw input');
  // AND THE TALLY SURVIVES. The drawn-row count that gates it must count TOP-LEVEL
  // bullets only — counting the nested `Band` lines too makes every banded chart
  // look partly-parsed and silently drops its verdict. Nothing covered that until a
  // mutation walked straight through the arms above.
  assert.ok(out.includes('One of two cleared the plan line'), out);
});

test('the shape is one sentence per FACT, and the hazards stay one list', () => {
  // Two opposite failures, and the split has to avoid both. Joining every clause
  // produced a 13.2s/39-word cue on this slide; splitting the HAZARDS as well would
  // chop a list of the same kind of thing into three five-word fragments, and the
  // cue profile's other tail is exactly that. Nothing pinned the grouping until a
  // mutation walked through every arm above.
  const out = narrateStateChart(slide('state-chart', [
    '## Three hazards nothing else names.', '',
    '1. Running `start`', '   - `fail => 2`', '   - `finish => 4`',
    '2. Stuck', '   - `retry => self`', '3. Parked', '4. Done `end`',
  ].join('\n')));
  // Each SHAPE fact is its own sentence…
  assert.ok(out.includes('A four-state machine from Running to Done.'), out);
  assert.ok(out.includes('Running is where it decides, with two ways out.'), out);
  // …and the hazards arrive as ONE sentence, semicolon-joined.
  assert.ok(
    out.includes('Stuck has no way out but to stay; Nothing leads to Parked; Parked stops without being marked an ending.')
    || out.includes('Stuck has no way out but to stay; nothing leads to Parked; Parked stops without being marked an ending.'),
    out,
  );
});

test('CHECKER3 — an endpoint claim names only a terminal the machine can REACH', () => {
  // The two bails above (no edges, only self-loops) both turn on whether any edge
  // goes anywhere. A third shape has real edges and still contradicts itself: the
  // machine narrated "A three-state machine from Draft to Draft and Filed. … Nothing
  // leads to Filed and Closed" — a route asserted and denied two sentences later.
  // Both halves were reading true facts. "from X to Y" is a claim about a ROUTE, so
  // the terminals it may name are the ones the start can get to.
  const out = narrateStateChart(slide('state-chart', [
    '## Flow.', '', '1. Draft', '2. Filed', '3. Closed', '   - `reopen => 1`',
  ].join('\n')));
  assert.ok(out.includes('A three-state machine from Draft.'), out);
  assert.ok(!/from Draft to/.test(out), out);
  // The hazard clause still names them — it is the half a listener can act on.
  assert.ok(/[Nn]othing leads to Filed and Closed/.test(out), out);

  // AND THE ISLAND IN-DEGREE COULD NOT SEE. Alpha and Beta point at each other, so
  // the old in-degree test called both reachable and said nothing.
  const island = narrateStateChart(slide('state-chart', [
    '## Island.', '', '1. Draft', '   - `go => 2`', '2. Done',
    '3. Alpha', '   - `x => 4`', '4. Beta', '   - `y => 3`',
  ].join('\n')));
  assert.ok(island.includes('A four-state machine from Draft to Done.'), island);
  assert.ok(/[Nn]othing leads to Alpha and Beta/.test(island), island);
});

test('CHECKER2 — a SELF-LOOP-only machine claims no path', () => {
  // `!edgeCount` closed the no-edge case and left it one self-loop away: "A two-state
  // machine from Draft to Filed; Draft loops on itself; Draft has no way out but to
  // stay; nothing leads to Filed" asserts a route its own next clauses deny.
  const out = narrateStateChart(slide('state-chart', '## Hold.\n\n1. Draft\n   - `hold => self`\n2. Filed'));
  assert.ok(!out.includes('from Draft to Filed'), out);
  assert.ok(!/straight chain/i.test(out), out);
});

test('CHECKER3 — a CLEARED row still voices the bands this narrator absorbed', () => {
  // The band clause sat below the `at.cleared` block, so a row that cleared never
  // reached it — and this narrator CONSUMES the author's `Band` lines so they are
  // not read back as prose. Absorbed and never voiced is deleted: the base
  // flattener had read both, and after the pilot they reached no surface at all.
  const body = '- Uptime `M`\n  - Target `99.5%`\n  - Band `99.0%`\n  - Band `99.3%`\n- Latency `2` `4`';
  const cleared = narrateBullet(slide('bullet', `## H.\n\n${body.replace('`M`', '`99.9%`')}`));
  assert.ok(cleared.includes('in band three of three'), cleared);
  const short = narrateBullet(slide('bullet', `## H.\n\n${body.replace('`M`', '`99.1%`')}`));
  assert.ok(short.includes('in band two of three'), short);
});

test('CHECKER3 — a rounded percentage never argues with the verdict', () => {
  // `attainment` rounds to a whole percent, the same arithmetic the chart's own
  // `<desc>` uses. The `<desc>` gets away with it by printing "below plan" beside
  // the number; the voice said "one hundred percent of plan, in band two of three"
  // over a row that MISSED — 99.1 against 99.5 is 99.6%. Where the rounding and the
  // verdict disagree, the verdict wins.
  const near = narrateBullet(slide('bullet', '## H.\n\n- Uptime `99.1%` `99.5%`\n- Latency `2` `4`'));
  assert.ok(near.includes('just short of plan'), near);
  assert.ok(!/one hundred percent of plan/.test(near), near);
  const over = narrateBullet(slide('bullet', '## H.\n\n- Uptime `99.6%` `99.5%`\n- Latency `2` `4`'));
  assert.ok(over.includes('just above plan'), over);
  // …and a percentage that does NOT argue with its verdict is still spoken.
  assert.ok(narrateBullet(slide('bullet', '## H.\n\n- A `5` `4`\n- B `2` `4`')).includes('one hundred twenty-five percent of plan'));
});

test('CHECKER3 — the tally survives a heading that merely carries two numbers', () => {
  // `cleared !== scored` accepted ANY arrangement of the two numbers, so "Three
  // pilots, five weeks in." — which reports nothing — deleted the one summary fact
  // a five-row chart has. The tally SHAPE ("N of M") is what states it; anything
  // else needs a verb. And a false positive here deletes a fact with no sign it is
  // gone, while a false negative repeats a clause the listener just heard.
  const d = ['## H.', '', '- A `4.2M` `5.0M`', '- B `3.6M` `3.0M`', '- C `2.8M` `2.6M`',
    '- D `1.1M` `1.8M`', '- E `0.9M` `1.4M`'].join('\n');
  for (const h of ['Three pilots, five weeks in.', 'Two sites, five regions.']) {
    const out = narrateBullet(slide('bullet', d.replace('## H.', `## ${h}`)));
    assert.ok(out.includes('cleared the plan line'), `${h} -> ${out}`);
  }
  // The tally shape still suppresses, whatever verb carries it — including two the
  // verb list did not have.
  for (const h of ['Two of five exceeded plan.', 'Two of five came in over target.', 'Two of five, measured against plan.']) {
    const out = narrateBullet(slide('bullet', d.replace('## H.', `## ${h}`)));
    assert.ok(!out.includes('cleared the plan line'), `${h} -> ${out}`);
  }
});

test('CHECKER3 — one trailing prose bullet does not delete the tally', () => {
  // The guard compared `tally.total` against every top-level bullet, so a deck
  // ending in "A closing note with no numbers" — which the chart draws as a
  // nameplate with no bar, no tick and no verdict in its own `<desc>` — raised the
  // drawn count by one and suppressed a tally that was correct. A dropped row only
  // threatens the count when it carries a VALUE.
  const out = narrateBullet(slide('bullet', '## H.\n\n- A `5` `4`\n- B `2` `4`\n- A closing note with no numbers'));
  assert.ok(out.includes('One of two cleared the plan line'), out);
  assert.ok(out.includes('A closing note with no numbers'), 'and the note is still read');
  // …while the row the transform WOULD score and this parse cannot still suppresses it.
  const hidden = narrateBullet(slide('bullet', '## Y.\n\n- `residency` `1` `2`\n- A `5` `4`\n- B `2` `4`'));
  assert.ok(!/cleared the plan line/.test(hidden), hidden);
  assert.ok(/residency/.test(hidden), 'and it is not deleted either');
});

// ── the declared frame ───────────────────────────────────────────────────────

test('every picture-bound data chart DECLARES what its encoding means', () => {
  // The roster is derived from the manifests, and so is the frame, so this cell
  // cannot be satisfied by editing a list here — a new SVG chart joins the roster
  // the day its manifest declares `data: true`, and this goes red until the same
  // manifest says what its picture means. That is the whole reason the frame lives
  // in the manifest rather than in a table in chart-narration.js:
  // `2026-09-13-projected-rosters.md` records nine hand-kept rosters here, four
  // holding the same twelve names, not one of which went red on omission.
  const { PROJECTION } = require('../../../lib/core/projection-catalog.generated.mjs');
  const roster = Object.entries(PROJECTION)
    .filter(([, p]) => p.data === true && (p.figure === 'svg' || p.figure === 'spatial'))
    .map(([name]) => name)
    .sort();
  assert.ok(roster.length >= 14, `the roster collapsed to ${roster.length} — the filter, not the manifests`);
  const missing = roster.filter((n) => !PROJECTION[n].frame);
  assert.deepEqual(missing, [], `these charts narrate their numbers and never say what they measure: ${missing.join(', ')}`);
});

test('a declared frame is a lowercase clause the caller composes', () => {
  // The manifest validator enforces this, and this is the cell that proves the
  // validator is wired rather than merely written: a leading capital or a trailing
  // period lands mid-track as "Sized by how often each came up. ."
  const { PROJECTION } = require('../../../lib/core/projection-catalog.generated.mjs');
  for (const [name, p] of Object.entries(PROJECTION)) {
    if (!p.frame) continue;
    assert.ok(!/^[A-Z]/.test(p.frame), `${name}: frame must not start capitalized — ${p.frame}`);
    assert.ok(!/[.!?]$/.test(p.frame.trim()), `${name}: frame must not be terminated — ${p.frame}`);
  }
});

// ── dispatch ─────────────────────────────────────────────────────────────────

test('the pilots win over the generic floor for their own components', () => {
  // NARRATORS is first-match-wins and the floor is last, so a pilot must be the one
  // that answers. If the order regressed, the floor's flat reading would come back.
  assert.ok(narrateChart(slide('bullet', BULLET_GALLERY)).includes('Each row shows where we landed'));
  assert.ok(narrateChart(slide('word-cloud', CLOUD_GALLERY)).includes('Sized by how often each came up'));
});
