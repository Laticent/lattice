const test = require('node:test');
const assert = require('node:assert/strict');
const {
  narrateChart,
  narrateDataSeries,
  narrateDiagram,
  narrateFunnel,
  narrateJourneyMood,
  narrateJourneyWeighted,
  narrateQuadrant,
  narrateRadar,
  narrateStateChart,
  narrateStateChartInference,
} = require('../../../lib/core/chart-narration.js');

// The shared chart narrators (lib/core, ported from the browser-only
// docs/src/components/studio/chart-narration.ts, #902 Gap 1 Phase 2). This is the
// authoritative behavior ORACLE — every case here mirrors the docs vitest suite it
// replaced, so the export and Present narrate a chart slide identically BY
// CONSTRUCTION (one kernel, one test). Each narrator re-derives a COMPUTED fact
// (funnel conversion %, journey weighting, radar/quadrant auto-fit scale, state-chart
// inference) that exists only in the rendered chart, never in the raw Markdown.

// ── narrateFunnel ─────────────────────────────────────────────────────────────
const funnelSkeleton = [
  '<!-- _class: funnel -->',
  '',
  '## Where the flow drops off.',
  '',
  '- Visitors `12,000`',
  '- Signups `4,800`',
  '- Activated `2,160`',
].join('\n');

test('narrateFunnel: returns null for a non-funnel slide', () => {
  assert.equal(narrateFunnel('<!-- _class: kpi -->\n\n## Revenue\n\n- A `1`\n- B `2`'), null);
});

test('narrateFunnel: returns null with fewer than two stages (mirrors the transform bailout)', () => {
  assert.equal(narrateFunnel('<!-- _class: funnel -->\n\n## One stage\n\n- Visitors `12,000`'), null);
});

test('narrateFunnel: speaks the heading, each stage value, and the computed conversion %', () => {
  const out = narrateFunnel(funnelSkeleton);
  assert.ok(out.includes('Where the flow drops off.'));
  assert.ok(out.includes('Visitors: twelve thousand.'));
  // 4,800 / 12,000 = 40% — computed here, never authored on the slide.
  assert.ok(out.includes('Signups: four thousand eight hundred, forty percent of the prior stage.'));
  // 2,160 / 4,800 = 45%
  assert.ok(out.includes('Activated: two thousand one hundred sixty, forty-five percent of the prior stage.'));
});

test('narrateFunnel: does not treat an indented detail sublist line as a stage, but still speaks it', () => {
  const md = [
    '<!-- _class: funnel -->',
    '',
    '## Stages.',
    '',
    '- Visitors `12,000`',
    '  - Two-thirds arrive from inbound',
    '- Signups `4,800`',
  ].join('\n');
  const out = narrateFunnel(md);
  assert.ok(out.includes('Signups: four thousand eight hundred, forty percent of the prior stage.'));
  assert.ok(out.includes('Two-thirds arrive from inbound.'));
});

test('narrateFunnel: skips a fenced code block that happens to contain stage-like syntax', () => {
  const md = [
    '<!-- _class: funnel -->',
    '',
    '## Stages.',
    '',
    '```',
    '- Fake `999`',
    '```',
    '',
    '- Visitors `12,000`',
    '- Signups `4,800`',
  ].join('\n');
  assert.ok(!narrateFunnel(md).includes('Fake'));
});

test('narrateFunnel: recognizes a funnel slide combined with a base modifier', () => {
  for (const cls of ['funnel dark', 'funnel compact', 'funnel accent']) {
    const md = `<!-- _class: ${cls} -->\n\n## Stages.\n\n- A \`100\`\n- B \`50\``;
    assert.ok(narrateFunnel(md).includes('fifty percent'), cls);
  }
});

test('narrateFunnel: does not mistake a substring class for funnel', () => {
  assert.equal(narrateFunnel('<!-- _class: funnel-detail -->\n\n## Stages.\n\n- A `100`\n- B `50`'), null);
});

test('narrateFunnel: ignores a heading inside a fenced code block', () => {
  const md = [
    '<!-- _class: funnel -->',
    '',
    '```',
    '## Not the real heading',
    '```',
    '',
    '## The real heading.',
    '',
    '- Visitors `100`',
    '- Signups `50`',
  ].join('\n');
  const out = narrateFunnel(md);
  assert.ok(out.includes('The real heading.'));
  assert.ok(!out.includes('Not the real heading'));
});

test('narrateFunnel: ignores a fenced _class: funnel directive shown as a doc example', () => {
  const md = [
    '<!-- _class: kpi -->',
    '',
    '## How to author a funnel',
    '',
    '```',
    '<!-- _class: funnel -->',
    '- A `100`',
    '- B `50`',
    '```',
    '',
    '- Not `1`',
    '- Stages `2`',
  ].join('\n');
  assert.equal(narrateFunnel(md), null);
});

test('narrateFunnel: strips a Markdown link label from a stage name', () => {
  const md = '<!-- _class: funnel -->\n\n## Stages.\n\n- [Visitors](https://x.example/report) `100`\n- Signups `50`';
  const out = narrateFunnel(md);
  assert.ok(out.includes('Visitors: one hundred'));
  assert.ok(!out.includes('https://x.example'));
  assert.ok(!out.includes('['));
});

test('narrateFunnel: recovers the FIRST numeric run from a range-style stage value instead of dropping the stage', () => {
  const md = ['<!-- _class: funnel -->', '', '## Stages.', '', '- Estimated `1,200-1,500`', '- Signups `600`'].join('\n');
  const out = narrateFunnel(md);
  assert.notEqual(out, null);
  assert.ok(out.includes('Signups: six hundred, fifty percent of the prior stage.'));
});

test('narrateFunnel: does not splice the chain across a broken middle stage', () => {
  const md = ['<!-- _class: funnel -->', '', '## Stages.', '', '- Visitors `10,000`', '- Mid-funnel `2,000-2,500`', '- Purchases `1,000`'].join('\n');
  const out = narrateFunnel(md);
  assert.ok(out.includes('Mid-funnel:'));
  assert.ok(out.includes('twenty percent of the prior stage'));
  assert.ok(out.includes('Purchases: one thousand, fifty percent of the prior stage.'));
  assert.ok(!out.includes('ten percent of the prior stage'));
});

// ── narrateJourneyWeighted ────────────────────────────────────────────────────
const weightedSample = [
  '<!-- _class: journey weighted -->',
  '',
  '## weighted sizes the stages by importance.',
  '',
  '- Discover',
  '  - Search `@prospect` `:4` `+45`',
  '  - Referral `@prospect` `:5` `+18`',
  '- Convert',
  '  - Pricing page `@prospect` `:3` `+12`',
  '  - Checkout `@prospect` `:2` `+10`',
  '- Support',
  '  - Settings `@user` `:3` `+8`',
  '  - Help docs `@user` `:4` `+7`',
].join('\n');

test('narrateJourneyWeighted: returns null for a non-journey slide', () => {
  assert.equal(narrateJourneyWeighted('<!-- _class: kpi -->\n\n## X\n\n- A\n  - B `+1`'), null);
});

test('narrateJourneyWeighted: returns null for journey without the weighted modifier', () => {
  assert.equal(narrateJourneyWeighted(weightedSample.replace('journey weighted', 'journey heatmap')), null);
});

test('narrateJourneyWeighted: speaks each task share of the total volume', () => {
  const out = narrateJourneyWeighted(weightedSample);
  assert.ok(out.includes('weighted sizes the stages by importance.'));
  assert.ok(out.includes('Discover: Search, forty-five percent; Referral, eighteen percent.'));
  assert.ok(out.includes('Convert: Pricing page, twelve percent; Checkout, ten percent.'));
  assert.ok(out.includes('Support: Settings, eight percent; Help docs, seven percent.'));
});

test('narrateJourneyWeighted: defaults an unweighted task to volume 1', () => {
  const md = ['<!-- _class: journey weighted -->', '', '## Mixed.', '', '- Stage', '  - Weighted `@me` `:3` `+9`', '  - Unweighted `@me` `:3`'].join('\n');
  const out = narrateJourneyWeighted(md);
  assert.ok(out.includes('Weighted, ninety percent'));
  assert.ok(out.includes('Unweighted, ten percent'));
});

test('narrateJourneyWeighted: does not treat a per-task detail sublist line as a task, but still speaks it', () => {
  const md = [
    '<!-- _class: journey weighted -->',
    '',
    '## Weighted flow.',
    '',
    '- Stage',
    '  - Task A `@me` `:3` `+50`',
    '    - Escalated after `3` retries',
    '  - Task B `@me` `:3` `+50`',
  ].join('\n');
  const out = narrateJourneyWeighted(md);
  assert.ok(out.includes('Stage: Task A, fifty percent; Task B, fifty percent.'));
  assert.ok(out.includes('Escalated after 3 retries.'));
});

test('narrateJourneyWeighted: keeps a qualifying phrase authored AFTER a task tokens', () => {
  const md = [
    '<!-- _class: journey weighted -->',
    '',
    '## Flow.',
    '',
    '- Stage',
    '  - Escalate `@support` `:2` to tier two `+40`',
    '  - Resolve `@support` `:2` `+60`',
  ].join('\n');
  const out = narrateJourneyWeighted(md);
  assert.ok(out.includes('Stage: Escalate to tier two, forty percent; Resolve, sixty percent.'));
});

test('narrateJourneyWeighted: accepts a `+.5`-style fractional volume with no leading digit', () => {
  const md = ['<!-- _class: journey weighted -->', '', '## Flow.', '', '- Stage', '  - A `@me` `:2` `+.5`', '  - B `@me` `:2` `+.5`'].join('\n');
  assert.ok(narrateJourneyWeighted(md).includes('Stage: A, fifty percent; B, fifty percent.'));
});

test('narrateJourneyWeighted: tolerates ordinary indentation variance between sibling task lines', () => {
  const md = [
    '<!-- _class: journey weighted -->',
    '',
    '## X.',
    '',
    '- Stage',
    '  - Search `@me` `:3` `+50`',
    '   - Referral `@me` `:3` `+50`',
  ].join('\n');
  assert.equal(narrateJourneyWeighted(md), 'X. Stage: Search, fifty percent; Referral, fifty percent.');
});

test('narrateJourneyWeighted: accepts a trailing non-numeric suffix on a volume token (`+45%`)', () => {
  const md = ['<!-- _class: journey weighted -->', '', '## X.', '', '- Stage', '  - Task `@me` `:3` `+45%`', '  - Filler `@me` `:3` `+1`'].join('\n');
  assert.equal(narrateJourneyWeighted(md), 'X. Stage: Task, ninety-eight percent; Filler, two percent.');
});

test('narrateJourneyWeighted: recognizes an h1 heading, not just h2', () => {
  const md = ['<!-- _class: journey weighted -->', '', '# Flow', '', '- Stage', '  - A `@me` `:3` `+9`', '  - B `@me` `:3` `+1`'].join('\n');
  assert.equal(narrateJourneyWeighted(md), 'Flow. Stage: A, ninety percent; B, ten percent.');
});

// ── narrateRadar ──────────────────────────────────────────────────────────────
test('narrateRadar: returns null for a non-radar slide', () => {
  assert.equal(narrateRadar('<!-- _class: kpi -->\n\n## X\n\n- A\n  - B `9`'), null);
});

// An eyebrow that declares the scale makes OUR scale sentence redundant — it does not make
// the narration redundant. Bailing threw away every series and axis value to avoid one
// duplicated line, and the shipped `radar` sample declares its scale, so the canonical
// example of the component reached no narrator at all
// (2026-09-20-narration-audit.md Finding 5).
test('narrateRadar: skips only the scale SENTENCE when the eyebrow already declares it', () => {
  const md = [
    '<!-- _class: radar -->',
    '',
    '`Scale · 0–10`',
    '',
    '## How we stack up across the buying criteria.',
    '',
    '- Lattice',
    '  - Performance `9`',
    '  - Pricing `7`',
    '- Rival North',
    '  - Performance `7`',
    '  - Pricing `8`',
  ].join('\n');
  const out = narrateRadar(md);
  assert.ok(!out.includes('On a scale of'), 'the eyebrow already said it');
  assert.ok(out.includes('Scale \u00b7 0\u201310.'), 'and the eyebrow itself is still read');
  assert.ok(out.includes('Lattice: Performance, nine; Pricing, seven.'));
  assert.ok(out.includes('Rival North: Performance, seven; Pricing, eight.'));
});

test('narrateRadar: narrates the auto-fit scale and every series when no eyebrow is authored', () => {
  const md = ['<!-- _class: radar -->', '', '## How we stack up.', '', '- Lattice', '  - Performance `9`', '  - Pricing `7`', '- Rival North', '  - Performance `7`', '  - Pricing `8`'].join('\n');
  const out = narrateRadar(md);
  assert.ok(out.includes('On a scale of zero to ten.'));
  assert.ok(out.includes('Lattice: Performance, nine; Pricing, seven.'));
  assert.ok(out.includes('Rival North: Performance, seven; Pricing, eight.'));
});

test('narrateRadar: still auto-computes the scale when the eyebrow is present but not a parseable number', () => {
  const md = ['<!-- _class: radar -->', '', '`Buying criteria`', '', '## X.', '', '- Lattice', '  - Performance `9`'].join('\n');
  assert.ok(narrateRadar(md).includes('On a scale of zero to ten.'));
});

test('narrateRadar: recognizes a radar slide combined with a base modifier', () => {
  const md = ['<!-- _class: radar dark -->', '', '## X.', '', '- Lattice', '  - Performance `9`'].join('\n');
  assert.ok(narrateRadar(md).includes('scale of zero to ten'));
});

test('narrateRadar: returns null with no axis data', () => {
  assert.equal(narrateRadar('<!-- _class: radar -->\n\n## X.\n\n- Lattice'), null);
});

test('narrateRadar: defers to slideToSpeech on the `quadrant` variant', () => {
  const md = [
    '<!-- _class: radar quadrant -->',
    '',
    '## quadrant shades the compass quarters.',
    '',
    '- Our capability',
    '  - People',
    '    - Hiring `4`',
    '    - Retention `3`',
    '  - Process',
    '    - Cadence `5`',
  ].join('\n');
  assert.equal(narrateRadar(md), null);
});

test('narrateRadar: does not treat a per-axis detail sublist line as an axis, but still speaks it', () => {
  const md = [
    '<!-- _class: radar -->',
    '',
    '## How we stack up.',
    '',
    '- Lattice',
    '  - Performance `9`',
    '    - Verified in cycle `2024`',
    '  - Pricing `7`',
  ].join('\n');
  const out = narrateRadar(md);
  assert.ok(out.includes('On a scale of zero to ten.'));
  assert.ok(out.includes('Lattice: Performance, nine; Pricing, seven.'));
  assert.ok(out.includes('Verified in cycle 2024.'));
});

test('narrateRadar: tolerates ordinary indentation variance between sibling axis lines', () => {
  const md = ['<!-- _class: radar -->', '', '## How we stack up.', '', '- Lattice', '  - Performance `9`', '   - Pricing `95`'].join('\n');
  assert.equal(narrateRadar(md), 'How we stack up. Each spoke is one axis, and a rating further from the center is higher. On a scale of zero to one hundred. Lattice: Performance, nine; Pricing, ninety-five.');
});

test('narrateRadar: tolerates trailing non-numeric text on an axis value pill', () => {
  const md = ['<!-- _class: radar -->', '', '## X.', '', '- Lattice', '  - Performance `9 pts`'].join('\n');
  assert.equal(narrateRadar(md), 'X. Each spoke is one axis, and a rating further from the center is higher. On a scale of zero to ten. Lattice: Performance, nine.');
});

test('narrateRadar: speaks a leading eyebrow FIRST, in its authored position, properly punctuated', () => {
  const md = ['<!-- _class: radar -->', '', '`Buying criteria`', '', '## X.', '', '- Lattice', '  - Performance `9`'].join('\n');
  assert.equal(narrateRadar(md), 'Buying criteria. X. Each spoke is one axis, and a rating further from the center is higher. On a scale of zero to ten. Lattice: Performance, nine.');
});

// ── narrateQuadrant ───────────────────────────────────────────────────────────
test('narrateQuadrant: returns null for a non-quadrant slide', () => {
  assert.equal(narrateQuadrant('<!-- _class: kpi -->\n\n## X\n\n- A\n  - B `1, 2`'), null);
});

