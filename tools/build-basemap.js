#!/usr/bin/env node
/**
 * Basemap generator for the `map` component (lib/components/chart/map/).
 *
 *   us-atlas states-albers-10m TopoJSON  →  map.basemap.json
 *
 * `map`'s geometry is the one large fixed asset in the component catalog
 * (every other component adds < 3 KB; a US-states basemap is ~30-45 KB of
 * baked SVG path data). It is GENERATED, not hand-traced — this script is
 * the recorded provenance. Re-run it to regenerate or to re-simplify.
 *
 *   node tools/build-basemap.js          # write map.basemap.json
 *   node tools/build-basemap.js --check  # exit 1 if stale vs. source params
 *
 * ── Source ────────────────────────────────────────────────────────────────
 * us-atlas@3 `states-albers-10m.json` — US Census Bureau cartographic
 * boundary files, projected to d3.geoAlbersUsa (AK/HI insets), simplified
 * and TopoJSON-quantized by the us-atlas project. Public domain (US Census
 * works are not copyrightable; us-atlas ships ISC). Because the atlas is
 * ALREADY projected into 960×600 screen space, this generator needs no
 * projection library: it delta-decodes the quantized TopoJSON arcs, rounds
 * to integer screen coordinates, and emits one SVG `<path d>` per region.
 *
 * ── Why baked path data, not a fetched asset ────────────────────────────────
 * The kernel (map.transform.js) `require()`s the JSON this writes. esbuild
 * inlines it into dist/lattice-emulator.js and dist/lattice-runtime.js (CJS
 * requires are not tree-shaken, and the chart-family dispatcher is always
 * loaded), so the basemap ships in those two JS bundles — never in
 * dist/lattice.css, which carries only color rules. Baking it inline keeps
 * the zero-fetch contract (the emulator CLI renders offline; the runtime is
 * a single <script>). The cost is bounded by integer-rounding the geometry.
 *
 * d3-geo / topojson-client are NOT dependencies: the decode is inlined below
 * and the atlas is pre-projected. The only generation-time need is network
 * access to fetch the source atlas (recorded in SOURCE_URL).
 */

const fs = require('node:fs');
const path = require('node:path');

const SOURCE_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json';
const SOURCE_LABEL =
  'us-atlas@3 states-albers-10m (US Census cartographic boundaries, d3.geoAlbersUsa, public domain)';
const OUT = path.join(__dirname, '..', 'lib', 'components', 'chart', 'map', 'map.basemap.json');
const WORLD_OUT = path.join(__dirname, '..', 'lib', 'components', 'chart', 'map', 'map.basemap.world.json');
const WORLD_ROBINSON_OUT = path.join(__dirname, '..', 'lib', 'components', 'chart', 'map', 'map.basemap.world-robinson.json');
// The world basemap (Natural Earth countries + grouping) is built by a sibling
// module — its curated metadata (ISO fallbacks, exonyms, dated blocs) and
// inlined projections are substantial enough to keep out of this file. It bakes
// TWO projections: Equal Earth (the default `map.basemap.world.json`) and
// Robinson (the `robinson`-variant `map.basemap.world-robinson.json`).
// `node tools/build-basemap.js` writes ALL THREE assets (US + the two worlds).
const { buildWorld } = require('./build-basemap.world');

// FIPS state code → { postal, name }. The atlas keys geometries by FIPS id
// and carries properties.name; postal codes are the natural canonical region
// id (short, well-known, double as a built-in alias). DC included (51 rows).
const FIPS = {
  '01': ['AL', 'Alabama'],        '02': ['AK', 'Alaska'],
  '04': ['AZ', 'Arizona'],        '05': ['AR', 'Arkansas'],
  '06': ['CA', 'California'],     '08': ['CO', 'Colorado'],
  '09': ['CT', 'Connecticut'],   '10': ['DE', 'Delaware'],
  '11': ['DC', 'District of Columbia'],
  '12': ['FL', 'Florida'],        '13': ['GA', 'Georgia'],
  '15': ['HI', 'Hawaii'],         '16': ['ID', 'Idaho'],
  '17': ['IL', 'Illinois'],       '18': ['IN', 'Indiana'],
  '19': ['IA', 'Iowa'],           '20': ['KS', 'Kansas'],
  '21': ['KY', 'Kentucky'],       '22': ['LA', 'Louisiana'],
  '23': ['ME', 'Maine'],          '24': ['MD', 'Maryland'],
  '25': ['MA', 'Massachusetts'],  '26': ['MI', 'Michigan'],
  '27': ['MN', 'Minnesota'],      '28': ['MS', 'Mississippi'],
  '29': ['MO', 'Missouri'],       '30': ['MT', 'Montana'],
  '31': ['NE', 'Nebraska'],       '32': ['NV', 'Nevada'],
  '33': ['NH', 'New Hampshire'],  '34': ['NJ', 'New Jersey'],
  '35': ['NM', 'New Mexico'],     '36': ['NY', 'New York'],
  '37': ['NC', 'North Carolina'], '38': ['ND', 'North Dakota'],
  '39': ['OH', 'Ohio'],           '40': ['OK', 'Oklahoma'],
  '41': ['OR', 'Oregon'],         '42': ['PA', 'Pennsylvania'],
  '44': ['RI', 'Rhode Island'],   '45': ['SC', 'South Carolina'],
  '46': ['SD', 'South Dakota'],   '47': ['TN', 'Tennessee'],
  '48': ['TX', 'Texas'],          '49': ['UT', 'Utah'],
  '50': ['VT', 'Vermont'],        '51': ['VA', 'Virginia'],
  '53': ['WA', 'Washington'],     '54': ['WV', 'West Virginia'],
  '55': ['WI', 'Wisconsin'],      '56': ['WY', 'Wyoming'],
};

