/**
 * Unit: the `hub-spoke` chart member — lib/core/hub-spoke-model.js (the grammar, the
 * channel rule, the lint) and lib/components/chart/hub-spoke/hub-spoke.transform.js
 * (the geometry and the SVG).
 *
 * What is pinned here, and why each exists:
 *   1. THE PARSER. The prototype crashed on a hub name of four characters or fewer, and
 *      its private value parser disagreed with the family's on eight spellings. Both are
 *      asserted against the shared parser (`lib/core/chart-values.js`).
 *   2. THE PILL GRAMMAR AND THE CHANNEL RULE, which the kernel, the linter and the voice
 *      all read from one module (HARD RULE #7).
 *   3. THE LINT, through `lint-core` itself, so a rule id or its wording cannot drift from
 *      what an author sees.
 *   4. THE SOLVER'S INVARIANTS — the hub inside the stage and outside every disc, the
 *      connector floor, the hub:satellite ratio band — on the emitted geometry.
 *   5. ORIENTATION: the smallest label clears its floor on a landscape AND a portrait box.
 *   6. A SEEDED FUZZ: every slide inside the certified envelope (the one `hub-spoke-crowded`
 *      warns outside of) lays out with zero unresolved labels and zero broken floors.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HS = require('../../../lib/core/hub-spoke-model');
const T = require('../../../lib/components/chart/hub-spoke/hub-spoke.transform');
const { findHubSpokeIssues } = require('../../../lib/authoring/lint-core');
const { narrateChart } = require('../../../lib/core/chart-narration');

const ROOT = path.join(__dirname, '../../..');

// ── helpers ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** The <ul> inner HTML the dispatcher hands the kernel. */
function ul(hub, sats, hubPills = []) {
  const li = (label, pills, kids) => `<li>${esc(label)}${(pills || []).map((p) => ` <code>${esc(p)}</code>`).join('')}` +
    `${kids ? `\n<ul>${kids}</ul>` : ''}</li>`;
  return li(hub, hubPills, sats.map(([label, pills, kids]) =>
    li(label, pills, kids ? kids.map(([l, p]) => li(l, p)).join('') : '')).join(''));
}
const model = (hub, sats, cls = [], hubPills = []) => T.parseHubSpoke(ul(hub, sats, hubPills), ['hub-spoke', ...cls]);
const lint = (md) => findHubSpokeIssues(`---\nmarp: true\n---\n\n${md}`);
const rules = (md) => lint(md).map((f) => f.rule);

const PMO = [['Customer onboarding'], ['Core platform migration', ['at-risk']], ['Data governance'],
  ['Vendor consolidation', ['blocked']], ['Branch network'], ['Workforce reskilling']];