// Same correction as radar: the per-axis `if (!xRange)` / `if (!yRange)` guards already skip
// an axis sentence the eyebrow stated, so the extra whole-narrator bail only cost the reader
// every group and coordinate on the slide.
test('narrateQuadrant: skips only the axis SENTENCES when the eyebrow ranges both axes', () => {
  const md = [
    '<!-- _class: quadrant -->',
    '',
    '`Effort 0–10 → Reach 0–100`',
    '',
    '## Where to put the next dollar.',
    '',
    '- Strategic Bets',
    '  - Scoring model v2 `3, 70`',
    '- Quick Wins',
    '  - Weekly signal brief `8, 80`',
  ].join('\n');
  const out = narrateQuadrant(md);
  assert.ok(!out.includes('axis runs'), 'the eyebrow already ranged both axes');
  assert.ok(out.includes('Strategic Bets: Scoring model v2 at three, seventy.'));
  assert.ok(out.includes('Quick Wins: Weekly signal brief at eight, eighty.'));
});

test('narrateQuadrant: narrates both axis scales and every item when no eyebrow is authored', () => {
  const md = ['<!-- _class: quadrant -->', '', '## Where to invest.', '', '- Strategic Bets', '  - Scoring model v2 `3, 70`', '  - Per-team calibration `5, 85`', '- Quick Wins', '  - Weekly signal brief `8, 80`'].join('\n');
  const out = narrateQuadrant(md);
  assert.ok(out.includes('The horizontal axis runs zero to ten.'));
  assert.ok(out.includes('The vertical axis runs zero to one hundred.'));
  assert.ok(out.includes('Strategic Bets: Scoring model v2 at three, seventy; Per-team calibration at five, eighty-five.'));
  assert.ok(out.includes('Quick Wins: Weekly signal brief at eight, eighty.'));
});

test('narrateQuadrant: narrates only the axis the eyebrow leaves unranged', () => {
  const md = ['<!-- _class: quadrant -->', '', '`Effort 0–10`', '', '## X.', '', '- Group', '  - Item `5, 85`'].join('\n');
  const out = narrateQuadrant(md);
  assert.ok(!out.includes('horizontal axis'));
  assert.ok(out.includes('The vertical axis runs zero to one hundred.'));
});

test('narrateQuadrant: correctly parses the `trail` variant two-pill item instead of garbling the label', () => {
  const md = [
    '<!-- _class: quadrant trail -->',
    '',
    '## trail shows where each point moved from.',
    '',
    '- Strategic Bets',
    '  - Scoring model v2 `5, 60` `3, 78`',
    '  - Per-team calibration `7, 70` `5, 88`',
    '- Quick Wins',
    '  - Snapshot exports `9, 45` `8, 62`',
  ].join('\n');
  const out = narrateQuadrant(md);
  assert.ok(out.includes('Strategic Bets: Scoring model v2 at three, seventy-eight; Per-team calibration at five, eighty-eight.'));
  assert.ok(out.includes('Quick Wins: Snapshot exports at eight, sixty-two.'));
  assert.ok(!out.includes('5, 60'));
  assert.ok(!out.includes('7, 70'));
});

test('narrateQuadrant: handles a negative-extreme axis', () => {
  const md = ['<!-- _class: quadrant -->', '', '## X.', '', '- Group', '  - A `-20, 5`', '  - B `8, 3`'].join('\n');
  const out = narrateQuadrant(md);
  assert.ok(out.includes('The horizontal axis runs negative twenty to twenty.'));
  assert.ok(out.includes('The vertical axis runs zero to five.'));
});

test('narrateQuadrant: bails when the `radar` token is also present', () => {
  const md = ['<!-- _class: radar quadrant -->', '', '## X.', '', '- Group', '  - Sub', '    - Item `4`'].join('\n');
  assert.equal(narrateQuadrant(md), null);
});

test('narrateQuadrant: does not treat a per-item detail sublist line as an item, but still speaks it', () => {
  const md = [
    '<!-- _class: quadrant -->',
    '',
    '## Where to invest.',
    '',
    '- Strategic Bets',
    '  - Scoring model v2 `3, 70`',
    '    - Confidence range `40, 95`',
    '  - Per-team calibration `5, 85`',
  ].join('\n');
  const out = narrateQuadrant(md);
  assert.ok(out.includes('The horizontal axis runs zero to five.'));
  assert.ok(out.includes('The vertical axis runs zero to one hundred.'));
  assert.ok(out.includes('Strategic Bets: Scoring model v2 at three, seventy; Per-team calibration at five, eighty-five.'));
  assert.ok(out.includes('Confidence range 40, 95.'));
});

test('narrateQuadrant: speaks an intro paragraph between the heading and the groups', () => {
  const md = [
    '<!-- _class: quadrant -->',
    '',
    '## Where to invest.',
    '',
    'Bubble size reflects team size.',
    '',
    '- Strategic Bets',
    '  - Scoring model v2 `3, 70`',
    '- Quick Wins',
    '  - Weekly signal brief `8, 80`',
  ].join('\n');
  const out = narrateQuadrant(md);
  assert.ok(out.includes('Bubble size reflects team size.'));
  assert.ok(out.includes('Strategic Bets: Scoring model v2 at three, seventy.'));
});

test('narrateQuadrant: does not silently strip an unparseable eyebrow "targets" suffix', () => {
  const md = [
    '<!-- _class: quadrant -->',
    '',
    '`Effort 0–10 → Reach 0–100 · targets tbd`',
    '',
    '## Where to invest.',
    '',
    '- Strategic Bets',
    '  - Scoring model v2 `3, 45`',
    '- Quick Wins',
    '  - Weekly signal brief `8, 30`',
  ].join('\n');
  const out = narrateQuadrant(md);
  assert.ok(out.includes('The vertical axis runs zero to fifty.'));
  assert.ok(!out.includes('one hundred'));
});

test('narrateQuadrant: tolerates ordinary indentation variance between sibling item lines', () => {
  const md = [
    '<!-- _class: quadrant -->',
    '',
    '## Where to invest.',
    '',
    '- Strategic Bets',
    '  - Scoring model v2 `3, 70`',
    '   - Per-team calibration `7, 85`',
  ].join('\n');
  assert.equal(
    narrateQuadrant(md),
    'Where to invest. Each item sits at its two scores, so which quadrant it lands in is the read. The horizontal axis runs zero to ten. The vertical axis runs zero to one hundred. Strategic Bets: Scoring model v2 at three, seventy; Per-team calibration at seven, eighty-five.',
  );
});

test('narrateQuadrant: speaks a leading eyebrow FIRST, in its authored position, properly punctuated', () => {
  const md = ['<!-- _class: quadrant -->', '', '`Effort 0–10`', '', '## X.', '', '- Group', '  - Item `5, 85`'].join('\n');
  assert.equal(narrateQuadrant(md), 'Effort 0–10. X. Each item sits at its two scores, so which quadrant it lands in is the read. The vertical axis runs zero to one hundred. Group: Item at five, eighty-five.');
});

test('narrateQuadrant: mirrors parseCoordPill leading-digit quirk (`.5` does not count as a coordinate)', () => {
  const md = ['<!-- _class: quadrant -->', '', '## X.', '', '- Group', '  - Item `.5, 80`'].join('\n');
  assert.ok(narrateQuadrant(md).includes('Group: Item at eighty, zero.'));
});

// ── narrateStateChartInference ─────────────────────────────────────────────────
test('narrateStateChartInference: returns null for a non-state-chart slide', () => {
  assert.equal(narrateStateChartInference('<!-- _class: kpi -->\n\n## X\n\n1. A\n2. B'), null);
});

test('narrateStateChartInference: returns null when start AND end are both already explicit', () => {
  const md = [
    '<!-- _class: state-chart -->',
    '',
    '## Document approval flow.',
    '',
    '1. Draft `start`',
    '   - `submit => 2`',
    '   - `discard => 6`',
    '2. Submitted `on-track`',
    '   - `review => 3`',
    '3. In Review',
    '   - `approve => 4`',
    '   - `reject => 1`',
    '   - `revise => self`',
    '4. Approved `done`',
    '   - `publish => 5`',
    '5. Published `live`',
    '   - `archive => 6`',
    '6. Archived `end`',
  ].join('\n');
  assert.equal(narrateStateChartInference(md), null);
});

test('narrateStateChartInference: infers only the terminal state when start is explicit but end is not', () => {
  const md = [
    '<!-- _class: state-chart lr -->',
    '',
    '## States connect; the arrows carry the rules.',
    '',
    '1. Draft `start`',
    '   - `submit => 2`',
    '2. Submitted `on-track`',
    '   - `review => 3`',
    '3. In Review `at-risk`',
    '   - `approve => 4`',
    '   - `reject => 1`',
    '   - `revise => self`',
    '4. Approved',
    '   - `publish => 5`',
    '5. Published',
  ].join('\n');
  assert.equal(narrateStateChartInference(md), 'It ends at Published.');
});

test('narrateStateChartInference: infers both start and terminal states when neither is tagged', () => {
  const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft', '   - `submit => 2`', '2. Review', '   - `approve => 3`', '3. Done'].join('\n');
  assert.equal(narrateStateChartInference(md), 'This flow starts at Draft. It ends at Done.');
});

test('narrateStateChartInference: lists multiple inferred terminal states with "and"', () => {
  const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Start `start`', '   - `go => 2`', '   - `go => 3`', '2. Branch A', '3. Branch B'].join('\n');
  assert.equal(narrateStateChartInference(md), 'It ends at Branch A and Branch B.');
});

test('narrateStateChartInference: does not let an out-of-range transition target suppress terminal inference', () => {
  const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft `start`', '   - `submit => 9`', '2. Review', '3. Done'].join('\n');
  assert.equal(narrateStateChartInference(md), 'It ends at Draft, Review, and Done.');
});

test('narrateStateChartInference: keeps an unrelated trailing annotation in an inferred state spoken label', () => {
  const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Config `port 8080`', '   - `next => 2`', '2. Done'].join('\n');
  assert.equal(narrateStateChartInference(md), 'This flow starts at Config port 8080. It ends at Done.');
});

test('narrateStateChartInference: does not include a status keyword pill in the spoken label', () => {
  const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Submitted `on-track`', '   - `go => 2`', '2. Done'].join('\n');
  assert.equal(narrateStateChartInference(md), 'This flow starts at Submitted. It ends at Done.');
});

// ── narrateStateChart ─────────────────────────────────────────────────────────
// The SHAPE sentence replaced the old "This flow starts at Draft. It ends at Done."
// pair, and it must carry strictly more: the same two endpoints PLUS the size, which
// the inference sentence never said. It also now runs on every machine rather than
// only on one whose author left the roles untagged — the case the old sentence covered
// was the rarer one, and every shipped sample got nothing from it.
test('narrateStateChart: leads with the heading, then the machine SHAPE, then the rest', () => {
  const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft', '   - `submit => 2`', '2. Review', '   - `approve => 3`', '3. Done'].join('\n');
  const out = narrateStateChart(md);
  assert.ok(out.startsWith('Flow. A three-state machine from Draft to Done'), out);
  assert.ok(!out.includes('This flow starts at'), 'the shape sentence subsumes it — saying both is the duplication this pass removes');
  assert.ok(out.includes('It runs as a straight chain with no forks'), out);
  assert.equal(out.match(/Flow\./g).length, 1);
});

// With start AND end explicit there is nothing INFERRED to add — but there is still a
// machine to read. The old docblock claimed the `event => N` pills "read as reasonable, if
// plain, prose" through the flattener; measured, they do not: the pill is inline code, so
// `submit => 2` reaches the voice whole and `=>` has no spoken form. The listener got a glyph
// and a bare index where the slide draws an arrow to a named state
// (2026-09-20-narration-audit.md Finding 5).
test('narrateStateChart: reads the machine by name even when nothing is inferred', () => {
  const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft `start`', '   - `submit => 2`', '2. Done `end`'].join('\n');
  const out = narrateStateChart(md);
  assert.ok(out.includes('From Draft, submit goes to Done.'), out);
  assert.ok(!out.includes('=>'), 'the raw pill must not also be read');
  assert.ok(!out.includes('This flow starts at'), 'start is explicit — nothing to infer');
  // …and the shape sentence still names both endpoints, which is the whole point:
  // the old inference sentence went SILENT on every deck that tagged its roles, and
  // all five samples in state-chart.docs.md tag both.
  assert.ok(out.includes('A two-state machine from Draft to Done'), out);
});

test('narrateStateChart: still returns null when there is no machine and no inference', () => {
  // A state-chart slide with no resolvable transitions has nothing this narrator can add
  // over the flattener, so it falls through exactly as before.
  const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft `start`', '2. Done `end`'].join('\n');
  assert.equal(narrateStateChart(md), null);
});

test('narrateStateChart: reads a self-loop as staying put, not as its own name twice', () => {
  const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft `start`', '   - `revise => self`', '   - `submit => 2`', '2. Done `end`'].join('\n');
  const out = narrateStateChart(md);
  assert.ok(out.includes('revise stays here'), out);
});

test('narrateStateChart: does not speak a fenced doc-example heading as the title, and does not lose the real heading', () => {
  const md = [
    '<!-- _class: state-chart -->',
    '',
    '```',
    '## Not the real heading (doc example)',
    '```',
    '',
    '## The real heading.',
    '',
    '1. Draft',
    '   - `submit => 2`',
    '2. Review',
    '   - `approve => 3`',
    '3. Done',
  ].join('\n');
  const out = narrateStateChart(md);
  assert.ok(out.startsWith('The real heading. A three-state machine from Draft to Done'), out);
  assert.ok(!out.includes('Not the real heading'));
});

// ── narrateChart (dispatcher) ─────────────────────────────────────────────────
test('narrateChart: recognizes a funnel slide', () => {
  assert.ok(narrateChart('<!-- _class: funnel -->\n\n## Stages.\n\n- A `100`\n- B `50`').includes('fifty percent'));
});

test('narrateChart: recognizes a weighted journey slide', () => {
  const md = ['<!-- _class: journey weighted -->', '', '## X.', '', '- Stage', '  - A `@me` `:3` `+9`', '  - B `@me` `:3` `+1`'].join('\n');
  assert.ok(narrateChart(md).includes('ninety percent'));
});

test('narrateChart: recognizes a state-chart slide and reads its shape', () => {
  const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft', '   - `submit => 2`', '2. Done'].join('\n');
  assert.ok(narrateChart(md).includes('A two-state machine from Draft to Done'));
});

test('narrateChart: returns null for a slide no narrator recognizes', () => {
  assert.equal(narrateChart('<!-- _class: kpi -->\n\n## Revenue\n\nWe grew.'), null);
});

// ── narrateDiagram (Mermaid flowchart) ────────────────────────────────────────
// Reads a `diagram` slide's flowchart topology from the Mermaid SOURCE fence. Scoped
// to flowchart/graph; a CONSERVATIVE grammar that BAILS to null on anything it can't
// fully recognize, so it never speaks a confidently-wrong relationship
// (2026-07-13-mermaid-diagram-narration.md §8.3).

const diagramSkeleton = [
  '<!-- _class: diagram -->',
  '',
  '`01 · Flowchart`',
  '',
  '## How a signal becomes a decision.',
  '',
  '```mermaid',
  '---',
  'title: Signal pipeline',
  '---',
  'flowchart LR',
  '  A{{"Signal Intake"}} --> B(["Scoring Model"])',
  '  B -->|"scored signal"| C["Decision Log"]',
  '  C -->|"decide / close"| D[("Outcome Store")]',
  '  B -.->|"recalibration"| C',
  '```',
  '',
  '> A trailing authored note.',
].join('\n');

test('narrateDiagram: returns null for a non-diagram slide', () => {
  assert.equal(narrateDiagram('<!-- _class: kpi -->\n\n## Revenue\n\n1. `$2.4B`\n- Total'), null);
});

test('narrateDiagram: returns null for a diagram slide with no mermaid fence', () => {
  assert.equal(narrateDiagram('<!-- _class: diagram -->\n\n## Just a heading.\n\nSome prose.'), null);
});

test('narrateDiagram: speaks eyebrow, heading, the flowchart frame, and the FLOW (chain + labeled hops + terminal)', () => {
  const out = narrateDiagram(diagramSkeleton);
  assert.ok(out.includes('01 · Flowchart.'));
  assert.ok(out.includes('How a signal becomes a decision.'));
  assert.ok(out.includes('A flowchart, Signal pipeline.'));
  // The unlabeled A→B hop reads "leads to"; the labeled hops read faithfully. The Scoring
  // Model's two parallel edges to the Decision Log (scored signal + recalibration) dedupe
  // into one merged label, which — being neither a recognized verb nor a condition — reads
  // as the grammatical APPOSITIVE, never the broken "Scoring Model scored signal Decision Log".
  assert.ok(out.includes('Signal Intake leads to Scoring Model'), out);
  assert.ok(out.includes('Scoring Model, scored signal, recalibration, leads to Decision Log'), out);
  assert.ok(out.includes('Decision Log, decide / close, leads to Outcome Store'), out);
  assert.ok(out.includes('The flow ends at Outcome Store.'), out);
});

