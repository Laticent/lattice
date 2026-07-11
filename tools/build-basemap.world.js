#!/usr/bin/env node
/**
 * World basemap builder for the `map` component — the `world` companion to the
 * `us` basemap in tools/build-basemap.js, which requires and orchestrates this
 * module (so `node tools/build-basemap.js` writes both assets).
 *
 * ── Source ────────────────────────────────────────────────────────────────
 * Natural Earth 1:110m admin-0 countries (public domain — Natural Earth data
 * carries no copyright), fetched as GeoJSON so one file supplies BOTH the
 * geometry AND the metadata join (ISO_A2 / ISO_A3 / NAME / CONTINENT /
 * SUBREGION). Antarctica is dropped for a tight boardroom frame.
 *
 * ── Projection ──────────────────────────────────────────────────────────────
 * Two projections ship, both baked into the path data at generation time:
 * Equal Earth (the area-preserving DEFAULT — the Global South reads at its true
 * size, not the Mercator/Robinson shrink) and Robinson (the familiar boardroom
 * compromise, opt-in via the `robinson` class token → a sibling
 * `map.basemap.world-robinson.json`). Both raw projections are INLINED below,
 * adapted from d3-geo-projection (ISC), so the engine declares no d3 /
 * projection dependency. The only generation-time use of d3-geo is its
 * geoProjection/geoPath path machinery (already present in the tree via
 * Mermaid, never shipped); the output is static baked paths, so nothing d3
 * reaches any bundle or the npm tarball.
 *
 * ── Region ids + name binding ───────────────────────────────────────────────
 * Regions are keyed by ISO 3166-1 alpha-2 (the natural short id, like the US
 * postal codes), falling back to Natural Earth's ADM0_A3 for the two entries
 * with no ISO alpha-2 (N. Cyprus, Somaliland). Each region's aliases cover the
 * alpha-2, alpha-3, the common + long + admin names, and a curated exonym list
 * (Burma→Myanmar, Ivory Coast→Côte d'Ivoire, UK→United Kingdom, …) — the
 * spelling-variance problem world maps live with.
 *
 * ── Groups ──────────────────────────────────────────────────────────────────
 * A group is a "fat alias" — a name that expands to a SET of region ids. Three
 * kinds, each provenance-stamped:
 *   - continent  : the 6 inhabited continents (Natural Earth CONTINENT).
 *   - region     : UN M49 subregions + a few curated composites authors say
 *                  out loud (Sub-Saharan Africa, Middle East, Latin America,
 *                  the Nordics).
 *   - bloc       : dated political/economic blocs (EU, ASEAN, G20, BRICS,
 *                  OECD), each with an `asOf` year because membership changes.
 *   - category   : analytical categories — Global South / Global North, plus
 *                  per-continent slices of the South (global-south-africa, …) —
 *                  each pinned to a stated, dated definition.
 * Global South / North ship pinned to a stated, dated definition: South to the
 * UN Group of 77 + China membership (the standard operationalization in UN /
 * UNCTAD / development practice), North to the developed economies — carrying
 * the same `source` + `asOf` provenance as the blocs. Omitting them is not the
 * neutral choice it looks like: it just forces every author to hand-roll an
 * undocumented ~130-country roster, so the political call lands on each deck
 * inconsistently and invisibly. Shipping ONE sourced, dated roster is the
 * transparent call — the definition travels with the data and an author can
 * cite it. States in neither list (Russia, the post-Soviet / Balkan
 * "in-transition" economies, disputed territories) belong to no global-* group
 * rather than being forced into one. See the map.docs.md grouping section.
 */

const SOURCE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const SOURCE_BASE = 'Natural Earth 1:110m admin-0 countries (public domain)';
const SOURCE_LABEL = `${SOURCE_BASE}, Equal Earth projection`;

const VIEW_W = 1000, VIEW_H = 520;
const SIMPLIFY_EPS = 0.7; // px in projected screen space — invisible at slide scale
const MIN_RING_BBOX = 4;  // drop offshore specks (px²)