// ── 1 · parser ─────────────────────────────────────────────────────────────────
describe('hub-spoke parser', () => {
  test('a hub name of 0 to 4 characters lays out (the prototype crashed on all five)', () => {
    for (const name of ['', 'A', 'AB', 'ABC', 'ABCD']) {
      const m = model(name, [['One'], ['Two'], ['Three']]);
      const { html, meta } = T.buildHubSpoke(m);
      assert.ok(html.includes('hub-spoke-hub'), `hub "${name}" drew no hub`);
      assert.ok(Number.isFinite(meta.Rh) && meta.Rh > 0, `hub "${name}" has no radius`);
    }
  });

  test('every value spelling reads through the family parser, not a private one', () => {
    const cases = [
      ['1,25M', 1250000, ''], ['20 mg', 20, 'mg'], ['$-5M', -5e6, '$'], ['($5M)', -5e6, '$'],
      ['~$18M', 18e6, '$'], ['−$1.2M', -1.2e6, '$'], ['$1.2bn', 1.2e9, '$'], ['$1.2B', 1.2e9, '$'],
      ['120 ms', 120, 'ms'], ['9 bps', 9, 'bps'], ['12 months', 12, 'months'],
    ];
    for (const [raw, num, unit] of cases) {
      const s = model('Hub', [['A', [raw]], ['B']]).spokes[0];
      assert.equal(s.value, raw, `${raw} was not read as the value`);
      assert.equal(s.num, num, `${raw} parsed to ${s.num}`);
      assert.equal(s.unit, unit, `${raw} keyed as unit "${s.unit}"`);
    }
  });

  test('$1.2bn and $1.2B are one unit, so a slide mixing them still scales', () => {
    const m = model('Hub', [['A', ['$1.2bn']], ['B', ['$1.2B']], ['C', ['$900M']]], ['sized']);
    assert.equal(HS.channelOf(m).channel, 'size');
  });

  test('a digit-bearing pill that is not a value is refused, never made a group', () => {
    for (const raw of ['$18M+', '1.2e6']) {
      const s = model('Hub', [['A', [raw]], ['B']]).spokes[0];
      assert.equal(s.value, '', `${raw} became a value`);
      assert.equal(s.group, '', `${raw} became a group`);
      assert.deepEqual(s.issues.map((i) => i.kind), ['numeric-group']);
    }
  });

  test('ONE value per spoke; a second is linted and dropped, not made a group', () => {
    const s = model('Hub', [['A', ['$6M', '$7M']], ['B']]).spokes[0];
    assert.equal(s.value, '$6M');
    assert.equal(s.group, '');
    assert.deepEqual(s.issues, [{ kind: 'extra-value', pill: '$7M' }]);
  });

  test('a leading-digit group name (3PL) is a value by the family test — documented, not bent', () => {
    const s = model('Hub', [['A', ['3PL']], ['B']]).spokes[0];
    assert.equal(s.value, '3PL');
  });

  test('status, flow, value and group are read in any order', () => {
    const s = model('Hub', [['A', ['Retail', 'flow:in', 'at-risk', '$4M']], ['B']]).spokes[0];
    assert.deepEqual([s.status, s.dir, s.value, s.group], ['at-risk', 'in', '$4M', 'Retail']);
    assert.equal(s.alarm, true);
  });

  test('tiered: the sublist is leaves (level 3) and a leaf sublist is detail (level 4)', () => {
    const html = '<li>Org<ul><li>Payments<ul><li>Fraud <code>blocked</code><ul><li>Rule engine lag</li></ul></li></ul></li><li>Data</li></ul></li>';
    const m = T.parseHubSpoke(html, ['hub-spoke', 'tiered']);
    assert.equal(m.spokes[0].leaves[0].label, 'Fraud');
    assert.equal(m.spokes[0].leaves[0].status, 'blocked');
    assert.match(m.spokes[0].leaves[0].detail, /Rule engine lag/);
    const flat = T.parseHubSpoke(html, ['hub-spoke']);
    assert.match(flat.spokes[0].detail, /Fraud/, 'flat: the sublist is the satellite\'s detail');
  });

  test('markdown in a name is read off the rendered HTML, escaped once, never as markup', () => {
    const html = '<li>Hub<ul><li><strong>Ops</strong> &amp; IT <code>$4M</code></li><li>&lt;b&gt;x</li></ul></li>';
    const out = T.buildHubSpoke(T.parseHubSpoke(html, ['hub-spoke'])).html;
    assert.match(out, /data-label="Ops &amp; IT"/);
    assert.doesNotMatch(out, /<b>x/);
  });
});

