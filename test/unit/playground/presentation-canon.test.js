/**
 * Unit: the presentation-canon pack — principle cards + the retrieval selector
 * that grounds Converse advice and per-finding fixes. Pure; no model involved.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

async function load() {
  return import('../../../docs/src/components/studio/ai/presentation-canon.js');
}

describe('canonForFinding', () => {
  test('maps a finding rule to its principle card', async () => {
    const { canonForFinding } = await load();
    assert.equal(canonForFinding({ rule: 'label-title' }).id, 'takeaway-titles');
    assert.equal(canonForFinding({ rule: 'no-ask' }).id, 'answer-first');
    assert.equal(canonForFinding({ rule: 'wall-of-text' }).id, 'one-idea');
  });
  test('null for an unmapped or missing rule', async () => {
    const { canonForFinding } = await load();
    assert.equal(canonForFinding({ rule: 'image-no-alt' }), null);
    assert.equal(canonForFinding(null), null);
    assert.equal(canonForFinding({}), null);
  });
});

describe('buildCanonContext', () => {
  test('includes the matched card AND the core arc set, deduped', async () => {
    const { buildCanonContext } = await load();
    const out = buildCanonContext({ findings: [{ rule: 'chart-no-takeaway' }] });
    assert.match(out, /every chart earns its “so what”/i); // the matched card
    assert.match(out, /Lead with the answer/); // a core arc card rode along
    assert.match(out, /one idea per slide/i); // core
    // No card appears twice even if it is both matched and core.
    const onAsk = buildCanonContext({ findings: [{ rule: 'no-ask' }] });
    assert.equal((onAsk.match(/Lead with the answer/g) || []).length, 1);
  });

  test('empty findings still grounds with the core arc set', async () => {
    const { buildCanonContext } = await load();
    const out = buildCanonContext({ findings: [] });
    assert.match(out, /PRESENTATION PRINCIPLES/);
    assert.match(out, /Give the deck an arc/); // through-line is core
  });

  test('renders principle, source, and fix for each card', async () => {
    const { buildCanonContext } = await load();
    const out = buildCanonContext({ findings: [{ rule: 'label-title' }] });
    assert.match(out, /Knaflic/); // source attributed
    assert.match(out, /when: .*fix:/); // the smell → fix shape
  });

  test('caps at the limit', async () => {
    const { buildCanonContext } = await load();
    const many = ['label-title', 'no-ask', 'wall-of-text', 'chart-no-takeaway', 'metric-no-referent', 'monotone-openings', 'agenda-missing', 'length-vs-time'].map((rule) => ({ rule }));
    const out = buildCanonContext({ findings: many, limit: 3 });
    assert.equal(out.split('\n').filter((l) => l.startsWith('- ')).length, 3);
  });
});