test('narrateDiagram: speaks authored prose outside the fence (never say less), and NEVER leaks the mermaid source', () => {
  const out = narrateDiagram(diagramSkeleton);
  assert.ok(out.includes('A trailing authored note.'));
  // The fence body must not reach the voice as gibberish prose. (The spoken frame "A
  // flowchart, …" legitimately contains the word "flowchart"; a LEAK is the mermaid
  // SOURCE syntax — arrows, node-shape delimiters, the fence, the in-fence `title:`.)
  // Plain substring checks, NOT a regex: a regex alternative matching `-->` trips
  // CodeQL's js/bad-tag-filter (it reads `-->` as an HTML-comment-end filter).
  for (const leak of ['-->', '-.->', '{{', '```', 'title:', 'Signal Intake}}']) {
    assert.ok(!out.includes(leak), `${leak} leaked: ${out}`);
  }
});

test('narrateDiagram: frame has no title when the mermaid front matter omits one', () => {
  const md = ['<!-- _class: diagram -->', '', '## Plain.', '', '```mermaid', 'flowchart LR', '  A[One] --> B[Two]', '```'].join('\n');
  const out = narrateDiagram(md);
  assert.ok(out.includes('A flowchart. One leads to Two.'));
  assert.ok(!out.includes('A flowchart,'));
});

test('narrateDiagram: coalesces a linear chain into one flowing sentence', () => {
  const md = ['<!-- _class: diagram -->', '', '## Chain.', '', '```mermaid', 'flowchart LR', '  A[One] --> B[Two] --> C[Three]', '```'].join('\n');
  const out = narrateDiagram(md);
  assert.ok(out.includes('One leads to Two, then Three.'));
  assert.ok(out.includes('The flow ends at Three.'));
});

test('narrateDiagram: groups a fan-out and closes at the terminals', () => {
  const md = [
    '<!-- _class: diagram -->', '', '## Fan.', '',
    '```mermaid', 'flowchart TD',
    '  Gateway["API Gateway"] --> A["Auth"]', '  Gateway --> B["Orders"]', '  Gateway --> C["Search"]', '```',
  ].join('\n');
  const out = narrateDiagram(md);
  assert.ok(out.includes('API Gateway fans out to Auth, Orders, and Search.'), out);
  assert.ok(out.includes('The flow ends at Auth, Orders, and Search.'), out);
});

test('narrateDiagram: a decision node binds each branch label to its target unambiguously', () => {
  const md = [
    '<!-- _class: diagram -->', '', '## Gate.', '',
    '```mermaid', 'flowchart TD',
    '  S["New request"] --> C{"Within policy?"}', '  C -->|"yes"| Y["Approve"]', '  C -->|"no"| N["Review"]', '```',
  ].join('\n');
  const out = narrateDiagram(md);
  // Each branch is a verb-bound clause ("on yes, leads to Approve"), NOT a flat comma
  // list ("Approve, yes and Review, no") a listener can't parse.
  assert.ok(out.includes('From Within policy?: on yes, leads to Approve; on no, leads to Review.'), out);
});

test('narrateDiagram: a feedback edge narrates as a loop, not a whole-graph grouped collapse', () => {
  const md = ['<!-- _class: diagram -->', '', '## Loop.', '', '```mermaid', 'flowchart LR', '  I[Ingest] --> V[Validate] --> T[Transform] --> L[Load]', '  V -->|retry| I', '```'].join('\n');
  const out = narrateDiagram(md);
  assert.ok(out.includes('Ingest leads to Validate, then Transform, then Load.'), out); // forward flow survives
  assert.ok(out.includes('Validate, retry, loops back to Ingest.'), out); // the back-edge is a loop (appositive label)
  assert.ok(out.includes('The flow ends at Load.'), out);
});

test('narrateDiagram: a pure cycle narrates a flow plus a loop-back (cycle signal preserved)', () => {
  const md = ['<!-- _class: diagram -->', '', '## Loop.', '', '```mermaid', 'flowchart LR', '  A[Draft] --> B[Review]', '  B --> C[Publish]', '  C --> A', '```'].join('\n');
  const out = narrateDiagram(md);
  assert.ok(out.includes('Draft leads to Review, then Publish.'), out);
  assert.ok(out.includes('Publish loops back to Draft.'), out);
});

test('narrateDiagram: an orphan node is not a false flow terminal, and parallel edges de-dup', () => {
  const orphan = ['<!-- _class: diagram -->', '', '## O.', '', '```mermaid', 'flowchart TD', '  A[A] --> B[B]', '  Z[Legend only]', '```'].join('\n');
  const oo = narrateDiagram(orphan);
  assert.ok(oo.includes('The flow ends at B.'), oo);
  assert.ok(!oo.includes('Legend only'), oo); // an in=out=0 orphan is never a terminal
  const par = ['<!-- _class: diagram -->', '', '## P.', '', '```mermaid', 'flowchart TD', '  A[A] --> B[B]', '  A --> B', '```'].join('\n');
  assert.ok(!narrateDiagram(par).includes('B and B'), narrateDiagram(par)); // deduped, not "fans out to B and B"
});

test('narrateDiagram: reads a dotted inline-text edge label', () => {
  const md = ['<!-- _class: diagram -->', '', '## Loop.', '', '```mermaid', 'flowchart LR', '  A[Calibration] -.adjust weights.-> B[Score]', '```'].join('\n');
  assert.ok(narrateDiagram(md).includes('Calibration, adjust weights, leads to Score.'));
});

test('narrateDiagram: narrates edges inside and across subgraphs (subgraph lines skipped)', () => {
  const md = [
    '<!-- _class: diagram -->', '', '## Groups.', '',
    '```mermaid', 'flowchart LR',
    '  subgraph Ingest', '    A["Collect"] --> B["Normalize"]', '  end',
    '  B --> C["Score"]', '```',
  ].join('\n');
  const out = narrateDiagram(md);
  assert.ok(out.includes('Collect leads to Normalize, then Score.'), out); // chained across the subgraph boundary
  assert.ok(!out.includes('Ingest leads')); // the subgraph title is not spoken as a node
});

test('narrateDiagram: BAILS to null on a not-yet-supported Mermaid type', () => {
  // sequenceDiagram is now narrated (slice #1); the rest still fall back to heading+caption
  // until their own first-wave slice lands (design 2026-07-14).
  for (const type of ['classDiagram', 'stateDiagram-v2', 'erDiagram', 'gantt', 'pie', 'mindmap', 'C4Context']) {
    const md = `<!-- _class: diagram -->\n\n## T\n\n\`\`\`mermaid\n${type}\n  A->>B: x\n\`\`\``;
    assert.equal(narrateDiagram(md), null, type);
  }
});

test('narrateDiagram: BAILS to null on unrecognized edge grammar — never confidently-wrong topology', () => {
  const cases = {
    'reversed arrow': '  A[X] <-- B[Y]',
    'bidirectional': '  A[X] <--> B[Y]',
    'undirected link': '  A[X] --- B[Y]',
    'cross terminator': '  A[X] --x B[Y]',
    'circle terminator': '  A[X] --o B[Y]',
    'ampersand fan-out': '  A & B --> C',
    'class shorthand': '  A[X]:::hot --> B[Y]',
  };
  for (const [name, edge] of Object.entries(cases)) {
    const md = `<!-- _class: diagram -->\n\n## T\n\n\`\`\`mermaid\nflowchart LR\n${edge}\n\`\`\``;
    assert.equal(narrateDiagram(md), null, name);
  }
});

test('narrateDiagram: BAILS to null on a flowchart with no readable edges (node-only)', () => {
  const md = ['<!-- _class: diagram -->', '', '## Nodes.', '', '```mermaid', 'flowchart LR', '  A["Alone"]', '  B["Also"]', '```'].join('\n');
  assert.equal(narrateDiagram(md), null);
});

test('narrateDiagram: a fenced doc-example heading never masquerades as the slide heading', () => {
  // The real heading is outside the fence; a `#`/`flowchart` inside a nested example must not win.
  const md = [
    '<!-- _class: diagram -->', '', '## The real heading.', '',
    '```mermaid', 'flowchart LR', '  A[Start] --> B[End]', '```',
  ].join('\n');
  const out = narrateDiagram(md);
  assert.ok(out.includes('The real heading.'));
  assert.ok(out.includes('Start leads to End.'));
});

test('narrateChart: routes a diagram slide through narrateDiagram', () => {
  assert.ok(narrateChart(diagramSkeleton).includes('Signal Intake leads to Scoring Model'));
});

test('narrateDiagram: does not double-punctuate a node label that already ends in ? or .', () => {
  const md = ['<!-- _class: diagram -->', '', '## Gate.', '', '```mermaid', 'flowchart TD', '  A[New request] --> C{"Within policy?"}', '  C -->|yes| D[Approve]', '```'].join('\n');
  const out = narrateDiagram(md);
  assert.ok(out.includes('New request leads to Within policy?'));
  assert.ok(!out.includes('Within policy?.')); // no doubled ?.
});

test('narrateDiagram: reads a DOT-lengthened dotted arrow with no fabricated label (never leaks the arrow dots)', () => {
  for (const arrow of ['-.->', '-..->', '-...->', '-....->']) {
    const md = ['<!-- _class: diagram -->', '', '## D.', '', '```mermaid', 'flowchart LR', `  A[X] ${arrow} B[Y]`, '```'].join('\n');
    const out = narrateDiagram(md);
    assert.ok(out.includes('X leads to Y.'), `${arrow} -> ${out}`);
    assert.ok(!/,\s*\.+,\s*leads/.test(out), `${arrow} fabricated a dot label: ${out}`);
  }
});

test('narrateDiagram: keeps the REAL label on a dotted arrow (base and dot-lengthened), not the dots', () => {
  for (const arrow of ['-. yes .->', '-. yes ..->']) {
    const md = ['<!-- _class: diagram -->', '', '## D.', '', '```mermaid', 'flowchart LR', `  A[X] ${arrow} B[Y]`, '```'].join('\n');
    // "yes" is a branch condition, so it reads "on yes, leads to Y" — the point is the real
    // label survives (never the arrow's dots).
    assert.ok(narrateDiagram(md).includes('X, on yes, leads to Y.'), arrow);
  }
});

test('narrateDiagram: inline-text solid/thick edges bail (ReDoS-safe scope) — a labeled `-- x -->` is not narrated', () => {
  // These forms are intentionally unrecognized (their ReDoS-safe regex would bar
  // hyphens/`=` from the label); an edge using them bails to the heading-only projection.
  for (const edge of ['  A[X] -- go --> B[Y]', '  A[X] == go ==> B[Y]']) {
    const md = `<!-- _class: diagram -->\n\n## T\n\n\`\`\`mermaid\nflowchart LR\n${edge}\n\`\`\``;
    assert.equal(narrateDiagram(md), null, edge);
  }
});

test('narrateDiagram: returns quickly on a pathological connector line (no super-linear backtracking)', () => {
  // A ReDoS in the connector regexes would hang for seconds+ on this; linear-time returns instantly.
  const md = `<!-- _class: diagram -->\n\n## T\n\n\`\`\`mermaid\nflowchart LR\n  A[X] --${' '.repeat(40000)}\n\`\`\``;
  const t = process.hrtime.bigint();
  narrateDiagram(md);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  assert.ok(ms < 1000, `took ${ms}ms — possible ReDoS`);
});

// ── label GRAMMAR: verb vs. noun vs. condition (the trio's central inversion) ──────────────
const diagram = (body, opts = 'flowchart LR') => `<!-- _class: diagram -->\n\n## H.\n\n\`\`\`mermaid\n${opts}\n${body}\n\`\`\``;

test('narrateDiagram: a recognized VERB label reads AS the connective ("A calls B")', () => {
  assert.ok(narrateDiagram(diagram('  A["Web App"] -->|calls| B["API"]')).includes('Web App calls API.'));
  // a verb + preposition composes onto the target
  assert.ok(narrateDiagram(diagram('  A["API"] -->|"reads from"| B[("Postgres")]')).includes('API reads from Postgres.'));
  assert.ok(narrateDiagram(diagram('  A["app"] -->|"depends on"| B["core-lib"]')).includes('app depends on core-lib.'));
});

test('narrateDiagram: a NOUN / code / cadence / slashed label reads as the grammatical APPOSITIVE, never a verb', () => {
  // The whole-trio inversion: "Producer data Consumer" is a broken non-sentence; the appositive
  // "A, ‹label›, leads to B" is grammatical for ANY label the narrator can't confirm is a verb.
  for (const [label, want] of [
    ['data', 'Producer, data, leads to Consumer.'],
    ['events', 'Producer, events, leads to Consumer.'], // a bare plural NOUN is not a verb
    ['"HTTP 200"', 'Producer, HTTP 200, leads to Consumer.'],
    ['v2', 'Producer, v2, leads to Consumer.'],
    ['"decide / close"', 'Producer, decide / close, leads to Consumer.'],
  ]) {
    const out = narrateDiagram(diagram(`  A["Producer"] -->|${label}| B["Consumer"]`));
    assert.ok(out.includes(want), `${label} → ${out}`);
  }
});

test('narrateDiagram: a label on a "?"-named source is classified by the LABEL, not the source (no verb misread as a condition)', () => {
  // Regression: the old "source ends in ?" rule turned every out-edge into a condition, so a
  // verb-ish label on a question node read "on answers, leads to". Now classification is
  // label-only, so a non-condition label reads faithfully (here: the safe appositive).
  const out = narrateDiagram(diagram('  A["FAQ?"] -->|answers| B["Answer"]'));
  assert.ok(out.includes('FAQ?, answers, leads to Answer.'), out);
  assert.ok(!out.includes('on answers'), out);
});

test('narrateDiagram: FAN-IN coalesces same-relation sources into one sentence (unlabeled and verb)', () => {
  const unlabeled = narrateDiagram(diagram('  A["Auth"] --> M["User DB"]\n  B["Orders"] --> M', 'flowchart TD'));
  assert.ok(unlabeled.includes('Auth and Orders both lead to User DB.'), unlabeled);
  // a shared VERB is depluralized for the now-plural subject ("depends on" → "depend on")
  const verb = narrateDiagram(diagram('  A["core-lib"] -->|"depends on"| R["runtime"]\n  B["ui-kit"] -->|"depends on"| R', 'flowchart TD'));
  assert.ok(verb.includes('core-lib and ui-kit both depend on runtime.'), verb);
  // 3+ sources → "all", not "both"
  const three = narrateDiagram(diagram('  A --> M["Merge"]\n  B --> M\n  C --> M', 'flowchart TD'));
  assert.ok(three.includes('A, B, and C all lead to Merge.'), three);
});

test('narrateDiagram: pluralizeVerb conjugates sibilant / -es / -ies verbs on the merge path (no "processe"/"querie")', () => {
  for (const [label, want] of [
    ['processes', 'both process Queue.'],
    ['dispatches', 'both dispatch Queue.'],
    ['queries', 'both query Queue.'],
    ['watches', 'both watch Queue.'],
    ['pushes', 'both push Queue.'],
    // silent-e -ize / -che stems: the 3rd-person adds only "s", so strip only "s"
    // (never "processe"/"authoriz"/"cach") — a third-verifier catch.
    ['authorizes', 'both authorize Queue.'],
    ['normalizes', 'both normalize Queue.'],
    ['caches', 'both cache Queue.'],
  ]) {
    const out = narrateDiagram(diagram(`  A["A"] -->|${label}| M["Queue"]\n  B["B"] -->|${label}| M`, 'flowchart TD'));
    assert.ok(out.includes(want), `${label} → ${out}`);
  }
});

test('narrateDiagram: a condition-labeled fan-IN is NOT coalesced — each guard is spoken from its source', () => {
  // "both on yes Z" would be broken; the guards are load-bearing, so they stay separate.
  const out = narrateDiagram(diagram('  A{"A?"} -->|yes| Z["Go"]\n  B{"B?"} -->|yes| Z', 'flowchart TD'));
  assert.ok(!out.includes('both'), out);
  assert.ok(out.includes('on yes, leads to Go'), out);
});

