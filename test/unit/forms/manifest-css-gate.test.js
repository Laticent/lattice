/**
 * Manifest↔CSS consistency gate (the "light" coupling that makes the Form catalog
 * load-bearing — engineering/decisions/2026-06-16-form-manifest-medium-independent-contract.md
 * §4). The pure checker lives in lib/forms; the fs-scanning wiring in
 * tools/build-forms.js. These tests pin: (1) the pure ref extraction, (2) the
 * pure assertion catches drift, (3) the LIVE catalog + real lib CSS are
 * consistent (the regression guard itself).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  loadCells,
  loadCatalog,
  collectGeometryTokenRefs,
  checkManifestCssRefs,
  checkCellCssPresence,
  checkSuppressIntegrity,
  checkZPlaneZIndex,
} = require('../../../lib/forms');
const {
  collectDefinedCssTokens,
  collectCellCssPresence,
  collectZPlaneZIndex,
  assertManifestCssConsistency,
} = require('../../../tools/build-forms');

describe('Form manifest↔CSS gate — pure helpers', () => {
  test('collectGeometryTokenRefs pulls every geometry/gap token name', () => {
    const cells = [
      { id: 'masthead', gap: '--frame-y', geometry: { size: '--masthead-h', inset: '--frame-x' } },
      { id: 'token-only', gap: '--footer-center-half' },
      { id: 'bare' },
    ];
    const refs = collectGeometryTokenRefs(cells);
    assert.deepEqual(
      refs.sort((a, b) => (a.token + a.cell).localeCompare(b.token + b.cell)),
      [
        { cell: 'masthead', field: 'geometry.size', token: '--masthead-h' },
        { cell: 'token-only', field: 'gap', token: '--footer-center-half' },
        { cell: 'masthead', field: 'geometry.inset', token: '--frame-x' },
        { cell: 'masthead', field: 'gap', token: '--frame-y' },
      ].sort((a, b) => (a.token + a.cell).localeCompare(b.token + b.cell)),
    );
  });

  test('checkManifestCssRefs is clean when every token is defined', () => {
    const cells = [{ id: 'c', gap: '--frame-y', geometry: { size: '--masthead-h' } }];
    const defined = new Set(['--frame-y', '--masthead-h']);
    assert.deepEqual(checkManifestCssRefs(cells, defined), []);
  });

  test('checkManifestCssRefs FLAGS an undefined token (the drift it guards)', () => {
    const cells = [{ id: 'masthead', geometry: { inset: '--frame-inset-x-renamed' } }];
    const defined = new Set(['--frame-x']); // the rename left the manifest dangling
    const errors = checkManifestCssRefs(cells, defined);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /cell "masthead" geometry\.inset references CSS token --frame-inset-x-renamed/);
  });
});

describe('Form manifest↔CSS gate — live catalog', () => {
  test('every real Cell geometry/gap token is defined in lib CSS', () => {
    const defined = collectDefinedCssTokens();
    // sanity: the scan actually found the frame token vocabulary
    assert.ok(defined.has('--frame-x') && defined.has('--masthead-h'), 'scan found frame tokens');
    const errors = checkManifestCssRefs(loadCells(), defined);
    assert.deepEqual(errors, [], `live manifest↔CSS drift:\n${errors.join('\n')}`);
  });

  test('assertManifestCssConsistency does not throw on the live catalog', () => {
    assert.doesNotThrow(() => assertManifestCssConsistency(loadCatalog()));
  });
});

describe('§4.1 — Cell-CSS presence', () => {
  test('clean when css flag matches the files on disk', () => {
    const cells = [{ id: 'stage' }, { id: 'overlay', css: false }];
    assert.deepEqual(checkCellCssPresence(cells, new Set(['stage'])), []);
  });
  test('flags a layout Cell missing its stylesheet', () => {
    const errors = checkCellCssPresence([{ id: 'masthead' }], new Set());
    assert.equal(errors.length, 1);
    assert.match(errors[0], /cell "masthead" expects a co-located stylesheet/);
  });
  test('flags a css:false Cell that still has a stylesheet (orphan/contradiction)', () => {
    const errors = checkCellCssPresence([{ id: 'overlay', css: false }], new Set(['overlay']));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /marked "css": false but a co-located overlay\.css exists/);
  });
  test('live: every Cell css flag matches the filesystem', () => {
    assert.deepEqual(checkCellCssPresence(loadCells(), collectCellCssPresence()), []);
  });
});

describe('§4.4 — suppresses integrity', () => {
  test('clean for a normal sovereign frame', () => {
    const frames = [{ id: 'title', cells: ['stage'], suppresses: ['masthead', 'footer'] }];
    assert.deepEqual(checkSuppressIntegrity(frames), []);
  });
  test('flags suppressing the content stage', () => {
    const errors = checkSuppressIntegrity([{ id: 'x', cells: ['stage'], suppresses: ['stage'] }]);
    assert.ok(errors.some((e) => /suppresses the content "stage" cell/.test(e)));
  });
  test('flags produce∩suppress overlap', () => {
    const errors = checkSuppressIntegrity([{ id: 'x', cells: ['footer'], suppresses: ['footer'] }]);
    assert.ok(errors.some((e) => /both produces and suppresses cell "footer"/.test(e)));
  });
  test('live: the real frames are consistent', () => {
    assert.deepEqual(checkSuppressIntegrity(loadCatalog().frames), []);
  });
});

describe('§4.3 — z-plane ↔ z-index monotonicity', () => {
  test('clean when z-index rises with the plane', () => {
    assert.deepEqual(
      checkZPlaneZIndex([{ id: 'a', plane: 1, zindex: -1 }, { id: 'b', plane: 3, zindex: 3 }]),
      [],
    );
  });
  test('flags an inversion (lower plane, higher z-index)', () => {
    const errors = checkZPlaneZIndex([{ id: 'a', plane: 1, zindex: 99 }, { id: 'b', plane: 3, zindex: 3 }]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /z-plane inversion/);
  });
  test('live: the real co-located z-index declarations are monotonic', () => {
    assert.deepEqual(checkZPlaneZIndex(collectZPlaneZIndex(loadCatalog())), []);
  });
});
