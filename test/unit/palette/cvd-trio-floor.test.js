/**
 * Unit: a status trio that is CVD-distinct today stays CVD-distinct.
 *
 * `test/unit/palette/cvd-palette.test.js` gates the four a11y CVD palettes, which
 * are curated for separation. Nothing gated the FOURTEEN brand palettes, and
 * `tools/cvd-audit.js` is a report that exits 0 — so a re-tune driven by some other
 * constraint could collapse a pair with every gate green.
 *
 * It nearly did. #1640 darkened `--pass` on ardesia / brina / laguna to clear AA on
 * redline's own-hue band; measured afterwards, pass↔fail under PROTANOPIA went
 * 0.158 -> 0.094 on ardesia and 0.152 -> 0.087 on laguna, straight through the 0.15
 * collapse floor `cvd-audit` uses. laguna's shipped value was not an accident —
 * CHANGELOG.md records it as "chosen so it still holds the >=0.15 protanopia
 * pass<->fail CVD floor". That is the #1181 shape: a re-tune satisfying its own
 * surface and breaking a distant one through a shared channel (HARD RULE #18). The
 * fix was to solve both tokens together, and this is the gate that would have seen
 * it.
 *
 * WHAT IS FROZEN is the SET of pairs that are distinct (OKLab dE >= 0.15) under a
 * deficiency today — not their exact distances, which would be noise. The brand
 * palettes are not CVD-curated, so many pairs sit below the floor and always have;
 * demanding they all clear it would be a different change (the a11y palettes exist
 * for that). This asserts only "what is distinct stays distinct".
 *
 * If this fails: a token move collapsed a pair. Solve the trio TOGETHER — move the
 * companion token, or spend hue rather than lightness (that is what carried
 * magnolia's `--fail`, which needed +0.084 L and -14 deg of hue to clear its band
 * without closing on `--warn`). Do not delete the key.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { simulate } = require('../../../lib/theme/cvd.js');
const { oklabDistance } = require('../../../lib/theme/color.js');
const { resolveTokenExpr } = require('../../../lib/core/resolve-token-expr.js');
const { mergedVars, listAllThemes } = require('../../../tools/composed-contrast.js');

// The same floor tools/cvd-audit.js uses for an induced collapse.
const COLLAPSE = 0.15;
const TRIO = ['pass', 'warn', 'fail'];
const TYPES = ['protanopia', 'deuteranopia', 'tritanopia'];

/** theme|mode|a^b|deficiency — distinct today, and must stay distinct. */
const CVD_DISTINCT = new Set([
  'a11y-achromatopsia|light|warn^fail|protanopia',
  'a11y-achromatopsia|light|warn^fail|deuteranopia',
  'a11y-achromatopsia|light|warn^fail|tritanopia',
  'a11y-achromatopsia|dark|warn^fail|protanopia',
  'a11y-achromatopsia|dark|warn^fail|deuteranopia',
  'a11y-achromatopsia|dark|warn^fail|tritanopia',
  'a11y-base|light|pass^warn|tritanopia',
  'a11y-base|light|pass^fail|tritanopia',
  'a11y-base|dark|pass^warn|tritanopia',
  'a11y-base|dark|pass^fail|tritanopia',
  'a11y-deuteranopia|light|pass^warn|protanopia',
  'a11y-deuteranopia|light|pass^warn|deuteranopia',
  'a11y-deuteranopia|light|pass^warn|tritanopia',
  'a11y-deuteranopia|light|pass^fail|protanopia',
  'a11y-deuteranopia|light|pass^fail|deuteranopia',
  'a11y-deuteranopia|light|pass^fail|tritanopia',
  'a11y-deuteranopia|light|warn^fail|protanopia',
  'a11y-deuteranopia|light|warn^fail|deuteranopia',
  'a11y-deuteranopia|light|warn^fail|tritanopia',
  'a11y-deuteranopia|dark|pass^warn|protanopia',
  'a11y-deuteranopia|dark|pass^warn|deuteranopia',
  'a11y-deuteranopia|dark|pass^warn|tritanopia',
  'a11y-deuteranopia|dark|pass^fail|protanopia',
  'a11y-deuteranopia|dark|pass^fail|deuteranopia',
  'a11y-deuteranopia|dark|pass^fail|tritanopia',
  'a11y-deuteranopia|dark|warn^fail|protanopia',
  'a11y-deuteranopia|dark|warn^fail|deuteranopia',
  'a11y-deuteranopia|dark|warn^fail|tritanopia',
  'a11y-protanopia|light|pass^warn|protanopia',
  'a11y-protanopia|light|pass^warn|deuteranopia',
  'a11y-protanopia|light|pass^warn|tritanopia',
  'a11y-protanopia|light|pass^fail|protanopia',
  'a11y-protanopia|light|pass^fail|deuteranopia',
  'a11y-protanopia|light|pass^fail|tritanopia',
  'a11y-protanopia|light|warn^fail|protanopia',
  'a11y-protanopia|light|warn^fail|deuteranopia',
  'a11y-protanopia|light|warn^fail|tritanopia',
  'a11y-protanopia|dark|pass^warn|protanopia',
  'a11y-protanopia|dark|pass^warn|deuteranopia',
  'a11y-protanopia|dark|pass^warn|tritanopia',
  'a11y-protanopia|dark|pass^fail|protanopia',
  'a11y-protanopia|dark|pass^fail|deuteranopia',
  'a11y-protanopia|dark|pass^fail|tritanopia',
  'a11y-protanopia|dark|warn^fail|protanopia',
  'a11y-protanopia|dark|warn^fail|deuteranopia',
  'a11y-protanopia|dark|warn^fail|tritanopia',
  'a11y-tritanopia|light|pass^warn|tritanopia',
  'a11y-tritanopia|light|pass^fail|protanopia',
  'a11y-tritanopia|light|pass^fail|deuteranopia',
  'a11y-tritanopia|light|pass^fail|tritanopia',
  'a11y-tritanopia|light|warn^fail|protanopia',
  'a11y-tritanopia|light|warn^fail|deuteranopia',
  'a11y-tritanopia|light|warn^fail|tritanopia',
  'a11y-tritanopia|dark|pass^warn|tritanopia',
  'a11y-tritanopia|dark|pass^fail|protanopia',
  'a11y-tritanopia|dark|pass^fail|deuteranopia',
  'a11y-tritanopia|dark|pass^fail|tritanopia',
  'a11y-tritanopia|dark|warn^fail|protanopia',
  'a11y-tritanopia|dark|warn^fail|deuteranopia',
  'a11y-tritanopia|dark|warn^fail|tritanopia',
  'ardesia|light|pass^warn|tritanopia',
  'ardesia|light|pass^fail|protanopia',
  'ardesia|light|pass^fail|tritanopia',
  'ardesia|light|warn^fail|protanopia',
  'ardesia|dark|pass^warn|tritanopia',
  'ardesia|dark|pass^fail|protanopia',
  'ardesia|dark|pass^fail|tritanopia',
  'ardesia|dark|warn^fail|protanopia',
  'ardesia-dark|light|pass^warn|tritanopia',
  'ardesia-dark|light|pass^fail|protanopia',
  'ardesia-dark|light|pass^fail|tritanopia',
  'ardesia-dark|light|warn^fail|protanopia',
  'ardesia-dark|dark|pass^warn|tritanopia',
  'ardesia-dark|dark|pass^fail|protanopia',
  'ardesia-dark|dark|pass^fail|tritanopia',
  'ardesia-dark|dark|warn^fail|protanopia',
  'atelier|light|pass^warn|tritanopia',
  'atelier|light|pass^fail|tritanopia',
  'atelier|dark|pass^warn|tritanopia',
  'atelier|dark|pass^fail|protanopia',
  'atelier|dark|pass^fail|tritanopia',
  'atelier-dark|light|pass^warn|tritanopia',
  'atelier-dark|light|pass^fail|tritanopia',
  'atelier-dark|dark|pass^warn|tritanopia',
  'atelier-dark|dark|pass^fail|protanopia',
  'atelier-dark|dark|pass^fail|tritanopia',
  'brina|light|pass^warn|tritanopia',
  'brina|light|pass^fail|protanopia',
  'brina|light|pass^fail|tritanopia',
  'brina|light|warn^fail|protanopia',
  'brina|dark|pass^warn|tritanopia',
  'brina|dark|pass^fail|protanopia',
  'brina|dark|pass^fail|tritanopia',
  'brina|dark|warn^fail|protanopia',
  'brina-dark|light|pass^warn|tritanopia',
  'brina-dark|light|pass^fail|protanopia',
  'brina-dark|light|pass^fail|tritanopia',
  'brina-dark|light|warn^fail|protanopia',
  'brina-dark|dark|pass^warn|tritanopia',
  'brina-dark|dark|pass^fail|protanopia',
  'brina-dark|dark|pass^fail|tritanopia',
  'brina-dark|dark|warn^fail|protanopia',
  'burgundy|light|pass^warn|tritanopia',
  'burgundy|light|pass^fail|tritanopia',
  'burgundy|dark|pass^warn|tritanopia',
  'burgundy|dark|pass^fail|protanopia',
  'burgundy|dark|pass^fail|tritanopia',
  'burgundy-dark|light|pass^warn|tritanopia',
  'burgundy-dark|light|pass^fail|tritanopia',
  'burgundy-dark|dark|pass^warn|tritanopia',
  'burgundy-dark|dark|pass^fail|protanopia',
  'burgundy-dark|dark|pass^fail|tritanopia',
  'carbone|light|pass^warn|tritanopia',
  'carbone|light|pass^fail|protanopia',
  'carbone|light|pass^fail|tritanopia',
  'carbone|dark|pass^warn|protanopia',
  'carbone|dark|pass^warn|tritanopia',
  'carbone|dark|pass^fail|protanopia',
  'carbone|dark|pass^fail|tritanopia',
  'carta|light|pass^warn|tritanopia',
  'carta|light|pass^fail|tritanopia',
  'carta|dark|pass^warn|tritanopia',
  'carta|dark|pass^fail|protanopia',
  'carta|dark|pass^fail|tritanopia',
  'carta|dark|warn^fail|protanopia',
  'carta-dark|light|pass^warn|tritanopia',
  'carta-dark|light|pass^fail|tritanopia',
  'carta-dark|dark|pass^warn|tritanopia',
  'carta-dark|dark|pass^fail|protanopia',
  'carta-dark|dark|pass^fail|tritanopia',
  'carta-dark|dark|warn^fail|protanopia',
  'concrete|light|pass^fail|tritanopia',
  'concrete|dark|pass^warn|tritanopia',
  'concrete|dark|pass^fail|protanopia',
  'concrete|dark|pass^fail|tritanopia',
  'concrete-dark|light|pass^fail|tritanopia',
  'concrete-dark|dark|pass^warn|tritanopia',
  'concrete-dark|dark|pass^fail|protanopia',
  'concrete-dark|dark|pass^fail|tritanopia',
  'crepuscolo|light|pass^warn|tritanopia',
  'crepuscolo|light|pass^fail|tritanopia',
  'crepuscolo|dark|pass^warn|tritanopia',
  'crepuscolo|dark|pass^fail|protanopia',
  'crepuscolo|dark|pass^fail|tritanopia',
  'crepuscolo-dark|light|pass^warn|tritanopia',
  'crepuscolo-dark|light|pass^fail|tritanopia',
  'crepuscolo-dark|dark|pass^warn|tritanopia',
  'crepuscolo-dark|dark|pass^fail|protanopia',
  'crepuscolo-dark|dark|pass^fail|tritanopia',
  'cuoio|light|pass^warn|tritanopia',
  'cuoio|light|pass^fail|tritanopia',
  'cuoio|dark|pass^warn|tritanopia',
  'cuoio|dark|pass^fail|protanopia',
  'cuoio|dark|pass^fail|tritanopia',
  'cuoio-dark|light|pass^warn|tritanopia',
  'cuoio-dark|light|pass^fail|tritanopia',
  'cuoio-dark|dark|pass^warn|tritanopia',
  'cuoio-dark|dark|pass^fail|protanopia',
  'cuoio-dark|dark|pass^fail|tritanopia',
  'indaco|light|pass^warn|tritanopia',
  'indaco|light|pass^fail|tritanopia',
  'indaco|dark|pass^warn|tritanopia',
  'indaco|dark|pass^fail|protanopia',
  'indaco|dark|pass^fail|tritanopia',
  'indaco|dark|warn^fail|protanopia',
  'indaco-dark|light|pass^warn|tritanopia',
  'indaco-dark|light|pass^fail|tritanopia',
  'indaco-dark|dark|pass^warn|tritanopia',
  'indaco-dark|dark|pass^fail|protanopia',
  'indaco-dark|dark|pass^fail|tritanopia',
  'indaco-dark|dark|warn^fail|protanopia',
  'laguna|light|pass^warn|tritanopia',
  'laguna|light|pass^fail|protanopia',
  'laguna|light|pass^fail|tritanopia',
  'laguna|light|warn^fail|protanopia',
  'laguna|dark|pass^warn|tritanopia',
  'laguna|dark|pass^fail|protanopia',
  'laguna|dark|pass^fail|tritanopia',
  'laguna|dark|warn^fail|protanopia',
  'laguna-dark|light|pass^warn|tritanopia',
  'laguna-dark|light|pass^fail|protanopia',
  'laguna-dark|light|pass^fail|tritanopia',
  'laguna-dark|light|warn^fail|protanopia',
  'laguna-dark|dark|pass^warn|tritanopia',
  'laguna-dark|dark|pass^fail|protanopia',
  'laguna-dark|dark|pass^fail|tritanopia',
  'laguna-dark|dark|warn^fail|protanopia',
  'magnolia|light|pass^warn|tritanopia',
  'magnolia|light|pass^fail|tritanopia',
  'magnolia|dark|pass^warn|tritanopia',
  'magnolia|dark|pass^fail|protanopia',
  'magnolia|dark|pass^fail|tritanopia',
  'magnolia|dark|warn^fail|protanopia',
  'magnolia|dark|warn^fail|deuteranopia',
  'magnolia-dark|light|pass^warn|tritanopia',
  'magnolia-dark|light|pass^fail|tritanopia',
  'magnolia-dark|dark|pass^warn|tritanopia',
  'magnolia-dark|dark|pass^fail|protanopia',
  'magnolia-dark|dark|pass^fail|tritanopia',
  'magnolia-dark|dark|warn^fail|protanopia',
  'magnolia-dark|dark|warn^fail|deuteranopia',
  'mustard|light|pass^warn|tritanopia',
  'mustard|light|pass^fail|tritanopia',
  'mustard|dark|pass^warn|tritanopia',
  'mustard|dark|pass^fail|protanopia',
  'mustard|dark|pass^fail|tritanopia',
  'mustard-dark|light|pass^warn|tritanopia',
  'mustard-dark|light|pass^fail|tritanopia',
  'mustard-dark|dark|pass^warn|tritanopia',
  'mustard-dark|dark|pass^fail|protanopia',
  'mustard-dark|dark|pass^fail|tritanopia',
  'onyx|light|pass^warn|tritanopia',
  'onyx|light|pass^fail|tritanopia',
  'onyx|dark|pass^warn|tritanopia',
  'onyx|dark|pass^fail|tritanopia',
  'onyx-dark|light|pass^warn|tritanopia',
  'onyx-dark|light|pass^fail|tritanopia',
  'onyx-dark|dark|pass^warn|tritanopia',
  'onyx-dark|dark|pass^fail|tritanopia',
]);