test('narrateDiagram: the GIST is a LEAN shape line — never re-naming a node the walk already speaks', () => {
  // A clean small diamond → the shape gestalt only, no "splits/rejoins at X" (the walk says the merge).
  const diamond = narrateDiagram(diagram('  S["Req"] --> A["Validate"]\n  S --> B["Auth"]\n  A --> M["Process"]\n  B --> M\n  M --> E["Respond"]', 'flowchart TD'));
  assert.ok(diamond.includes('A diamond.'), diamond);
  assert.ok(!/rejoins at|splits|Process is shared/.test(diamond), diamond); // no node re-naming / pre-echo
  // A pure linear chain → silent (the walk enumerates it).
  const chain = narrateDiagram(diagram('  A1 --> A2 --> A3 --> A4 --> A5 --> A6 --> A7'));
  assert.ok(!/diamond|hops deep|reconverging|with a loop/.test(chain), chain);
  // A lone fan-out (no reconvergence) → silent: the walk's "R fans out to A, B, and C" IS the gist.
  const fan = narrateDiagram(diagram('  R["Root"] --> A\n  R --> B\n  R --> C', 'flowchart TD'));
  assert.ok(!/fan-out|hops deep|diamond/.test(fan), fan);
});

test('narrateDiagram: the GIST adds DEPTH + shape on a wide graph — no fan/endpoint re-statement', () => {
  const wide = narrateDiagram(diagram('  U["Browser"] --> LB["Load Balancer"] --> GW["API Gateway"]\n  GW --> Auth["Auth"]\n  GW --> Ord["Orders"]\n  GW --> Srch["Search"]\n  Auth --> DB[("User DB")]\n  Ord --> DB\n  Srch --> Cache[("Cache")]', 'flowchart LR'));
  assert.ok(wide.includes('Four hops deep, branching and reconverging.'), wide); // depth (the fact the walk omits) + shape gestalt
  assert.ok(!/parallel paths|is shared|fans out to three/.test(wide), wide); // never restates what the walk says
});

test('narrateDiagram: the GIST flags a loop, spells depth grammatically, and fires on a loop-tail sink', () => {
  // hops>=4 always plural ("hops"); the "one hops deep" agreement bug is structurally impossible.
  const mixed = narrateDiagram(diagram('  O["Order"] -->|validates| V{"In stock?"}\n  V -->|yes| Pay["Charge card"]\n  V -->|no| Back["Backorder"]\n  Pay -->|"on failure"| Back\n  Back -->|restocked| Pay\n  Ship --> Done\n  Pay --> Ship["Ship"]\n  Ship --> Done["Delivered"]', 'flowchart TD'));
  assert.ok(mixed.includes('hops deep') && mixed.includes('with a loop'), mixed);
  assert.ok(!mixed.includes('One hops') && !mixed.includes('hops deep, with'), mixed);
  // terminals computed on the DAG: a graph whose only sink loops back still gets a gist (was silent).
  const loopTail = narrateDiagram(diagram('  A --> B\n  A --> C\n  B --> D\n  C --> D\n  D --> E\n  E --> A', 'flowchart TD'));
  assert.ok(/diamond|reconverging/.test(loopTail) && loopTail.includes('with a loop'), loopTail);
});

test('narrateDiagram: a feedback loop reads its loop-back and ends cleanly (no doubled "?.")', () => {
  // A pure feedback loop has no forward branch after back-edge removal, so it stays overview-free
  // (the walk says it all); the guard here is the loop-back phrasing + no doubled terminal.
  const out = narrateDiagram(diagram('  A["Commit"] --> B["Build"] --> C{"Tests pass?"}\n  C -->|yes| D["Deploy"]\n  C -->|no| B'));
  assert.ok(out.includes('Tests pass?, on no, loops back to Build.'), out);
  assert.ok(out.includes('The flow ends at Deploy.'), out);
  assert.ok(!out.includes('?.'), out); // terminate() keeps a "?"-ending node label from doubling
});

test('narrateDiagram: a NOUN + preposition label is NOT a verb — it reads as the appositive', () => {
  // Regression (trio re-verify): "request to"/"response to"/"part of" are noun+prep, not verbs;
  // reading them as verbs ("Gateway response to Client") is the broken non-sentence the
  // appositive prevents. Only a phrase whose FIRST word is a curated verb reads as a verb.
  for (const label of ['request to', 'response to', 'path to', 'part of', 'access to']) {
    const out = narrateDiagram(diagram(`  A["Source"] -->|"${label}"| B["Target"]`));
    assert.ok(out.includes(`Source, ${label}, leads to Target.`), `${label} → ${out}`);
  }
  // a canonical request/response loop reads grammatically on both the forward and loop-back paths
  const loop = narrateDiagram(diagram('  Client["Client"] -->|"request to"| GW["Gateway"]\n  GW -->|"response to"| Client'));
  assert.ok(loop.includes('Client, request to, leads to Gateway.'), loop);
  assert.ok(loop.includes('Gateway, response to, loops back to Client.'), loop);
  // a genuine verb + preposition still reads as a verb (the gate costs nothing)
  assert.ok(narrateDiagram(diagram('  A["API"] -->|"reads from"| B["DB"]')).includes('API reads from DB.'));
});

test('narrateDiagram: a terminal or loop target whose label ends in "?" never doubles its punctuation', () => {
  const term = narrateDiagram(diagram('  A["Start"] --> B["Resolved?"]'));
  assert.ok(term.includes('The flow ends at Resolved?'), term);
  assert.ok(!term.includes('Resolved?.'), term);
  const loop = narrateDiagram(diagram('  A["Work"] --> B["Ready?"]\n  B --> A'));
  assert.ok(loop.includes('Ready? loops back to Work.'), loop);
  assert.ok(!loop.includes('Ready?.'), loop);
});

test('narrateDiagram: the GIST flags a loop when the graph also branches and cycles', () => {
  // branch (In stock?) + a real cycle (Pay ⇄ Backorder) → the gist flags the loop with a bare
  // "with a loop" (the walk names the target; the gist just orients that one exists).
  const out = narrateDiagram(diagram('  O["Order"] -->|validates| V{"In stock?"}\n  V -->|yes| P["Pay"]\n  V -->|no| Bk["Backorder"]\n  P -->|"on failure"| Bk\n  Bk -->|restocked| P\n  P --> Sh["Ship"]', 'flowchart TD'));
  assert.ok(out.includes('with a loop'), out);
});

// ── narrateSequence (Mermaid sequenceDiagram — first-wave slice #1) ────────────
const seqSlide = (body) => `<!-- _class: diagram -->\n\n## Auth handshake.\n\n\`\`\`mermaid\n${body}\n\`\`\``;

test('narrateSequence: reads participants (display label), messages in order, notes, and a single-level block', () => {
  const out = narrateChart(seqSlide('sequenceDiagram\n  participant A as Alice\n  participant B as Bob\n  A->>+B: Request auth token\n  Note right of B: Validates credentials\n  B-->>-A: Return signed token\n  alt Token expired\n    A->>B: Refresh token\n  end'));
  assert.ok(out.includes('A three-message sequence diagram.'), out); // §14 count frame (3 messages, not the note)
  assert.ok(out.includes('Alice sends to Bob: Request auth token.'), out); // display label, not id; activation "+" stripped
  assert.ok(out.includes('Note: Validates credentials.'), out);
  assert.ok(out.includes('Bob sends to Alice: Return signed token.'), out); // direction reversal read plainly — never "returns/back to"
  // A first `alt` opens with "If ‹cond›:" — NOT "Alternatively" (which would falsely imply a prior option).
  assert.ok(out.includes('If Token expired: Alice sends to Bob: Refresh token.'), out);
});

// ── §14 reading model (the faithful architect-grade lift; multi-pass trio) ─────

test('narrateSequence: §14 count frame — opens with the message count, the one faithful orientation', () => {
  const one = narrateChart(seqSlide('sequenceDiagram\n  A->>B: hi'));
  assert.ok(one.includes('A one-message sequence diagram.'), one);
  const four = narrateChart(seqSlide('sequenceDiagram\n  A->>B: 1\n  B->>C: 2\n  C->>A: 3\n  A->>B: 4'));
  assert.ok(four.includes('A four-message sequence diagram.'), four);
  // "An" before a vowel-sound count word (a read-aloud spoken-grammar fix, checker finding).
  const eight = narrateChart(seqSlide('sequenceDiagram\n' + Array.from({ length: 8 }, (_, i) => `  ${i % 2 ? 'B' : 'A'}->>${i % 2 ? 'A' : 'B'}: m${i}`).join('\n')));
  assert.ok(eight.includes('An eight-message sequence diagram.'), eight);
});

test('narrateSequence: §14 same-sender coalescing de-repeats "X sends to Y" but keeps every label', () => {
  const out = narrateChart(seqSlide('sequenceDiagram\n  App->>SDK: score\n  App->>SDK: refine\n  App->>SDK: commit'));
  assert.ok(out.includes('App sends to SDK: score; then refine; then commit.'), out);
  assert.ok(!/App sends to SDK: refine/.test(out), out); // the repeated scaffolding is gone
});

test('narrateSequence: §14 fan-out coalescing names EVERY receiver and label (lossless)', () => {
  const out = narrateChart(seqSlide('sequenceDiagram\n  GW->>Auth: verify\n  GW->>Orders: create\n  GW->>Pay: charge'));
  assert.ok(out.includes('From GW: to Auth, verify; to Orders, create; to Pay, charge.'), out);
});

test('narrateSequence: §14 a self-message reads as internal work, not a send-to-self', () => {
  const out = narrateChart(seqSlide('sequenceDiagram\n  App->>SDK: score\n  SDK->>SDK: compute totals\n  SDK-->>App: result'));
  assert.ok(out.includes('SDK, to itself: compute totals.'), out);
  assert.ok(!/SDK sends to SDK/.test(out), out);
});

test('narrateSequence: §14 coalescing NEVER crosses a block or note boundary (a red-team guard)', () => {
  // A conditional message inside a same-pair run must NOT be swept into an unconditional coalesced run.
  const alt = narrateChart(seqSlide('sequenceDiagram\n  App->>SDK: score\n  alt ok\n    App->>SDK: commit\n  end\n  App->>SDK: refine'));
  assert.ok(alt.includes('App sends to SDK: score.'), alt); // run flushed at the block
  assert.ok(alt.includes('If ok: App sends to SDK: commit.'), alt); // commit stays conditional
  assert.ok(!/score; then commit/.test(alt), alt); // the alt was NOT coalesced away
  const note = narrateChart(seqSlide('sequenceDiagram\n  App->>SDK: score\n  note over App,SDK: retry\n  App->>SDK: refine'));
  assert.ok(!/score; then refine/.test(note), note); // the note breaks the run
});

test('narrateSequence: §14 faithfulness — NO round-trip "returns/back to", NO shape gist', () => {
  // A B→A message after A→B is NOT necessarily a reply (only the banned glyph would say so); it reads
  // plainly as its own message. And no relay/hub/request-response/polling shape is ever asserted.
  // Neutral heading (the shared helper's "Auth handshake" would be authored content, not invented).
  const slide = '<!-- _class: diagram -->\n\n## The flow.\n\n```mermaid\nsequenceDiagram\n  Client->>Server: login\n  Server->>Client: promo banner\n```';
  const out = narrateChart(slide);
  assert.ok(out.includes('Server sends to Client: promo banner.'), out);
  assert.ok(!/back to|returns|responds|replies|request-response|orchestrat|polling|relay|handshake/i.test(out), out);
});

test('narrateSequence: every arrow glyph reads as the neutral "sends to" — never voices sync/async/reply', () => {
  const out = narrateChart(seqSlide('sequenceDiagram\n  Client-)Server: fire and forget\n  Server--xClient: dropped\n  A-->>B: reply'));
  assert.ok(out.includes('Client sends to Server: fire and forget.'), out); // async `-)` → neutral
  assert.ok(out.includes('Server sends to Client: dropped.'), out); // lost `--x` → neutral
  assert.ok(out.includes('A sends to B: reply.'), out); // dashed reply `-->>` → neutral, never "returns"
  assert.ok(!/asynchronous|synchronous|returns|replies with/i.test(out), out); // no fabricated glyph semantics
});

test('narrateSequence: an id used without a participant declaration reads as its own name', () => {
  const out = narrateChart(seqSlide('sequenceDiagram\n  App->>SDK: score(signal)\n  SDK-->>App: a score'));
  assert.ok(out.includes('App sends to SDK: score(signal).'), out);
  assert.ok(out.includes('SDK sends to App: a score.'), out);
});

test('narrateSequence: past the cap it reads the prefix, the remainder count, AND the final message (§14 truncation-proof)', () => {
  // 14 messages (cap 12): the first 12 (coalesced), then the remainder count, then the FINAL message —
  // the terminal outcome is never truncated into silence (an architect-quality trio finding).
  const out = narrateChart(seqSlide('sequenceDiagram\n  participant A as Alice\n  participant B as Bob\n' + Array.from({ length: 14 }, (_, i) => `  A->>B: message ${i + 1}`).join('\n')));
  assert.ok(out.includes('Alice sends to Bob: message 1;'), out); // coalesced prefix opens with the first
  assert.ok(out.includes('then message 12.'), out); // through the cap
  assert.ok(!/message 13\b/.test(out), out); // the hidden middle (13) is folded into the count
  assert.ok(out.includes('And one more message, ending: Alice sends to Bob: message 14.'), out); // final IS spoken
});

test('narrateSequence: exactly the cap reads in full, coalesced (the boundary is > not ≥)', () => {
  const out = narrateChart(seqSlide('sequenceDiagram\n' + Array.from({ length: 12 }, (_, i) => `  A->>B: m${i + 1}`).join('\n')));
  assert.ok(out.includes('then m12.'), out); // 12 ≤ cap → full read (coalesced same-pair run)
  assert.ok(!/more message/.test(out), out); // no tail at exactly the cap
});

// ── Regression: adversarial-trio findings on slice #1 (design 2026-07-14 §13) ──

test('narrateSequence: an arrow glyph INSIDE the message text never corrupts src/tgt or leaks a raw glyph (red-team WORST)', () => {
  // `parseSeqMessage` isolates the signature at the FIRST colon before matching an arrow, so an
  // arrow-like token in the label can't split the wrong place or get spoken as "sends to".
  const out = narrateChart(seqSlide('sequenceDiagram\n  A->>B: prefer -->> over ->'));
  assert.ok(out.includes('A sends to B: prefer -->> over ->.'), out); // right participants, glyphs stay text
  assert.ok(!/sends to over/.test(out), out); // NOT split inside the text
  // A trailing arrow glyph in the text must not spurious-bail the whole diagram.
  const trailing = narrateChart(seqSlide('sequenceDiagram\n  A->>B: see -->>'));
  assert.ok(trailing?.includes('A sends to B: see -->>.'), trailing);
  // A colon inside the label (e.g. a ratio) splits only at the FIRST colon.
  const ratio = narrateChart(seqSlide('sequenceDiagram\n  A->>B: ratio a:b'));
  assert.ok(ratio.includes('A sends to B: ratio a:b.'), ratio);
});

test('narrateSequence: a `%%{init}%%` directive or `%%` comment before the type token still narrates (red-team secondary)', () => {
  const init = narrateChart(seqSlide("%%{init: {'theme':'forest'}}%%\nsequenceDiagram\n  A->>B: hi"));
  assert.ok(init?.includes('A sends to B: hi.'), init); // dispatcher recognizes → narrator must too
  const comment = narrateChart(seqSlide('%% a lead comment\nsequenceDiagram\n  A->>B: hi'));
  assert.ok(comment?.includes('A sends to B: hi.'), comment);
});

test('narrateSequence: a message after a closed block reads with an "Afterwards:" resume cue, not inside the block (Munger WORST)', () => {
  const out = narrateChart(seqSlide('sequenceDiagram\n  loop every 5s\n    A->>B: ping\n  end\n  A->>B: disconnect'));
  assert.ok(out.includes('Repeatedly, every 5s: A sends to B: ping.'), out);
  assert.ok(out.includes('Afterwards: A sends to B: disconnect.'), out); // NOT swept inside the loop
  // A block that closes at the very end emits NO trailing cue (nothing follows).
  const trailing = narrateChart(seqSlide('sequenceDiagram\n  A->>B: hi\n  loop retry\n    A->>B: ping\n  end'));
  assert.ok(!/Afterwards/.test(trailing), trailing);
});

test('narrateSequence: BAILS to null on a nested block, a multiline note, or an unrecognized line', () => {
  const nested = narrateChart(seqSlide('sequenceDiagram\n  A->>B: x\n  alt outer\n    opt inner\n      A->>B: y\n    end\n  end'));
  assert.equal(nested, null, 'nested block');
  const multiNote = narrateChart(seqSlide('sequenceDiagram\n  A->>B: x\n  note over A\n    a long note\n  end note'));
  assert.equal(multiNote, null, 'multiline note');
  const gibberish = narrateChart(seqSlide('sequenceDiagram\n  A->>B: x\n  this is not a message'));
  assert.equal(gibberish, null, 'unrecognized line');
});

