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

// The historical hardcoded skip list (the behavior the manifests must preserve).
//
// `math` LEFT THIS LIST in 2026-09 and it is the only entry ever to have done so, which
// is worth stating rather than quietly deleting: its claim on a sovereign frame was
// "drives its own `> h2` title grid" — a heading-placement preference, not the "this
// slide has no room for chrome" that every other entry rests on. Eight variants moved
// onto the shared Form frame one commit at a time and none lost anything; what they
// gained was `meta:`, the progress rail and the watermark tile, none of which a
// chrome-exempt section can render. `compare-code` carries the same WORDING in its
// manifest and not the same substance — it builds a real explicit title grid where
// math's was absolutely-positioned arithmetic — so math is not a precedent for it.
// See the math variant assertions in test (c) below.
const HISTORICAL_SKIP = [
  'title', 'divider', 'closing',
  'compare-code',
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
  assert.equal(tiles.length, 15, 'expected the 15 registry tiles');
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
  // AND MATH IS NOT ONE OF THEM, at any variant. Asserted from the COMPONENT manifest
  // rather than a second hardcoded list, so a ninth variant is covered the day it is
  // declared. This is the arm that fails if the sovereign frame is ever put back.
  const MATH = require('../../../lib/components/math/math/math.manifest.json');
  for (const variant of MATH.variants) {
    const cls = variant === 'decompose' ? 'math matrix decompose' : `math ${variant}`;
    assert.equal(plugins.formToggleClass(cls, 'standard'), `${cls} form`,
      `math ${variant} must take the form class`);
  }
  assert.ok(!forms.frameToggleSkip().includes('math'),
    'lib/forms/frame/math/ is deleted — math must not be in the derived skip set');
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

// (f) The Cell `region` vocabulary lives in TWO places — the JSON schema's enum
// (read by editors and by anyone validating a manifest by hand) and CELL_REGIONS
// in lib/forms/index.js (read by the loader, which is what actually rejects a bad
// manifest). Adding `slide` in 2026-09 hit exactly that split: the schema accepted
// the new region and the loader threw. They are not derived from one another, so
// nothing but this test stops them drifting again.
test('(f) the region vocabulary is identical in all THREE places that carry it', () => {
  const { CELL_REGIONS } = require('../../../lib/forms');
  const cellSchema = require('../../../lib/forms/schema/cell.schema.json');
  const frameSchema = require('../../../lib/forms/schema/frame.schema.json');

  const fromCell = cellSchema.properties.region.enum;
  // The third copy: a slicing block may RELOCATE a Cell to another region, and
  // frame.schema.json enumerates the legal targets. The first cut of this test
  // compared only the two above and missed it — which is how adding `slide`
  // landed in two copies and not the third, widening the very split it closed.
  const slicing = frameSchema.properties.slicing.patternProperties['^(square|tall|strip)$']
    .patternProperties['^[a-z][a-z0-9-]*$'].properties.region.enum;
  const fromFrame = slicing.filter((v) => v !== null); // null = "drop this Cell"

  assert.ok(Array.isArray(fromCell) && fromCell.length > 0, 'the cell schema enumerates regions');
  assert.ok(fromFrame.length > 0, 'the frame schema enumerates relocation targets');
  const sorted = (a) => [...a].sort();
  assert.deepEqual(sorted(CELL_REGIONS), sorted(fromCell),
    'CELL_REGIONS (lib/forms/index.js) and schema/cell.schema.json must match');
  assert.deepEqual(sorted(CELL_REGIONS), sorted(fromFrame),
    'CELL_REGIONS and schema/frame.schema.json slicing region enum must match');
});

// (g) The two frame-anchored Tiles must keep saying so. `logo` and `watermark`
// are positioned against the SECTION by their own CSS/transform, and both
// manifests claimed a band Cell until 2026-09-08 (`masthead-bay` / `stage`) —
// a divergence invisible for as long as one Frame existed. See
// engineering/decisions/2026-09-08-frame-catalog.md §4.2.
test('(g) logo and watermark dock in the slide Cell, matching where they render', () => {
  const { loadCatalog } = require('../../../lib/forms');
  const { tiles, cells } = loadCatalog();
  assert.ok(cells.some((c) => c.id === 'slide'), 'the slide Cell exists');
  for (const id of ['logo', 'watermark']) {
    const t = tiles.find((x) => x.id === id);
    assert.ok(t, `${id} tile exists`);
    assert.deepEqual(t.fits, ['slide'], `${id} fits the slide Cell, not a band`);
  }
});

// (h) `admits` is the FRAME side of the containment contract (design/forms.md §7).
// The component side has shipped since 2026-07-14 as each manifest's `stage`
// field, generated into stage-catalog.generated.js; the frame side did not exist
// until 2026-09-08, so a Frame could not say what it accepts. These arms prove
// the field is checked rather than decorative — each shape below fails.
test('(h) frame admits rejects every malformed shape', () => {
  const { validateFrame } = require('../../../lib/forms');
  const base = { id: 'x', form: 'bookend', kind: 'root', exemptFromChrome: false,
    description: 'd', admits: ['flow'], cells: [], suppresses: [] };
  assert.equal(validateFrame(base, 't').length, 0, 'a valid root frame passes');
  const bad = [
    [{ ...base, kind: 'sovereign', exemptFromChrome: true, admits: ['flow', 'canvas'] }, /exactly \["sovereign"\]/],
    [{ ...base, admits: ['sovereign'] }, /admits "sovereign" but exemptFromChrome is false/],
    [{ ...base, admits: ['poster'] }, /must be one of flow, canvas, sovereign/],
    [{ ...base, admits: [] }, /must be a non-empty array/],
  ];
  for (const [frame, re] of bad) {
    const errs = validateFrame(frame, 't');
    assert.ok(errs.some((e) => re.test(e)), `rejected ${JSON.stringify(frame.admits)}: ${errs.join(' | ')}`);
  }
});

// (i) …and it is tied to the components that actually ship, both ways: a Frame
// may not claim a stage kind nothing declares, and no declared kind may be left
// with nowhere to compose.
test('(i) frame admits is checked against the generated stage catalog', () => {
  const { checkAdmitsCensus, loadCatalog } = require('../../../lib/forms');
  const catalog = require('../../../lib/forms/cell/masthead/stage-catalog.generated.js');
  const declared = new Set(Object.values(catalog));

  const { frames } = loadCatalog();
  const admitted = new Set(frames.flatMap((f) => f.admits));
  assert.deepEqual([...declared].sort(), [...admitted].sort(),
    'every shipped stage kind is admitted by a Frame, and no Frame invents one');

  // the census arm fires when a kind loses its only Frame. It is deliberately
  // NOT in checkIntegrity: that runs over caller-supplied subsets, where an
  // absent kind is not an orphaned one.
  const onlyFlow = [{ id: 'y', form: 'bookend', kind: 'root', exemptFromChrome: false,
    description: 'd', admits: ['flow'], cells: [], suppresses: [] }];
  const errs = checkAdmitsCensus(onlyFlow);
  assert.ok(errs.length >= 2, `orphaned kinds reported: ${errs.join(' | ')}`);
});