const sep = (a, b, t) => oklabDistance(simulate(a, t), simulate(b, t));

function measure() {
  const distinct = new Set();
  for (const theme of listAllThemes()) {
    const vars = mergedVars(theme);
    for (const [mode, isDark] of [['light', false], ['dark', true]]) {
      const hex = (k) => {
        const r = String(resolveTokenExpr(vars[k], vars, isDark)).trim();
        return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(r) ? r : null;
      };
      for (let i = 0; i < TRIO.length; i++) {
        for (let j = i + 1; j < TRIO.length; j++) {
          const a = hex(TRIO[i]);
          const b = hex(TRIO[j]);
          if (!a || !b) continue;
          for (const t of TYPES) {
            if (sep(a, b, t) >= COLLAPSE) distinct.add(`${theme}|${mode}|${TRIO[i]}^${TRIO[j]}|${t}`);
          }
        }
      }
    }
  }
  return distinct;
}

const now = measure();

describe('CVD trio floor (every palette, both modes)', () => {
  test('no pair that was distinct under a deficiency has collapsed', () => {
    const lost = [...CVD_DISTINCT].filter((k) => !now.has(k));
    assert.deepEqual(lost, [],
      `${lost.length} status pair(s) collapsed under a color-vision deficiency:\n  ${lost.join('\n  ')}`);
  });

  test('the frozen set carries no stale key', () => {
    // A pair that became distinct is a WIN — add its key so it is protected too.
    const gained = [...now].filter((k) => !CVD_DISTINCT.has(k));
    assert.deepEqual(gained, [],
      `${gained.length} status pair(s) are now CVD-distinct and unprotected — add them to `
      + `CVD_DISTINCT:\n  ${gained.join('\n  ')}`);
  });

  test('coverage: the frozen set is populated and spans the palettes', () => {
    assert.ok(CVD_DISTINCT.size > 100, `only ${CVD_DISTINCT.size} frozen keys — the set looks truncated`);
    const themes = new Set([...CVD_DISTINCT].map((k) => k.split('|')[0]));
    assert.ok(themes.size >= 20, `only ${themes.size} themes represented`);
  });
});
