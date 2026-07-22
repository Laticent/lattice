/**
 * Unit: lib/theme/contrast.js — the Workbench's contrast meter / auditor.
 * Verifies it resolves light-dark()/var() per mode, reports pass/fail/missing,
 * and that `meter()` reports the WCAG tiers a live UI paints.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { resolveVars, auditVars, auditBoth, meter } = require('../../../lib/theme/contrast.js');

describe('theme-contrast', () => {
  test('resolveVars resolves light-dark() per mode', () => {
    const vars = { bg: 'light-dark(#ffffff, #000000)' };
    assert.equal(resolveVars(vars, 'light').bg, '#ffffff');
    assert.equal(resolveVars(vars, 'dark').bg, '#000000');
  });

  test('resolveVars chases var() references', () => {
    const vars = { a: '#123456', b: 'var(--a)' };
    assert.equal(resolveVars(vars, 'light').b, '#123456');
  });

  test('auditVars flags a failing pair and passes a clean one', () => {
    const clean = {
      bg: '#ffffff', 'bg-alt': '#ffffff', 'text-heading': '#000000',
      'cat-on-mark': '#ffffff',
    };
    // add 12 light + 12 deep pairs that all pass
    for (let i = 1; i <= 12; i++) { clean[`cat-${i}-fill`] = '#f4f4f4'; clean[`cat-${i}-mark`] = '#222222'; }
    clean['cat-on-fill'] = '#111111';
    const ok = auditVars(clean, { mode: 'light', level: 'gate' });
    assert.ok(ok.ok, JSON.stringify(ok.failures.concat(ok.missing)));

    const broken = { ...clean, 'text-heading': '#eeeeee' }; // heading no longer reads on white
    const bad = auditVars(broken, { mode: 'light', level: 'gate' });
    assert.ok(!bad.ok);
    assert.ok(bad.failures.some(f => f.role === 'heading'));
  });

  test('auditVars reports missing tokens distinctly from failures', () => {
    const r = auditVars({ bg: '#ffffff' }, { mode: 'light', level: 'gate' });
    assert.ok(r.missing.length > 0);
    assert.ok(!r.ok);
  });

  test('auditBoth requires both modes to pass', () => {
    // heading reads on white (light) but its dark side is set too dark on black
    const vars = {
      bg: 'light-dark(#ffffff, #000000)', 'bg-alt': 'light-dark(#ffffff, #000000)',
      'text-heading': 'light-dark(#000000, #050505)',
      'cat-on-fill': '#000000', 'cat-on-mark': '#ffffff',
    };
    for (let i = 1; i <= 12; i++) { vars[`cat-${i}-fill`] = '#f4f4f4'; vars[`cat-${i}-mark`] = '#222222'; }
    const both = auditBoth(vars, { level: 'gate' });
    assert.ok(both.light.ok);
    assert.ok(!both.dark.ok); // heading on dark canvas fails
    assert.ok(!both.ok);
  });

  test('meter reports WCAG tiers', () => {
    const m = meter('#000000', '#ffffff');
    assert.equal(m.AA, true);
    assert.equal(m.AAA, true);
    assert.equal(m.rounded, 21);
    const low = meter('#777777', '#ffffff');
    assert.equal(low.AA, false);
  });
});