// ── Robinson raw projection (inlined; adapted from d3-geo-projection, ISC) ───
// 19 control points at 5° latitude steps: [parallel-length, parallel-distance].
// biome-ignore-start lint/suspicious/noApproximativeNumericConstant: these are Robinson projection table coefficients, not math constants.
const ROBINSON_K = [
  [0.9986, -0.062], [1.0000, 0.0000], [0.9986, 0.0620], [0.9954, 0.1240],
  [0.9900, 0.1860], [0.9822, 0.2480], [0.9730, 0.3100], [0.9600, 0.3720],
  [0.9427, 0.4340], [0.9216, 0.4958], [0.8962, 0.5571], [0.8679, 0.6176],
  [0.8350, 0.6769], [0.7986, 0.7346], [0.7597, 0.7903], [0.7186, 0.8435],
  [0.6732, 0.8936], [0.6213, 0.9394], [0.5722, 0.9761], [0.5322, 1.0000],
];
// biome-ignore-end lint/suspicious/noApproximativeNumericConstant: end Robinson table.
const HALF_PI = Math.PI / 2;
function robinsonRaw(lambda, phi) {
  const i = Math.min(18, Math.abs(phi) * 36 / Math.PI);
  const i0 = Math.floor(i), di = i - i0;
  const ax = ROBINSON_K[i0][0], ay = ROBINSON_K[i0][1];
  const bx = ROBINSON_K[i0 + 1][0], by = ROBINSON_K[i0 + 1][1];
  const cx = ROBINSON_K[Math.min(19, i0 + 2)][0], cy = ROBINSON_K[Math.min(19, i0 + 2)][1];
  const x = lambda * (bx + di * (cx - ax) / 2 + di * di * (cx - 2 * bx + ax) / 2);
  const y = (phi > 0 ? HALF_PI : -HALF_PI) * (by + di * (cy - ay) / 2 + di * di * (cy - 2 * by + ay) / 2);
  return [x, y];
}

// ── Equal Earth raw projection (inlined; adapted from d3-geo-projection, ISC) ─
// Equal-area pseudocylindrical (Šavrič, Patterson & Jenny, 2018). The Lattice
// default: relative area is preserved, so the Global South reads at its true
// size instead of the high-latitude inflation Robinson/Mercator introduce.
const EE_A1 = 1.340264, EE_A2 = -0.081106, EE_A3 = 0.000893, EE_A4 = 0.003796;
const EE_M = Math.sqrt(3) / 2;
function equalEarthRaw(lambda, phi) {
  const l = Math.asin(EE_M * Math.sin(phi));
  const l2 = l * l, l6 = l2 * l2 * l2;
  return [
    (lambda * Math.cos(l)) / (EE_M * (EE_A1 + 3 * EE_A2 * l2 + l6 * (7 * EE_A3 + 9 * EE_A4 * l2))),
    l * (EE_A1 + EE_A2 * l2 + l6 * (EE_A3 + EE_A4 * l2)),
  ];
}

// Projection registry — `buildWorld(projId)` bakes one of these. Equal Earth is
// the default (`map world`); Robinson is the opt-in variant (`map world
// robinson`), written to a sibling JSON.
const PROJECTIONS = {
  'equal-earth': { projection: 'equal-earth', raw: equalEarthRaw, label: `${SOURCE_BASE}, Equal Earth projection` },
  robinson: { projection: 'robinson', raw: robinsonRaw, label: `${SOURCE_BASE}, Robinson projection` },
};

