/**
 * Unit: every component's budget per `venue:` lives in its manifest (`venueCapacity`), and the
 * three readers state the same numbers — lint-core (through venue-capacity.generated.js), the
 * component's `.docs.md`, and dist/docs/components.pick.md.
 * Record: engineering/decisions/2026-09-25-font-scale-fit.md, Amendment 2026-09-27.
 *
 * What is pinned, and why:
 *   · EVERY manifest carries the block — a measured row or a `none` reason. An absent block
 *     would read as "not measured yet" on one surface and "no budget" on another.
 *   · lint's table is the manifests' numbers, row for row, in FONT_SCALE_ORDER (laptop 1x,
 *     huddle 1.15x, conference 1.3x, hall 1.5x). A hand edit to the generated file, or a
 *     manifest edit without a rebuild, fails here as well as in `build:check`.
 *   · a measured row never grows as the room grows: a bigger venue can only hold the same or
 *     fewer elements. A row that grows is a mis-measurement.
 *   · the `code` pane's line budget is the `code` manifest's, so lint's code rule is never off.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadAll } = require('../../../lib/components');
const core = require('../../../lib/authoring/lint-core');
const generated = require('../../../lib/authoring/venue-capacity.generated.js');
const { venueDocsLine, venuePickCell, hardCap, VENUES } = require('../../../tools/lib/venue-capacity.js');

const manifests = loadAll();

test('every component manifest states a venue budget or why it has none', () => {
  const missing = manifests.filter((m) => !m.venueCapacity).map((m) => m.name);
  assert.deepEqual(missing, [], `add \`venueCapacity\` to: ${missing.join(', ')}`);
});

test('lint reads the manifests\' numbers, in laptop/huddle/conference/hall order', () => {
  for (const m of manifests) {
    const vc = m.venueCapacity;
    if (vc.none || vc.lines) {
      assert.equal(core.SCALE_CAPACITY[m.name], undefined, `${m.name}: no count row in lint`);
      continue;
    }
    for (const [words, row] of Object.entries(vc.byWords)) {
      assert.deepEqual(core.SCALE_CAPACITY[m.name]?.[words], VENUES.map((v) => row[v]), `${m.name} @ ${words} words`);
    }
  }
  const code = manifests.find((m) => m.name === 'code').venueCapacity.lines;
  assert.deepEqual(core.CODE_LINES_AT_SCALE, {
    bare: VENUES.map((v) => code.bare[v]),
    eyebrow: VENUES.map((v) => code.eyebrow[v]),
  });
  assert.equal(core.SCALE_CAPACITY, generated.items);
});

test('a measured row never grows as the room grows', () => {
  for (const m of manifests) {
    const vc = m.venueCapacity;
    const rows = vc.lines ? Object.entries(vc.lines) : Object.entries(vc.byWords || {});
    for (const [key, row] of rows) {
      const seq = VENUES.map((v) => row[v]);
      for (let i = 1; i < seq.length; i++) {
        assert.ok(seq[i] <= seq[i - 1], `${m.name} [${key}] ${seq.join('/')}: ${VENUES[i]} holds more than ${VENUES[i - 1]}`);
      }
    }
  }
});

test('the docs line and the pick cell print the manifest\'s numbers', () => {
  const agenda = manifests.find((m) => m.name === 'agenda');
  const row = agenda.venueCapacity.byWords[String(Math.max(...Object.keys(agenda.venueCapacity.byWords).map(Number)))];
  const cap = hardCap(agenda);
  const shown = VENUES.map((v) => Math.min(row[v], cap));
  assert.equal(venuePickCell(agenda), shown.join('/'));
  assert.match(venueDocsLine(agenda, 'items'), new RegExp(`conference ~${shown[2]} `));
  // A venue budget never promises more than the component's own \`hard\`, which lint's
  // capacity-overflow enforces in every room: split-compare measures 4 at laptop and holds 2.
  const sc = manifests.find((m) => m.name === 'split-compare');
  assert.ok(Object.values(sc.venueCapacity.byWords).some((r) => r.laptop > hardCap(sc)), 'the case this pins');
  assert.equal(venuePickCell(sc), VENUES.map(() => hardCap(sc)).join('/'));
  const bar = manifests.find((m) => m.name === 'bar');
  assert.equal(venuePickCell(bar), '—');
  assert.ok(venueDocsLine(bar, 'items').includes(bar.venueCapacity.none), 'a `none` prints its reason');
});