test('narrateSequence: reads the in-fence title and speaks a bare (text-less) message as just the link', () => {
  const out = narrateChart(seqSlide('---\ntitle: Checkout flow\n---\nsequenceDiagram\n  A->>B: place order\n  B->>A'));
  assert.ok(out.includes('A two-message sequence diagram, Checkout flow.'), out); // §14 count frame + authored title
  assert.ok(out.includes('B sends to A.'), out); // no colon text → just the link, nothing invented
});

// ── Slice #2 — pie · classDiagram · stateDiagram · erDiagram · C4 (design 2026-07-14 §8) ──
// A `diagram` slide's Mermaid fence routed through the type dispatcher. Typed-relationship diagrams
// speak the Mermaid-DEFINED symbol as a faithful verb (§2, the authored-verb asymmetry) — the
// opposite of the flowchart's neutral arrow. Each narrator self-bails on constructs a flat reading
// would misstate.
const mdiag = (body) => `<!-- _class: diagram -->\n\n## Diagram.\n\n\`\`\`mermaid\n${body}\n\`\`\``;

// pie — read the DERIVED % the way Mermaid derives it (§3.5).
test('narratePie: reads each slice with its derived percent; showData adds the raw value', () => {
  const out = narrateChart(mdiag('pie title Budget\n  "Marketing" : 40\n  "Sales" : 35\n  "R and D" : 25'));
  assert.ok(out.includes('A pie chart, Budget.'), out);
  assert.ok(out.includes('Marketing, forty percent.'), out);
  assert.ok(out.includes('Sales, thirty-five percent.'), out);
  const sd = narrateChart(mdiag('pie showData\n  "Calcium" : 30\n  "Iron" : 10'));
  assert.ok(sd.includes('Calcium, thirty, seventy-five percent.'), sd); // raw value + derived %
});
test('narratePie: bails on fewer than two slices, a non-positive sum, or an unrecognized row', () => {
  assert.equal(narrateChart(mdiag('pie\n  "Only" : 5')), null);
  assert.equal(narrateChart(mdiag('pie\n  "A" : 0\n  "B" : 0')), null);
  assert.equal(narrateChart(mdiag('pie\n  "A" : 5\n  not a row')), null);
});

// classDiagram — the defined-symbol→verb table; DIRECTION honored on both the base and reversed forms.
test('narrateClass: speaks the DEFINED relationship verb with correct direction (both arrow sides)', () => {
  const out = narrateChart(mdiag('classDiagram\n  Animal <|-- Dog\n  Car *-- Engine\n  Team o-- Player\n  Order ..> Logger\n  Bird ..|> Flyer'));
  assert.ok(out.includes('Dog inherits from Animal.'), out); // <|-- : the RIGHT id is the child
  assert.ok(out.includes('Car is composed of Engine.'), out);
  assert.ok(out.includes('Team aggregates Player.'), out);
  assert.ok(out.includes('Order depends on Logger.'), out);
  assert.ok(out.includes('Bird realizes Flyer.'), out);
  // reversed forms read the SAME meaning
  const rev = narrateChart(mdiag('classDiagram\n  Dog --|> Animal\n  Engine --* Car'));
  assert.ok(rev.includes('Dog inherits from Animal.') && rev.includes('Car is composed of Engine.'), rev);
});
test('narrateClass: an association LABEL overrides the verb; multiplicity trails as "one to many"', () => {
  const out = narrateChart(mdiag('classDiagram\n  Customer "1" --> "*" Order : places'));
  assert.ok(out.includes('Customer places Order, one to many.'), out);
});
test('narrateClass: reads members, and bails on a namespace (composite) or unrecognized line', () => {
  const mem = narrateChart(mdiag('classDiagram\n  class Animal {\n    +int age\n    +makeSound()\n  }\n  Animal <|-- Dog'));
  assert.ok(mem.includes('Animal has int age and makeSound.'), mem);
  assert.equal(narrateChart(mdiag('classDiagram\n  namespace Net {\n    class Socket\n  }')), null);
  assert.equal(narrateChart(mdiag('classDiagram\n  Animal <|-- Dog\n  this is not valid')), null);
});

// stateDiagram — [*] start/end by position; event labels; bail composite/concurrency/fork-join.
test('narrateState: reads start/end by [*] position and event labels', () => {
  const out = narrateChart(mdiag('stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running : start\n  Running --> Idle : stop\n  Running --> [*]'));
  assert.ok(out.includes('It starts at Idle.'), out);
  assert.ok(out.includes('From Idle, on start, goes to Running.'), out);
  assert.ok(out.includes('Running can end.'), out);
});
test('narrateState: resolves a "desc" as id label, and bails on composite/concurrency/fork', () => {
  assert.ok(narrateChart(mdiag('stateDiagram-v2\n  state "Waiting for input" as w\n  [*] --> w\n  w --> [*]')).includes('It starts at Waiting for input.'));
  assert.equal(narrateChart(mdiag('stateDiagram-v2\n  state Active {\n    [*] --> Sub\n  }')), null);
  assert.equal(narrateChart(mdiag('stateDiagram-v2\n  [*] --> A\n  --\n  [*] --> B')), null);
  assert.equal(narrateChart(mdiag('stateDiagram-v2\n  state fork_state <<fork>>\n  [*] --> fork_state')), null);
});

// erDiagram — read BOTH crow's-foot counts literally (never gamble a direction).
test('narrateEr: reads both cardinality counts literally with the label as the verb', () => {
  const out = narrateChart(mdiag('erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE-ITEM : contains'));
  assert.ok(out.includes('One CUSTOMER places zero or more ORDER.'), out);
  assert.ok(out.includes('One ORDER contains one or more LINE-ITEM.'), out);
});
test('narrateEr: reads attributes with key roles; bails on a malformed crow\'s-foot', () => {
  const out = narrateChart(mdiag('erDiagram\n  CUSTOMER {\n    string name\n    string email PK\n  }\n  CUSTOMER ||--o{ ORDER : places'));
  assert.ok(out.includes('CUSTOMER has attributes name and email as the primary key.'), out);
  assert.equal(narrateChart(mdiag('erDiagram\n  A ||xx B : bad')), null);
});

// C4 — typed nodes + Rel direction (Rel_Back reversal; layout suffix ignored) + boundary containment.
test('narrateC4: reads typed elements, honors Rel_Back, ignores layout suffixes, says external only on _Ext', () => {
  const out = narrateChart(mdiag('C4Context\n  title Banking\n  Person(c, "Customer", "A bank customer.")\n  System(s, "Banking System", "View accounts.")\n  System_Ext(mail, "E-mail System", "Exchange.")\n  Rel(c, s, "Uses")\n  Rel(s, mail, "Sends e-mails", "SMTP")'));
  assert.ok(out.includes('A C4 context diagram, Banking.'), out);
  assert.ok(out.includes('Customer, a person: A bank customer.'), out);
  assert.ok(out.includes('E-mail System, an external system: Exchange.'), out); // "external" only on _Ext
  assert.ok(out.includes('Customer Uses Banking System.'), out);
  assert.ok(out.includes('Banking System Sends e-mails E-mail System, over SMTP.'), out); // tech read
  const back = narrateChart(mdiag('C4Context\n  Person(a,"A")\n  System(b,"B")\n  Rel_Back(a, b, "Notifies")\n  Rel_D(a, b, "Pings")'));
  assert.ok(back.includes('B Notifies A.'), back); // Rel_Back reverses
  assert.ok(back.includes('A Pings B.') && !/_D|down/i.test(back), back); // _D layout ignored, not spoken
});
test('narrateC4: a boundary names its members without asserting a peer relationship (§3.2)', () => {
  const out = narrateChart(mdiag('C4Context\n  System_Boundary(bank, "Bank") {\n    System(a, "Accounts")\n    System(b, "Payments")\n  }\n  Person(c,"Customer")'));
  assert.ok(out.includes('Within the Bank boundary: Accounts, a system. Payments, a system.'), out);
});
test('narrateChart: an unsupported Mermaid type still bails to the heading-only projection', () => {
  assert.equal(narrateChart(mdiag('mindmap\n  root\n    a\n    b')), null);
  assert.equal(narrateChart(mdiag('gantt\n  title X\n  section S\n  Task :a1, 2024-01-01, 30d')), null);
});

// ── Slice #2 regression — adversarial-check findings folded (design §8) ──────
test('narratePie: a NEGATIVE slice value bails, but a ZERO slice renders (Mermaid throws only on < 0)', () => {
  assert.equal(narrateChart(mdiag('pie\n  "A" : -10\n  "B" : 30')), null);
  // Zero renders in Mermaid (empty slice) — the old `<= 0` guard wrongly dropped the whole pie (§17).
  const zero = narrateChart(mdiag('pie\n  "A" : 0\n  "B" : 30'));
  assert.ok(zero.includes('A, zero percent.'), zero);
  assert.ok(zero.includes('B, one hundred percent.'), zero);
});
test('narrateState: the `id : description` label form narrates by display label, like `state "…" as id`', () => {
  const out = narrateChart(mdiag('stateDiagram-v2\n  Still : The device is still\n  [*] --> Still\n  Still --> [*]'));
  assert.ok(out.includes('It starts at The device is still.'), out);
  assert.ok(!/\bStill\b/.test(out), out); // the raw id is never spoken
});
test('narrateEr: comma-separated composite keys (PK, FK) narrate, not bail; a quoted label loses its quotes', () => {
  const out = narrateChart(mdiag('erDiagram\n  ORDER {\n    int id PK, FK\n  }\n  ORDER ||--|| CUSTOMER : belongs to'));
  assert.ok(out.includes('ORDER has attribute id as the primary key.'), out);
  assert.ok(narrateChart(mdiag('erDiagram\n  A ||--|| B : "makes payment"')).includes('A makes payment one B'));
});
test('narrateC4: a nested boundary does not leak a sibling element to the top level (boundary stack)', () => {
  const out = narrateChart(mdiag('C4Context\n  System_Boundary(bank, "Bank") {\n    Container(web, "Web App", "React", "the app")\n    Container_Boundary(be, "Backend") {\n      Container(api, "API", "Java", "the api")\n    }\n    Container(wrk, "Worker", "Go", "jobs")\n  }'));
  // Worker is authored inside Bank — it must read within the Bank boundary, not as a top-level element.
  assert.ok(/Within the Bank boundary:[\s\S]*Web App[\s\S]*Worker/.test(out), out);
  assert.ok(out.includes('Within the Backend boundary: API'), out);
});
test('narrateC4: a Rel to a boundary resolves the boundary label; a label-less Rel bails (Mermaid requires a label)', () => {
  const toB = narrateChart(mdiag('C4Context\n  Person(u,"User")\n  System_Boundary(bank,"Bank") {\n    System(s,"Sys")\n  }\n  Rel(u, bank, "uses")'));
  assert.ok(toB.includes('User uses Bank.'), toB); // display label, not the raw alias "bank"
  // A labelless `Rel(a, b)` parse-errors in Mermaid — narrating it would speak a phantom edge (§17).
  assert.equal(narrateChart(mdiag('C4Context\n  Person(a,"A")\n  System(b,"B")\n  Rel(a,b)')), null);
});
test('narrateClass: a standalone `<<interface>> Name` annotation narrates (not bail); a generic name loses its tildes', () => {
  assert.ok(narrateChart(mdiag('classDiagram\n  <<interface>> Shape\n  Shape <|.. Circle')).includes('Circle realizes Shape.'));
  assert.ok(narrateChart(mdiag('classDiagram\n  class Box~T~\n  Box~T~ <|-- IntBox')).includes('IntBox inherits from Box.'));
});
test('narrateState: a transition whose source id equals a keyword (`end`) is not dropped', () => {
  const out = narrateChart(mdiag('stateDiagram-v2\n  Start --> end\n  end --> Done'));
  assert.ok(out.includes('From Start, goes to end.') && out.includes('From end, goes to Done.'), out);
});

