/**
 * THE TEXT MEASURER READS THE FACE THE SLIDE PAINTS IN.
 *
 * Chart text paints in `--font-body` (lib/core/resolve-typography.js `articleTypographyCss`): Outfit by default, and
 * Inter under the ledger, poster and festival type sets. The phone kernel measures labels from a per-glyph table
 * (shared/text-measure.js) and held only Outfit and the sketch hand, so an Inter deck was billed about 10% narrow on
 * a label and up to 4x narrow on a glyph (`·`): the kernel wrapped too late and set names over each other. The sketch
 * finish paints it in the hand, about 17% wider, and a pie's key set a name under its value. The phone dispatch now
 * sets the slide's body face (shared/chart-phone.js `bodyFaceOf`) and the table carries Inter.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { TYPOGRAPHY_SETS } = require('../../../lib/core/resolve-typography.js');
const { textWidth, wrapWords } = require('../../../lib/plugins/chart-family/shared/text-measure.js');
const { withBodyFace, bodyFace } = require('../../../lib/plugins/chart-family/shared/chart-form-state.js');
const { bodyFaceOf, INTER_SETS } = require('../../../lib/plugins/chart-family/shared/chart-phone.js');
const { FACES } = require('../../../lib/plugins/chart-family/shared/text-advance.generated.js');

const LABEL = 'Revenue growth by region';

describe('the text measurer reads the slide\'s body face', () => {
  test('the Inter type sets are exactly the sets whose body face is Inter', () => {
    const inter = Object.values(TYPOGRAPHY_SETS).filter((s) => s.body === 'Inter').map((s) => s.cls).sort();
    assert.deepEqual([...INTER_SETS].sort(), inter);
    assert.ok(inter.length > 0, 'at least one set paints in Inter, or this test pins nothing');
  });

  test('the table carries a row for every face and weight the measurer reads', () => {
    for (const row of ['clean-600', 'clean-700', 'hand-700', 'inter-600', 'inter-700']) assert.ok(FACES[row], row);
  });

  test('a slide\'s classes pick the face; its own typography-classic wins', () => {
    assert.equal(bodyFaceOf([]), 'clean');
    assert.equal(bodyFaceOf(['bar', 'form']), 'clean');
    for (const cls of INTER_SETS) assert.equal(bodyFaceOf(['bar', cls]), 'inter', cls);
    assert.equal(bodyFaceOf(['bar', 'typography-ledger', 'typography-classic']), 'clean');
    assert.equal(bodyFaceOf(undefined), 'clean');
  });

  test('the sketch finish measures in the hand, unless the slide keeps the clean body', () => {
    // base.sketch.css re-points --font-body to the hand on `section.sketch:not(.sketch-clean-body)`.
    assert.equal(bodyFaceOf(['piechart', 'sketch']), 'hand');
    assert.equal(bodyFaceOf(['piechart', 'sketch', 'typography-ledger']), 'hand');
    assert.equal(bodyFaceOf(['piechart', 'sketch', 'sketch-clean-body']), 'clean');
    assert.equal(bodyFaceOf(['piechart', 'sketch', 'sketch-clean-body', 'typography-poster']), 'inter');
    // A key name measured in the hand is wider than in Outfit: the red team's pie set "merchandising" under "40%".
    const name = 'Wholesale merchandising';
    assert.ok(withBodyFace('hand', () => textWidth(name, 36, { weight: 600 })) > textWidth(name, 36, { weight: 600 }) * 1.1);
  });

  test('under Inter a label measures wider, and wraps sooner, than under Outfit', () => {
    const outfit = textWidth(LABEL, 36, { weight: 600 });
    const inter = withBodyFace('inter', () => textWidth(LABEL, 36, { weight: 600 }));
    assert.ok(inter > outfit * 1.05, `Inter ${inter.toFixed(1)} vs Outfit ${outfit.toFixed(1)}`);
    // A width the Outfit measure fits on one line and the Inter measure does not.
    const width = (outfit + inter) / 2;
    assert.equal(wrapWords(LABEL, width, 36).lines.length, 1);
    assert.equal(withBodyFace('inter', () => wrapWords(LABEL, width, 36).lines.length), 2);
  });

  test('an explicit "clean" means the body face, and the sketch hand is never replaced', () => {
    const interClean = withBodyFace('inter', () => textWidth(LABEL, 36, { weight: 600, face: 'clean' }));
    assert.equal(interClean, withBodyFace('inter', () => textWidth(LABEL, 36, { weight: 600 })));
    const hand = textWidth(LABEL, 36, { weight: 700, face: 'hand' });
    assert.equal(withBodyFace('inter', () => textWidth(LABEL, 36, { weight: 700, face: 'hand' })), hand);
  });

  test('the face is scoped to the drawing: it is restored after, even when the drawing throws', () => {
    assert.equal(bodyFace(), 'clean');
    assert.throws(() => withBodyFace('inter', () => { throw new Error('boom'); }));
    assert.equal(bodyFace(), 'clean');
  });
});
