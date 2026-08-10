/**
 * Unit: lib/theme/derive.js — the contrast-aware derivation.
 *
 * The load-bearing guarantee: deriving from any starter essential set yields a
 * COMPLETE token map that is CONTRAST-CLEAN in both canvas modes against the
 * exact pairs the shipped palette gate asserts
 * (test/unit/palette/contrast.test.js). If this passes, a graduated theme
 * passes the gate.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { deriveTheme, validateEssentials, requiredTokenList, ESSENTIAL_KEYS, RAMP_STRATEGIES, normalizeStrategy } = require('../../../lib/theme/derive.js');
const { auditBoth } = require('../../../lib/theme/contrast.js');
const { contrastRatio, oklchToHex } = require('../../../lib/theme/color.js');
const { STARTERS } = require('../../../lib/theme/starters.js');

describe('theme-derive', () => {
  test('validateEssentials rejects malformed input', () => {
    assert.throws(() => validateEssentials(null));
    assert.throws(() => validateEssentials({}), /missing/);
    const partial = { ...STARTERS[0].essentials };
    delete partial.accent;
    assert.throws(() => validateEssentials(partial), /accent/);
    const badHex = { ...STARTERS[0].essentials, bg: 'periwinkle' };
    assert.throws(() => validateEssentials(badHex), /hex/);
  });

  test('every essential key is documented', () => {
    for (const s of STARTERS) {
      for (const k of ESSENTIAL_KEYS) assert.ok(s.essentials[k], `${s.name} missing ${k}`);
    }
  });

  for (const s of STARTERS) {
    test(`derive(${s.name}) yields the complete token contract`, () => {
      const t = deriveTheme(s.essentials);
      const missing = requiredTokenList().filter(k => t[k] == null);
      assert.deepEqual(missing, [], `missing tokens: ${missing.join(', ')}`);
    });

    test(`derive(${s.name}) is contrast-clean in both modes (gate parity)`, () => {
      const t = deriveTheme(s.essentials);
      const audit = auditBoth(t, { level: 'gate' });
      const fmt = a => a.failures.concat(a.missing).map(f => `${f.fill}/${f.ink}=${(f.ratio || 0).toFixed(2)}[${f.status}]`);
      assert.ok(audit.light.ok, `light failures: ${fmt(audit.light).join(', ')}`);
      assert.ok(audit.dark.ok, `dark failures: ${fmt(audit.dark).join(', ')}`);
    });
  }

  test('derivation is deterministic (same input → same output)', () => {
    const a = deriveTheme(STARTERS[0].essentials);
    const b = deriveTheme(STARTERS[0].essentials);
    assert.deepEqual(a, b);
  });

  test('cross-check: a spot pair clears AA via the raw predicate too', () => {
    // Guards against the audit and derivation sharing a hidden mutual bug.
    const t = deriveTheme(STARTERS[0].essentials);
    // The categorical tokens are now flipping light-dark() pairs (three-layer
    // contract), so resolve the mode arm before the raw contrast predicate.
    const arm = (v, m) => {
      const mm = v.match(/^light-dark\(\s*([^,]+),\s*(.+)\)\s*$/);
      return mm ? mm[m].trim() : v;
    };
    assert.ok(contrastRatio(arm(t['text-heading'], 1), arm(t.bg, 1)) >= 4.5);
    // The categorical inks FLIP, so verify the label pairs in BOTH modes plus the
    // graphical edge (mark vs bg ≥ 3) that the pre-#1022 model failed in dark mode.
    for (const m of [1, 2]) {
      assert.ok(contrastRatio(arm(t['cat-1-mark'], m), arm(t['cat-on-mark'], m)) >= 4.5, `cat-1-mark/on-mark mode ${m}`);
      assert.ok(contrastRatio(arm(t['cat-1-fill'], m), arm(t['cat-on-fill'], m)) >= 4.5, `cat-1-fill/on-fill mode ${m}`);
      assert.ok(contrastRatio(arm(t['cat-1-mark'], m), arm(t.bg, m)) >= 3, `cat-1-mark vs bg (edge) mode ${m}`);
    }
  });

  describe('ramp strategy', () => {
    const ESS = STARTERS[0].essentials;

    test('spectrum is the no-regression default — explicit === implicit', () => {
      assert.deepEqual(deriveTheme(ESS), deriveTheme(ESS, { rampStrategy: 'spectrum' }));
    });

    test('an unknown / absent strategy normalizes to spectrum', () => {
      assert.equal(normalizeStrategy('rainbow-sparkle'), 'spectrum');
      assert.equal(normalizeStrategy(undefined), 'spectrum');
      assert.deepEqual(deriveTheme(ESS, { rampStrategy: 'nonsense' }), deriveTheme(ESS));
    });

    // The load-bearing guarantee: the AA promise holds for EVERY strategy the
    // AI might pick — so a user never has to repair a color by hand.
    for (const strategy of RAMP_STRATEGIES) {
      test(`derive(${strategy}) is complete AND contrast-clean in both modes`, () => {
        const t = deriveTheme(ESS, { rampStrategy: strategy });
        const missing = requiredTokenList().filter(k => t[k] == null);
        assert.deepEqual(missing, [], `missing: ${missing.join(', ')}`);
        const audit = auditBoth(t, { level: 'gate' });
        assert.ok(audit.light.ok && audit.dark.ok, `${strategy} not AA-clean`);
      });
    }

    test('the strategy actually changes the categorical hue layout', () => {
      // triad must differ from spectrum somewhere in the cycle (param has effect).
      const spectrum = deriveTheme(ESS, { rampStrategy: 'spectrum' });
      const triad = deriveTheme(ESS, { rampStrategy: 'triad' });
      const differs = Array.from({ length: 12 }, (_, i) => `cat-${i + 1}-mark`)
        .some(k => spectrum[k] !== triad[k]);
      assert.ok(differs, 'triad produced an identical cycle to spectrum');
    });
  });

  // ── The no-safe-default families (#1457) ──────────────────────────────────
  //
  // These three shipped MISSING from the generator, and none of them degrades:
  // the Mermaid map turns a `--c-*` miss into a black sentinel that renders, a
  // `--spectrum` miss invalidates the whole `background:` shorthand it rides in,
  // and `--cat-N-ink` falls back to a mark curated to the 3:1 GRAPHICAL floor.
  // So the assertions here are the same ones the hand-authored palettes are held
  // to — containment-contrast.test.js and the AA text floor — applied to derived
  // output across every starter × every ramp strategy the AI can pick.
  describe('no-safe-default families', () => {
    const arm = (v, m) => {
      const mm = String(v).match(/^light-dark\(\s*(.+?),\s*(.+)\)\s*$/);
      return mm ? mm[m].trim() : v;
    };
    const cases = [];
    for (const s of STARTERS) {
      for (const strategy of RAMP_STRATEGIES) {
        cases.push([`${s.name}/${strategy}`, deriveTheme(s.essentials, { rampStrategy: strategy })]);
      }
    }

    /** Every ink/surface pair of one derived theme, as ratios. */
    const inkRatios = (t) => {
      const out = [];
      for (let m = 1; m <= 2; m++) {
        for (let i = 1; i <= 12; i++) {
          for (const surface of ['bg', 'bg-alt']) {
            out.push([`--cat-${i}-ink on --${surface} (mode ${m})`, contrastRatio(arm(t[`cat-${i}-ink`], m), arm(t[surface], m))]);
          }
        }
      }
      return out;
    };

    test('every categorical ink clears AA as TEXT on both surfaces, in both modes', () => {
      // The mark is repaired to 3:1 (a shape); the same hue as a LABEL needs 4.5:1.
      // That gap is the whole reason this tier exists rather than being borrowed.
      for (const [name, t] of cases) {
        for (const [what, r] of inkRatios(t)) {
          assert.ok(r >= 4.5, `${name}: ${what} is ${r.toFixed(2)}:1`);
        }
      }
    });

    // THE STARTERS ARE TOO KIND TO BE THE ONLY POPULATION. Mutating the tier away
    // entirely — `cat-N-ink := cat-N-mark`, i.e. exactly the pre-#1457 fallback —
    // fails the test above on ONE assertion out of 960, at 4.47 against a 4.50
    // threshold. Any retune of DEEP_L, any starter `bg` change, any gamut-clip
    // rounding shift takes that pair over the line and the test goes green with the
    // tier deleted. So the real bite comes from the population the decision record
    // measures on: seeded pseudo-random essential sets, where the fallback fails on
    // 23-34 of 200 themes under the hue-spread ramps and 176 of 200 under brand-mono.
    // Seeded, so it is a fixed test rather than a flaky one.
    test('BITES on sampled essential sets, where deleting the tier fails in bulk', () => {
      const sample = (strategy, n) => {
        let seed = 42;
        const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
        const out = [];
        for (let k = 0; k < n; k++) {
          const h = rnd() * 360;
          const bgL = 0.9 + rnd() * 0.09;
          out.push(deriveTheme({
            bg: oklchToHex({ L: bgL, C: 0.005, h }),
            bgAlt: oklchToHex({ L: bgL - 0.03 - rnd() * 0.06, C: 0.01, h }),
            textHeading: oklchToHex({ L: 0.15 + rnd() * 0.1, C: 0.02, h }),
            textBody: oklchToHex({ L: 0.35 + rnd() * 0.1, C: 0.02, h }),
            textMuted: oklchToHex({ L: 0.6, C: 0.02, h }),
            accent: oklchToHex({ L: 0.35 + rnd() * 0.3, C: 0.1 + rnd() * 0.08, h }),
            accentSoft: oklchToHex({ L: 0.92, C: 0.03, h }),
            pass: '#1F7A4D', warn: '#B26A00', fail: '#C0392B',
          }, { rampStrategy: strategy }));
        }
        return out;
      };
      // The mutant: what every consumer resolves to when the tier is absent.
      const asFallback = (t) => ({ ...t, ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`cat-${i + 1}-ink`, t[`cat-${i + 1}-mark`]])) });

      for (const strategy of RAMP_STRATEGIES) {
        const themes = sample(strategy, 40);
        const failing = (list) => list.filter(t => inkRatios(t).some(([, r]) => r < 4.5)).length;
        assert.equal(failing(themes), 0, `${strategy}: the derived tier must clear AA on every sampled theme`);
        // And prove the assertion can fail: without the tier, this population does.
        const mutantFailures = failing(themes.map(asFallback));
        assert.ok(mutantFailures > 0,
          `${strategy}: deleting the ink tier left every sampled theme AA-clean — this test cannot see the defect it exists for`);
      }
    });

    test('the containment tier is legible — ink AA on its rung, edge 3:1 on the fill it outlines', () => {
      for (const [name, t] of cases) {
        for (let m = 1; m <= 2; m++) {
          for (const [rung, edge, ink] of [
            ['c-container', 'c-container-edge', 'c-on-container'],
            ['c-subcontainer', 'c-subcontainer-edge', 'c-on-subcontainer'],
          ]) {
            const fill = arm(t[rung], m);
            const inkRatio = contrastRatio(arm(t[ink], m), fill);
            const edgeRatio = contrastRatio(arm(t[edge], m), fill);
            assert.ok(inkRatio >= 4.5, `${name}: --${ink} on --${rung} (mode ${m}) is ${inkRatio.toFixed(2)}:1`);
            assert.ok(edgeRatio >= 3, `${name}: --${edge} on --${rung} (mode ${m}) is ${edgeRatio.toFixed(2)}:1`);
          }
        }
      }
    });

    test('the containment ladder never steps back toward the canvas', () => {
      // Same assertion containment-contrast.test.js makes of the hand-authored
      // palettes, and it is on RELATIVE LUMINANCE — the derivation checks its own
      // step against that predicate rather than trusting OKLCH lightness to agree.
      const lum = (hex) => {
        const h = hex.replace('#', '');
        const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
          .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      for (const [name, t] of cases) {
        for (let m = 1; m <= 2; m++) {
          const [lc, l1, l2] = ['bg', 'c-container', 'c-subcontainer'].map(k => lum(arm(t[k], m)));
          assert.notEqual(l1, lc, `${name} (mode ${m}): --c-container IS the canvas — no ladder at all`);
          assert.ok((l1 - lc) * (l2 - l1) > 0, `${name} (mode ${m}): --c-subcontainer steps back toward the canvas`);
        }
      }
    });

    test('the spectrum ribbon is a usable gradient value, and the mono ramp keeps one hue', () => {
      for (const [name, t] of cases) {
        assert.match(t.spectrum, /^linear-gradient\(90deg, #[0-9a-f]{6} 0%, #[0-9a-f]{6} 55%, #[0-9a-f]{6} 100%\)$/, name);
        assert.match(t['spectrum-vertical'], /^linear-gradient\(180deg, /, name);
        assert.match(t['spectrum-end'], /^#[0-9a-f]{6}$/, name);
        // One line, no semicolon: it is serialized into a `--token: value;` line and
        // parsed back by a `[^;]+` reader (theme-serialize.test.js).
        assert.ok(!/[\n;]/.test(t.spectrum), `${name}: the ribbon must serialize on one line`);
      }
      // The endpoint follows the ramp strategy, so a single-hue theme gets a
      // single-hue ribbon instead of a rainbow that contradicts the rest of it.
      const mono = deriveTheme(STARTERS[0].essentials, { rampStrategy: 'brand-mono' });
      const wheel = deriveTheme(STARTERS[0].essentials, { rampStrategy: 'spectrum' });
      assert.notEqual(mono['spectrum-end'], wheel['spectrum-end']);
    });

    test('derivation never throws for a valid essential set, however hostile the canvas', () => {
      // The open risk #1457 flagged: porting the ink solver brought two throwing
      // failure paths into a browser-facing generator. They are non-strict here —
      // an unsolvable slot degrades to its most legible shade and is reported, it
      // does not become a stack trace mid-edit.
      //
      // The condition that makes `solveInk` return null is a canvas pair that
      // STRADDLES: one surface wants a dark ink and the other a light one, so no
      // shade of any hue clears 4.5:1 against both. A near-white `--bg` with a
      // near-black `--bg-alt` is a legal essential set and does exactly that — the
      // solver's own unit test proves this input degrades 12 slots and throws under
      // `strict`, so this assertion is not vacuous.
      const cruel = {
        ...STARTERS[0].essentials,
        bg: '#FFFFFF', bgAlt: '#111111',
        accent: '#7F8081', accentSoft: '#7E7F80',
      };
      for (const strategy of RAMP_STRATEGIES) {
        const t = deriveTheme(cruel, { rampStrategy: strategy });
        assert.ok(requiredTokenList().every(k => t[k] != null), `${strategy}: incomplete map`);
      }
    });
  });
});