// ── first-wave family hardening (retro-trio; design §17) ─────────────────────
// Every case below was checked against the REAL Mermaid v11 parser: a narrated input renders, a
// bailed input parse-errors. The shared root cause was a too-narrow ignorable-statement skip-list.
test('skipMermaidMeta: accTitle/accDescr/accDescr{}/direction never bail or fabricate across types', () => {
  // class: accTitle used to be ingested as a phantom class named "accTitle" (fabrication).
  const cls = narrateChart(mdiag('classDiagram\n  accTitle: My Title\n  accDescr: A desc\n  Animal <|-- Dog'));
  assert.ok(cls.includes('Dog inherits from Animal.') && !/accTitle|accDescr/.test(cls), cls);
  // state: an accDescr { … } block used to trip the composite-brace bail.
  const st = narrateChart(mdiag('stateDiagram-v2\n  accDescr {\n    multi line\n  }\n  [*] --> A\n  A --> [*]'));
  assert.ok(st.includes('It starts at A.'), st);
  // ER + C4 + pie: accessibility statements are skipped, the diagram still narrates.
  assert.ok(narrateChart(mdiag('erDiagram\n  accTitle: X\n  A ||--o{ B : has')).includes('A has zero or more B'));
  assert.ok(narrateChart(mdiag('C4Context\n  accDescr: X\n  Person(a,"A")\n  System(b,"B")\n  Rel(a,b,"uses")')).includes('A uses B.'));
  assert.ok(narrateChart(mdiag('pie\n  accTitle: X\n  "A" : 40\n  "B" : 60')).includes('B, sixty percent.'));
  // direction is ignorable everywhere it appears.
  assert.ok(narrateChart(mdiag('erDiagram\n  direction LR\n  A ||--o{ B : has')).includes('A has zero or more B'));
});
test('narratePie: single-quoted labels, a title line, and duplicate-label first-wins', () => {
  assert.ok(narrateChart(mdiag("pie\n  'Dogs' : 10\n  'Cats' : 30")).includes('Cats, seventy-five percent.'));
  assert.ok(narrateChart(mdiag('pie\n  title Pets\n  "Dogs" : 10\n  "Cats" : 30')).includes('A pie chart, Pets.'));
  // Mermaid keeps the FIRST value for a repeated label and recomputes % over the deduped total.
  const dup = narrateChart(mdiag('pie\n  "Dogs" : 10\n  "Dogs" : 30\n  "Cats" : 60'));
  assert.ok(dup.includes('Dogs, fourteen percent.') && dup.includes('Cats, eighty-six percent.'), dup);
  assert.ok(!/Dogs, thirty percent/.test(dup), dup); // the second Dogs is dropped, not spoken
});
test('narratePie: a leading-zero value bails (Mermaid parse-errors on `05`)', () => {
  assert.equal(narrateChart(mdiag('pie\n  "Dogs" : 05\n  "Cats" : 20')), null);
});
test('narrateEr: a labelless relationship bails (Mermaid has no labelless production)', () => {
  assert.equal(narrateChart(mdiag('erDiagram\n  CUSTOMER ||--o{ ORDER')), null);
  assert.ok(narrateChart(mdiag('erDiagram\n  CUSTOMER ||--o{ ORDER : places')).includes('CUSTOMER places zero or more ORDER'));
});
test('narrateEr: word-form cardinality narrates the same counts as the crow’s-foot glyphs', () => {
  const out = narrateChart(mdiag('erDiagram\n  CUSTOMER one to many ORDER : places'));
  assert.ok(out.includes('One CUSTOMER places zero or more ORDER.'), out);
});
test('narrateEr: space-separated key tags (`PK FK`) bail; a display-name alias + non-ASCII narrate', () => {
  assert.equal(narrateChart(mdiag('erDiagram\n  CUSTOMER {\n    int id PK FK\n  }')), null); // Mermaid requires commas
  const alias = narrateChart(mdiag('erDiagram\n  CUSTOMER["Customer Account"]\n  CUSTOMER ||--o{ ORDER : places'));
  assert.ok(alias.includes('Customer Account places zero or more ORDER'), alias);
  assert.ok(narrateChart(mdiag('erDiagram\n  CAFÉ ||--o{ ORDÖR : serves')).includes('CAFÉ serves zero or more ORDÖR'));
});
test('narrateEr: a huge attribute list summarizes with the count, not a wall', () => {
  const attrs = Array.from({ length: 14 }, (_, i) => `    int a${i}`).join('\n');
  const out = narrateChart(mdiag(`erDiagram\n  E {\n${attrs}\n  }`));
  assert.ok(out.includes('fourteen attributes, including a0, a1, and a2.'), out);
});
test('narrateC4: `$tags`/`$link` named args are not spoken; Node_L/Node_R narrate; nested boundaries nest', () => {
  const tags = narrateChart(mdiag('C4Context\n  Person(a, "A", "a person", $tags="v1")\n  System(b,"B")\n  Rel(a,b,"uses")'));
  assert.ok(tags.includes('A, a person: a person.') && !/tags|v1/.test(tags), tags);
  assert.ok(narrateChart(mdiag('C4Deployment\n  Node_L(n,"Server") {\n    Container(c,"App","Go")\n  }')).includes('Within the Server boundary:'));
  const nest = narrateChart(mdiag('C4Context\n  System_Boundary(o,"Outer") {\n    Container_Boundary(i,"Inner") {\n      Component(c,"C")\n    }\n  }'));
  assert.ok(/Within the Outer boundary: Within the Inner boundary: C/.test(nest), nest);
});
test('narrateClass: classDef/title narrate (no over-bail); a typed-relationship label reads as "labeled"', () => {
  assert.ok(narrateChart(mdiag('classDiagram\n  classDef important fill:red\n  Animal <|-- Dog')).includes('Dog inherits from Animal.'));
  assert.ok(narrateChart(mdiag('classDiagram\n  title My Diagram\n  Animal <|-- Dog')).includes('A class diagram, My Diagram.'));
  assert.ok(narrateChart(mdiag('classDiagram\n  Car *-- Engine : has')).includes('Car is composed of Engine, labeled has.'));
});
test('narrateState: hide/note-block narrate; a `[guard]` reads as "when", not an event', () => {
  assert.ok(narrateChart(mdiag('stateDiagram-v2\n  hide empty description\n  [*] --> A\n  A --> [*]')).includes('It starts at A.'));
  assert.ok(narrateChart(mdiag('stateDiagram-v2\n  [*] --> A\n  note right of A\n    hi\n  end note\n  A --> [*]')).includes('It starts at A.'));
  assert.ok(narrateChart(mdiag('stateDiagram-v2\n  A --> B : [isValid]')).includes('From A, when isValid, goes to B.'));
});
test('narrateClass/State: a large diagram summarizes past the firehose cap (§5), naming the count', () => {
  const rels = Array.from({ length: 14 }, (_, i) => `  C${i} <|-- D${i}`).join('\n');
  assert.ok(narrateChart(mdiag(`classDiagram\n${rels}`)).includes('with twenty-eight classes and fourteen relationships:'));
  const trs = Array.from({ length: 18 }, (_, i) => `  S${i} --> S${i + 1}`).join('\n');
  assert.ok(narrateChart(mdiag(`stateDiagram-v2\n  [*] --> S0\n${trs}`)).includes('transitions across'));
});
// maker-checker follow-ups (§17): an attribute type that IS a meta keyword must be read as an
// attribute (block handled before the meta/title checks — was fabricating a title + dropping attrs).
test('narrateEr: an attribute whose type token is `title`/`direction` narrates, not a phantom title', () => {
  const out = narrateChart(mdiag('erDiagram\n  E {\n    title heading\n    direction compass\n  }'));
  assert.ok(out.includes('E has attributes heading and compass.'), out);
  assert.ok(!/relationship diagram, heading/.test(out), out); // "heading" is an attr name, not the title
});
test('narrateEr: the `1+` / `0+` / `many(0)` / `many(1)` word-form cardinalities narrate', () => {
  assert.ok(narrateChart(mdiag('erDiagram\n  A 1+ to many B : x')).includes('One or more A x zero or more B.'));
  assert.ok(narrateChart(mdiag('erDiagram\n  A many(1) to 0+ B : x')).includes('One or more A x zero or more B.'));
});
test('narrateC4: a present-but-empty Rel label renders (neutral connective); a 2-arg Rel still bails', () => {
  assert.ok(narrateChart(mdiag('C4Context\n  Person(a,"A")\n  System(b,"B")\n  Rel(a,b,"")')).includes('A is connected to B.'));
  assert.equal(narrateChart(mdiag('C4Context\n  Person(a,"A")\n  System(b,"B")\n  Rel(a,b)')), null);
});
test('narrateC4: a quoted description that merely starts `$x=` (with a space) is kept, not dropped', () => {
  const out = narrateChart(mdiag('C4Context\n  Person(a,"A","$x=5 cost")\n  System(b,"B")\n  Rel(a,b,"uses")'));
  assert.ok(out.includes('A, a person: $x=5 cost.'), out);
});

// ── radar-beta (design 2026-07-14 §8, first-wave fast-follow) ────────────────
// DATA tier: read the scale (min/max or auto-fit niceCeil) then each curve's axis values, pairing
// POSITIONAL values in axis order and KEYED values by axis id. Bail rather than mis-pair.
test('narrateRadarBeta: reads the scale and pairs positional curve values to axes in order', () => {
  const out = narrateChart(mdiag('radar-beta\n  title Grades\n  axis m["Math"], s["Science"], e["English"]\n  curve a["Alice"]{85, 90, 95}\n  curve b["Bob"]{70, 80, 90}\n  max 100'));
  assert.ok(out.includes('A radar chart, Grades, on a scale of zero to one hundred.'), out);
  assert.ok(out.includes('Alice: Math, eighty-five; Science, ninety; English, ninety-five.'), out);
  assert.ok(out.includes('Bob: Math, seventy; Science, eighty; English, ninety.'), out);
});
test('narrateRadarBeta: keyed values pair to the correct axis by id, regardless of key order', () => {
  const out = narrateChart(mdiag('radar-beta\n  axis a["Alpha"], b["Beta"], c["Gamma"]\n  curve x["X"]{ b: 5, a: 10, c: 15 }'));
  // keys given b,a,c but must read in AXIS order Alpha(10), Beta(5), Gamma(15)
  assert.ok(out.includes('X: Alpha, ten; Beta, five; Gamma, fifteen.'), out);
});
test('narrateRadarBeta: the auto scale is the RAW data max (what Mermaid draws), not a rounded ceiling; explicit max wins', () => {
  // {3, 7} with no `max` → Mermaid's outer ring is the raw 7, so the spoken scale is "zero to seven".
  assert.ok(narrateChart(mdiag('radar-beta\n  axis a["A"], b["B"]\n  curve c["C"]{3, 7}')).includes('scale of zero to seven'));
  assert.ok(narrateChart(mdiag('radar-beta\n  axis a["A"], b["B"]\n  curve c["C"]{3, 7}\n  max 10')).includes('scale of zero to ten'));
});
test('narrateRadarBeta: bails on a positional count mismatch, unknown/partial keyed axes, or no axes', () => {
  assert.equal(narrateChart(mdiag('radar-beta\n  axis a["A"], b["B"], c["C"]\n  curve x{1, 2}')), null); // 2 values, 3 axes
  assert.equal(narrateChart(mdiag('radar-beta\n  axis a["A"]\n  curve x{ zzz: 5 }')), null); // unknown axis id
  // a keyed curve that doesn't cover EVERY axis makes Mermaid throw — so bail, don't read a subset.
  assert.equal(narrateChart(mdiag('radar-beta\n  axis a["A"], b["B"], c["C"]\n  curve x{ a: 5, c: 9 }')), null);
  assert.equal(narrateChart(mdiag('radar-beta\n  curve x{1,2,3}')), null); // no axes to pair against
  assert.equal(narrateChart(mdiag('radar-beta\n  axis a["A"]\n  not a radar line')), null); // unrecognized
});

// ── radar-beta regression — the full trio's findings (Munger + independent checker vs v11 source) ──
test('narrateRadarBeta: matches the render on partial input — skips a mismatched curve, ignores an unknown key, first-wins a duplicate', () => {
  // a positional count mismatch makes Mermaid skip JUST that curve and render the rest — so do we
  const sib = narrateChart(mdiag('radar-beta\n  axis a["A"], b["B"], c["C"]\n  curve good["Good"]{1, 2, 3}\n  curve bad{1, 2}'));
  assert.ok(sib.includes('Good: A, one; B, two; C, three.'), sib);
  assert.ok(!/bad/.test(sib), sib);
  // an unknown keyed axis is silently ignored by Mermaid (never an error), not a bail
  const unk = narrateChart(mdiag('radar-beta\n  axis a["A"], b["B"]\n  curve c["C"]{ a: 1, b: 2, z: 9 }'));
  assert.ok(unk.includes('C: A, one; B, two.') && !/nine/.test(unk), unk);
  // a duplicate key is first-wins (Mermaid `find`)
  assert.ok(narrateChart(mdiag('radar-beta\n  axis a["A"]\n  curve c["C"]{ a: 10, a: 20 }')).includes('C: A, ten.'));
});
test('narrateRadarBeta: bails to match a chart that does NOT render — duplicate axis, negative value, or the wrong keyword', () => {
  assert.equal(narrateChart(mdiag('radar-beta\n  axis a["First"], a["Second"], b["B"]\n  curve x{10, 20, 30}')), null); // dup axis id
  assert.equal(narrateChart(mdiag('radar-beta\n  axis a["A"], b["B"]\n  curve c{-1, 2}')), null); // Mermaid NUMBER is non-negative
  assert.equal(narrateChart(mdiag('radar\n  axis a, b\n  curve c{1, 2}')), null); // bare `radar` doesn't render
  assert.equal(narrateChart(mdiag('Radar-Beta\n  axis a, b\n  curve c{1, 2}')), null); // case-sensitive keyword
});
test('narrateRadarBeta: an accessibility statement (accTitle/accDescr) does not bail the chart', () => {
  const out = narrateChart(mdiag('radar-beta\n  accTitle: Skill radar\n  accDescr: a chart of skills\n  axis a["A"], b["B"]\n  curve c["C"]{3, 7}'));
  assert.ok(out.includes('C: A, three; B, seven.'), out);
});
test('narrateRadarBeta: a large radar SUMMARIZES (count + each curve\'s peak), never a value wall (§5 firehose)', () => {
  const out = narrateChart(mdiag('radar-beta\n  axis a["Speed"], b["Cost"], c["Quality"], d["Support"], e["Security"]\n  curve alpha["Alpha"]{85, 40, 90, 70, 60}\n  curve beta["Beta"]{60, 80, 70, 55, 95}\n  curve gamma["Gamma"]{50, 50, 50, 50, 50}'));
  assert.ok(out.includes('with three curves across five axes.'), out); // the count names itself — no silent truncation
  assert.ok(out.includes('Alpha peaks on Quality, at ninety.'), out); // each curve's peak (top-N=1)
  assert.ok(out.includes('Beta peaks on Security, at ninety-five.'), out);
  assert.ok(!/Alpha: Speed/.test(out), out); // NOT the enumerated wall
});

// ── xychart-beta (design 2026-07-15 §18, tier-2 slice) ───────────────────────
// DATA tier: name the chart by its series, state an authored axis range, read each series' values
// paired to the x category (or "point N" for a numeric x-range); summarize by SHAPE past the cap.
// Every narrate-vs-bail below was matched to the real Mermaid v11 parser.
test('narrateXychart: names the chart by its series and pairs each value to its x category', () => {
  const bar = narrateChart(mdiag('xychart-beta\n  x-axis [jan, feb, mar]\n  bar [5, 6, 7]'));
  assert.ok(bar.includes('A bar chart.'), bar);
  assert.ok(bar.includes('The bar series: jan, five; feb, six; mar, seven.'), bar);
  const both = narrateChart(mdiag('xychart-beta\n  x-axis [a, b]\n  bar [1, 2]\n  line [2, 1]'));
  assert.ok(both.includes('A bar and line chart.'), both);
  assert.ok(narrateChart(mdiag('xychart\n  x-axis [a, b]\n  bar [1, 2]')).includes('A bar chart.')); // bare `xychart` renders too
});
test('narrateXychart: states an AUTHORED axis range with orientation-neutral role names', () => {
  const out = narrateChart(mdiag('xychart-beta horizontal\n  title "Sales"\n  x-axis "Month" [jan, feb]\n  y-axis "Revenue" 0 --> 100\n  bar [40, 60]'));
  assert.ok(out.includes('A bar chart, Sales.'), out);
  assert.ok(out.includes('The x-axis is Month.'), out);
  assert.ok(out.includes('The y-axis, Revenue, runs zero to one hundred.'), out);
  assert.ok(!/horizontal|vertical/.test(out), out); // orientation is visual — never spoken (it would flip)
});
test('narrateXychart: a numeric x-range anchors each value with "point N" (never a bare list)', () => {
  const out = narrateChart(mdiag('xychart-beta\n  x-axis "Score" 0 --> 10\n  line [3, 7, 5]'));
  assert.ok(out.includes('The x-axis, Score, runs zero to ten.'), out);
  assert.ok(out.includes('The line series: point one, three; point two, seven; point three, five.'), out);
});
test('narrateXychart: an authored series title NAMES the series', () => {
  const out = narrateChart(mdiag('xychart-beta\n  x-axis [q1, q2]\n  bar "Revenue" [10, 20]\n  line "Target" [15, 15]'));
  assert.ok(out.includes('The Revenue series: q1, ten; q2, twenty.'), out);
  assert.ok(out.includes('The Target series: q1, fifteen; q2, fifteen.'), out);
});
test('narrateXychart: a quoted x category containing a comma stays ONE category (quote-aware split)', () => {
  const out = narrateChart(mdiag('xychart-beta\n  x-axis ["Q1, 2024", "Q2, 2024"]\n  bar [10, 20]'));
  assert.ok(out.includes('The bar series: Q1, 2024, ten; Q2, 2024, twenty.'), out); // value 10 → "Q1, 2024", not split
});
test('narrateXychart: past the per-series cap, summarizes by SHAPE — endpoints, high, low with positions', () => {
  // a series that crashes then recovers: the TROUGH must be spoken, not hidden behind a lone peak.
  const out = narrateChart(mdiag('xychart-beta\n  title "Runway"\n  x-axis [m1,m2,m3,m4,m5,m6,m7,m8,m9,m10,m11,m12,m13]\n  line [100,90,70,40,10,2,5,20,50,80,95,100,100]'));
  assert.ok(out.includes('summarizing thirteen points'), out); // the summary names itself (§7)
  assert.ok(out.includes('a low of two at m6'), out); // the trough — the story a peak-only summary hides
  assert.ok(out.includes('starts at one hundred, ends at one hundred'), out);
});
test('narrateXychart: a flat series reads "is flat at N", not a false "peaks at"', () => {
  const out = narrateChart(mdiag('xychart-beta\n  x-axis [a,b,c,d,e,f,g,h,i,j,k,l,m]\n  bar [5,5,5,5,5,5,5,5,5,5,5,5,5]'));
  assert.ok(out.includes('The bar series is flat at five.'), out);
});
test('narrateXychart: the firehose gate is per-series — several SHORT series still read in full', () => {
  const out = narrateChart(mdiag('xychart-beta\n  x-axis [a,b,c,d,e]\n  bar [1,2,3,4,5]\n  line [5,4,3,2,1]\n  bar [2,2,2,2,2]'));
  assert.ok(out.includes('The first bar series: a, one'), out); // enumerated, not summarized (each is 5 points)
  assert.ok(out.includes('The line series: a, five'), out);
});
test('narrateXychart: bails to match a chart that does NOT render (empty/malformed), tolerates a trailing `;`', () => {
  assert.equal(narrateChart(mdiag('xychart-beta\n  x-axis []\n  bar [1, 2]')), null); // empty [] parse-errors
  assert.equal(narrateChart(mdiag('xychart-beta\n  x-axis [a, b,]\n  bar [1, 2]')), null); // trailing comma parse-errors
  assert.equal(narrateChart(mdiag('xychart-beta\n  x-axis 0 100\n  bar [1, 2]')), null); // bare numbers aren't a title
  assert.equal(narrateChart(mdiag('xychart-beta\n  x-axis a --> b\n  bar [1, 2]')), null); // non-numeric range
  assert.equal(narrateChart(mdiag('xychart-beta\n  x-axis [a, b]')), null); // no series → nothing to narrate
  assert.ok(narrateChart(mdiag('xychart-beta\n  x-axis [a, b];\n  bar [1, 2];')).includes('A bar chart.')); // `;` is a valid eol
});
test('narrateXychart: accessibility statements and comments carry nothing; negatives/decimals read', () => {
  assert.ok(narrateChart(mdiag('xychart-beta\n  accTitle: X\n  %% note\n  x-axis [a, b]\n  bar [1, 2]')).includes('A bar chart.'));
  assert.ok(narrateChart(mdiag('xychart-beta\n  x-axis [a, b]\n  line [-1.5, 2.5]')).includes('negative one point five'));
});

