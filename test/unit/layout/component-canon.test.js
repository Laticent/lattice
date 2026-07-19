/**
 * Unit: lib/layout/ai.js COMPONENT_CANON — the facts-from-source drift gate (Win 3).
 *
 * COMPONENT_CANON teaches the product AI how a native Lattice component is built.
 * Its MANIFEST-FIELD enums (function / form / substance / bucket) are already
 * interpolated from gate.js into the output contract, but the canon ALSO carries
 * falsifiable facts in prose: the BUCKET TAXONOMY (what each bucket is for) and
 * the categorical token range. Those had already drifted once — the taxonomy
 * prose listed 12 buckets after `connect` (the 13th) shipped. This gate holds the
 * canon true to source so that drift is caught at build time, and reconciles it
 * with the design/skills/component.md teaching doc.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { COMPONENT_CANON, askComponentMessages } = require('../../../lib/layout/ai.js');
const { FUNCTIONS, FORMS, BUCKETS, CSS_ONLY_SUBSTANCES } = require('../../../lib/layout/gate.js');
const { CATEGORICAL_COUNT } = require('../../../lib/theme/derive.js');

const word = s => new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);

describe('component-canon (facts-from-source)', () => {
  test('the prose bucket taxonomy names EVERY bucket (catches the connect-style drift)', () => {
    // COMPONENT_CANON's TAXONOMY bullet teaches "what each bucket is FOR"; if a
    // bucket ships without being named there, the model is blind to it.
    for (const b of BUCKETS) {
      assert.match(COMPONENT_CANON, word(b), `COMPONENT_CANON taxonomy omits bucket "${b}"`);
    }
  });

  test('the output contract still interpolates every manifest-field enum', () => {
    // The model must be OFFERED every legal value it will be coerced against.
    const sys = askComponentMessages('a grid of capability cards').at(0).content;
    for (const f of FUNCTIONS) assert.match(sys, word(f), `output contract omits function "${f}"`);
    for (const f of FORMS) assert.match(sys, word(f), `output contract omits form "${f}"`);
    for (const b of BUCKETS) assert.match(sys, word(b), `output contract omits bucket "${b}"`);
    for (const s of CSS_ONLY_SUBSTANCES) assert.match(sys, word(s), `output contract omits substance "${s}"`);
  });

  test('the categorical token range is true to CATEGORICAL_COUNT', () => {
    // The canon points the model at `--cat-1-mark … --cat-N-mark`; N must be the
    // live categorical slot count, not a stale literal.
    assert.match(COMPONENT_CANON, /--cat-1-mark/, 'canon must anchor the categorical ramp at slot 1');
    assert.match(COMPONENT_CANON, new RegExp(`--cat-${CATEGORICAL_COUNT}-mark`), `canon must end the categorical ramp at slot ${CATEGORICAL_COUNT}`);
  });

  test('canon and design/skills/component.md agree on the full bucket set', () => {
    const doc = fs.readFileSync(path.join(__dirname, '../../../design/skills/component.md'), 'utf8');
    for (const b of BUCKETS) assert.match(doc, word(b), `component.md omits bucket "${b}"`);
    // And the doc's stated bucket COUNT matches the enum (guards the "13 buckets" line).
    assert.match(doc, new RegExp(`${BUCKETS.length} buckets`), `component.md must state "${BUCKETS.length} buckets"`);
  });
});