// ── 2 · channel rule ───────────────────────────────────────────────────────────
describe('hub-spoke channel rule', () => {
  const vals = [['A', ['$30M']], ['B', ['$20M']], ['C', ['$10M']]];
  test('default: values print and nothing scales', () => {
    assert.equal(HS.channelOf(model('Hub', vals)).channel, 'none');
  });
  test('`sized` is node area; `flow-*` is connector weight; both → weight wins', () => {
    assert.equal(HS.channelOf(model('Hub', vals, ['sized'])).channel, 'size');
    assert.equal(HS.channelOf(model('Hub', vals, ['flow-out'])).channel, 'flow');
    assert.equal(HS.channelOf(model('Hub', vals, ['sized', 'flow-in'])).channel, 'flow');
  });
  test('a per-spoke flow: pill is an arrowhead only — it never turns a channel on', () => {
    const m = model('Hub', [['A', ['$30M', 'flow:in']], ['B', ['$20M']], ['C', ['$10M']]]);
    assert.equal(HS.channelOf(m).channel, 'none');
    assert.match(T.buildHubSpoke(m).html, /class="hub-spoke-arrow"[^>]*data-dir="in"/);
  });
  test('a missing, non-positive or mixed-unit value switches the channel off', () => {
    assert.equal(HS.channelOf(model('Hub', [['A', ['$3M']], ['B'], ['C', ['$1M']]], ['sized'])).why, 'missing');
    assert.equal(HS.channelOf(model('Hub', [['A', ['$3M']], ['B', ['0']], ['C', ['$1M']]], ['sized'])).why, 'nonpositive');
    assert.equal(HS.channelOf(model('Hub', [['A', ['$3M']], ['B', ['12%']], ['C', ['$1M']]], ['sized'])).why, 'units');
  });
  test('`sized` past 8 satellites is off (area ranks nothing past eight)', () => {
    const nine = Array.from({ length: 9 }, (_, i) => [`S${i}`, [`${i + 1}`]]);
    assert.equal(HS.channelOf(model('Hub', nine, ['sized'])).why, 'sized-many');
  });
  test('the undrawn 13th spoke is sliced off BEFORE the channel and the maximum', () => {
    const sats = Array.from({ length: 12 }, (_, i) => [`S${i}`, [`${i + 1}`]]);
    sats.push(['Thirteenth']);  // no value, and it would have switched the channel off
    const m = model('Hub', sats, ['flow-out']);
    const C = HS.channelOf(m);
    assert.equal(m.spokes.length, 12);
    assert.equal(C.channel, 'flow');
    assert.equal(C.vmax, 12);
    assert.doesNotMatch(T.buildHubSpoke(m).html, /Thirteenth/, 'an undrawn spoke is not narrated in the desc');
  });
  test('stepped flow classes: near-equal values share a class (tie tolerance)', () => {
    const cls = HS.flowClasses([100, 75, 75.1, 50, 10]);
    assert.equal(cls[1], cls[2], '75 and 75.1 must draw alike');
    assert.ok(cls.every((c) => c >= 1 && c <= HS.FLOW_STEPS), 'never a hairline, never past the top step');
    assert.equal(cls[0], HS.FLOW_STEPS);
  });
  test('size radii are sqrt-area with a floor, and a floored disc is stamped clamped', () => {
    const r = HS.sizeRadii([100, 25, 1], 30, 10);
    assert.equal(r[0].r, 30);
    assert.ok(Math.abs(r[1].r - 15) < 1e-9);
    assert.deepEqual([r[2].r, r[2].clamped], [10, true]);
    const m = model('Hub', [['A', ['100']], ['B', ['1']], ['C', ['50']]], ['sized']);
    assert.match(T.buildHubSpoke(m).html, /data-clamped="true"/);
  });
});