// ── journey mood — 2026-09-20-narration-audit.md Finding 5 ──────────────────────────
//
// `narrateJourneyWeighted` gates on the `weighted` token, so a PLAIN journey — the default,
// and what the shipped sample uses — reached no narrator. What the listener got was the
// rendered SVG walked in DOM order: measured on the real export, "prospect. sales. user.
// onboarding. Pain. 1. 2. 3. 4. 5. Delight." — the legend and the mood axis read as a list,
// with no step attached to any score.
test('narrateJourneyMood: reads each task with its actors and its mood, by section', () => {
  const md = ['<!-- _class: journey -->', '', '## The path.', '', '- Evaluate', '  - Read case study `@prospect` `:5`', '  - Live demo `@prospect` `@sales` `:4`', '- Trial', '  - Signup `@user` `:3`'].join('\n');
  const out = narrateJourneyMood(md);
  assert.ok(out.includes('Evaluate: Read case study, prospect, five out of five;'), out);
  assert.ok(out.includes('Live demo, prospect and sales, four out of five.'), out);
  assert.ok(out.includes('Trial: Signup, user, three out of five.'), out);
  // The mood scale is the point, and a listener has no axis to read a bare number against.
  assert.ok(!/\bfive\.(?! )/.test(out.replace(/out of five/g, '')), 'no bare mood numbers');
});

test('narrateJourneyMood: stands down for the weighted variant, which has its own narrator', () => {
  const md = ['<!-- _class: journey weighted -->', '', '## X.', '', '- Discover', '  - Search `@prospect` `:4` `+45`'].join('\n');
  assert.equal(narrateJourneyMood(md), null);
});

test('narrateJourneyMood: leaves an omitted mood UNSAID rather than reporting the plotted default', () => {
  // journey.docs.md: an omitted `:N` silently defaults to a neutral 3 and still plots.
  // Narrating that default would state an affect the author never claimed.
  const md = ['<!-- _class: journey -->', '', '## X.', '', '- Evaluate', '  - Read case study `@prospect`'].join('\n');
  const out = narrateJourneyMood(md);
  assert.ok(out.includes('Read case study, prospect.'), out);
  assert.ok(!out.includes('out of five'), out);
});

test('narrateJourneyMood: stands down when no task carries a mood or an actor', () => {
  const md = ['<!-- _class: journey -->', '', '## X.', '', '- Evaluate', '  - Read case study', '  - Book demo'].join('\n');
  assert.equal(narrateJourneyMood(md), null);
});

test('narrateJourneyMood: the dispatcher reaches it for a plain journey slide', () => {
  const md = ['<!-- _class: journey -->', '', '## X.', '', '- Evaluate', '  - Read case study `@prospect` `:5`'].join('\n');
  assert.ok(narrateChart(md).includes('five out of five'));
});

// ── Regressions the maker-checker caught before merge ───────────────────────────────
test('narrateStateChart: a `:::tint` suffix does not hide a transition', () => {
  // THE FIXTURE IS THE REAL AUTHORED SYNTAX, and the first version of this test was not —
  // it put the tint INSIDE the backticks, which no deck writes and the transform rejects as a
  // transition. So it passed against a fix that was a no-op on every shipped deck: the whole
  // point of the finding was examples/state-chart-tint.md, which writes the tint AFTER the
  // closing backtick (state-chart.transform.js's `codeOnly` is the authority). Verified against
  // that file's line 56. The tint is LATTICE's own channel, not Mermaid's `:::className`.
  const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft `start`', '   - `submit => 2`:::state-pass-hue', '   - `hold => self`', '2. Done `end`'].join('\n');
  const out = narrateStateChart(md);
  assert.ok(out.includes('submit goes to Done'), out);
  assert.ok(out.includes('hold stays here'), out);
  assert.ok(!out.includes('=>'), `a raw pill survived: ${out}`);
  assert.ok(!out.includes(':::'), `a style hook was spoken: ${out}`);
});

test('narrateStateChart: the two-slot tint form is recognized too', () => {
  // `:::edge-token/label-bg-token` (state-chart.docs.md `tint` row, examples/state-chart-tint.md:95).
  // A `[\\w-]+` token class could not match slot two; the transform's own class allows the slash.
  const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft `start`', '   - `run => 2`:::state-pass-hue/surface-raised', '2. Done `end`'].join('\n');
  const out = narrateStateChart(md);
  assert.ok(out.includes('run goes to Done'), out);
  assert.ok(!out.includes(':::'), out);
});

test('narrateStateChart: an UNRESOLVED transition is still read, not silently dropped', () => {
  // The suppression filter dropped every line matching the pill pattern, but `parseStateChart`
  // records a transition only when its target RESOLVES — so a dangling `typo => 9` was narrated
  // by nobody, while the slide still renders it as "typo => 9 (unresolved)". Narration going
  // quiet about something the audience can see is the failure this pass exists to remove.
  const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft `start`', '   - `submit => 2`', '   - `typo => 9`', '2. Done `end`'].join('\n');
  const out = narrateStateChart(md);
  assert.ok(out.includes('submit goes to Done'), out);
  assert.ok(out.includes('typo => 9'), `the unresolved pill went silent: ${out}`);
});

test('narrateJourneyMood: mirrors the transform’s clampMood, so it cannot state a score the chart does not plot', () => {
  // journey.transform.js clamps to 1..5 with Math.round, parses with parseInt, and ignores a
  // bare `@`. The narrator did none of those: `:99` read "ninety-nine out of five", `:0` read
  // "zero", `:4x` read nothing, and `@` produced an empty actor and a double comma.
  const md = ['<!-- _class: journey -->', '', '## X.', '', '- Stage', '  - High `@prospect` `:99`', '  - Low `@` `:0`', '  - Odd `@user` `:4x`', '  - Half `@user` `:2.5`'].join('\n');
  const out = narrateJourneyMood(md);
  assert.ok(out.includes('High, prospect, five out of five'), out); // 99 clamps to 5
  assert.ok(out.includes('Low, one out of five'), out); // 0 clamps to 1, bare @ dropped
  assert.ok(out.includes('Odd, user, four out of five'), out); // parseInt reads 4 from `4x`
  // `:2.5` reads TWO, not three: the transform runs `parseInt` BEFORE `clampMood`, so the
  // fraction is gone before any rounding happens. Asserted against journey.transform.js
  // itself rather than against what rounding alone would suggest.
  assert.ok(out.includes('Half, user, two out of five'), out);
  assert.ok(!out.includes(', ,'), `an empty actor left a double comma: ${out}`);
});

test('narrateStateChart: a state LABEL loses its tint but the author’s prose keeps it', () => {
  // `:::state-pass-hue` after a state's pills is a style hook, not a name. It sits AFTER the
  // pill's closing backtick, so `stripTrailingPills` never saw a trailing pill and the whole
  // string became the label — "Accepted `done`:::state-pass-hue" reached the voice. That was
  // already true on main in the terminal sentence; it became this branch's to fix when
  // `narrateStateTransitions` started reading the same labels into every "goes to X".
  //
  // Found by rendering examples/state-chart-tint.md through the real CLI and reading the .vtt,
  // not by a unit test — the two checker passes both caught me asserting from a fixture
  // instead of from shipped bytes.
  const md = [
    '<!-- _class: state-chart -->', '', '`Legend`', '', '## F.', '',
    '`:::token` names a theme token, never a color.', '',
    '1. Intake `start`', '   - `triage => 2`',
    '2. Accepted `done`:::state-pass-hue',
    '3. Refused `end`:::state-fail-hue/surface-raised',
  ].join('\n');
  const out = narrateStateChart(md);
  assert.ok(out.includes('triage goes to Accepted.'), `dirty label in a transition: ${out}`);
  assert.ok(out.includes('Accepted done.'), `dirty label in the flatten: ${out}`);
  assert.ok(out.includes('Refused end.'), `two-slot tint survived: ${out}`);
  // The author's own prose ABOUT the syntax is slide text and must survive untouched.
  assert.ok(out.includes(':::token names a theme token'), `ate the author's prose: ${out}`);
  // The eyebrow still leads — the tint strip is a map, so original line indices are preserved.
  assert.ok(out.startsWith('Legend.'), out);
});

// ── narrateDataSeries (the generic floor) ─────────────────────────────────────
// Every fixture below is the component's OWN canonical `sample` from its manifest,
// pasted verbatim — not a fixture built from a model of the grammar. That is the habit
// two checker passes on #2243 flagged twice, and the audit this narrator answers
// (2026-09-20-narration-audit.md) is about narration stating what the slide does not.
// `manifestSample(name)` re-reads the manifest at test time, so a component that
// rewrites its sample fails HERE rather than shipping an unread narration.
const fs = require('node:fs');
const path = require('node:path');
const COMPONENTS = path.join(__dirname, '../../../lib/components');
function manifestSample(name) {
  for (const bucket of fs.readdirSync(COMPONENTS)) {
    const file = path.join(COMPONENTS, bucket, name, `${name}.manifest.json`);
    if (!fs.existsSync(file)) continue;
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    return String(m.sample || m.skeleton || '').trim();
  }
  throw new Error(`no manifest for ${name}`);
}

test('narrateDataSeries: returns null for a component that is not picture-bound data', () => {
  // `list` keeps its substance in HTML, so the speech walker already reads it and a
  // full-replacement narrator here would only take that away.
  assert.equal(narrateDataSeries('<!-- _class: list -->\n\n## Heading\n\n- A `1`\n- B `2`'), null);
  assert.equal(narrateDataSeries('<!-- _class: roadmap -->\n\n## Heading\n\n- A `1`\n- B `2`'), null);
  assert.equal(narrateDataSeries('## No class directive at all\n\n- A `1`\n- B `2`'), null);
});

test('narrateDataSeries: returns null when the roster component carries no data rows', () => {
  assert.equal(narrateDataSeries('<!-- _class: bar -->\n\n## Just a heading.'), null);
  // One row is not a series — the same floor narrateFunnel holds.
  assert.equal(narrateDataSeries('<!-- _class: bar -->\n\n## One.\n\n- North America `$4.2M`'), null);
});

test('narrateDataSeries: reads a flat one-pill series — the audit\'s own bar counter-example', () => {
  const out = narrateDataSeries(manifestSample('bar'));
  // Finding 1 quotes what `bar` said BEFORE: the heading and the eyebrow, then silence.
  assert.match(out, /Revenue · FY26\. Growth is concentrated in two regions\./);
  // All four regions and all four values now reach the voice.
  assert.match(out, /North America, four point two million dollars\./);
  assert.match(out, /EMEA, three point one million dollars\./);
  assert.match(out, /APAC, one point eight million dollars\./);
  // "SIX HUNDRED THOUSAND", not "zero point six million" — the deck authors this row
  // as `$0.6M` and narration now reads the VALUE rather than the spelling, so it says
  // it the way a person would. The same row typed `$600k` reads identically, which is
  // the whole point: the author's choice of unit is not a fact about the number.
  assert.match(out, /LATAM, six hundred thousand dollars\./);
  assert.ok(!out.includes('zero point six million'), out);
});

test('narrateDataSeries: reads a nested two-level series, each value bound to its group', () => {
  const out = narrateDataSeries(manifestSample('line'));
  assert.match(out, /Q1 2025: Enterprise, four point one; Mid-market, two point six; Services, one point two\./);
  assert.match(out, /Q2 2026: Enterprise, three point five; Mid-market, four point six; Services, five point two\./);
});

test('narrateDataSeries: binds each value to its AXIS when the eyebrow is a multi-pill legend', () => {
  const out = narrateDataSeries(manifestSample('scatter'));
  assert.match(out, /Atlas: Annual cost, four hundred twenty thousand dollars; Teams adopting, eighteen percent\./);
  // The axis names now arrive in ONE bracketed span rather than two pills, so the
  // legend test has to expand the list to count them. Without that the line reads
  // as a caption and a listener hears "[Annual cost, Teams adopting]." — brackets
  // spoken aloud, and the values below left unbound. Never say the punctuation.
  assert.doesNotMatch(out, /[[\]]/, out);
  // The legend is NOT also spoken as a sentence — its words arrive bound to their values.
  assert.doesNotMatch(out, /^Annual cost\./);
  assert.doesNotMatch(out, /Annual cost\. Teams adopting\./);
});

test('narrateDataSeries: a ONE-pill eyebrow is a caption, spoken first, never an axis name', () => {
  // The distinction matters: pairing a one-pill caption with a one-pill row would say
  // "North America: Revenue · FY26, four point two million dollars."
  const out = narrateDataSeries(manifestSample('bar'));
  assert.ok(out.startsWith('Revenue · FY26.'), out.slice(0, 60));
  assert.doesNotMatch(out, /North America: Revenue/);
});

test('narrateDataSeries: reads a markdown table as a grid, naming each column', () => {
  const out = narrateDataSeries(manifestSample('heatmap'));
  assert.match(out, /Jan 2026: M0, one hundred; M1, sixty-two; M2, forty-eight; M3, forty-four\./);
  // An EMPTY cell is a fact the slide shows — say so, rather than emit a short row a
  // listener cannot align. heatmap's own sample leaves Apr/M3 blank.
  assert.match(out, /Apr 2026: M0, one hundred; M1, sixty-nine; M2, fifty-seven; M3, no data\./);
});

test('narrateDataSeries: keeps a row-level pill with its row, then its nested values', () => {
  // slope authors a status pill on the GROUP line and two endpoints under it.
  const out = narrateDataSeries(manifestSample('slope'));
  assert.match(out, /Northwind, fail: 2023, thirty-one percent; 2026, twenty-four percent\./);
  assert.match(out, /Vantage: 2023, nineteen percent; 2026, twenty-one percent\./);
});

test('narrateDataSeries: reads two unnamed pills in authored order and claims nothing about them', () => {
  // bullet's pills are a measure and a target, but NOTHING in the Markdown says which is
  // which — so the floor reads them in order. Inventing "sixteen percent below plan"
  // from pill position is the defect class the audit is about; a future narrateBullet
  // can say it properly from the manifest's declared grammar.
  const out = narrateDataSeries(manifestSample('bullet'));
  assert.match(out, /New ARR, four point two million, five million\./);
  // Scoped to the DATA sentences: "cleared the plan line" is the author's own heading,
  // which the narrator speaks faithfully. What must not appear is an invented relation
  // between the two pills.
  const data = out.slice(out.indexOf('New ARR'));
  assert.doesNotMatch(data, /target|plan|below|above|behind|versus|of the/i);
});

test('narrateDataSeries: speaks a per-row detail sublist instead of ingesting it as data', () => {
  const out = narrateDataSeries(manifestSample('scatter'));
  // A pill-less nested line is authored prose. It must not become a phantom data point…
  assert.doesNotMatch(out, /Renewal lands in March,/);
  // …and it must not be dropped either — a full-replacement narrator that loses it
  // reads worse than the flatten it replaced.
  assert.match(out, /Renewal lands in March/);
  assert.match(out, /Two teams asked to drop it/);
});

test('narrateDataSeries: does not read a DEEPER detail line that ends in a number as data', () => {
  // The confidently-wrong-number failure class classifyDepth exists for: a detail line
  // ending in a year would otherwise become a phantom row.
  const md = [
    '<!-- _class: bar -->',
    '',
    '## Growth.',
    '',
    '- North America `4.2`',
    '  - Verified in cycle `2024`',
    '- EMEA `3.1`',
  ].join('\n');
  const out = narrateDataSeries(md);
  assert.match(out, /North America, four point two\./);
  assert.match(out, /EMEA, three point one\./);
  assert.doesNotMatch(out, /Verified in cycle, two thousand twenty-four/);
  assert.match(out, /Verified in cycle/); // still spoken, as leftover prose
});

test('narrateDataSeries: ignores a fenced doc example of its own syntax', () => {
  const md = [
    '<!-- _class: bar -->',
    '',
    '## How to author a bar chart.',
    '',
    '```markdown',
    '- North America `$4.2M`',
    '- EMEA `$3.1M`',
    '```',
  ].join('\n');
  assert.equal(narrateDataSeries(md), null);
});

test('narrateDataSeries: recognizes a roster component combined with a base modifier', () => {
  const md = '<!-- _class: bar dark -->\n\n## Growth.\n\n- A `1`\n- B `2`';
  assert.match(narrateDataSeries(md), /A, one\. B, two\./);
  // …and does NOT match a hyphenated class that merely contains the token.
  assert.equal(narrateDataSeries('<!-- _class: bar-detail -->\n\n## X.\n\n- A `1`\n- B `2`'), null);
});

