const test = require('node:test');
const assert = require('node:assert/strict');
const {
  narrateChart,
  narrateDiagram,
  narrateFunnel,
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

test('narrateRadar: returns null when the eyebrow already declares an explicit, parseable scale', () => {
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
  assert.equal(narrateRadar(md), null);
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
  assert.equal(narrateRadar(md), 'How we stack up. On a scale of zero to one hundred. Lattice: Performance, nine; Pricing, ninety-five.');
});

test('narrateRadar: tolerates trailing non-numeric text on an axis value pill', () => {
  const md = ['<!-- _class: radar -->', '', '## X.', '', '- Lattice', '  - Performance `9 pts`'].join('\n');
  assert.equal(narrateRadar(md), 'X. On a scale of zero to ten. Lattice: Performance, nine.');
});

test('narrateRadar: speaks a leading eyebrow FIRST, in its authored position, properly punctuated', () => {
  const md = ['<!-- _class: radar -->', '', '`Buying criteria`', '', '## X.', '', '- Lattice', '  - Performance `9`'].join('\n');
  assert.equal(narrateRadar(md), 'Buying criteria. X. On a scale of zero to ten. Lattice: Performance, nine.');
});

// ── narrateQuadrant ───────────────────────────────────────────────────────────
test('narrateQuadrant: returns null for a non-quadrant slide', () => {
  assert.equal(narrateQuadrant('<!-- _class: kpi -->\n\n## X\n\n- A\n  - B `1, 2`'), null);
});

test('narrateQuadrant: returns null when the eyebrow already ranges BOTH axes', () => {
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
  assert.equal(narrateQuadrant(md), null);
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
    'Where to invest. The horizontal axis runs zero to ten. The vertical axis runs zero to one hundred. Strategic Bets: Scoring model v2 at three, seventy; Per-team calibration at seven, eighty-five.',
  );
});

test('narrateQuadrant: speaks a leading eyebrow FIRST, in its authored position, properly punctuated', () => {
  const md = ['<!-- _class: quadrant -->', '', '`Effort 0–10`', '', '## X.', '', '- Group', '  - Item `5, 85`'].join('\n');
  assert.equal(narrateQuadrant(md), 'Effort 0–10. X. The vertical axis runs zero to one hundred. Group: Item at five, eighty-five.');
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
test('narrateStateChart: leads with the heading, then the inferred facts, then the rest via slideToSpeech', () => {
  const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft', '   - `submit => 2`', '2. Review', '   - `approve => 3`', '3. Done'].join('\n');
  const out = narrateStateChart(md);
  assert.ok(out.startsWith('Flow. This flow starts at Draft. It ends at Done.'));
  assert.equal(out.match(/Flow\./g).length, 1);
});

test('narrateStateChart: returns null when there is nothing inferred to add', () => {
  const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft `start`', '   - `submit => 2`', '2. Done `end`'].join('\n');
  assert.equal(narrateStateChart(md), null);
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
  assert.ok(out.startsWith('The real heading. This flow starts at Draft. It ends at Done.'));
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

test('narrateChart: recognizes a state-chart slide with an inference to add', () => {
  const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft', '   - `submit => 2`', '2. Done'].join('\n');
  assert.ok(narrateChart(md).includes('This flow starts at Draft.'));
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

test('narrateDiagram: BAILS to null on a non-flowchart Mermaid type', () => {
  for (const type of ['sequenceDiagram', 'classDiagram', 'stateDiagram-v2', 'erDiagram', 'gantt', 'pie', 'mindmap']) {
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

test('narrateDiagram: the GIST layer is gated — a shape line on a non-trivial graph, silent on a pure linear chain', () => {
  // Diamond (branch + reconvergence) → a one-line shape characterization opens the reading.
  const diamond = narrateDiagram(diagram('  S["Req"] --> A["Validate"]\n  S --> B["Auth"]\n  A --> M["Process"]\n  B --> M\n  M --> E["Respond"]', 'flowchart TD'));
  assert.ok(diamond.includes('A diamond — the path splits in two and rejoins at Process.'), diamond);
  // A 7-node linear chain: the walk already says start→end, so the gist stays silent.
  const chain = narrateDiagram(diagram('  A1 --> A2 --> A3 --> A4 --> A5 --> A6 --> A7'));
  assert.ok(!/diamond|hops deep|fan-out|steps from/.test(chain), chain);
  // A lone fan-out gets a shape line naming the hub and the lack of reconvergence.
  const fan = narrateDiagram(diagram('  R["Root"] --> A\n  R --> B\n  R --> C', 'flowchart TD'));
  assert.ok(fan.includes('A three-way fan-out from Root, with no reconvergence.'), fan);
});

test('narrateDiagram: the GIST characterizes a wide graph by shape + the shared node, with numbers spoken', () => {
  const wide = narrateDiagram(diagram('  U["Browser"] --> LB["Load Balancer"] --> GW["API Gateway"]\n  GW --> Auth["Auth"]\n  GW --> Ord["Orders"]\n  GW --> Srch["Search"]\n  Auth --> DB[("User DB")]\n  Ord --> DB\n  Srch --> Cache[("Cache")]', 'flowchart LR'));
  assert.ok(wide.includes('fans out to three parallel paths'), wide); // numbers spelled for TTS
  assert.ok(wide.includes('User DB is shared'), wide); // the one convergence node is flagged
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

test('narrateDiagram: the overview names a loop when the graph also branches and cycles', () => {
  // branch (In stock?) + a real cycle (Pay ⇄ Backorder) → the shape earns an overview, and the
  // loop is announced with ", with a loop back".
  const out = narrateDiagram(diagram('  O["Order"] -->|validates| V{"In stock?"}\n  V -->|yes| P["Pay"]\n  V -->|no| Bk["Backorder"]\n  P -->|"on failure"| Bk\n  Bk -->|restocked| P\n  P --> Sh["Ship"]', 'flowchart TD'));
  assert.ok(out.includes('with a loop back'), out);
});