// Curated abbreviation aliases the bare postal/name match won't catch. The
// kernel also normalizes case + strips trailing periods, so "Calif." and
// "calif" both reach "calif" here. Keys are lowercased, period-stripped.
const ALIASES = {
  calif: 'CA', cal: 'CA', ariz: 'AZ', colo: 'CO', conn: 'CT',
  fla: 'FL', ill: 'IL', ind: 'IN', kans: 'KS', mass: 'MA',
  mich: 'MI', minn: 'MN', miss: 'MS', mont: 'MT', nebr: 'NE',
  neb: 'NE', nev: 'NV', okla: 'OK', oreg: 'OR', ore: 'OR',
  penn: 'PA', pa: 'PA', tenn: 'TN', tex: 'TX', wash: 'WA',
  wis: 'WI', wisc: 'WI', wyo: 'WY', 'd.c': 'DC', dc: 'DC',
  'washington d.c': 'DC', 'washington dc': 'DC',
};

// ── Minimal TopoJSON decode (pre-projected, quantized) ──────────────────────
// Inlined to avoid a topojson-client dependency. The atlas carries a
// transform (scale/translate); arcs are delta-encoded in quantized integer
// space. Decode once into absolute screen coordinates, then stitch rings.
function decodeArcs(topology) {
  const [sx, sy] = topology.transform.scale;
  const [tx, ty] = topology.transform.translate;
  return topology.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => {
      x += dx; y += dy;
      return [x * sx + tx, y * sy + ty];
    });
  });
}

// Stitch a ring (array of arc indices; negative = reversed via ~i) into a
// point list. Adjacent arcs share an endpoint, so drop the leading point of
// every arc after the first.
function ringPoints(indices, arcs) {
  const pts = [];
  for (const idx of indices) {
    const rev = idx < 0;
    const arc = arcs[rev ? ~idx : idx];
    const seq = rev ? arc.slice().reverse() : arc;
    for (let k = 0; k < seq.length; k++) {
      if (k === 0 && pts.length) continue;
      pts.push(seq[k]);
    }
  }
  return pts;
}

// Douglas–Peucker line simplification. The atlas is the 10m (high-res) cut;
// at slide scale (the map renders ~600px wide) sub-pixel vertices are
// invisible, so dropping near-collinear points cuts the baked size roughly
// in half with no perceptible quality loss. EPS is in screen px.
const SIMPLIFY_EPS = 1.15;
// Drop offshore-island rings whose bounding box is tinier than this (px²) —
// invisible specks that only add bytes. Kept low so real small states (RI,
// DE) survive; those are well above it.
const MIN_RING_BBOX = 5;

function perpDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function douglasPeucker(pts, eps) {
  if (pts.length < 3) return pts;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [pts[0], pts[pts.length - 1]];
  const left = douglasPeucker(pts.slice(0, idx + 1), eps);
  const right = douglasPeucker(pts.slice(idx), eps);
  return left.slice(0, -1).concat(right);
}

