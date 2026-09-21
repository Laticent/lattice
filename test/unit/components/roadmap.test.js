/**
 * Unit: lib/components/chart/roadmap/roadmap.transform.js — roadmap modifier transforms.
 *
 * Two transforms keyed off the roadmap layout class:
 *   - roadmap status   : tag <td> cells with state marker → state class
 *   - roadmap horizons : transpose workstream × phase table into 3 cards
 *
 * Both transforms operate on rendered HTML strings (post-markdown-it)
 * and skip sections that don't carry the matching modifier.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  applyStatusMarkers,
  applyHorizons,
  applyToRenderedHtml,
  markerToState,
} = require('../../../lib/components/chart/roadmap/roadmap.transform');

describe('roadmap', () => {
  // ── markerToState ──────────────────────────────────────────────────────

  test('markerToState: maps [x]/[-]/[ ]/[/] to the four state classes', () => {
    assert.equal(markerToState('x'), 'state-shipped');
    assert.equal(markerToState('-'), 'state-wip');
    assert.equal(markerToState(' '), 'state-planned');
    assert.equal(markerToState('/'), 'state-skipped');
    assert.equal(markerToState('?'), '');
  });

  // ── applyStatusMarkers ────────────────────────────────────────────────

  const STATUS_TABLE = (
    '<table>' +
      '<thead><tr><th>Workstream</th><th>Phase 01</th><th>Phase 02</th></tr></thead>' +
      '<tbody>' +
        '<tr><td>Platform</td><td>[x] Scoring policy</td><td>[-] Per-team calibration</td></tr>' +
        '<tr><td>SDK</td><td>[ ] Java</td><td>[/] .NET</td></tr>' +
      '</tbody>' +
    '</table>'
  );

  test('status: tags every marker-prefixed body cell with the state class', () => {
    const out = applyStatusMarkers(STATUS_TABLE);
    // All four markers found
    assert.match(out, /cell-state state-shipped/);
    assert.match(out, /cell-state state-wip/);
    assert.match(out, /cell-state state-planned/);
    assert.match(out, /cell-state state-skipped/);
    // Marker text stripped from the cell content
    assert.ok(!out.includes('[x]'), 'shipped marker should be stripped');
    assert.ok(!out.includes('[-]'), 'wip marker should be stripped');
    assert.ok(!out.includes('[ ]'), 'planned marker should be stripped');
    assert.ok(!out.includes('[/]'), 'skipped marker should be stripped');
  });

  test('status: emits a state-label eyebrow with the human-readable state name', () => {
    const out = applyStatusMarkers(STATUS_TABLE);
    assert.match(out, /<span class="cell-state-label">Shipped<\/span>/);
    assert.match(out, /<span class="cell-state-label">In flight<\/span>/);
    assert.match(out, /<span class="cell-state-label">Planned<\/span>/);
    assert.match(out, /<span class="cell-state-label">Out of scope<\/span>/);
  });

  test('status: leaves the workstream cell (first td) unchanged', () => {
    const out = applyStatusMarkers(STATUS_TABLE);
    // First-cell workstream labels survive untouched
    assert.match(out, /<td>Platform<\/td>/);
    assert.match(out, /<td>SDK<\/td>/);
  });

  test('status: leaves header cells unchanged', () => {
    const out = applyStatusMarkers(STATUS_TABLE);
    assert.match(out, /<th>Phase 01<\/th>/);
    assert.match(out, /<th>Phase 02<\/th>/);
  });

  test('status: ignores cells without a marker prefix', () => {
    const noMarker = (
      '<table><thead><tr><th>WS</th><th>P1</th></tr></thead>' +
      '<tbody><tr><td>Foo</td><td>plain text</td></tr></tbody></table>'
    );
    const out = applyStatusMarkers(noMarker);
    assert.ok(!out.includes('cell-state'));
    assert.match(out, /<td>plain text<\/td>/);
  });

  // ── applyHorizons ─────────────────────────────────────────────────────

  const HORIZONS_TABLE = (
    '<table>' +
      '<thead><tr><th>Workstream</th><th>Now · Q2</th><th>Next · Q3</th></tr></thead>' +
      '<tbody>' +
        '<tr><td>Platform</td><td>Scoring policy</td><td>Per-team calibration</td></tr>' +
        '<tr><td>SDK</td><td>Java</td><td></td></tr>' +
      '</tbody>' +
    '</table>'
  );

  test('horizons: builds one horizon-card per phase column (workstream column dropped)', () => {
    const out = applyHorizons(HORIZONS_TABLE);
    const cards = out.match(/horizon-card/g) || [];
    assert.equal(cards.length, 2, 'two phase columns → two cards');
    // Original table replaced with horizons wrapper
    assert.ok(!out.includes('<table>'));
    assert.match(out, /class="horizons"/);
  });

  test('horizons: phase header text becomes the card title', () => {
    const out = applyHorizons(HORIZONS_TABLE);
    assert.match(out, /<span class="horizon-title">Now · Q2<\/span>/);
    assert.match(out, /<span class="horizon-title">Next · Q3<\/span>/);
  });

  test('horizons: phase number eyebrow auto-derives from column order', () => {
    const out = applyHorizons(HORIZONS_TABLE);
    assert.match(out, /<span class="horizon-eyebrow">Phase 01<\/span>/);
    assert.match(out, /<span class="horizon-eyebrow">Phase 02<\/span>/);
  });

  test('horizons: each card carries workstream rows with label + commitment', () => {
    const out = applyHorizons(HORIZONS_TABLE);
    // Workstream labels reused across both cards
    const platformLabels = out.match(/<span class="row-label">Platform<\/span>/g) || [];
    assert.equal(platformLabels.length, 2);
    // Commitments routed to the right card
    assert.match(out, /<span class="row-text">Scoring policy<\/span>/);
    assert.match(out, /<span class="row-text">Per-team calibration<\/span>/);
    assert.match(out, /<span class="row-text">Java<\/span>/);
  });

  test('horizons: empty cells render as a muted dash row', () => {
    const out = applyHorizons(HORIZONS_TABLE);
    assert.match(out, /<span class="row-text row-empty">—<\/span>/);
  });

  test('horizons: cycles the categorical accent across cards', () => {
    const out = applyHorizons(HORIZONS_TABLE);
    assert.match(out, /--phase-accent:var\(--cat-1-mark\)/);
    assert.match(out, /--phase-accent:var\(--cat-2-mark\)/);
  });

  test('horizons: carries state classes from source cells onto card rows', () => {
    // First run state markers (universal), then transpose to cards. The
    // card row li should carry the state class so the horizons row gets
    // the light state styling via CSS.
    const tagged = applyStatusMarkers(STATUS_TABLE);
    const out = applyHorizons(tagged);
    assert.match(out, /<li class="cell-state state-shipped">/);
    assert.match(out, /<li class="cell-state state-wip">/);
    assert.match(out, /<li class="cell-state state-planned">/);
  });

  // ── applyToRenderedHtml — section dispatch ─────────────────────────────

  const STATUS_SECTION = (
    '<section id="1" class="roadmap status" data-lattice-slide="1">' + STATUS_TABLE + '</section>'
  );
  const HORIZONS_SECTION = (
    '<section id="2" class="roadmap horizons" data-lattice-slide="2">' + HORIZONS_TABLE + '</section>'
  );
  const PLAIN_ROADMAP_SECTION = (
    '<section id="3" class="roadmap" data-lattice-slide="3">' + STATUS_TABLE + '</section>'
  );
  const NON_ROADMAP_SECTION = (
    '<section id="4" class="kpi" data-lattice-slide="4">' + STATUS_TABLE + '</section>'
  );

  test('dispatch: tags state markers on .status sections', () => {
    const out = applyToRenderedHtml(STATUS_SECTION);
    assert.match(out, /cell-state state-shipped/);
  });

  test('dispatch: tags state markers on plain roadmap sections too (universal)', () => {
    // The .status modifier only controls visual treatment now; the marker
    // transform fires on any roadmap section so authors can sprinkle
    // [x]/[-]/[ ]/[/] into default, swimlane, milestones, horizons cells.
    const out = applyToRenderedHtml(PLAIN_ROADMAP_SECTION);
    assert.match(out, /cell-state state-shipped/);
    assert.match(out, /cell-state state-wip/);
    // No horizons wrapper without the modifier
    assert.ok(!out.includes('class="horizons"'));
    // Markers are stripped from the rendered HTML
    assert.ok(!out.includes('[x] Scoring policy'));
  });

  test('dispatch: applies horizons transform only when the modifier is present', () => {
    const out = applyToRenderedHtml(HORIZONS_SECTION);
    assert.match(out, /class="horizons"/);
    assert.ok(!out.includes('<table>'));
  });

  test('dispatch: leaves non-roadmap sections untouched', () => {
    const out = applyToRenderedHtml(NON_ROADMAP_SECTION);
    assert.equal(out, NON_ROADMAP_SECTION);
  });

  test('dispatch: idempotent on re-application', () => {
    const once  = applyToRenderedHtml(STATUS_SECTION);
    const twice = applyToRenderedHtml(once);
    assert.equal(once, twice);
    const h1 = applyToRenderedHtml(HORIZONS_SECTION);
    const h2 = applyToRenderedHtml(h1);
    assert.equal(h1, h2);
  });

  test('dispatch: handles multiple sections in the same document', () => {
    const doc = STATUS_SECTION + HORIZONS_SECTION + NON_ROADMAP_SECTION;
    const out = applyToRenderedHtml(doc);
    assert.match(out, /cell-state state-shipped/);
    assert.match(out, /class="horizons"/);
    // Non-roadmap section's [x] markers still survive (not in scope)
    assert.match(out, /\[x\] Scoring policy/);
  });
});

// ── The status key's WORDS are a default, not a vocabulary ──────────────────
//
// `STATE_LABEL` used to be a constant here, so a legislative roadmap read
// "Shipped" and no deck could say otherwise. The words now come from the
// manifest and an author overrides any of them with an inline label set. These
// arms hold the three properties that make that safe: the merge is PARTIAL, the
// spelling is the marker an author already types, and the derived behaviors
// roadmap always had (present-only, canonical order, nothing when nothing is
// marked) survive the move into the kernel.

describe('the status key label set', () => {
  const {
    transformSection, STATE_LABEL,
  } = require('../../../lib/components/chart/roadmap/roadmap.transform');

  // A minimal rendered roadmap carrying all four markers.
  const GRID = '<h2>Plan</h2><table><thead><tr><th></th><th>Q1</th></tr></thead>'
    + '<tbody>'
    + '<tr><td>A</td><td>[x] Done</td></tr>'
    + '<tr><td>B</td><td>[-] Doing</td></tr>'
    + '<tr><td>C</td><td>[ ] Next</td></tr>'
    + '<tr><td>D</td><td>[/] Cut</td></tr>'
    + '</tbody></table>';
  const CTX = { cls: 'roadmap', classTokens: ['roadmap'], orientation: 'landscape' };
  const setPara = (t) => `<p><code>${t}</code></p>`;
  const labels = (html) => [...html.matchAll(/roadmap-legend-label">([^<]*)</g)].map((m) => m[1]);

  test('with nothing authored, the manifest supplies the words', () => {
    const out = transformSection(GRID, { ...CTX });
    assert.deepEqual(labels(out.html),
      ['Shipped', 'In flight', 'Planned', 'Out of scope']);
    // And those ARE the exported constant, so the runtime mirror cannot drift.
    assert.deepEqual(labels(out.html), [
      STATE_LABEL['state-shipped'], STATE_LABEL['state-wip'],
      STATE_LABEL['state-planned'], STATE_LABEL['state-skipped'],
    ]);
  });

  test('naming a SUBSET leaves the rest on their defaults', () => {
    // The whole point of the construct: a legislative roadmap renames the two
    // states whose product words are wrong and says nothing about the others.
    const out = transformSection(
      setPara('[{[x], Enacted}, {[-], In committee}]') + GRID, { ...CTX });
    assert.deepEqual(labels(out.html),
      ['Enacted', 'In committee', 'Planned', 'Out of scope']);
  });

  test('the [ ] marker is addressable — the brackets protect its space', () => {
    // A bare ` ` key collapses to empty under the parser's tidy and would take
    // this row with it. If this arm goes red the docs are wrong, not the test.
    const out = transformSection(setPara('[{[ ], Not started}]') + GRID, { ...CTX });
    assert.deepEqual(labels(out.html),
      ['Shipped', 'In flight', 'Not started', 'Out of scope']);
  });

  test('the set paragraph is consumed, not printed above the grid', () => {
    const out = transformSection(setPara('[{[x], Enacted}]') + GRID, { ...CTX });
    assert.ok(!out.html.includes('Enacted}'), 'the raw set must not survive in the body');
    assert.ok(!/<code>\[\{/.test(out.html), 'no leftover set code span');
  });

  test('an ordinary eyebrow in the same shape survives untouched', () => {
    // matrix-grid's reader documents the trap from the other side; here the
    // pass-through is what keeps a code-only eyebrow from being eaten.
    const out = transformSection(
      setPara('Delivery · FY26') + setPara('[{[x], Enacted}]') + GRID, { ...CTX });
    assert.match(out.html, /Delivery · FY26/);
    assert.deepEqual(labels(out.html)[0], 'Enacted');
  });

  test('order comes from the manifest, never from the author', () => {
    // The declaration order is a lifecycle. An author listing states backwards
    // is naming them, not re-ordering the key.
    const out = transformSection(
      setPara('[{[/], D}, {[ ], C}, {[-], B}, {[x], A}]') + GRID, { ...CTX });
    assert.deepEqual(labels(out.html), ['A', 'B', 'C', 'D']);
  });

  test('only the markers the grid actually carries get a row', () => {
    const thin = '<h2>Plan</h2><table><tbody><tr><td>A</td><td>[x] Done</td></tr></tbody></table>';
    const out = transformSection(thin, { ...CTX });
    assert.deepEqual(labels(out.html), ['Shipped']);
  });

  test('a key for a state the grid does not carry is dropped', () => {
    // A chip beside no cell is a row a reader cannot find on the slide.
    const thin = '<h2>Plan</h2><table><tbody><tr><td>A</td><td>[x] Done</td></tr></tbody></table>';
    const out = transformSection(setPara('[{[/], Dropped}]') + thin, { ...CTX });
    assert.deepEqual(labels(out.html), ['Shipped']);
  });

  test('no markers at all means no key element, not an empty one', () => {
    const bare = '<h2>Plan</h2><table><tbody><tr><td>A</td><td>Just text</td></tr></tbody></table>';
    const out = transformSection(bare, { ...CTX });
    assert.ok(!out.html.includes('roadmap-legend'), 'a roadmap with no markers needs no key');
  });

  test('the `status` variant still suppresses the key, authored set or not', () => {
    const out = transformSection(setPara('[{[x], Enacted}]') + GRID,
      { ...CTX, cls: 'roadmap status', classTokens: ['roadmap', 'status'] });
    assert.ok(!out.html.includes('roadmap-legend'),
      'status labels every cell, so the key is redundant');
  });

  test('an authored label lands as text, never as markup', () => {
    // Fed as markdown-it really emits it: a code span's content arrives
    // ENTITY-ESCAPED. The lift decodes it to read the set, and the key builder
    // escapes it again on the way out — so the round trip has to end as text.
    // (Hand-writing a raw `<img>` here would test a string the engine never
    // produces, and would fail for the wrong reason: the label parses empty,
    // the set is rejected, and the paragraph survives with its raw tag.)
    const out = transformSection(
      setPara('[{[x], &lt;img src=x onerror=alert(1)&gt;}]') + GRID, { ...CTX });
    assert.ok(!out.html.includes('<img'), 'the label must not become a live element');
    assert.match(out.html, /roadmap-legend-label">&lt;img src=x onerror=alert\(1\)&gt;</);
  });
});
