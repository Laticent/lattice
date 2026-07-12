/**
 * Unit: lib/components/chart/map/map.transform.js — kernel for the `map`
 * chart-family member, the one component on the `spatial` form.
 *
 * Section dispatch + chart-frame wrapping live in chart-family.js (map is one
 * of CHART_LAYOUTS); this kernel produces the figure HTML. Tests here cover:
 *
 *   1. Name binding: full name / postal code / curated alias all resolve,
 *      case- and punctuation-insensitively.
 *   2. Unmatched reporting: names the basemap can't place are surfaced in a
 *      data-unmatched attribute + a muted legend row, never dropped.
 *   3. Choropleth: the single-hue ramp emits a per-region --mix percentage,
 *      monotonic with value, with the flat-series edge case pinned to the ceil.
 *   4. Highlight: each named region carries its --catN slot var-reference.
 *   5. Basemap integrity: the baked asset has 51 regions and a valid viewBox.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseMap,
  buildMap,
  pickVariant,
  pickBasemap,
  normName,
  BASEMAP,
  WORLD_BASEMAP,
  WORLD_ROBINSON_BASEMAP,
} = require('../../../lib/components/chart/map/map.transform');
const {
  findUnknownMapRegions,
  nearestRegion,
  editDistance,
} = require('../../../lib/authoring/lint-core');
const { buildMapVocab } = require('../../../lib/authoring/lint');

// Build the rendered-<li> inner HTML the dispatcher hands the kernel. Each row
// is `<li>Name <code>value</code></li>`, matching Marp Core / emulator output.
function ul(rows) {
  return rows.map(([name, value]) =>
    `<li>${name}${value != null ? ` <code>${value}</code>` : ''}</li>`).join('');
}

describe('map kernel', () => {
  describe('parseMap — name binding', () => {
    test('resolves full names, postal codes, and curated aliases', () => {
      const m = parseMap(ul([['California', '4'], ['TX', '3'], ['Calif.', '9'], ['N.Y.', '2']]));
      // California + Calif. collapse to one CA row (last value wins); TX + NY resolve.
      const postals = m.matched.map((r) => r.ids[0]);
      assert.deepEqual(postals, ['CA', 'TX', 'NY']);
      assert.equal(m.matched.find((r) => r.ids[0] === 'CA').num, 9, 'duplicate region: last value wins');
      assert.equal(m.unmatched.length, 0);
    });

    test('is case- and whitespace-insensitive', () => {
      const m = parseMap(ul([['  new YORK ', '1'], ['washington', '2']]));
      assert.deepEqual(m.matched.map((r) => r.ids[0]), ['NY', 'WA']);
    });

    test('parses commas and units in the value', () => {
      const m = parseMap(ul([['California', '1,240 grants'], ['Texas', '$980']]));
      assert.equal(m.matched[0].num, 1240);
      assert.equal(m.matched[1].num, 980);
      assert.equal(m.matched[0].valueRaw, '1,240 grants');
    });

    test('returns null only when there are no list items', () => {
      assert.equal(parseMap(''), null);
      assert.ok(parseMap(ul([['Atlantis', '1']])), 'an all-unmatched list still returns a model');
    });
  });

  describe('parseMap — unmatched reporting', () => {
    test('collects names the basemap cannot place, never drops them', () => {
      const m = parseMap(ul([['California', '4'], ['Atlantis', '9'], ['Westeros', '1']]));
      assert.deepEqual(m.matched.map((r) => r.ids[0]), ['CA']);
      assert.deepEqual(m.unmatched.map((r) => r.name), ['Atlantis', 'Westeros']);
    });

    test('buildMap stamps data-unmatched on the figure and adds muted legend rows', () => {
      const m = parseMap(ul([['California', '4'], ['Atlantis', '9']]));
      const html = buildMap(m, 'choropleth');
      assert.match(html, /data-unmatched="Atlantis"/);
      // SVG-native key (2026-06-13-svg-native-legend.md): the unmatched row is a hollow "?" chip.
      // Its swatch paints via `data-unmatched` + a CSS rule (fill:transparent; stroke:--text-muted),
      // NEVER an inline `fill=`/`stroke=` presentation attr (flaky on old WebKit → black; D2).
      assert.match(html, /class="chart-key-swatch" data-unmatched=""/);
      assert.doesNotMatch(html, /class="chart-key-swatch"[^>]*\b(?:fill|stroke)=/, 'no inline swatch paint attr');
      assert.match(html, /class="chart-key-value"[^>]*>\?<\/text>/);
    });

    test('no unmatched names → no data-unmatched attribute', () => {
      const html = buildMap(parseMap(ul([['California', '4']])), 'choropleth');
      assert.doesNotMatch(html, /data-unmatched/);
    });
  });

  describe('buildMap — choropleth (default)', () => {
    test('emits a data-ramp bucket per named region, monotonic with value', () => {
      const m = parseMap(ul([['California', '100'], ['Texas', '50'], ['Florida', '0']]));
      const html = buildMap(m, 'choropleth');
      // The ramp is quantized to 16 buckets (0..15); a region and its swatch share
      // the bucket, so it compiles to a flat `--map-ramp-j` literal.
      const buckets = [...html.matchAll(/map-region--on" data-ramp="(\d+)"/g)].map((x) => +x[1]);
      assert.equal(buckets.length, 3);
      assert.equal(Math.max(...buckets), 15, 'highest value → top bucket');
      assert.equal(Math.min(...buckets), 0, 'lowest value → bottom bucket');
    });

    test('a flat series (all equal) pins to the ramp top bucket', () => {
      const m = parseMap(ul([['California', '5'], ['Texas', '5']]));
      const html = buildMap(m, 'choropleth');
      const buckets = [...html.matchAll(/data-ramp="(\d+)"/g)].map((x) => +x[1]);
      assert.ok(buckets.length > 0 && buckets.every((v) => v === 15));
    });

    test('draws every basemap region — named coloured, the rest neutral', () => {
      const html = buildMap(parseMap(ul([['California', '4']])), 'choropleth');
      const total = (html.match(/class="map-region/g) || []).length;
      assert.equal(total, Object.keys(BASEMAP.regions).length, 'all 51 regions drawn');
      assert.equal((html.match(/map-region--on/g) || []).length, 1, 'one region filled');
    });

    test('a choropleth swatch shares its region\'s ramp bucket (swatch == region)', () => {
      const m = parseMap(ul([['California', '100'], ['Texas', '50'], ['Florida', '0']]));
      const html = buildMap(m, 'choropleth');
      // Region <path>s and legend <rect> swatches both carry `data-ramp="j"`, so the
      // one `[data-ramp]` CSS rule paints both from the SAME `--map-ramp-j` token —
      // a swatch is byte-identical to the region it keys. Assert the bucket SETS match.
      const regionBuckets = [...html.matchAll(/map-region--on" data-ramp="(\d+)"/g)].map((x) => +x[1]);
      const swatchBuckets = [...html.matchAll(/class="chart-key-swatch" data-ramp="(\d+)"/g)].map((x) => +x[1]);
      assert.deepEqual(new Set(swatchBuckets), new Set(regionBuckets),
        'every swatch bucket has a matching region bucket and vice-versa');
      assert.equal(swatchBuckets.length, 3, 'one swatch per named region');
    });
  });

  describe('buildMap — highlight', () => {
    test('each named region carries its 0-based --catN slot, rotating the six-hue cap', () => {
      const names = ['California', 'Texas', 'New York', 'Florida', 'Illinois', 'Ohio', 'Georgia'];
      const m = parseMap(ul(names.map((n, i) => [n, String(i)])));
      const html = buildMap(m, 'highlight');
      // Region <path>s emit in basemap order; the SVG-native key swatches preserve
      // authored order and carry a 0-based `data-cat` (paints via the CSS rule, no
      // inline color-mix presentation attr — D2).
      const slots = [...html.matchAll(/class="chart-key-swatch" data-cat="(\d)"/g)].map((x) => +x[1]);
      assert.deepEqual(slots, [0, 1, 2, 3, 4, 5, 0], 'seventh region wraps back to slot 0');
    });
  });

  describe('pickVariant', () => {
    test('defaults to choropleth, opts into highlight on the token', () => {
      assert.equal(pickVariant(['map']), 'choropleth');
      assert.equal(pickVariant(['map', 'highlight']), 'highlight');
    });
  });

  describe('normName', () => {
    test('lowercases, drops periods/apostrophes, collapses whitespace', () => {
      assert.equal(normName('  N.Y. '), 'ny');
      assert.equal(normName("Hawai'i"), 'hawaii');
      assert.equal(normName('New  York'), 'new york');
    });
  });

  describe('basemap asset integrity', () => {
    test('US ships 51 regions (50 states + DC), each with a path', () => {
      const ids = Object.keys(BASEMAP.regions);
      assert.equal(ids.length, 51);
      for (const id of ids) {
        assert.ok(BASEMAP.regions[id].d.startsWith('M'), `${id} has an SVG path`);
        assert.ok(BASEMAP.regions[id].name, `${id} has a name`);
      }
      assert.match(BASEMAP.viewBox, /^-?\d+ -?\d+ \d+ \d+$/);
      assert.equal(BASEMAP.id, 'us-states');
    });

    test('world ships ~175 countries with continents + dated blocs', () => {
      assert.equal(WORLD_BASEMAP.id, 'world');
      assert.equal(WORLD_BASEMAP.projection, 'equal-earth');
      assert.ok(Object.keys(WORLD_BASEMAP.regions).length > 150);
      // Six inhabited continents present as groups.
      const continents = Object.values(WORLD_BASEMAP.groups).filter((g) => g.kind === 'continent').map((g) => g.label).sort();
      assert.deepEqual(continents, ['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America']);
      // Dated blocs carry provenance.
      const eu = WORLD_BASEMAP.groups['european-union'];
      assert.equal(eu.kind, 'bloc');
      assert.ok(eu.asOf, 'a bloc records the year its membership is asserted');
      assert.ok(eu.members.length >= 24);
    });

    test('robinson variant mirrors the default world but reprojects', () => {
      assert.equal(WORLD_ROBINSON_BASEMAP.projection, 'robinson');
      // Same logical basemap — identical region + group sets…
      assert.deepEqual(
        Object.keys(WORLD_ROBINSON_BASEMAP.regions).sort(),
        Object.keys(WORLD_BASEMAP.regions).sort(),
      );
      assert.deepEqual(
        Object.keys(WORLD_ROBINSON_BASEMAP.groups).sort(),
        Object.keys(WORLD_BASEMAP.groups).sort(),
      );
      // …but reprojected path data (and viewBox) differ.
      assert.notEqual(WORLD_ROBINSON_BASEMAP.regions.US.d, WORLD_BASEMAP.regions.US.d);
    });
  });

  // ── world basemap + grouping ──────────────────────────────────────────────
  describe('pickBasemap', () => {
    test('the world map is the default; us/usa selects US states', () => {
      assert.equal(pickBasemap(['map']).id, 'world');           // bare map → world
      assert.equal(pickBasemap(['map', 'world']).id, 'world');  // explicit, same
      assert.equal(pickBasemap(['map', 'us']).id, 'us-states');
      assert.equal(pickBasemap(['map', 'usa']).id, 'us-states');
    });

    test('robinson swaps in the Robinson world; default world is Equal Earth; us wins', () => {
      assert.equal(pickBasemap(['map']).projection, 'equal-earth');
      assert.equal(pickBasemap(['map', 'robinson']).projection, 'robinson');         // bare robinson → world robinson
      assert.equal(pickBasemap(['map', 'world', 'robinson']).projection, 'robinson');
      // us wins over a (world-only) robinson token, which is a no-op on US.
      assert.equal(pickBasemap(['map', 'us', 'robinson']).id, 'us-states');
    });
  });

  describe('world — country + alias + group resolution', () => {
    const wul = (rows) => rows.map(([n, v]) => `<li>${n}${v != null ? ` <code>${v}</code>` : ''}</li>`).join('');

    test('resolves country names, ISO codes, exonyms, and group names', () => {
      const m = parseMap(wul([['Brazil', '5'], ['BR', '4'], ['Burma', '3'], ['European Union', '9'], ['Atlantis', '1']]), WORLD_BASEMAP);
      // Brazil + BR collapse to one region row; Burma→Myanmar; EU is a group.
      const region = m.matched.filter((r) => r.kind === 'region');
      const group = m.matched.filter((r) => r.kind === 'group');
      assert.deepEqual(region.map((r) => r.ids[0]), ['BR', 'MM']);
      assert.equal(group.length, 1);
      assert.ok(group[0].ids.length >= 24, 'EU expands to its member set');
      assert.deepEqual(m.unmatched.map((r) => r.name), ['Atlantis']);
    });

    test('a group fills every member region', () => {
      const m = parseMap(wul([['Sub-Saharan Africa', '7']]), WORLD_BASEMAP);
      const html = buildMap(m, 'choropleth', ['map', 'world']);
      const filled = (html.match(/map-region--on/g) || []).length;
      assert.equal(filled, m.matched[0].ids.length, 'all SSA members shaded');
      assert.ok(filled > 30, 'Sub-Saharan Africa is dozens of countries');
    });

    test('grouped modifier clusters the legend by continent', () => {
      const m = parseMap(wul([['Brazil', '1'], ['Japan', '2'], ['European Union', '3']]), WORLD_BASEMAP);
      const html = buildMap(m, 'highlight', ['map', 'world', 'grouped']);
      const heads = [...html.matchAll(/chart-key-head"[^>]*><tspan[^>]*>([^<]+)</g)].map((x) => x[1]);
      assert.ok(heads.includes('South America') && heads.includes('Asia') && heads.includes('Groups'));
    });
  });

  // ── the deterministic "did you mean" (no LLM) ─────────────────────────────
  describe('findUnknownMapRegions — did you mean', () => {
    const vocab = buildMapVocab();

    test('flags an unresolved country with the nearest suggestion', () => {
      const deck = '<!-- _class: map world -->\n\n## x\n\n- Brasil `3`\n- United States `4`\n';
      const f = findUnknownMapRegions(deck, vocab);
      assert.equal(f.length, 1);
      assert.equal(f[0].rule, 'unknown-map-region');
      assert.match(f[0].message, /Brasil.*did you mean 'Brazil'/);
    });

    test('resolves valid names, codes, aliases, and groups silently', () => {
      const deck = '<!-- _class: map world -->\n\n## x\n\n- Brazil `1`\n- BR `2`\n- Burma `3`\n- European Union `4`\n';
      assert.equal(findUnknownMapRegions(deck, vocab).length, 0);
    });

    test('uses the basemap the slide selects (world default, us opt-in)', () => {
      // Bare `map` is a world map: a misspelled country resolves against world.
      const world = '<!-- _class: map -->\n\n## x\n\n- Brazl `1`\n';
      const fw = findUnknownMapRegions(world, vocab);
      assert.equal(fw.length, 1);
      assert.match(fw[0].message, /country the world basemap/);
      assert.match(fw[0].message, /Brazil/);
      // `map us` selects the US states: a misspelled state resolves against US.
      const us = '<!-- _class: map us -->\n\n## x\n\n- Califrnia `1`\n';
      const fu = findUnknownMapRegions(us, vocab);
      assert.equal(fu.length, 1);
      assert.match(fu[0].message, /state the us basemap/);
      assert.match(fu[0].message, /California/);
    });

    test('an unrecognizable name gets flagged without a bogus suggestion', () => {
      const deck = '<!-- _class: map world -->\n\n## x\n\n- Wakanda `9`\n';
      const f = findUnknownMapRegions(deck, vocab);
      assert.equal(f.length, 1);
      assert.doesNotMatch(f[0].message, /did you mean/);
    });

    test('non-map slides are never touched', () => {
      assert.equal(findUnknownMapRegions('<!-- _class: list -->\n\n- Brasil\n', vocab).length, 0);
    });

    test('nested per-region detail bullets are NOT linted as regions', () => {
      // The mark-detail feature lets a region carry an indented sublist; those
      // bullets are prose, not country names, and must not trip the linter.
      const deck = '<!-- _class: map world -->\n\n## x\n\n' +
        '- Kenya `4.2`\n' +
        '  - Anchor market, 3 hubs\n' +
        '  - Up 28% YoY\n' +
        '- Brazil `2.2`\n';
      assert.equal(findUnknownMapRegions(deck, vocab).length, 0);
    });

    test('a genuinely wrong top-level region is still caught alongside detail', () => {
      const deck = '<!-- _class: map world -->\n\n## x\n\n' +
        '- Wakanda `9`\n' +
        '  - fictional nation\n';
      const f = findUnknownMapRegions(deck, vocab);
      assert.equal(f.length, 1);
      assert.match(f[0].message, /Wakanda/);
    });
  });

  describe('editDistance + nearestRegion', () => {
    test('bounded edit distance', () => {
      assert.equal(editDistance('kitten', 'sitting', 5), 3);
      assert.equal(editDistance('abc', 'xyz', 1), 2, 'bails past max');
    });
    test('nearest only suggests a genuinely close name', () => {
      assert.equal(nearestRegion('Brazil', ['Brazil', 'Bolivia']), 'Brazil');
      assert.equal(nearestRegion('Zorptania', ['Brazil', 'Japan', 'Kenya']), null);
    });
  });

  describe('per-region detail (interactive reveal substrate)', () => {
    // A row may carry an optional nested sublist — captured as present-mode
    // detail (inert <template> + speaker-note), byte-identical export.
    const withDetail =
      '<li>California <code>4.2</code><ul><li>West coast</li><li>Tech hub <code>hi</code></li></ul></li>' +
      '<li>Texas <code>3.1</code></li>';

    test('a plain map emits no detail payload and no note', () => {
      const html = buildMap(parseMap(ul([['California', '4.2'], ['Texas', '3.1']]), BASEMAP), 'choropleth', ['us']);
      assert.doesNotMatch(html, /chart-details/);
      assert.doesNotMatch(html, /<!--/);
    });

    test('the region path carries data-mark and an inert template by index', () => {
      const html = buildMap(parseMap(withDetail, BASEMAP), 'choropleth', ['us']);
      assert.match(html, /<path class="map-region[^"]*"[^>]*data-mark="0"/);
      assert.match(html, /<template class="chart-detail" data-mark="0">/);
      assert.equal((html.match(/class="chart-detail"/g) || []).length, 1);
    });

    test('the same detail folds into a Marp-faithful speaker-note comment', () => {
      const html = buildMap(parseMap(withDetail, BASEMAP), 'choropleth', ['us']);
      assert.match(html, /<!-- California \(4\.2\): West coast · Tech hub hi -->/);
    });
  });
});