test('narrateChart: the generic floor is actually WIRED to the dispatcher', () => {
  // Mutation-checked, and it is the reason this test exists: deleting narrateDataSeries from
  // NARRATORS entirely left the whole suite green. `bar` has no hand-written narrator, so it
  // can only be the floor answering — and nothing else in this file notices if it stops.
  const bar = manifestSample('bar');
  assert.equal(narrateChart(bar), narrateDataSeries(bar));
  assert.match(narrateChart(bar), /North America, four point two million dollars\./);
});

test('narrateChart: the generic floor never shadows a hand-written narrator', () => {
  // NARRATORS is first-match-wins and narrateDataSeries is LAST, so a pilot keeps its
  // COMPUTED fact. funnel's conversion % is the tell — the floor computes nothing and could
  // not produce it.
  assert.match(narrateChart(manifestSample('funnel')), /percent of the prior stage/);
  assert.equal(narrateChart(manifestSample('funnel')), narrateFunnel(manifestSample('funnel')));
  assert.equal(narrateChart(manifestSample('quadrant')), narrateQuadrant(manifestSample('quadrant')));
  // radar is deliberately NOT asserted through narrateChart here: the floor's output for the
  // radar sample is byte-identical to the pilot's, so that arm passes even with the floor
  // moved to the FRONT of NARRATORS — it certifies nothing. funnel and quadrant differ, so
  // they are the ones that can detect a reordering.
  assert.notEqual(narrateDataSeries(manifestSample('funnel')), narrateFunnel(manifestSample('funnel')));
  assert.notEqual(narrateDataSeries(manifestSample('quadrant')), narrateQuadrant(manifestSample('quadrant')));
});

test('narrateDataSeries: speaks every row EXACTLY once — nothing consumed is also flattened', () => {
  // The `consumed` set is what keeps `speakLeftover` from reading a line the narrator already
  // spoke. Four separate deletions of a `consumed.add(…)` survived the first version of this
  // suite, each one making the slide say everything twice.
  const once = (text, needle) => text.split(needle).length - 1;
  const bar = narrateDataSeries(manifestSample('bar'));
  assert.equal(once(bar, 'North America'), 1);
  assert.equal(once(bar, 'Revenue · FY26'), 1); // the eyebrow, too
  assert.equal(once(bar, '$4.2M'), 0, 'the raw pill must not survive alongside its spoken form');
  const line = narrateDataSeries(manifestSample('line'));
  assert.equal(once(line, 'Q1 2025'), 1);
  assert.equal(once(line, 'Enterprise'), 6); // once per period, never twice per period
  const heat = narrateDataSeries(manifestSample('heatmap'));
  assert.equal(once(heat, 'Jan 2026'), 1);
  assert.equal(once(heat, '| 100 |'), 0, 'the raw table row must not survive');
});

test('narrateDataSeries: an axis legend binds only when EVERY row matches its pill count', () => {
  // `>=` instead of `===` would bind a two-name legend to a three-pill row and silently
  // mislabel the third value.
  const md = (rows) => `<!-- _class: scatter -->\n\n\`Cost\` \`Reach\`\n\n## H.\n\n${rows}`;
  assert.match(narrateDataSeries(md('- A `1` `2`\n- B `3` `4`')), /A: Cost, one; Reach, two\./);
  // Three pills against two names: the legend cannot bind, so it is spoken as a caption and
  // the values read in order rather than being labeled wrongly.
  const wide = narrateDataSeries(md('- A `1` `2` `3`\n- B `4` `5` `6`'));
  assert.match(wide, /Cost, Reach\./);
  assert.match(wide, /A, one, two, three\./);
  assert.doesNotMatch(wide, /A: Cost/);
});

test('narrateDataSeries: an eyebrow is never deleted, whether or not it is a legend', () => {
  // examples/proposal-charts-expansion.md authors BOTH a caption and an axis legend. Measured
  // on the real --captions export: "Tooling spend review" was on the slide and in no .vtt,
  // because one regex spanned both lines and consumed only the first.
  const out = narrateDataSeries(
    '<!-- _class: scatter -->\n\n`Tooling spend review`\n\n`Annual cost` `Teams adopting`\n\n## H.\n\n- Atlas `$420k` `18%`\n- Borealis `$310k` `24%`',
  );
  assert.match(out, /^Tooling spend review\./, out.slice(0, 80));
  assert.match(out, /Atlas: Annual cost, four hundred twenty thousand dollars; Teams adopting, eighteen percent\./);
  // A legend that binds is not ALSO read as a sentence — that is the duplication radar dropped.
  assert.equal(out.split('Annual cost').length - 1, 2, 'once per row, never as its own sentence');
  // And a legend that does NOT bind is spoken rather than swallowed.
  assert.match(narrateDataSeries('<!-- _class: bar -->\n\n`Plan` `Actual`\n\n## H.\n\n- A `1`\n- B `2`'), /^Plan, Actual\./);
});

test('narrateDataSeries: a row whose label is inside the code span is not deleted', () => {
  // `stripTrailingPills` peels BOTH spans, leaving an empty label. Consuming the line and then
  // filtering the row dropped the author's words outright.
  const out = narrateDataSeries('<!-- _class: word-cloud -->\n\n## Weight is meaning.\n\n- time-to-value `5`\n- `residency` `1`\n- security `4`');
  assert.match(out, /time-to-value, five\./);
  assert.match(out, /security, four\./);
  assert.match(out, /residency/, 'left to the flattener rather than deleted');
});

test('narrateDataSeries: bails on a three-level list rather than flattening the middle level', () => {
  // radar's `quadrant` variant is group > sub-group > axis. narrateRadar refuses it in exactly
  // these terms; the floor used to read it as "G: Axis, nine. H: Axis, seven. Sub. Sub.",
  // tearing every sub-group name off its data.
  assert.equal(
    narrateDataSeries('<!-- _class: radar -->\n\n## R.\n\n- G\n  - Sub\n    - Axis `9`\n- H\n  - Sub\n    - Axis `7`'),
    null,
  );
  // …while a two-level list with an ordinary pill-less DETAIL line under it still narrates.
  assert.match(
    narrateDataSeries('<!-- _class: scatter -->\n\n## S.\n\n- Atlas `$420k`\n  - Renewal lands in March\n- Borealis `$310k`'),
    /Atlas, four hundred twenty thousand dollars\./,
  );
});

test('narrateDataSeries: the class gate reads the COMPONENT, not a modifier that shares its name', () => {
  // Three shipped shapes put a roster name in a modifier slot. Firing there replaced the
  // walker on a component this narrator does not model.
  assert.equal(narrateDataSeries('<!-- _class: list principles bullet -->\n\n## W.\n\n- Latency `p95`\n  - Down from 400 ms.\n- Cost `-12%`\n  - From storage.'), null);
  assert.equal(narrateDataSeries('<!-- _class: journey heatmap -->\n\n## J.\n\n- Evaluate\n  - Read case study `+5`\n  - Book demo `+2`'), null);
  assert.equal(narrateDataSeries('<!-- _class: radar quadrant -->\n\n## R.\n\n- G\n  - Sub\n    - Axis `9`\n- H\n  - Sub\n    - Axis `7`'), null);
  // …and the ordinary "component then modifiers" form still fires.
  assert.match(narrateDataSeries('<!-- _class: bar dark -->\n\n## G.\n\n- A `1`\n- B `2`'), /A, one\./);
});

test('narrateDataSeries: the table reader narrates the grid markdown-it BUILDS', () => {
  const t = (rows, header = '| | M0 | M1 |\n| --- | --: | --: |') => narrateDataSeries(`<!-- _class: heatmap -->\n\n## H.\n\n${header}\n${rows}`);
  // A cell PAST the header count is dropped by markdown-it, so the chart never draws it.
  // Narrating it announced a value, under an invented column name, that is not on the slide.
  const extra = t('| Jan | 1 | 2 | 3 |');
  assert.match(extra, /Jan: M0, one; M1, two\./);
  assert.doesNotMatch(extra, /column|three/);
  // A SHORT row is padded by markdown-it, and the chart paints the pad as unmeasured — so it
  // reads the same as an author's explicit empty cell, not as silence.
  assert.match(t('| Feb | 4 |'), /Feb: M0, four; M1, no data\./);
  // A one-column table names no columns to read values against.
  assert.equal(t('| Jan |', '| Region |\n| --- |'), null);
  // A cell annotation is the chart's NOTE, not part of the value — and not dropped either.
  assert.match(t('| Jan | 100 | 62 `# rollout paused` |'), /M1, sixty-two \(rollout paused\)\./);
});

test('narrateDataSeries: a nested line with no pill is prose, not a value-less item', () => {
  const out = narrateDataSeries('<!-- _class: line -->\n\n## L.\n\n- Q1\n  - Enterprise `4.1`\n  - A note with no value\n- Q2\n  - Enterprise `4.4`');
  assert.match(out, /Q1: Enterprise, four point one\./);
  assert.doesNotMatch(out, /A note with no value,/, 'not read as an item');
  assert.match(out, /A note with no value/, 'but still spoken');
});

test('narrateDataSeries: strips the markdown a label carries rather than reading it aloud', () => {
  const out = narrateDataSeries('<!-- _class: bar -->\n\n## G.\n\n- **North** America `1`\n- [EMEA](https://x.test) `2`');
  assert.match(out, /North America, one\./);
  assert.match(out, /EMEA, two\./);
  assert.doesNotMatch(out, /\*\*|https/);
});

// THE ROSTER, as a SNAPSHOT of what the derivation currently yields.
//
// It is written out rather than recomputed on purpose. The first version of this test looped
// the catalog and built its `expected` with the SAME predicate the implementation uses, so
// widening the filter changed both sides together and the test could not fail — the exact
// unfalsifiable shape the rest of this suite was rewritten to avoid. The derivation is still
// the mechanism (2026-09-13-projected-rosters.md records what a hand-kept roster costs); this
// is the tripwire that says when its OUTPUT moves, which is the thing a reviewer needs to see
// in a diff.
const PICTURE_DATA_ROSTER = [
  'bar', 'bullet', 'funnel', 'heatmap', 'line', 'map', 'piechart',
  'quadrant', 'radar', 'scatter', 'slope', 'stacked-bar', 'waterfall', 'word-cloud',
];

test('narrateDataSeries: exactly the declared picture-data components narrate, and no others', () => {
  const { PROJECTION } = require('../../../lib/core/projection-catalog.generated.mjs');
  const rows = '\n\n## Heading.\n\n- A `1`\n- B `2`';
  const fires = Object.keys(PROJECTION).filter((n) => narrateDataSeries(`<!-- _class: ${n} -->${rows}`) !== null);
  assert.deepEqual(fires.sort(), [...PICTURE_DATA_ROSTER].sort());
  // Every member really does declare BOTH halves — so the snapshot above is the derivation's
  // output and not a list someone typed.
  for (const name of PICTURE_DATA_ROSTER) {
    assert.equal(PROJECTION[name]?.data, true, `${name} must declare data`);
    assert.ok(['svg', 'spatial'].includes(PROJECTION[name]?.figure), `${name} must declare an svg/spatial figure`);
  }
});

test('narrateDataSeries: the roster needs data:true, not merely a declared projection', () => {
  // A KNOWN EQUIVALENT MUTANT, recorded rather than papered over. Relaxing the implementation's
  // `p.data === true` to `p.data !== undefined` changes nothing today, because no component in
  // the catalog declares an svg/spatial figure WITHOUT data — measured: 14 svg/spatial
  // components, all 14 `data: true`. So this cannot be a behavioral test yet; it pins the
  // premise instead, and fails the day a component breaks it, which is the day the distinction
  // starts to matter.
  const { PROJECTION } = require('../../../lib/core/projection-catalog.generated.mjs');
  const svgish = Object.entries(PROJECTION).filter(([, p]) => p.figure === 'svg' || p.figure === 'spatial');
  assert.deepEqual(
    svgish.filter(([, p]) => p.data !== true).map(([n]) => n),
    [],
    'a picture component with no declared data — decide whether it should narrate',
  );
  // What IS falsifiable today: a component with a figure and no data never narrates.
  const rows = '\n\n## Heading.\n\n- A `1`\n- B `2`';
  for (const [name, p] of Object.entries(PROJECTION)) {
    if (p.data === true || !p.figure) continue;
    assert.equal(narrateDataSeries(`<!-- _class: ${name} -->${rows}`), null, `${name} declares no data`);
  }
});

test('narrateDataSeries: a delimiter row needs a DASH — colons alone are not a table', () => {
  // `| : | : |` is not a markdown table and markdown-it renders no table for it. Treating it as
  // one would narrate a prose line's pipes as a data grid.
  assert.equal(narrateDataSeries('<!-- _class: heatmap -->\n\n## H.\n\n| A | B |\n| : | : |\n| 1 | 2 |'), null);
  assert.match(
    narrateDataSeries('<!-- _class: heatmap -->\n\n## H.\n\n| | A | B |\n| --- | --- | --- |\n| Jan | 1 | 2 |'),
    /Jan: A, one; B, two\./,
  );
});

// ── a state-chart event's authored line break ─────────────────────────────────
// The last item the 2026-09-20 audit logged rather than fixed: it was pre-existing and off
// that branch's path. `state-chart.docs.md`'s `transitions` slot documents BOTH break forms
// as honored, and the render draws both — so the voice was reading markup the audience sees
// as a line break. Fixtures are the real deck's own line, not a model of it.
test('narrateStateChart: an authored <br/> in an event label is a break, not words', () => {
  const md = (evt) => `<!-- _class: state-chart lr -->\n\n## A label can break.\n\n1. Submitted \`start\`\n   - \`${evt} => 2\`\n2. Second review \`end\``;
  // examples/state-chart-branching.md:126, verbatim.
  const br = narrateStateChart(md('needs<br/>second review'));
  assert.match(br, /needs second review goes to Second review/);
  assert.doesNotMatch(br, /<br|br slash|&lt;/);
  // The other documented form: a literal backslash-n.
  assert.match(narrateStateChart(md('needs\\nsecond review')), /needs second review goes to Second review/);
  // `<br>` without the slash, and mixed case, are the same break.
  assert.match(narrateStateChart(md('needs<BR>second review')), /needs second review goes to Second review/);
});

test('narrateStateChart: the break reads as a SPACE, not a comma', () => {
  // A state-chart event break is there to FIT the rank gap, so the label is one phrase split
  // across two lines. A comma would add a pause the author did not write. (A Mermaid node
  // label keeps its comma — `scrubLabel` — because that break usually separates two things.)
  const out = narrateStateChart('<!-- _class: state-chart -->\n\n## M.\n\n1. Draft `start`\n   - `needs<br/>second review => 2`\n2. Done `end`');
  assert.match(out, /needs second review/);
  assert.doesNotMatch(out, /needs, second/);
});

test('scrubLabel keeps its comma for a Mermaid label — the two breaks mean different things', () => {
  // Pinning the ASYMMETRY, so "consistency" does not quietly collapse it. examples/
  // mermaid-sketch-labels.md authors `Booking received<br/>(EDI 204 / portal)`, where the
  // break separates a name from its qualifier.
  const md = ['<!-- _class: diagram -->', '', '## Flow.', '', '```mermaid', 'flowchart LR', '  A["Booking received<br/>(EDI 204 / portal)"] --> B["Hold"]', '```'].join('\n');
  assert.match(narrateDiagram(md), /Booking received, \(EDI 204/);
});

test('narrateDataSeries: only a component that OWNS an axis expands a bracketed eyebrow', () => {
  // The render path decides by POSITION; this path had no position rule at all,
  // so the two could disagree about the same span. `bullet` draws no axis, so a
  // bracketed caption above its rows must stay a CAPTION — spoken as itself,
  // with the values left unbound — exactly as the slide renders it.
  const bullet = [
    '<!-- _class: bullet -->', '', '`[Confidential, internal]`', '', '## Rows', '',
    '- New ARR `4.2M` `5.0M`', '- Expansion `2.1M` `3.0M`',
  ].join('\n');
  const spoken = narrateDataSeries(bullet);
  assert.match(spoken, /Confidential, internal/, 'the caption is still spoken');
  assert.doesNotMatch(spoken, /New ARR: Confidential/, 'and never bound as an axis name');
});

test('narrateDataSeries: a bracketed list cannot invent more axes than the component declares', () => {
  const { axisSetFor } = require('../../../lib/core/label-set');
  assert.equal(axisSetFor('scatter').members.length, 3);
  assert.equal(axisSetFor('bullet'), null, 'bullet declares no axis');
});
