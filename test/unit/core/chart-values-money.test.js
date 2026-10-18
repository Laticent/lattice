// lib/core/chart-values.js — a global client's money is read, keyed and SPOKEN as the number it
// plots. Before, `4,2 Mio. €` was said as "forty-two Mio. €" over a chart showing 4.2 million, and
// `EUR 4.2M` was said as the glyphs "EUR4.2M"
// (engineering/decisions/2026-10-15-business-deck-gaps.md §7.3).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toSpokenText } = require('@laticent/cadenza');
const { isValuePill, parseValue, unitKey } = require('../../../lib/core/chart-values.js');
const { spokenValue } = require('../../../lib/core/chart-values-speech.js');

test('every money form a global client writes is a value', () => {
  for (const [s, v] of [['EUR 4.2M', 4.2e6], ['US$4.2M', 4.2e6], ['4.2M €', 4.2e6], ['4,2 Mio. €', 4.2e6], ['USD 250mn', 2.5e8], ['4 200 €', 4200]]) {
    assert.equal(isValuePill(s), true, s);
    assert.equal(parseValue(s), v, s);
  }
  assert.equal(isValuePill('FTC 2025'), false);
});

test('money is spoken as the number it plots, in the currency\'s own name', () => {
  const cases = [
    ['EUR 4.2M', 'four point two million euros'],
    ['4.2M €', 'four point two million euros'],
    ['4,2 Mio. €', 'four point two million euros'],
    ['-EUR 4.2M', 'down four point two million euros'],
    ['USD 250mn', 'two hundred fifty million US dollars'],
    ['US$4.2M', 'four point two million US dollars'],
    ['¥420M', 'four hundred twenty million yen'],
    ['₹4.2Cr', 'forty-two million rupees'],
    ['4200€', 'four thousand two hundred euros'],
    ['1 €', 'one euro'],
    ['5 Mrd', 'five billion'],
  ];
  for (const [s, said] of cases) assert.equal(spokenValue(s, toSpokenText), said, s);
});

test('what the speech reader already said is unchanged', () => {
  for (const [s, said] of [['$4.2M', 'four point two million dollars'], ['€4.2M', 'four point two million euros'], ['12%', 'twelve percent'], ['2024', 'two thousand twenty-four'], ['15mn', '15mn']]) {
    assert.equal(spokenValue(s, toSpokenText), said, s);
  }
});

test('a currency key ignores the magnitude however it is written', () => {
  assert.equal(unitKey('4,2 Mio. €'), unitKey('4.2M €'));
  assert.equal(unitKey('EUR 4.2M'), 'EUR');
  assert.equal(unitKey('41 TB'), 'tb');
});

// The independent checker's findings on the first draft: each of these changed on a real deck.
test('a symbol that is not a currency is said as it always was', () => {
  for (const [s, said] of [['±3%', 'plus or minus three percent'], ['(§5)', 'section five'], ['#616', 'number six hundred sixteen'], ['250 FTE', 'two hundred fifty FTE'], ['3 SKU', 'three skew'], ['99¢', '99¢'], ['>50%', '>50%']]) {
    assert.equal(spokenValue(s, toSpokenText), said, s);
  }
});

test('a currency with a unit beside it is not money', () => {
  for (const s of ['EUR 12%', 'USD 4bps', 'EUR 5 beds', 'EUR 12kg', '12% EUR']) assert.equal(isValuePill(s), false, s);
});

test('a typo inside a money form is malformed, not a different number', () => {
  for (const s of ['EUR --4M', '--4M €', 'EUR 1,2,3', '4.2M €€', '1.2.3.4 €']) assert.ok(Number.isNaN(parseValue(s)), s);
});

test('a hostile 50,000-character pill reads in linear time', () => {
  const t0 = performance.now();
  for (const s of ['1 '.repeat(25_000) + 'x', '9'.repeat(50_000) + ' EURx', '€' + '1 '.repeat(25_000) + 'Crx']) {
    isValuePill(s);
    parseValue(s);
  }
  // The first draft took 2 to 13 s on these; the ceiling only has to catch the quadratic shape.
  assert.ok(performance.now() - t0 < 500, `${Math.round(performance.now() - t0)} ms`);
});
