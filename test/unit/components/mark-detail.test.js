/**
 * Unit: lib/plugins/chart-family/shared/mark-detail.js — the shared per-mark
 * detail substrate (data-mark <template> payload + speaker-note fallback)
 * generalized from the pie and reused by funnel / map / quadrant / radar.
 * See engineering/decisions/2026-06-20-chart-detail-reveal-family.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  splitDetail, detailPayload, detailNote, extractFirstList, topLevelLis,
} = require('../../../lib/plugins/chart-family/shared/mark-detail');

describe('mark-detail — splitDetail', () => {
  test('an item with no sublist returns the whole item as lead, empty detail', () => {
    const { lead, detail } = splitDetail('Visitors <code>12000</code>');
    assert.equal(lead, 'Visitors <code>12000</code>');
    assert.equal(detail, '');
  });

  test('splits the first nested list off as detail, keeping the lead clean', () => {
    const { lead, detail } = splitDetail(
      'Visitors <code>12000</code><ul><li>Top of funnel</li><li>Organic <code>60%</code></li></ul>');
    assert.equal(lead, 'Visitors <code>12000</code>');
    assert.equal(detail, '<li>Top of funnel</li><li>Organic <code>60%</code></li>');
  });

  test('is depth-aware — a sublist nested inside the detail is not truncated', () => {
    const { detail } = splitDetail(
      'A<ul><li>outer<ul><li>inner</li></ul></li></ul>');
    assert.equal(detail, '<li>outer<ul><li>inner</li></ul></li>');
  });
});

describe('mark-detail — detailPayload', () => {
  test('emits nothing when no mark carries detail', () => {
    assert.equal(detailPayload([{ detail: '' }, {}]), '');
  });

  test('emits an inert template per detailed mark, keyed by index', () => {
    const out = detailPayload([{ detail: '<li>x</li>' }, { detail: '' }, { detail: '<li>z</li>' }]);
    assert.match(out, /^<div class="chart-details" hidden>/);
    assert.match(out, /<template class="chart-detail" data-mark="0"><li>x<\/li><\/template>/);
    assert.match(out, /<template class="chart-detail" data-mark="2"><li>z<\/li><\/template>/);
    assert.equal((out.match(/class="chart-detail"/g) || []).length, 2);
  });
});

describe('mark-detail — detailNote', () => {
  test('emits nothing when no mark carries detail', () => {
    assert.equal(detailNote([{ label: 'A', valueRaw: '1' }]), '');
  });

  test('folds label, value and detail items into one comment line per mark', () => {
    const note = detailNote([
      { label: 'Visitors', valueRaw: '12000', detail: '<li>Top of funnel</li><li>Organic <code>60%</code></li>' },
      { label: 'Paid', valueRaw: '864' },
    ]);
    assert.equal(note, '<!-- Visitors (12000): Top of funnel · Organic 60% -->');
  });

  test('neutralizes a stray comment terminator inside the detail', () => {
    const note = detailNote([{ label: 'A', valueRaw: '1', detail: '<li>a --> b</li>' }]);
    assert.doesNotMatch(note.slice(4, -3), /--+>/); // body between <!-- … --> has no terminator
  });
});

describe('mark-detail — extractFirstList / topLevelLis (shared primitives)', () => {
  test('extractFirstList is depth-aware', () => {
    const ext = extractFirstList('x<ul><li>a<ul><li>b</li></ul></li></ul>y');
    assert.equal(ext.inner, '<li>a<ul><li>b</li></ul></li>');
  });

  test('topLevelLis returns only top-level item contents', () => {
    assert.deepEqual(
      topLevelLis('<li>a<ul><li>nested</li></ul></li><li>b</li>'),
      ['a<ul><li>nested</li></ul>', 'b']);
  });
});
