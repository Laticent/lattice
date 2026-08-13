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

describe('§4.3 — the manifest plane and the CSS plane are the same plane', () => {
  test('clean when each noun paints on the token for its declared plane', () => {
    assert.deepEqual(
      checkZPlaneZIndex([
        { id: 'tile/watermark', plane: 1, token: '--z-atmosphere', zindex: 'var(--z-atmosphere)' },
        { id: 'cell/footer', plane: 3, token: '--z-chrome', zindex: 'var(--z-chrome)' },
      ]),
      [],
    );
  });
  test('flags a noun painting on a plane its manifest does not declare', () => {
    const errors = checkZPlaneZIndex([
      { id: 'tile/watermark', plane: 1, token: '--z-chrome', zindex: 'var(--z-chrome)' },
    ]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /z-plane disagreement/);
  });
  test('the watermark defect fails now, where the old monotonicity test passed it', () => {
    // `"z": 1` in the manifest, `z-index: -1` in the CSS. Monotonic against the only other
    // co-located declaration in the repo at the time, and wrong: it put the ghost numeral
    // below the finish backdrop, and under `finish: savile` the pinstripes ruled across it.
    // This is the regression case the check was rewritten for.
    const errors = checkZPlaneZIndex([
      { id: 'tile/watermark', plane: 1, token: null, zindex: -1 },
      { id: 'tile/progress', plane: 3, token: null, zindex: 3 },
    ]);
    assert.equal(errors.length, 2, 'both bare integers are reported, not just the inverted one');
    for (const e of errors) assert.match(e, /bare `z-index/);
  });
  test('an empty item set is an error, not a pass', () => {
    // The failure mode that let the retired frame-chrome gate certify a deleted rule: when
    // the Form sheets moved from integers to tokens, a collector still matching only digits
    // returned nothing and the check went quietly green. A gate that certifies an empty set
    // is worse than no gate, because it reports confidently on nothing.
    const errors = checkZPlaneZIndex([]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /no z-index at all/);
  });
  test('live: every real Cell and Tile paints on the plane its manifest declares', () => {
    assert.deepEqual(checkZPlaneZIndex(collectZPlaneZIndex(loadCatalog())), []);
  });
});