// Curated exonyms / common alternates the bare ISO + Natural Earth names miss.
// Keyed by region id (alpha-2), value is the list of normalized alternates the
// kernel should also accept. (The kernel normalizes case + strips periods, so
// "U.K." and "uk" both arrive as "uk".)
const EXONYMS = {
  US: ['usa', 'america', 'united states', 'united states of america', 'the states'],
  GB: ['uk', 'united kingdom', 'britain', 'great britain', 'england'],
  AE: ['uae', 'united arab emirates'],
  CI: ['ivory coast', 'cote divoire'],
  MM: ['burma'],
  CZ: ['czech republic', 'czechia'],
  CD: ['drc', 'dr congo', 'democratic republic of congo', 'democratic republic of the congo', 'congo kinshasa', 'congo-kinshasa'],
  CG: ['republic of congo', 'congo brazzaville', 'congo-brazzaville'],
  KR: ['south korea', 'korea', 'republic of korea'],
  KP: ['north korea', 'dprk'],
  RU: ['russia', 'russian federation'],
  SY: ['syria'],
  LA: ['laos'],
  VN: ['vietnam', 'viet nam'],
  BN: ['brunei'],
  TZ: ['tanzania'],
  IR: ['iran', 'persia'],
  TR: ['turkey', 'turkiye', 'türkiye'],
  MK: ['macedonia', 'north macedonia'],
  SZ: ['swaziland', 'eswatini'],
  CV: ['cape verde', 'cabo verde'],
  TL: ['east timor', 'timor-leste', 'timor leste'],
  NL: ['holland', 'the netherlands'],
  BO: ['bolivia'],
  VE: ['venezuela'],
  MD: ['moldova'],
  BA: ['bosnia', 'bosnia and herzegovina'],
  DO: ['dominican republic'],
  CF: ['central african republic'],
  GQ: ['equatorial guinea'],
  SS: ['south sudan'],
  EH: ['western sahara'],
};

// Dated political / economic blocs, by region id. Each is provenance-stamped
// with an `asOf` because membership changes — that note ships in the data.
const BLOCS = {
  'european-union': {
    label: 'European Union', aliases: ['eu'], asOf: '2025',
    source: 'EU member states',
    members: ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'],
  },
  'asean': {
    label: 'ASEAN', aliases: ['association of southeast asian nations'], asOf: '2025',
    source: 'ASEAN member states',
    members: ['BN','KH','ID','LA','MY','MM','PH','SG','TH','VN'],
  },
  'g20': {
    label: 'G20', aliases: ['group of twenty'], asOf: '2025',
    source: 'G20 country members (excludes the EU + African Union bloc seats)',
    members: ['AR','AU','BR','CA','CN','FR','DE','IN','ID','IT','JP','KR','MX','RU','SA','ZA','TR','GB','US'],
  },
  'brics': {
    label: 'BRICS', aliases: ['brics founding five'], asOf: '2024',
    source: 'BRICS founding five (the 2024 expansion is not included)',
    members: ['BR','RU','IN','CN','ZA'],
  },
  'oecd': {
    label: 'OECD', aliases: ['organisation for economic co-operation and development'], asOf: '2025',
    source: 'OECD member states',
    members: ['AU','AT','BE','CA','CL','CO','CR','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IE','IL','IT','JP','KR','LV','LT','LU','MX','NL','NZ','NO','PL','PT','SK','SI','ES','SE','CH','TR','GB','US'],
  },
};

// Curated regional composites authors say out loud but Natural Earth doesn't
// carry as one subregion. Provenance noted; membership is the curated list.
const CURATED_REGIONS = {
  'middle-east': {
    label: 'Middle East', aliases: ['mena', 'the middle east'],
    source: 'common Middle East definition (Western Asia + Egypt)',
    members: ['BH','CY','EG','IR','IQ','IL','JO','KW','LB','OM','PS','QA','SA','SY','TR','AE','YE'],
  },
  'nordics': {
    label: 'Nordics', aliases: ['nordic countries', 'scandinavia'],
    source: 'Nordic countries',
    members: ['DK','FI','IS','NO','SE'],
  },
};

