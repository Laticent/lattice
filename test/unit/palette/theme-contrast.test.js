/**
 * Unit: lib/theme/contrast.js — the Workbench's contrast meter / auditor.
 * Verifies it resolves light-dark()/var() per mode, reports pass/fail/missing,
 * and that `meter()` reports the WCAG tiers a live UI paints.
 *
 * Since the separation tier landed, it also verifies the SECOND predicate: an
 * OKLab distance between two inks, which is not a contrast ratio and must not be
 * reported as one.
 */

const fs = require('node:fs');
const path = require('node:path');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveVars, readableHex, auditVars, auditBoth, meter, separationPairs, SEPARATION_FLOOR,
} = require('../../../lib/theme/contrast.js');
const { deriveTheme, requiredTokenList } = require('../../../lib/theme/derive.js');
const { STARTERS } = require('../../../lib/theme/starters.js');

/**
 * The ink trio every separation row stands on. Hand-built fixtures below carry it
 * so the rows read `pass`/`fail` on their own merits rather than `missing` — a
 * fixture that omits the tier is testing the absence, which is its own test.
 */
const INKS = { 'text-body': '#333333', 'text-secondary': '#5a5a5a', 'text-muted': '#767676' };

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
      'cat-on-mark': '#ffffff', ...INKS,
    };
    // add 12 light + 12 deep pairs that all pass, plus the on-canvas ink tier the
    // contract carries since #1457 (the same hue as LABEL TEXT on --bg / --bg-alt)
    for (let i = 1; i <= 12; i++) {
      clean[`cat-${i}-fill`] = '#f4f4f4';
      clean[`cat-${i}-mark`] = '#222222';
      clean[`cat-${i}-ink`] = '#222222';
    }
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
      'text-body': 'light-dark(#333333, #dddddd)',
      'text-secondary': 'light-dark(#5a5a5a, #b4b4b4)',
      'text-muted': 'light-dark(#767676, #949494)',
    };
    for (let i = 1; i <= 12; i++) {
      vars[`cat-${i}-fill`] = '#f4f4f4';
      vars[`cat-${i}-mark`] = '#222222';
      vars[`cat-${i}-ink`] = 'light-dark(#222222, #dddddd)'; // flips with the canvas
    }
    const both = auditBoth(vars, { level: 'gate' });
    assert.ok(both.light.ok);
    assert.ok(!both.dark.ok); // heading on dark canvas fails
    assert.ok(!both.ok);
  });

  // ── The separation tier ───────────────────────────────────────────────────
  //
  // A DIFFERENT PREDICATE from every other row: an OKLab distance between two
  // INKS, with no canvas in it. It exists because `checkMutedTierFloors` measures
  // this only over `themes/` — a population a Studio-fabricated theme never joins
  // — while this module is the meter the Studio actually shows.
  describe('separation rows', () => {
    const withInks = (over = {}) => ({
      bg: '#ffffff', 'bg-alt': '#ffffff', 'text-heading': '#000000',
      'cat-on-fill': '#111111', 'cat-on-mark': '#ffffff',
      ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap((i) => [
        [`cat-${i}-fill`, '#f4f4f4'], [`cat-${i}-mark`, '#222222'], [`cat-${i}-ink`, '#222222'],
      ])),
      ...INKS,
      ...over,
    });
    const rowFor = (vars, role, mode = 'light') =>
      auditVars(vars, { mode }).results.find((r) => r.role === role);

    /**
     * THE DUPLICATION PIN. `SEPARATION_FLOOR` is written as a literal here rather
     * than imported from `tools/check-ownership.js`, because a floor that moves with
     * its producer cannot fail for the reason that matters (#1720 §5). This test is
     * what makes that duplication safe: the two literals may be re-tuned together on
     * purpose, never drift apart by accident.
     *
     * Read out of the gate's SOURCE TEXT, not by requiring it — `check-ownership.js`
     * does not export the constant, and a test that quietly fell back to a default
     * when the read failed would pin nothing. An unmatched pattern is an error.
     */
    test('SEPARATION_FLOOR equals checkMutedTierFloors MUTED_SEPARATION_FLOOR', () => {
      const gate = fs.readFileSync(
        path.join(__dirname, '../../../tools/check-ownership.js'), 'utf8');
      const m = gate.match(/^const MUTED_SEPARATION_FLOOR = ([\d.]+);$/m);
      assert.ok(m, 'could not find MUTED_SEPARATION_FLOOR in tools/check-ownership.js — '
        + 'if it was renamed or reshaped, re-point this pin rather than deleting it');
      assert.equal(Number(m[1]), SEPARATION_FLOOR,
        `the Studio meter's floor (${SEPARATION_FLOOR}) has drifted from the build gate's `
        + `(${m[1]}). They are duplicated on purpose; move them together.`);
    });

    test('covers exactly the two de-emphasis tiers, against body', () => {
      assert.deepEqual(
        separationPairs().map(([quiet, loud, floor]) => [quiet, loud, floor]),
        [['text-muted', 'text-body', SEPARATION_FLOOR], ['text-secondary', 'text-body', SEPARATION_FLOOR]],
      );
    });

    test('a separation row never carries a ratio, and a contrast row never a distance', () => {
      const results = auditVars(withInks(), { mode: 'light', level: 'full' }).results;
      const sep = results.filter((r) => r.kind === 'separation');
      const con = results.filter((r) => r.kind === 'contrast');
      assert.equal(sep.length, 2);
      assert.ok(con.length > 20);
      for (const r of sep) {
        assert.equal(r.ratio, null, `${r.role} put a number in the ratio field`);
        assert.equal(typeof r.distance, 'number');
      }
      for (const r of con) assert.equal(r.distance, undefined, `${r.role} grew a distance`);
      // Every row is tagged; nothing is left kind-less for a consumer to guess about.
      assert.ok(results.every((r) => r.kind === 'contrast' || r.kind === 'separation'));
    });

    test('BITES: muted collapsed onto body fails, and drags the whole audit down', () => {
      const ok = auditVars(withInks(), { mode: 'light' });
      assert.equal(rowFor(withInks(), 'muted-separation').status, 'pass');
      assert.ok(ok.ok);

      // Byte-identical — #1715's inversion built exactly this from plausible essentials.
      const collapsed = withInks({ 'text-muted': '#333333' });
      const row = rowFor(collapsed, 'muted-separation');
      assert.equal(row.status, 'fail');
      assert.equal(row.distance, 0);
      assert.ok(!auditVars(collapsed, { mode: 'light' }).ok, 'a collapsed tier must sink `ok`');
      assert.ok(auditVars(collapsed, { mode: 'light' }).failures.some((f) => f.role === 'muted-separation'));
    });

    test('BITES: secondary collapsed onto body fails independently of muted', () => {
      const collapsed = withInks({ 'text-secondary': '#333333' });
      assert.equal(rowFor(collapsed, 'secondary-separation').status, 'fail');
      assert.equal(rowFor(collapsed, 'muted-separation').status, 'pass');
    });

    /**
     * THE BOUNDARY, both sides. A floor is a claim about one number; a test that only
     * shows a collapse proves the row fires, not that it fires HERE.
     */
    test('the floor bites at the floor: just under fails, just over passes', () => {
      // #767676 vs #333333 is ~0.19 apart, so walk body toward muted instead.
      const near = (hex) => rowFor(withInks({ 'text-body': hex }), 'muted-separation').distance;
      // #6c6c6c is 0.0346 from muted and #6f6f6f is 0.0241 — the pair straddles 0.030.
      const inks = ['#686868', '#6a6a6a', '#6c6c6c', '#6f6f6f', '#737373', '#767676'];
      const readings = inks.map((h) => ({ h, d: near(h) }));
      const under = readings.filter((r) => r.d < SEPARATION_FLOOR);
      const over = readings.filter((r) => r.d >= SEPARATION_FLOOR);
      assert.ok(under.length && over.length,
        `expected the sweep to straddle ${SEPARATION_FLOOR}: ${JSON.stringify(readings)}`);
      for (const { h } of under) {
        assert.equal(rowFor(withInks({ 'text-body': h }), 'muted-separation').status, 'fail');
      }
      for (const { h } of over) {
        assert.equal(rowFor(withInks({ 'text-body': h }), 'muted-separation').status, 'pass');
      }
    });

    test('an unresolved color-mix() is SKIPPED, not silently passed', () => {
      const mixed = withInks({ 'text-muted': 'color-mix(in oklab, #333333 90%, #ffffff)' });
      const row = rowFor(mixed, 'muted-separation');
      assert.equal(row.status, 'skipped');
      assert.equal(row.distance, null);
      assert.equal(row.ratio, null);
      // `skipped` is not a failure and not a pass — but it DOES sink `ok`, and this
      // assertion used to say the opposite. An unmeasured row is a hole in the
      // evidence, and a verdict that ignores it certifies something nobody checked:
      // a map of all 107 contract tokens set to `oklch(50% 0.1 250)` returned
      // `ok: true` with every row skipped. See auditVars's header.
      const v = auditVars(mixed, { mode: 'light' });
      assert.equal(v.ok, false, 'an unmeasured row must not report a clean bill of health');
      assert.equal(v.failures.length, 0, 'and it is still NOT a failure');
      assert.deepEqual(v.skipped.map(r => r.role), ['muted-separation']);
      assert.deepEqual(v.skipped[0].unreadable, ['text-muted'], 'names the operand it could not read');
    });

    test('an absent tier reports MISSING, distinctly from a failure', () => {
      const bare = { ...withInks() };
      delete bare['text-muted'];
      const row = rowFor(bare, 'muted-separation');
      assert.equal(row.status, 'missing');
      assert.equal(row.distance, null);
      assert.ok(!auditVars(bare, { mode: 'light' }).ok, 'a missing tier is not a pass');
    });

    /**
     * FAIL CLOSED — the reachable half, pinned as a PROPERTY over hostile values
     * rather than as a list of payloads.
     *
     * BE PRECISE ABOUT WHAT THIS DOES AND DOES NOT PROVE, because the first cut of it
     * proved nothing. `evalSeparation` guards with `Number.isFinite(distance)` before
     * comparing, and behind the `isHex` gate above that arm is UNREACHABLE: `isHex`
     * admits exactly 3- and 6-digit hex, which is exactly what `oklabDistance` reads,
     * so a measured row can never be NaN. A test asserting `Number.isFinite(NaN) &&
     * ... === false` therefore stays green when the guard is deleted — it re-states
     * JavaScript, not this module. The guard is kept as insurance for the day `isHex`
     * widens; the test below is what actually bites.
     *
     * WHAT IT BITES: every value a resolver can hand this module that it cannot
     * measure must come back NOT-PASS and must not THROW. The throw matters more than
     * it looks — `normalizeHex` raises on anything it cannot read, and an exception
     * here takes out the Studio's whole audit panel rather than one row. `#rrggbbaa`
     * is the live example: legal CSS an author can type today, rejected by `isHex`
     * today, and one widening away from reaching `oklabDistance`.
     */
    test('FAILS CLOSED: nothing unmeasurable becomes a pass, and nothing throws', () => {
      const hostile = [
        '#11223344',                                  // 8-digit hex — legal CSS, not readable here
        'color-mix(in oklab, #333333 90%, #ffffff)',  // left unresolved by resolveVars
        'var(--nope)',                                // a chain the resolver could not close
        'rgb(51 51 51)', 'oklch(0.4 0 0)', 'transparent', 'currentColor',
        '', '   ', 'periwinkle', '#12345', 12345, null, undefined, {},
      ];
      for (const value of hostile) {
        const vars = { ...withInks(), 'text-muted': value };
        let row;
        assert.doesNotThrow(() => { row = rowFor(vars, 'muted-separation'); },
          `--text-muted: ${String(value)} threw; one bad token must not take the panel down`);
        assert.notEqual(row.status, 'pass',
          `--text-muted: ${String(value)} was measured into a PASS`);
        assert.equal(row.distance, null,
          `--text-muted: ${String(value)} produced a distance it cannot have`);
      }
    });

    test('auditBoth measures the tier in BOTH modes', () => {
      // Clean on light, collapsed on dark — the mode-asymmetric case the meter's
      // worst-wins reduction exists for.
      const vars = {
        ...withInks(),
        bg: 'light-dark(#ffffff, #000000)', 'bg-alt': 'light-dark(#ffffff, #000000)',
        'text-heading': 'light-dark(#000000, #ffffff)',
        'text-body': 'light-dark(#333333, #dddddd)',
        'text-secondary': 'light-dark(#5a5a5a, #b4b4b4)',
        'text-muted': 'light-dark(#767676, #dddddd)',
        ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) =>
          [`cat-${i}-ink`, 'light-dark(#222222, #dddddd)'])),
      };
      const both = auditBoth(vars);
      assert.equal(both.light.results.find((r) => r.role === 'muted-separation').status, 'pass');
      assert.equal(both.dark.results.find((r) => r.role === 'muted-separation').status, 'fail');
      assert.ok(!both.ok);
    });

    test('the `separation` view is the same rows as `results`, not a second population', () => {
      const a = auditVars(withInks(), { mode: 'light' });
      assert.deepEqual(a.separation, a.results.filter((r) => r.kind === 'separation'));
      assert.equal(a.total, a.results.length);
      // `ok` counts each row once: a collapse shows up exactly once in `failures`.
      const bad = auditVars(withInks({ 'text-muted': '#333333' }), { mode: 'light' });
      assert.equal(bad.failures.filter((f) => f.role === 'muted-separation').length, 1);
    });

    test('present at BOTH audit levels — separation is not a stricter contrast bar', () => {
      for (const level of ['gate', 'full']) {
        assert.equal(auditVars(withInks(), { mode: 'light', level }).separation.length, 2, level);
      }
    });
  });

  /**
   * THE UNREADABLE-PALETTE HOLE (#1841). The auditor's verdict counted `skipped` as
   * neither a failure nor a missing token, so a palette it could not read at all
   * came back clean. The exact map from the design note is pinned here rather than
   * a smaller stand-in, because the number that makes it indefensible is that
   * NOTHING was measured — not that one row was.
   */
  describe('an unreadable palette is not a clean one', () => {
    const allOklch = () => {
      const map = {};
      for (const n of requiredTokenList()) map[n] = 'oklch(50% 0.1 250)';
      return map;
    };

    test('a 108-token map of oklch() does NOT return ok:true', () => {
      const map = allOklch();
      // 107 when the note measured it; 108 since `--seq-500` joined the contract
      // (the sequential ramp's anchor — the base's `var(--accent)` fallback is
      // near-white on a dark canvas, so the derived stops collapse). The count is
      // pinned deliberately: it is the tripwire for the map silently SHRINKING,
      // which is what would make the "nothing was measured" finding unreproducible.
      assert.equal(Object.keys(map).length, 108, 'the full contract, as the note measured it');
      for (const level of ['gate', 'full']) {
        const a = auditBoth(map, { level });
        assert.equal(a.ok, false, `${level}: an unreadable palette must not report AA`);
        assert.equal(a.light.failures.length, 0, `${level}: and it is not reported as failing either`);
        assert.equal(a.light.missing.length, 0, `${level}: the tokens are all present`);
        assert.equal(a.light.skipped.length, a.light.total, `${level}: every row is unmeasured`);
      }
    });

    test('the other hand-edit arrivals are unreadable too, and say which operand', () => {
      for (const value of ['color-mix(in srgb, #fff 50%, #000)', 'rgb(10 20 30)', 'hsl(200 50% 40%)', 'rebeccapurple', '#aabbcc80', 'var(--nope)']) {
        const map = { ...INKS, bg: value, 'text-heading': '#000000' };
        const row = auditVars(map, { mode: 'light' }).results.find((r) => r.role === 'heading' && r.fill === 'bg');
        assert.equal(row.status, 'skipped', `${value} must not be measured`);
        assert.deepEqual(row.unreadable, ['bg'], `${value} must name the operand`);
      }
    });

    test('a FULLY OPAQUE 8- or 4-digit hex IS measured — it is exactly the 6-digit color', () => {
      // The one widening: `#000000ff` is not an approximation of `#000000`, so
      // refusing to measure it would be a false alarm on a legitimate hand edit.
      // The alpha is dropped; the remaining bytes are carried as written.
      assert.equal(readableHex('#000000ff'), '#000000');
      assert.equal(readableHex('#000f'), '#000');
      assert.equal(readableHex('#FFFFFFFF'), '#FFFFFF');
      assert.equal(readableHex('#AABBCC'), '#AABBCC');
      const map = { ...INKS, bg: '#ffffffff', 'text-heading': '#000000ff' };
      const row = auditVars(map, { mode: 'light' }).results.find((r) => r.role === 'heading' && r.fill === 'bg');
      assert.equal(row.status, 'pass');
      assert.equal(Math.round(row.ratio), 21);
    });

    test('a TRANSLUCENT alpha is NOT measured — the composite depends on the backdrop', () => {
      assert.equal(readableHex('#00000080'), null);
      assert.equal(readableHex('#0008'), null);
      assert.equal(readableHex('#000000fe'), null, 'nearly opaque is still not opaque');
    });

    test('every derived starter still measures completely — the fix costs no false alarm', () => {
      for (const s of STARTERS) {
        const a = auditBoth(deriveTheme(s.essentials), { level: 'full' });
        assert.equal(a.light.skipped.length + a.dark.skipped.length, 0, `${s.name} must be fully measurable`);
        assert.equal(a.ok, true, `${s.name} must still pass`);
      }
    });
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
