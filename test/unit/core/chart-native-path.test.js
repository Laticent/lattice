// The byte-identical corpus comparison cannot tell a native reader from the bridge it replaced: both give the same bytes. This
// file can. It counts the fallbacks (`settleLead`, `settleCell`) a kernel calls on a row whose record is claimed, and the
// narrator's reads of a claim (`recordPills`), and requires the native path to run: zero fallbacks on a row that holds a record the
// chart reads, and at least one read through the row schema. The patch goes in BEFORE the engine loads, because the kernels bind the
// helpers when they are required.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const rows = require('../../../lib/core/chart-rows.js');

const seen = { settle: 0, settleStamped: 0, take: 0, pills: 0 };
const realSettleLead = rows.settleLead;
const realSettleCell = rows.settleCell;
const realTakeRecord = rows.takeRecord;
const realRecordPills = rows.recordPills;
const STAMP = rows.RECORD_ATTR;
rows.settleLead = (c, h) => { seen.settle++; if (String(h).includes(STAMP)) seen.settleStamped++; return realSettleLead(c, h); };
rows.settleCell = (c, h) => { seen.settle++; if (String(h).includes(STAMP)) seen.settleStamped++; return realSettleCell(c, h); };
rows.takeRecord = (c, h) => { const r = realTakeRecord(c, h); if (r) seen.take++; return r; };
rows.recordPills = (...a) => { seen.pills++; return realRecordPills(...a); };

const engine = require('../../../lib/engine');
const { narrateChart } = require('../../../lib/core/chart-narration.js');

const CASES = {
  bar: '- EMEA `{4.2}`\n- APAC `{3.1}`\n- AMER `{5.6}`',
  line: '- Q1 `{4.2}`\n- Q2 `{5.1}`\n- Q3 `{6.3}`',
  slope: '- EMEA\n  - 2024 `{40%}`\n  - 2025 `{55%}`\n- APAC\n  - 2024 `{30%}`\n  - 2025 `{35%}`',
  'stacked-bar': '- FY24\n  - Product `{3}`\n  - Services `{2}`\n- FY25\n  - Product `{4}`\n  - Services `{3}`',
  piechart: '- Enterprise `{52%}`\n- Mid-market `{31%}`\n- SMB `{17%}`',
  funnel: '- Visits `{1200}`\n- Signups `{340}`\n- Paid `{85}`',
  map: '- France `{42}`\n- Germany `{31}`\n- Spain `{18}`',
  'word-cloud': '- growth `{9}`\n- margin `{6}`\n- churn `{4}`',
  waterfall: '- Start `{10, total}`\n- Upsell `{+4}`\n- Churn `{-3}`\n- End `{11, total}`',
  scatter: '- Atlas `{4.2, 62}`\n- Cirrus `{3.3, 51}`',
  quadrant: '- Now\n  - Alpha `{3, 70}`\n  - Beta `{6, 40}`\n- Later\n  - Gamma `{8, 85}`',
  radar: '- Us\n  - Speed `{4}`\n  - Cost `{3}`\n  - Reach `{5}`\n  - Trust `{2}`',
  heatmap: '| | Jan | Feb |\n|---|---|---|\n| EMEA | `{10}` | `{20}` |\n| APAC | `{30}` | `{40}` |',
};
const slide = (cls, body) => `<!-- _class: ${cls} -->\n\n## KPIs\n\n${body}\n`;
const reset = () => { for (const k of Object.keys(seen)) seen[k] = 0; };

describe('a record the chart reads goes through the row schema, not the bridge fallback', () => {
  for (const [chart, body] of Object.entries(CASES)) {
    test(`${chart}: the transform reads it with no stamped fallback`, () => {
      reset();
      const html = engine.render(`---\nmarp: true\n---\n\n${slide(chart, body)}`, {}).html;
      assert.match(html, /chart-frame|chart-body/);
      assert.ok(seen.take > 0, 'takeRecord found the claim');
      assert.equal(seen.settleStamped, 0, 'no stamped record reached the fallback');
    });
  }
  for (const chart of Object.keys(CASES).filter((c) => c !== 'heatmap' && c !== 'scatter' && c !== 'quadrant')) {
    test(`${chart}: the narrator reads the claim through the row schema`, () => {
      reset();
      assert.ok(narrateChart(slide(chart, CASES[chart])));
      assert.ok(seen.pills > 0, 'recordPills ran for the claimed row');
    });
  }
  test('control: a record the old spans cannot spell reaches the fallback', () => {
    reset();
    engine.render(`---\nmarp: true\n---\n\n${slide('waterfall', '- Start `{10, Total}`\n- Up `{+4}`')}`, {});
    assert.equal(seen.take, 1 /* only {+4}: `{10, Total}` binds no field, so it is not read */);
  });
});
