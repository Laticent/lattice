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
  assert.ok(out.includes('Nine terms, sized by how often each came up'), out);
  assert.ok(out.includes('Time-to-value is the biggest at five, one clear of security and onboarding at four each'), out);
  // The old floor reading was nine flat sentences of counts. None may survive.
  assert.ok(!/pricing, three\./.test(out), 'the flat count list must be gone');
});

test('word-cloud — past the cap it COUNTS the remainder instead of reading a wall', () => {
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
  assert.ok(out.includes('Twenty terms'), out);
  assert.ok(out.includes('Component is the biggest at five hundred twelve'), out);
  // The remainder is NAMED as a count, so nothing is silently truncated (§7).
  assert.ok(out.includes('Eighteen more follow'), out);
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
  assert.ok(out.includes('one transition steps back'), out);
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
  assert.ok(out.includes('it runs as a straight chain with no forks'), out);
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
  assert.ok(out.includes('nothing leads to Forgotten'), out);
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
  // period lands mid-track as "Nine terms, Sized by how often each came up. ."
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
  assert.ok(narrateChart(slide('word-cloud', CLOUD_GALLERY)).includes('sized by how often each came up'));
});