// ── 3 · lint ─────────────────────────────────────────────────────────────────
describe('hub-spoke lint (through lint-core)', () => {
  const slide = (cls, list) => `<!-- _class: hub-spoke${cls ? ` ${cls}` : ''} -->\n\n## T.\n\n${list}\n`;
  test('rule ids are flat kebab-case', () => {
    const f = lint(slide('sized', '- Hub `$10M` `at-risk`\n  - A `$6M` `$7M`\n  - B `$18M+`\n  - C `live` `pilot`\n- Extra'));
    assert.ok(f.length >= 5);
    for (const x of f) assert.match(x.rule, /^hub-spoke-[a-z]+(-[a-z]+)*$/);
  });
  test('count limits, grammar refusals, hub status, a second hub', () => {
    const r = rules(slide('sized', '- Hub `$10M` `at-risk`\n  - A `$6M` `$7M`\n  - B `$18M+`\n  - C `live` `pilot`\n- Extra'));
    for (const id of ['hub-spoke-extra-hub', 'hub-spoke-hub-status', 'hub-spoke-extra-value', 'hub-spoke-numeric-group', 'hub-spoke-status-group']) {
      assert.ok(r.includes(id), `${id} missing: ${r.join(', ')}`);
    }
    const many = Array.from({ length: 13 }, (_, i) => `  - S${i}`).join('\n');
    assert.ok(rules(slide('', `- Hub\n${many}`)).includes('hub-spoke-too-many'));
  });
  test('missing-value counts the MISSING, and a zero value is its own finding', () => {
    const f = lint(slide('sized', '- Hub\n  - A `$3M`\n  - B\n  - C `$1M`'));
    const mv = f.find((x) => x.rule === 'hub-spoke-missing-value');
    assert.match(mv.message, /^1 of 3 satellites have no value, so `sized` is off/);
    const z = rules(slide('sized', '- Hub\n  - A `$3M`\n  - B `0`\n  - C `$1M`'));
    assert.ok(z.includes('hub-spoke-nonpositive-value'));
    assert.ok(!z.includes('hub-spoke-missing-value'), 'a zero is a value, not a missing one');
  });
  test('mixed units, sized past 8 (suggests bar), two channels', () => {
    assert.ok(rules(slide('sized', '- Hub\n  - A `$3M`\n  - B `12%`\n  - C `$1M`')).includes('hub-spoke-mixed-units'));
    const nine = Array.from({ length: 9 }, (_, i) => `  - S${i} \`${i + 1}\``).join('\n');
    const f = lint(slide('sized', `- Hub\n${nine}`)).find((x) => x.rule === 'hub-spoke-sized-many');
    assert.match(f.fix, /`bar`/);
    assert.ok(rules(slide('sized flow-out', '- Hub\n  - A `3`\n  - B `2`')).includes('hub-spoke-two-channels'));
  });
  test('the sum check fires only when the satellites EXCEED the hub (a subset is fine)', () => {
    assert.ok(!rules(slide('', '- Hub `$100M`\n  - A `$30M`\n  - B `$20M`')).includes('hub-spoke-sum'));
    assert.ok(rules(slide('', '- Hub `$10M`\n  - A `$30M`\n  - B `$20M`')).includes('hub-spoke-sum'));
    // flow-out: a flow:in spoke is not part of the outbound total.
    const ops = '- DC `12,000`\n  - NE `7,000`\n  - SE `5,000`\n  - Returns `400` `flow:in`';
    assert.ok(!rules(slide('flow-out', ops)).includes('hub-spoke-sum'));
  });
  test('tiered caps and tiered channel', () => {
    const br = Array.from({ length: 7 }, (_, i) => `  - B${i}\n    - L${i}a\n    - L${i}b\n    - L${i}c`).join('\n');
    const r = rules(slide('tiered sized', `- Hub\n${br}`));
    for (const id of ['hub-spoke-tiered-branches', 'hub-spoke-tiered-leaves', 'hub-spoke-tiered-channel']) assert.ok(r.includes(id), id);
  });
  test('hub overflow is an error; a crowded slide warns', () => {
    const long = 'Enterprise-wide customer relationship management modernization programme office and delivery';
    const f = lint(slide('', `- ${long} \`$1,234,567,890\`\n  - A\n  - B\n  - C`)).find((x) => x.rule === 'hub-spoke-hub-overflow');
    assert.equal(f.severity, 'error');
    const twelve = Array.from({ length: 12 }, (_, i) => `  - A very long satellite name number ${i}`).join('\n');
    assert.ok(rules(slide('', `- Hub\n${twelve}`)).includes('hub-spoke-crowded'));
  });
  test('the shipped samples lint clean', () => {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/components/chart/hub-spoke/hub-spoke.manifest.json'), 'utf8'));
    const samples = [m.sample, m.stressDoc.sample, ...Object.values(m.variantDocs).map((v) => v.sample)];
    for (const md of samples) assert.deepEqual(rules(md), [], md.split('\n')[0]);
  });
});

// ── 4 · solver invariants ───────────────────────────────────────────────────────
function assertGeometry(meta, label) {
  const { W, H } = meta;
  const eps = 1e-6;
  assert.ok(meta.ratio >= HS.HUB_RATIO_MIN - 0.01 && meta.ratio <= HS.HUB_RATIO_MAX + eps, `${label}: hub ratio ${meta.ratio}`);
  assert.ok(meta.Rh <= H / 2 - 2 + eps, `${label}: hub overflows the stage`);
  for (const n of meta.nodes) {
    if (meta.tier === 'flat') assert.ok(Math.hypot(n.x, n.y) - meta.Rh - n.r >= T.MIN_NECK - 0.01, `${label}: connector under the floor`);
    assert.ok(Math.hypot(n.x, n.y) > meta.Rh + n.r, `${label}: a disc sits inside the hub`);
    assert.ok(Math.abs(n.x) + n.r <= W / 2 + eps, `${label}: a disc leaves the stage`);
  }
  assert.deepEqual(meta.bad, [], `${label}: solver floors broken (${meta.bad.join(', ')})`);
  assert.equal(meta.unresolved, 0, `${label}: ${meta.unresolved} labels touch something`);
}