// ── Global South / North ────────────────────────────────────────────────────
// SOUTH is the UN Group of 77 + China membership — the standard operational
// definition of the Global South in UN / UNCTAD / development practice. NORTH is
// the developed economies (Europe, Northern America, Japan, South Korea,
// Australia, New Zealand, Israel). Each ships as a dated, sourced group, like
// the blocs; ids absent from the 1:110m basemap (most microstates) are filtered
// out at assembly. States in NEITHER list (Russia, the post-Soviet / Balkan
// "in-transition" economies, disputed territories) belong to no global-* group.
// Keyed by region id (alpha-2). The roster is auditable on purpose — the margins
// (e.g. which Central-Asian states are G77 members) are exactly where a reviewer
// should check it against the official G77 list.
const GLOBAL_SOUTH = [
  // Africa — every African UN member state is a G77 member.
  'DZ','AO','BJ','BW','BF','BI','CV','CM','CF','TD','KM','CG','CD','CI','DJ','EG','GQ','ER','SZ','ET','GA','GM','GH','GN','GW','KE','LS','LR','LY','MG','MW','ML','MR','MU','MA','MZ','NA','NE','NG','RW','ST','SN','SC','SL','SO','ZA','SS','SD','TZ','TG','TN','UG','ZM','ZW',
  // Asia + Middle East (China is the "+ China"). Excludes Japan, South Korea,
  // Israel, Turkey, and the non-member Central-Asian / Caucasus states.
  'AF','BH','BD','BT','BN','KH','CN','IN','ID','IR','IQ','JO','KW','LA','LB','MY','MV','MN','MM','NP','KP','OM','PK','PS','PH','QA','SA','SG','LK','SY','TH','TL','TJ','TM','AE','VN','YE',
  // Latin America + Caribbean (GRULAC). Excludes Mexico — not a G77 member.
  'AG','AR','BS','BB','BZ','BO','BR','CL','CO','CR','CU','DM','DO','EC','SV','GD','GT','GY','HT','HN','JM','NI','PA','PY','PE','KN','LC','VC','SR','TT','UY','VE',
  // Pacific.
  'FJ','KI','MH','FM','NR','PG','WS','SB','TO','TV','VU',
];
const GLOBAL_NORTH = [
  // Northern America.
  'US','CA',
  // Europe (EU + EFTA + UK + microstates).
  'GB','IE','FR','DE','NL','BE','LU','AT','CH','LI','IS','NO','SE','FI','DK','IT','ES','PT','GR','MT','CY','PL','CZ','SK','HU','SI','HR','EE','LV','LT','RO','BG','AD','MC','SM','VA',
  // Developed Asia-Pacific.
  'JP','KR','IL','AU','NZ',
];

// ── Brandt Line (the second Global South view) ───────────────────────────────
// The 1980 Brandt Report drew a single North–South line. Its "North" is the
// wealthy/industrial world of that moment: North America, ALL of Europe, the
// former USSR (Russia + the Caucasus + Central Asia), Japan, Israel, and the
// line's famous southern-hemisphere exception — Australia + New Zealand. The
// Brandt "Global South" is then everything BELOW the line, which we build as the
// complement (faithful to its draw-a-line logic, unlike the G77 membership
// roster). This is why the two views differ: Brandt sweeps in Mexico, Turkey,
// the Koreas, Taiwan, and assorted territories on geography, while moving the
// former-Soviet Central-Asian G77 members (Tajikistan, Turkmenistan) into the
// North. Dated to the report (1980) — a frozen snapshot, by design.
const BRANDT_NORTH = new Set([
  'US','CA','GL',
  'AL','AT','BA','BE','BG','BY','CH','CZ','DE','DK','EE','ES','FI','FR','GB','GR','HR','HU','IE','IS','IT','LT','LV','MD','ME','MK','NL','NO','PL','PT','RO','RS','RU','SE','SI','SK','UA','XK','AD','MC','SM','VA',
  'AM','AZ','GE','KZ','KG','TJ','TM','UZ',
  'JP','IL','AU','NZ',
]);

module.exports = { buildWorld, SOURCE_LABEL };

// ── Geometry helpers ────────────────────────────────────────────────────────
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
  return douglasPeucker(pts.slice(0, idx + 1), eps).slice(0, -1).concat(douglasPeucker(pts.slice(idx), eps));
}

// Project a GeoJSON feature through d3's path machinery into a rounded,
// simplified SVG `d`. d3-geo handles antimeridian clipping (Russia, Fiji); the
// collector context captures the projected screen rings for our own simplify.
function featurePath(geoPath, projection, feature) {
  const rings = [];
  let cur = null;
  const ctx = {
    beginPath() {}, arc() {}, closePath() {},
    moveTo(x, y) { cur = [[x, y]]; rings.push(cur); },
    lineTo(x, y) { cur.push([x, y]); },
  };
  geoPath(projection, ctx)(feature);
  const out = [];
  for (const ring of rings) {
    if (ring.length < 4) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if ((maxX - minX) * (maxY - minY) < MIN_RING_BBOX) continue;
    const simplified = douglasPeucker(ring, SIMPLIFY_EPS);
    const rounded = [];
    for (const [x, y] of simplified) {
      const rx = Math.round(x), ry = Math.round(y);
      const last = rounded[rounded.length - 1];
      if (!last || last[0] !== rx || last[1] !== ry) rounded.push([rx, ry]);
    }
    if (rounded.length < 3) continue;
    out.push(rounded.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1]).join('') + 'Z');
  }
  return out.join('');
}

