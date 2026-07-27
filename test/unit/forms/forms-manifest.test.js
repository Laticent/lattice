/**
 * Unit: the Form composition-model manifest (lib/forms/**) — the engine-read
 * single source of truth for Frame + Cell + Tile (design/forms.md §11;
 * 2026-06-15-form-implementation.md §6).
 *
 * Asserts:
 *   (a) every manifest validates against the Cell / Frame / Tile shape;
 *   (b) referential integrity — Tile.fits → real Cell; every Cell.accepts kind
 *       is satisfied by ≥1 real Tile (or a Frame for 'frame'); Frame.cells /
 *       Frame.suppresses → real Cells;
 *   (c) the manifest-derived FORM_TOGGLE_SKIP equals the historical set;
 *   (d) dist/docs/forms.json is fresh (regenerating produces no diff) —
 *       mirrors the components.json freshness gate.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const forms = require('../../../lib/forms');
const plugins = require('../../../lib/integrations/markdown-it/plugins');
const { renderJson, JSON_FILE } = require('../../../tools/build-forms');

// The historical hardcoded skip list (the behaviour the manifests must preserve).
const HISTORICAL_SKIP = [
  'title', 'divider', 'closing',
  'math', 'compare-code',
  'split-panel', 'split-compare',
  'image', 'scene', 'premise',
];

test('(a) every Cell manifest validates', () => {
  const cells = forms.loadCells();
  assert.ok(cells.length >= 9, `expected ≥9 cells, got ${cells.length}`);
  for (const c of cells) {
    assert.deepEqual(forms.validateCell(c, c.id), [], `cell ${c.id} should validate`);
  }
});

test('(a) every Frame manifest validates', () => {
  const frames = forms.loadFrames();
  assert.ok(frames.length >= 10, `expected ≥10 frames, got ${frames.length}`);
  for (const f of frames) {
    assert.deepEqual(forms.validateFrame(f, f.id), [], `frame ${f.id} should validate`);
  }
});

test('(a) every Tile manifest validates', () => {
  const tiles = forms.loadTiles();
  assert.equal(tiles.length, 14, 'expected the 14 registry tiles');
  for (const t of tiles) {
    assert.deepEqual(forms.validateTile(t, t.id), [], `tile ${t.id} should validate`);
  }
});

test('(b) referential integrity holds across the catalog', () => {
  const cells = forms.loadCells();
  const frames = forms.loadFrames();
  const tiles = forms.loadTiles();
  assert.deepEqual(forms.checkIntegrity({ cells, frames, tiles }), []);
  // loadCatalog throws if integrity fails — exercise that path too.
  assert.doesNotThrow(() => forms.loadCatalog());
});

test('(b) checkIntegrity catches a Tile fitting a non-existent Cell', () => {
  const errors = forms.checkIntegrity({
    cells: [{ id: 'stage', region: 'stage', z: 2, accepts: ['content'], capacity: 'one', fill: 'start' }],
    frames: [],
    tiles: [{ id: 'content', kind: 'content', fits: ['ghost'], z: 2, population: 'x', status: 'shipped' }],
  });
  assert.ok(errors.some((e) => /fits unknown cell "ghost"/.test(e)), errors.join('; '));
});

test('(b) checkIntegrity catches a Cell accepting a kind no Tile satisfies', () => {
  const errors = forms.checkIntegrity({
    cells: [{ id: 'overlay', region: 'overlay', z: 4, accepts: ['review'], capacity: 'one', fill: 'anchor' }],
    frames: [],
    tiles: [], // no review tile fits overlay
  });
  assert.ok(errors.some((e) => /accepts "review"/.test(e)), errors.join('; '));
});

test('(c) manifest-derived skip set equals the historical FORM_TOGGLE_SKIP', () => {
  const derived = forms.frameToggleSkip();
  assert.deepEqual([...derived].sort(), [...HISTORICAL_SKIP].sort());
});

test('(c) the browser-baked FORM_TOGGLE_SKIP_FALLBACK matches the manifest-derived set', () => {
  // The fallback literal is what the fs-free browser bundle uses; it must never
  // drift from the manifests (the Node-derived set). This guards that claim.
  assert.deepEqual([...plugins.FORM_TOGGLE_SKIP_FALLBACK].sort(), [...forms.frameToggleSkip()].sort());
  assert.deepEqual([...plugins.FORM_TOGGLE_SKIP].sort(), [...forms.frameToggleSkip()].sort());
});

test('(c) plugins.formToggleClass skips every historical sovereign Frame', () => {
  for (const skip of HISTORICAL_SKIP) {
    assert.equal(plugins.formToggleClass(skip, 'standard'), skip, `should skip ${skip}`);
  }
  // and still tags ordinary content
  assert.equal(plugins.formToggleClass('content', 'standard'), 'content form');
});

// STALENESS gate only, NOT a content oracle: renderJson() also generated the
// committed file, so a bug INSIDE renderJson would corrupt both sides equally
// and pass here. The CONTENT of forms.json is independently checked by the
// loadCatalog integrity + validateFrame/checkIntegrity tests below (real
// structural oracles). A diff here just means a source manifest changed without
// a rebuild — re-run the build and commit; treat the diff as expected.
test('(d) dist/docs/forms.json is fresh (regenerating produces no diff)', () => {
  const current = fs.existsSync(JSON_FILE) ? fs.readFileSync(JSON_FILE, 'utf8') : null;
  assert.equal(current, renderJson(), 'dist/docs/forms.json is stale — run `node tools/build-forms.js`');
});

// ── (e) the per-family `slicing` gate (responsive-Frame contract, §7) ─────────
// Regression guard: before this gate, a slicing block with a forbidden family,
// a ghost cell, a bad region, or a kind/capacity-violating relocation produced
// ZERO errors (the JSON-schema was never run). See
// engineering/decisions/2026-06-21-reflow-as-form-capability.md §7 red-team H1/M2.

test('(e) valid slicing on the standard frame passes both gates', () => {
  const { cells, frames, tiles } = forms.loadCatalog();
  const std = frames.find((f) => f.id === 'standard');
  assert.ok(std.slicing, 'standard frame declares slicing');
  assert.deepEqual(forms.validateFrame(std, 'standard'), []);
  assert.deepEqual(forms.checkIntegrity({ cells, frames: [std], tiles }), []);
});

test('(e) the gate catches forbidden family / ghost cell / bad region / kind violation', () => {
  const { cells, tiles } = forms.loadCatalog();
  const bad = {
    id: 'evil', form: 'bookend', kind: 'root', exemptFromChrome: false,
    description: 'x', cells: ['masthead', 'stage'], suppresses: [],
    slicing: {
      WIDE: { masthead: { tokens: { '--x': '1fr' } } },     // forbidden family key
      strip: {
        ghostcell: { tokens: { '--y': '1' } },              // not in cells
        stage: { region: 'nowhere' },                       // bad region
        masthead: { region: 'masthead-bay' },               // relocate "frame"-kind into a chrome-only slot
      },
    },
  };
  const errs = [...forms.validateFrame(bad, 'evil'), ...forms.checkIntegrity({ cells, frames: [bad], tiles })];
  assert.ok(errs.some((e) => /family "WIDE"/.test(e)), 'forbidden family caught');
  assert.ok(errs.some((e) => /region.*nowhere/.test(e)), 'bad region caught');
  assert.ok(errs.some((e) => /ghostcell.*not in its cells/.test(e)), 'ghost cell caught');
  assert.ok(errs.some((e) => /does not accept "frame"/.test(e)), 'kind violation caught');
});

test('(e) the gate catches a stack→single-capacity relocation (would overflow)', () => {
  const { cells, tiles } = forms.loadCatalog();
  // masthead-bay is capacity:stack; pagination-right is capacity:one — both chrome,
  // so kind-fit passes but capacity must not.
  const bad = {
    id: 'overflow', form: 'bookend', kind: 'root', exemptFromChrome: false,
    description: 'x', cells: ['masthead-bay', 'pagination-right'], suppresses: [],
    slicing: { strip: { 'masthead-bay': { region: 'pagination-right' } } },
  };
  const errs = forms.checkIntegrity({ cells, frames: [bad], tiles });
  assert.ok(errs.some((e) => /relocates stack cell.*into single-capacity/.test(e)), 'capacity violation caught');
});

test('(e) a slicing token no Cell CSS reads via var() is caught (dead generated rule)', () => {
  const { checkSlicingTokenRefs } = require('../../../tools/build-forms');
  const frames = [{ id: 'dead', slicing: { tall: { masthead: { tokens: { '--never-read-xyz': '1fr' } } } } }];
  const errs = checkSlicingTokenRefs(frames);
  assert.ok(errs.some((e) => /never reads it via var/.test(e)), 'dead token caught');
});

// (e) The slicing generator sets tokens at SECTION scope, not on a `.cell-<id>`
// element. Custom properties inherit, so this is what lets the footer Cells —
// whose elements are `.tile-progress` / `<footer>` / `::after` and have no
// `.cell-<id>` wrapper — be sliced per-family at all (not just the masthead band).
// Regression guard for the Cell-class-vs-Tile-class trap. See
// engineering/decisions/2026-06-21-reflow-as-form-capability.md §7.
test('(e) formsSlicingCss emits SECTION-scoped rules (so footer Cells inherit their tokens)', () => {
  const { formsSlicingCss } = require('../../../tools/build-css');
  const css = formsSlicingCss() || '';
  // the standard frame's masthead slicing is present and section-scoped…
  assert.match(css, /section\.form\[data-family="tall"\]\s*\{[^}]*--masthead-cols/);
  // …and NOT scoped to a `.cell-` element (which would miss the wrapper-less footer Cells).
  assert.doesNotMatch(css, /\[data-family="[^"]*"\]\s+\.cell-/);
});