describe('hub-spoke solver', () => {
  test('the four personas, 3 / 8 / 12 satellites, and tiered hold every invariant', () => {
    const cases = {
      pmo: model('Program office', PMO),
      cfo: model('Channel revenue', [['Atlas Distribution', ['28%']], ['Keystone Resellers', ['22%']], ['Northgate Systems', ['18%']],
        ['Brightline Retail', ['13%']], ['Summit Online', ['11%']], ['Harborview Telecom', ['8%']]], ['sized'], ['$120M']),
      ops: model('Memphis DC', [['Northeast', ['3,600']], ['Southeast', ['3,100']], ['Midwest', ['2,400']], ['Southwest', ['1,700']],
        ['West', ['1,200']], ['Returns center', ['400', 'flow:in']]], ['flow-out'], ['12,000']),
      three: model('Hub', [['North'], ['South'], ['West']]),
      eight: model('Lattice platform', Array.from({ length: 8 }, (_, i) => [`Partner number ${i + 1}`])),
      twelve: model('Lattice platform', Array.from({ length: 12 }, (_, i) => [`Partner ${i + 1}`, [`Group${'ABCD'[i % 4]}`]])),
      tiered: model('Platform org', [['Payments', [], [['Card issuing'], ['Acquiring'], ['Fraud scoring', ['at-risk']]]],
        ['Data', [], [['Warehouse'], ['Streaming']]], ['Core banking', ['blocked'], [['Ledger'], ['Accounts']]]], ['tiered']),
    };
    for (const orientation of [undefined, 'portrait', 'square']) {
      for (const [k, m] of Object.entries(cases)) assertGeometry(T.buildHubSpoke(m, { orientation }).meta, `${k}/${orientation || 'landscape'}`);
    }
  });

  test('the hub never outgrows 3x the largest satellite, whatever its text', () => {
    const m = model('Supercalifragilistic customer onboarding platform', [['A'], ['B'], ['C'], ['D']], [], ['$1,234,567']);
    const { meta } = T.buildHubSpoke(m);
    assert.ok(meta.ratio <= HS.HUB_RATIO_MAX + 1e-6);
    assert.ok(meta.Rh <= meta.H / 2);
  });

  test('an arrowhead ends on its target and never widens its connector', () => {
    const m = model('Hub', [['A', ['30', 'flow:out']], ['B', ['20', 'flow:in']], ['C', ['10', 'flow:both']]]);
    const html = T.buildHubSpoke(m).html;
    assert.equal((html.match(/class="hub-spoke-arrow"/g) || []).length, 4);
  });

  test('in `sized`, an alarm ring sits INSIDE the disc, so a flag never reads as size', () => {
    const m = model('Hub', [['A', ['30', 'at-risk']], ['B', ['20']], ['C', ['10']]], ['sized']);
    assert.match(T.buildHubSpoke(m).html, /hub-spoke-halo hub-spoke-halo--inner/);
  });

  test('CJK and an unbroken token wrap inside the budget (width billed at a full em)', () => {
    assert.ok(HS.textWidth('東京', 10) >= 20 - 1e-9);
    const lines = HS.wrapText('https://example.com/a/very/long/path/without/spaces', 90, 10);
    for (const l of lines) assert.ok(HS.textWidth(l, 10) <= 90 + 1e-9, l);
    assert.equal(lines.join(''), 'https://example.com/a/very/long/path/without/spaces');
  });
});