// Build an SVG path `d` for one geometry. Polygon arcs = [ring, …];
// MultiPolygon arcs = [polygon[ring, …], …]. Each ring is simplified, tiny
// rings are culled, and coordinates are integer-rounded with consecutive
// duplicates removed.
function geometryPath(geom, arcs) {
  const polygons = geom.type === 'Polygon' ? [geom.arcs] : geom.arcs;
  const out = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      let pts = ringPoints(ring, arcs);
      if (pts.length < 4) continue;
      // Cull invisible specks before spending DP on them.
      let rMinX = Infinity, rMinY = Infinity, rMaxX = -Infinity, rMaxY = -Infinity;
      for (const [x, y] of pts) {
        if (x < rMinX) rMinX = x; if (x > rMaxX) rMaxX = x;
        if (y < rMinY) rMinY = y; if (y > rMaxY) rMaxY = y;
      }
      if ((rMaxX - rMinX) * (rMaxY - rMinY) < MIN_RING_BBOX) continue;
      pts = douglasPeucker(pts, SIMPLIFY_EPS);
      // Round + drop consecutive duplicates.
      const rounded = [];
      for (const [x, y] of pts) {
        const rx = Math.round(x), ry = Math.round(y);
        const last = rounded[rounded.length - 1];
        if (!last || last[0] !== rx || last[1] !== ry) rounded.push([rx, ry]);
      }
      if (rounded.length < 3) continue;
      let d = '';
      for (let i = 0; i < rounded.length; i++) {
        d += (i === 0 ? 'M' : 'L') + rounded[i][0] + ',' + rounded[i][1];
      }
      out.push(d + 'Z');
    }
  }
  return out.join('');
}

async function build() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`fetch ${SOURCE_URL} → ${res.status}`);
  const topo = await res.json();
  const arcs = decodeArcs(topo);

  // viewBox from the decoded extent so AK/HI insets (which run negative on x)
  // are never clipped. Padded a touch and integer-rounded.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const regions = {};
  for (const geom of topo.objects.states.geometries) {
    const fips = FIPS[geom.id];
    if (!fips) continue; // territories not in the table are skipped
    const [postal, name] = fips;
    const d = geometryPath(geom, arcs);
    regions[postal] = { name, d };
    // Track extent from the rounded path numbers.
    for (const m of d.matchAll(/([ML])(-?\d+),(-?\d+)/g)) {
      const x = +m[2], y = +m[3];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const pad = 6;
  const vbX = Math.floor(minX - pad);
  const vbY = Math.floor(minY - pad);
  const vbW = Math.ceil(maxX + pad) - vbX;
  const vbH = Math.ceil(maxY + pad) - vbY;

  return {
    id: 'us-states',
    label: 'United States — states',
    projection: 'albersUsa',
    source: SOURCE_LABEL,
    sourceUrl: SOURCE_URL,
    generator: 'tools/build-basemap.js',
    viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
    aliases: ALIASES,
    regions,
  };
}

function serialize(data) {
  // Stable, compact serialization: regions sorted by id so diffs are legible
  // and the output is deterministic.
  const sorted = {};
  for (const k of Object.keys(data.regions).sort()) sorted[k] = data.regions[k];
  data.regions = sorted;
  return JSON.stringify(data, null, 0) + '\n';
}

// Geometry is fetched from a live CDN, so byte-equality isn't a fair gate;
// assert only that the region set + viewBox match (structural freshness). A
// re-simplified source would change paths, but that's a deliberate
// regeneration, not drift.
function isStale(outPath, data) {
  try {
    const cur = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    return cur.viewBox !== data.viewBox ||
      Object.keys(cur.regions).sort().join() !== Object.keys(data.regions).sort().join();
  } catch { return true; }
}

async function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const rel = (p) => path.relative(path.join(__dirname, '..'), p);

  const assets = [
    { out: OUT, data: await build() },
    { out: WORLD_OUT, data: await buildWorld('equal-earth') },
    { out: WORLD_ROBINSON_OUT, data: await buildWorld('robinson') },
  ];

  let stale = false;
  for (const a of assets) {
    a.json = serialize(a.data);
    if (check) {
      if (isStale(a.out, a.data)) {
        process.stderr.write(`${rel(a.out)} is stale relative to its source. Run: node tools/build-basemap.js\n`);
        stale = true;
      }
    } else {
      fs.writeFileSync(a.out, a.json);
      const groups = a.data.groups ? `, ${Object.keys(a.data.groups).length} groups` : '';
      process.stdout.write(
        `wrote ${rel(a.out)} (${Object.keys(a.data.regions).length} regions${groups}, ` +
        `${(a.json.length / 1024).toFixed(1)} KB, viewBox "${a.data.viewBox}")\n`,
      );
    }
  }
  if (check) {
    if (stale) process.exit(1);
    process.stdout.write('map basemaps are up to date.\n');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