function cleanName(p) {
  // Natural Earth abbreviates some NAMEs ("Dem. Rep. Congo"); prefer NAME_LONG
  // when NAME carries a period, else the tidy common NAME.
  return /\./.test(p.NAME) && p.NAME_LONG ? p.NAME_LONG : p.NAME;
}

async function buildWorld(projId = 'equal-earth') {
  const proj = PROJECTIONS[projId] || PROJECTIONS['equal-earth'];
  const { geoProjection, geoPath } = await import('d3-geo');
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`fetch ${SOURCE_URL} → ${res.status}`);
  const fc = await res.json();
  fc.features = fc.features.filter((f) => f.properties.NAME !== 'Antarctica');

  const projection = geoProjection(proj.raw).fitSize([VIEW_W, VIEW_H], fc);

  const regions = {};
  const aliases = {};
  const byContinent = {};
  const bySubregion = {};
  const norm = (s) => String(s).toLowerCase().replace(/[.’']/g, '').replace(/\s+/g, ' ').trim();

  for (const f of fc.features) {
    const p = f.properties;
    const a2 = p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ADM0_A3;
    const key = a2;
    const name = cleanName(p);
    const d = featurePath(geoPath, projection, f);
    if (!d) continue;
    regions[key] = { name, iso3: p.ISO_A3 !== '-99' ? p.ISO_A3 : p.ADM0_A3, continent: p.CONTINENT, subregion: p.SUBREGION, d };

    // Aliases: id, iso3, the various name fields, + curated exonyms.
    const names = [key, p.ISO_A3, p.ADM0_A3, p.NAME, p.NAME_LONG, p.ADMIN, p.FORMAL_EN, p.BRK_NAME];
    for (const n of names) if (n && n !== '-99') aliases[norm(n)] = key;
    for (const ex of EXONYMS[key] || []) aliases[norm(ex)] = key;

    if (p.CONTINENT && p.CONTINENT !== 'Antarctica' && p.CONTINENT !== 'Seven seas (open ocean)') {
      (byContinent[p.CONTINENT] ||= []).push(key);
    }
    if (p.SUBREGION && !/Antarctic|Seven seas/.test(p.SUBREGION)) {
      (bySubregion[p.SUBREGION] ||= []).push(key);
    }
  }

  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const groups = {};
  const addGroup = (key, g) => { groups[key] = g; };

  // Continents.
  for (const [cont, members] of Object.entries(byContinent)) {
    addGroup(slug(cont), { label: cont, kind: 'continent', source: 'Natural Earth CONTINENT', members: members.sort() });
  }
  // UN M49 subregions. "South America" is both a CONTINENT and a SUBREGION in
  // Natural Earth and slugs identically — let the continent group win (the more
  // useful grouping; the subregion members are the same set anyway).
  for (const [sub, members] of Object.entries(bySubregion)) {
    const s = slug(sub);
    if (groups[s]) continue;
    addGroup(s, { label: sub, kind: 'region', source: 'UN M49 subregion (Natural Earth SUBREGION)', members: members.sort() });
  }
  // Sub-Saharan Africa = the Africa continent minus the Northern Africa subregion.
  const ssa = (byContinent.Africa || []).filter((k) => regions[k] && regions[k].subregion !== 'Northern Africa');
  if (ssa.length) addGroup('sub-saharan-africa', { label: 'Sub-Saharan Africa', kind: 'region', aliases: ['ssa'], source: 'Africa minus the UN Northern Africa subregion', members: ssa.sort() });
  // Latin America = South America + Central America + Mexico.
  const latam = new Set([...(byContinent['South America'] || []), ...(bySubregion['Central America'] || [])]);
  if (regions.MX) latam.add('MX');
  if (latam.size) addGroup('latin-america', { label: 'Latin America', kind: 'region', aliases: ['latam'], source: 'South America + Central America + Mexico', members: [...latam].sort() });
  // Curated composites.
  for (const [key, g] of Object.entries(CURATED_REGIONS)) {
    addGroup(key, { label: g.label, kind: 'region', aliases: g.aliases, source: g.source, members: g.members.filter((k) => regions[k]).sort() });
  }
  // Dated blocs.
  for (const [key, g] of Object.entries(BLOCS)) {
    addGroup(key, { label: g.label, kind: 'bloc', aliases: g.aliases, source: g.source, asOf: g.asOf, members: g.members.filter((k) => regions[k]).sort() });
  }

  // Global South — pinned to the UN G77 + China membership (see header note).
  const southMembers = GLOBAL_SOUTH.filter((k) => regions[k]);
  const southSet = new Set(southMembers);
  if (southMembers.length) {
    addGroup('global-south', {
      label: 'Global South', kind: 'category',
      aliases: ['the global south', 'g77', 'g-77', 'g77 plus china', 'group of 77'],
      source: 'UN Group of 77 + China membership', asOf: '2025',
      members: [...southMembers].sort(),
    });
    // Continental slices of the same membership — mirrors how the G77 itself
    // organizes into regional chapters (African / Asia-Pacific / GRULAC). So an
    // author can colour just one region of it, e.g. `global-south-africa`.
    const southByContinent = {};
    for (const k of southMembers) {
      const cont = regions[k]?.continent;
      if (cont && cont !== 'Seven seas (open ocean)') (southByContinent[cont] ||= []).push(k);
    }
    for (const [cont, members] of Object.entries(southByContinent)) {
      addGroup('global-south-' + slug(cont), {
        label: 'Global South — ' + cont, kind: 'category',
        aliases: [`global south ${cont}`],
        source: `UN Group of 77 + China membership, ${cont} members`, asOf: '2025',
        members: members.sort(),
      });
    }
  }
  // Global North — the developed economies; states in neither list belong to no
  // global-* group (see header note). Defined disjoint from the South.
  const northMembers = GLOBAL_NORTH.filter((k) => regions[k] && !southSet.has(k));
  if (northMembers.length) addGroup('global-north', {
    label: 'Global North', kind: 'category',
    aliases: ['the global north', 'developed economies', 'developed countries'],
    source: 'Developed economies (Europe, Northern America, Japan, South Korea, Australia, New Zealand, Israel)', asOf: '2025',
    members: northMembers.sort(),
  });

  // Global South, Brandt-Line view — the second, geographic operationalization:
  // everything below the 1980 Brandt line (the complement of the Brandt North).
  // Shipped alongside `global-south` (G77 + China) so authors pick the framing;
  // neither is hidden, both carry their source + date.
  const brandtSouth = Object.keys(regions)
    .filter((k) => !BRANDT_NORTH.has(k) && regions[k].continent !== 'Seven seas (open ocean)')
    .sort();
  if (brandtSouth.length) addGroup('global-south-brandt', {
    label: 'Global South — Brandt Line', kind: 'category',
    aliases: ['brandt line', 'brandt south', 'brandt line south', 'global south brandt'],
    source: 'Brandt Line North–South divide (Brandt Report, 1980)', asOf: '1980',
    members: brandtSouth,
  });

  // Compute the viewBox from the actual projected extent (padded).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of Object.values(regions)) {
    for (const m of r.d.matchAll(/[ML](-?\d+),(-?\d+)/g)) {
      const x = +m[1], y = +m[2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const pad = 4;
  const vbX = Math.floor(minX - pad), vbY = Math.floor(minY - pad);
  const vbW = Math.ceil(maxX + pad) - vbX, vbH = Math.ceil(maxY + pad) - vbY;

  const sortedRegions = {};
  for (const k of Object.keys(regions).sort()) sortedRegions[k] = regions[k];
  const sortedAliases = {};
  for (const k of Object.keys(aliases).sort()) sortedAliases[k] = aliases[k];

  return {
    id: 'world',
    label: 'World — countries',
    projection: proj.projection,
    source: proj.label,
    sourceUrl: SOURCE_URL,
    generator: 'tools/build-basemap.js',
    viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
    aliases: sortedAliases,
    groups,
    regions: sortedRegions,
  };
}