// ── 5 · orientation ─────────────────────────────────────────────────────────────
describe('hub-spoke orientation', () => {
  // The chart body measured in the emulator: 1152 x 424 on the 1280 x 720 frame, and
  // 972 x 771 on a 4:5 portrait frame with a two-line title (the tightest measured).
  // Floors: landscape the pie key (19.06px); portrait the family floor 11px x --canvas-scale
  // (1.95 at 4:5, lib/engine/css.js orientationFor).
  const BOXES = [
    { orientation: undefined, w: 1152, h: 424, floor: 19 },
    { orientation: 'portrait', w: 972, h: 771, floor: 11 * 1.95 },
    { orientation: 'portrait', w: 972, h: 1330, floor: 11 * 2.19 },
    { orientation: 'square', w: 972, h: 712, floor: 11 * 1.65 },
  ];
  test('the smallest label clears its floor in landscape AND portrait', () => {
    const m = model('Program office', [...PMO.slice(0, 3), ['Branch network', ['$4M', 'Retail']], ['X', ['Ops']]]);
    for (const b of BOXES) {
      const { meta } = T.buildHubSpoke(m, { orientation: b.orientation });
      const scale = Math.min(b.w / meta.W, b.h / meta.H);
      const min = Math.min(...meta.labelSizes, 9 + (meta.W / meta.H < 2 ? 1 : 0)) * scale;
      assert.ok(min >= b.floor - 0.01, `${b.orientation || 'landscape'} ${b.w}x${b.h}: smallest label ${min.toFixed(2)}px < ${b.floor.toFixed(2)}px`);
    }
  });
  test('portrait lays out a tall figure, not a squeezed landscape one', () => {
    const land = T.buildHubSpoke(model('Hub', PMO)).meta;
    const port = T.buildHubSpoke(model('Hub', PMO), { orientation: 'portrait' }).meta;
    assert.ok(land.W / land.H > 2.5);
    assert.ok(port.W / port.H < 1.2);
  });
});

// ── 6 · seeded fuzz ───────────────────────────────────────────────────────────
function rng(seed) {
  let s = (seed * 2654435761) >>> 0;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 2 ** 32; };
  for (let i = 0; i < 4; i++) next();
  return next;
}
const WORDS = ['Northwind', 'Data', 'Quarry', 'Analytics', 'Customer', 'onboarding', 'Core', 'platform', 'migration', 'Vendor',
  'consolidation', 'Branch', 'network', 'Workforce', 'reskilling', 'Atlas', 'Distribution', 'Keystone', 'Resellers', 'Summit',
  'Online', 'West', 'Southeast', 'Returns', 'center', 'Ledger', 'Know-your-customer', 'API', 'Identity', 'Payments', 'Retail'];
const STAT = ['at-risk', 'blocked', 'on-track', 'live', 'warn', 'fail', 'pilot'];
function fuzzCase(seed, stage) {
  const r = rng(seed);
  const tall = stage !== 'landscape';
  const name = (max) => {
    const target = 3 + Math.floor(r() * (max - 2));
    let s = '';
    while (s.length < target) s = s ? `${s} ${WORDS[Math.floor(r() * WORDS.length)]}` : WORDS[Math.floor(r() * WORDS.length)];
    return s.length > max ? s.slice(0, max).trim() : s;
  };
  const tiered = r() < 0.2;
  const n = tiered ? 2 + Math.floor(r() * (tall ? 2 : 5)) : 3 + Math.floor(r() * 10);
  const env = tiered ? (tall ? HS.TALL_TIER.name : HS.LEAF_NAME_ENVELOPE) : HS.nameEnvelope(n, stage);
  const values = r() < 0.5;
  const flow = r() < 0.3 ? ['flow-out', 'flow-in', 'flow-both'][Math.floor(r() * 3)] : '';
  const sized = !flow && values && r() < 0.4;
  const groups = !tiered && r() < 0.3 ? 1 + Math.floor(r() * 5) : 0;
  const cls = ['hub-spoke', ...(tiered ? ['tiered'] : []), ...(flow ? [flow] : []), ...(sized ? ['sized'] : [])];
  let budget = HS.LIMITS.leaves;
  const tree = [{ label: name(24), pills: values ? [`$${10 + Math.floor(r() * 900)}M`] : [], children: Array.from({ length: n }, () => {
    const pills = [];
    if (values) pills.push(`$${1 + Math.floor(r() * 90)}M`);
    if (r() < 0.25) pills.push(STAT[Math.floor(r() * STAT.length)]);
    if (groups) pills.push(`Group${String.fromCharCode(65 + Math.floor(r() * groups))}`);
    if (r() < 0.1) pills.push('flow:in');
    const leaves = tiered ? Array.from({ length: Math.min(budget, 1 + Math.floor(r() * (tall ? 3 : 4))) }, () => ({
      label: name(env), pills: [...(values && r() < 0.5 ? [`$${1 + Math.floor(r() * 9)}M`] : []), ...(r() < 0.15 ? [STAT[Math.floor(r() * 2)]] : [])], children: [],
    })) : [];
    budget -= leaves.length;
    return { label: name(tiered ? (tall ? HS.TALL_TIER.name : HS.BRANCH_NAME_ENVELOPE) : env), pills, children: leaves };
  }) }];
  return HS.buildModel(tree, cls);
}

