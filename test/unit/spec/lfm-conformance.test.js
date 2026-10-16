
// LFM's shared test cases (spec/conformance/lfm/) run against the reference
// implementation. The second describe is the failing arm: every level of every
// case is broken on purpose, and the runner must say so. A case that cannot fail
// is not a test case.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { listCases, readCase, runCase } = require('../../../tools/lfm-conformance.js');

const cases = listCases().map((n) => readCase(n));

describe('LFM conformance: every shared case passes on the reference implementation', () => {
  test('the folder holds cases for every section of LFM §2 and §3', () => {
    const sections = new Set(cases.map((c) => c.expect.section));
    for (const s of ['2.1', '2.2', '2.3', '2.4', '3.1', '3.2', '3.3', '3.5', '3.6']) assert.ok(sections.has(s), `§${s} has a case`);
  });
  for (const c of cases) {
    test(c.name, () => assert.deepEqual(runCase(c), []));
  }
});

// One wrong answer per level the expectation checks. Returns the broken copies.
function broken(expect) {
  const out = [];
  if (expect.L0) {
    const e = structuredClone(expect);
    e.L0.visible = [...(e.L0.visible || []), 'NEVER RENDERED'];
    out.push(['L0', e]);
  }
  if (expect.L1) {
    const e = structuredClone(expect);
    if (e.L1.slides?.length) { const k = Object.keys(e.L1.slides[0])[0]; e.L1.slides[0][k] = 'WRONG'; }
    else if (e.L1.deck) { const k = Object.keys(e.L1.deck)[0]; e.L1.deck[k] = 'WRONG'; }
    else e.L1.slideCount += 1;
    out.push(['L1', e]);
  }
  if (expect.L2) {
    const e = structuredClone(expect);
    e.L2.findings = [...e.L2.findings, { rule: 'phantom', severity: 'error', slide: 1 }];
    out.push(['L2', e]);
  }
  return out;
}

describe('LFM conformance: a wrong expectation fails (the arm that bites)', () => {
  const wrong = (c, level, mutate) => {
    const expect = structuredClone(c.expect);
    mutate(expect[level]);
    return runCase({ ...c, expect });
  };
  for (const c of cases.filter((x) => x.expect.rows)) {
    test(`${c.name} · every row, every level`, () => {
      const missed = [];
      for (const row of c.expect.rows) {
        for (const [level, e] of broken(row)) {
          if (!runCase({ name: row.name, source: row.source, expect: e }).length) missed.push(`${row.name} · ${level}`);
        }
      }
      assert.deepEqual(missed, []);
    });
  }
  for (const c of cases.filter((x) => !x.expect.rows)) {
    if (c.expect.L0) {
      test(`${c.name} · L0`, () => {
        assert.ok(wrong(c, 'L0', (e) => { e.visible = [...(e.visible || []), 'NEVER RENDERED']; }).length);
      });
    }
    if (c.expect.L1) {
      test(`${c.name} · L1`, () => {
        assert.ok(wrong(c, 'L1', (e) => {
          if (e.slides?.length) { const k = Object.keys(e.slides[0])[0]; e.slides[0][k] = 'WRONG'; }
          else if (e.deck) { const k = Object.keys(e.deck)[0]; e.deck[k] = 'WRONG'; }
          else e.slideCount += 1;
        }).length);
      });
    }
    if (c.expect.L2) {
      test(`${c.name} · L2`, () => {
        assert.ok(wrong(c, 'L2', (e) => { e.findings = [...e.findings, { rule: 'phantom', severity: 'error', slide: 1 }]; }).length);
      });
    }
  }
});

describe('spec/LFM-1.1.md §2.3 lists exactly the values each register accepts', () => {
  // The cases catch a value the engine DROPS; this catches one it ADDS, which would otherwise
  // leave the public table silently short. Each register's list is its resolve-*.js *_NAMES.
  const fs = require('node:fs');
  const path = require('node:path');
  const core = (f) => require(`../../../lib/core/resolve-${f}`);
  const SOURCES = {
    mode: () => core('mode.js').MODE_NAMES, finish: () => core('finish.js').FINISH_NAMES, backdrop: () => core('backdrop.js').BACKDROP_NAMES,
    preset: () => core('preset.js').PRESET_NAMES, split: () => core('split.js').SPLIT_NAMES, stamp: () => core('stamp.js').STAMP_STYLE_NAMES,
    tone: () => core('tone-style.js').TONE_STYLE_NAMES, spectrum: () => core('spectrum.js').SPECTRUM_NAMES, 'spectrum-edge': () => core('spectrum.js').SPECTRUM_EDGE_NAMES,
    rule: () => core('rule.js').RULE_NAMES, eyebrow: () => core('eyebrow.js').EYEBROW_NAMES, headline: () => core('headline.js').HEADLINE_NAMES,
    lift: () => core('lift.js').LIFT_NAMES, cards: () => core('cards.js').CARDS_NAMES, tag: () => core('card-tag.js').CARD_TAG_NAMES,
    corners: () => core('corners.js').CORNERS_NAMES, 'chart-finish': () => core('chart-finish.js').CHART_FINISH_NAMES, spark: () => core('spark.js').SPARK_NAMES,
    'inline-code': () => core('inline-code.js').INLINE_CODE_NAMES, claim: () => core('claim.js').CLAIM_NAMES, 'color-mode': () => core('color-mode.js').COLOR_MODE_NAMES,
    icon: () => require('../../../lib/plugins/registers.generated.js').PLUGIN_REGISTERS.find((r) => r.key === 'icon').axes.flatMap((x) => x.names),
    fit: () => core('guards.js').FIT_NAMES, venue: () => core('venue.js').VENUE_NAMES, pace: () => core('pace.mjs').PACE_NAMES, delivery: () => core('delivery.mjs').DELIVERY_NAMES,
  };
  const spec = fs.readFileSync(path.join(__dirname, '../../../spec/LFM-1.1.md'), 'utf8');
  const rows = new Map(
    [...spec.matchAll(/^\| `([a-z-]+):` \| ([^|]+) \|/gm)].map((m) => [m[1], [...m[2].matchAll(/`([^`]+)`/g)].map((v) => v[1])]),
  );
  for (const [key, names] of Object.entries(SOURCES)) {
    test(`${key}:`, () => {
      assert.ok(rows.has(key), `§2.3 has a row for ${key}:`);
      assert.deepEqual([...rows.get(key)].sort(), [...names()].map(String).sort());
    });
  }
});