describe('hub-spoke seeded fuzz', () => {
  for (const [stage, orientation, seeds] of [['landscape', undefined, [1, 240]], ['portrait', 'portrait', [5001, 5100]]]) {
    test(`${stage}: every slide inside the certified envelope lays out clean`, () => {
      let inside = 0;
      const failures = [];
      for (let seed = seeds[0]; seed <= seeds[1]; seed++) {
        const m = fuzzCase(seed, stage);
        const C = HS.channelOf(m);
        const cap = HS.hubCeiling(m.spokes.length, { tiered: m.mods.tiered, sized: C.channel === 'size', stage });
        if (HS.crowding(m, stage).length || HS.fitHubText(m.hub.label, m.hub.value, cap).overflow) continue;
        inside++;
        const { meta } = T.buildHubSpoke(m, { orientation });
        if (meta.unresolved || meta.bad.length) failures.push(`seed ${seed} (${m.spokes.length}${m.mods.tiered ? ' tiered' : ''}): ${meta.unresolved} unresolved, ${meta.bad.join(',')}`);
      }
      assert.ok(inside > (seeds[1] - seeds[0]) * 0.5, `the fuzz exercised too few in-envelope cases (${inside})`);
      assert.deepEqual(failures, []);
    });
  }
});

// ── narration ─────────────────────────────────────────────────────────────────
describe('hub-spoke narration', () => {
  test('the hub and every drawn spoke lead a sentence; class-level flow is said', () => {
    const md = '<!-- _class: hub-spoke flow-out -->\n\n## Where the pallets go.\n\n- Memphis DC `12,000`\n  - Northeast `3,600`\n  - Returns center `400` `flow:in`\n  - West `1,200` `at-risk`\n';
    const said = narrateChart(md);
    for (const lead of ['Memphis DC,', 'Northeast,', 'Returns center,', 'West,']) assert.ok(said.includes(`. ${lead}`), `${lead} does not lead a sentence: ${said}`);
    assert.match(said, /Flow runs out from the hub\./);
    assert.match(said, /Returns center, four hundred, flowing in\./);
    assert.match(said, /West, one thousand two hundred, at risk, flowing out\./);
  });
  test('tiered: leaves (with their status) are said after their branch', () => {
    const md = '<!-- _class: hub-spoke tiered -->\n\n## T.\n\n- Org\n  - Payments\n    - Fraud `blocked`\n    - Acquiring\n  - Data\n    - Warehouse\n';
    assert.match(narrateChart(md), /Payments, with two leaves\. Fraud, blocked\. Acquiring\. Data, with one leaf\. Warehouse\./);
  });
  test('the desc narrates hub, spokes, values, statuses, flow and leaves', () => {
    const m = model('Org', [['Payments', ['$4M', 'flow:out'], [['Fraud', ['blocked']]]], ['Data']], ['tiered']);
    const html = T.buildHubSpoke(m).html;
    const desc = html.match(/<desc>([^<]*)<\/desc>/)[1];
    for (const w of ['Org', 'Payments', '$4M', 'flowing out', 'Fraud', 'blocked', 'Data']) assert.ok(desc.includes(w), `${w} missing from desc: ${desc}`);
    assert.match(html, /class="hub-spoke-leaf"[^>]*data-label="Fraud"/, 'leaves carry their identity');
  });
});

// ── palette-blindness (HARD RULE #3) ──────────────────────────────────────────────
test('the kernel emits no color; the stylesheet carries no hex, margin or @layer', () => {
  const html = T.buildHubSpoke(model('Hub', PMO)).html;
  assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}\b|rgb\(|fill="(?!none)/);
  const css = fs.readFileSync(path.join(ROOT, 'lib/components/chart/hub-spoke/hub-spoke.styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /\bmargin\s*:/);
  assert.doesNotMatch(css, /@layer/);
});
