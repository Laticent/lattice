/**
 * map kernel — parsing + SVG assembly for the `map` chart-family member, the
 * one component on the `spatial` form: regions placed by real-world geography
 * (a basemap), not by a grid or axis. A value (or category) per named region,
 * authored with the same series DSL the other charts use.
 *
 * Shape:
 *   ## Heading.
 *   - California `4.2`
 *   - Texas `3.1`
 *
 * Each `<li>` is one region: lead text = the region name (case/alias-tolerant
 * — `California` / `CA` / `Calif.` all resolve), trailing inline-code = the
 * value. Names the basemap can't match are REPORTED, not dropped: they land in
 * a `data-unmatched` attribute on the figure (the gallery test asserts it) and
 * in a muted legend row, so an author sees the typo instead of a silent gap.
 *
 * Two read modes (variants):
 *   - choropleth (default) — fill each named region on a sequential single-hue
 *     ramp off --chart-cat-1-hue (light→dark = low→high), exactly like funnel's band
 *     ramp. For "how much, where".
 *   - highlight (`map highlight`) — categorical: each named region takes a
 *     --catN slot; unnamed regions stay neutral. For "which ones". No magnitude.
 *
 * Like radar / quadrant / state-chart / funnel this is a kernel MODULE consumed
 * by the single chart-family dispatcher (lib/components/chart/_chart-family/
 * chart-family.js), which the registry adapter routes to all three render paths
 * (lattice-emulator.js, lib/runtime/index.js). Write once,
 * render everywhere. Palette stays in CSS: the kernel emits only a `--mix`
 * percentage (choropleth) or a `--region-hue` var-reference (highlight) plus
 * marker classes styled in map.styles.css — no hard-coded colour.
 *
 * The basemap geometry (baked, projected SVG path data keyed by region id) is
 * the one large fixed asset in the catalog. It is generated, not hand-traced —
 * see tools/build-basemap.js and map.basemap.json. It ships inline in the
 * emulator/runtime JS bundles (never in dist/lattice.css, which carries only
 * the colour rules), preserving the zero-fetch contract.
 */

// Two baked basemaps. Both are required (so both inline into the JS bundles —
// the accepted asset boundary), and the section's class tokens pick which one
// renders. `BASEMAP` stays the US default for back-compat with callers/tests
// that don't pass one.
const US_BASEMAP = require('./map.basemap.json');
const WORLD_BASEMAP = require('./map.basemap.world.json');
const WORLD_ROBINSON_BASEMAP = require('./map.basemap.world-robinson.json');
const BASEMAP = US_BASEMAP;

// Choropleth ramp endpoints, as color-mix percentages of --chart-cat-1-hue into the
// canvas. Floor keeps even the lowest region visibly tinted; ceiling stops
// short of full saturation so the hue stays legible against region borders.
const MIX_FLOOR = 24;
const MIX_CEIL = 88;
// Categorical slot cap for highlight mode — the same six-hue perceptual cap
// (Wong 2011) the rest of the chart family rotates through.
const CAT_SLOTS = 6;

// The shared SVG-native legend + spine builder — the map's key now lives inside
// the diagram <svg> (one scaling unit) instead of an HTML <ul> beside it, so it
// reads as one family with the pie/radar/quadrant. The map's swatch fills mirror
// its region fills (highlight hue / choropleth ramp). See svg-legend.js and
// engineering/decisions/2026-06-13-svg-native-legend.md.
const { buildSvgLegend } = require('../_chart-family/svg-legend');

// Shared per-mark detail substrate (data-mark template payload + speaker-note
// fallback), generalized from the pie. See mark-detail.js and
// engineering/decisions/2026-06-20-chart-detail-reveal-family.md.
const markDetail = require('../_chart-family/mark-detail');
// Canonical depth-aware list walker (lib/core) — was a local copy.
const { parseTopLevelLis: topLevelLis } = require('../../../core/html-lists');

function stripTags(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Normalize an author-supplied region name to the index key: lowercase, drop
// periods + apostrophes, collapse whitespace. "Calif." → "calif", "N.Y." →
// "ny", "  New York " → "new york".
function normName(s) {
  return String(s).toLowerCase().replace(/[.’']/g, '').replace(/\s+/g, ' ').trim();
}

// Build (and memoize) the name→id index for a basemap: region id, full name,
// and every curated alias, all normalized.
const _indexCache = new WeakMap();
function regionIndex(basemap) {
  if (_indexCache.has(basemap)) return _indexCache.get(basemap);
  const index = {};
  for (const [id, r] of Object.entries(basemap.regions)) {
    index[normName(id)] = id;
    index[normName(r.name)] = id;
  }
  for (const [alias, id] of Object.entries(basemap.aliases || {})) {
    index[normName(alias)] = id;
  }
  _indexCache.set(basemap, index);
  return index;
}

// Build (and memoize) the name→group-slug index: a group is a "fat alias" that
// expands to a SET of region ids (continents, UN subregions, dated blocs). Its
// label and curated aliases all resolve to the slug. US has no groups, so this
// is empty there and the kernel behaves exactly as before.
const _groupCache = new WeakMap();
function groupIndex(basemap) {
  if (_groupCache.has(basemap)) return _groupCache.get(basemap);
  const index = {};
  for (const [slug, g] of Object.entries(basemap.groups || {})) {
    index[normName(slug)] = slug;
    index[normName(g.label)] = slug;
    for (const a of g.aliases || []) index[normName(a)] = slug;
  }
  _groupCache.set(basemap, index);
  return index;
}

/** Pick the read-mode variant from the section's class tokens. */
function pickVariant(classTokens) {
  return classTokens.includes('highlight') ? 'highlight' : 'choropleth';
}

/**
 * Resolve which basemap a section's class tokens select. Two axes:
 *   - basemap : `us` / `usa` → US states; otherwise the WORLD countries map
 *               (the default — bare `map` is a world map). `world` is accepted
 *               as the explicit, symmetric form of the default.
 *   - projection (world only) : `robinson` swaps in the Robinson variant;
 *               otherwise Equal Earth (the area-preserving default).
 * `us` wins over `world`/`robinson` if both are present (robinson is world-only,
 * a no-op on the US map). Forward-compatible — a new basemap is one more token
 * + one more required JSON.
 */
function pickBasemap(classTokens) {
  if (Array.isArray(classTokens) && (classTokens.includes('us') || classTokens.includes('usa'))) {
    return US_BASEMAP;
  }
  return Array.isArray(classTokens) && classTokens.includes('robinson')
    ? WORLD_ROBINSON_BASEMAP
    : WORLD_BASEMAP;
}

/**
 * Parse the region list into a model. Returns null only when there is nothing
 * to draw (no list items) — an all-unmatched list still returns a model so the
 * basemap renders and the unmatched names are reported.
 */
function parseMap(ulInner, basemap = BASEMAP) {
  const rIndex = regionIndex(basemap);
  const gIndex = groupIndex(basemap);
  const rows = topLevelLis(ulInner).map((item) => {
    // Split an optional nested detail sublist off the row BEFORE reading the
    // name/value pill — it's the present-mode popover payload (see mark-detail.js).
    const { lead: rawLead, detail } = markDetail.splitDetail(item);
    const lead = rawLead.replace(/<\/?p>/g, '').trim();
    const m = lead.match(/^([\s\S]*?)\s*<code>([^<]+)<\/code>\s*$/);
    const name = stripTags(m ? m[1] : lead);
    const valueRaw = m ? m[2].trim() : '';
    const numMatch = valueRaw.replace(/,/g, '').match(/-?[\d.]+/);
    const num = numMatch ? parseFloat(numMatch[0]) : 0;
    // Resolve to a single region first, then a group (a "fat alias" → a set of
    // region ids). Names that are neither are unmatched.
    const key = normName(name);
    const regionId = rIndex[key] || null;
    const slug = !regionId ? (gIndex[key] || null) : null;
    let kind = 'unmatched', ids = [];
    if (regionId) { kind = 'region'; ids = [regionId]; }
    else if (slug) { kind = 'group'; ids = (basemap.groups[slug].members || []).filter((id) => basemap.regions[id]); }
    return { name, valueRaw, num, kind, ids, slug, detail };
  }).filter((r) => r.name || r.valueRaw);
  if (rows.length === 0) return null;

  const unmatched = rows.filter((r) => r.kind === 'unmatched');
  // Keep one legend entry per authored item, in authored order (highlight slot
  // assignment depends on it). A repeated SINGLE region collapses (last value
  // wins) — the long-standing behaviour; groups are always distinct entries.
  const ordered = [];
  for (const r of rows) {
    if (r.kind === 'unmatched') continue;
    if (r.kind === 'region') {
      const prev = ordered.find((x) => x.kind === 'region' && x.ids[0] === r.ids[0]);
      if (prev) { prev.valueRaw = r.valueRaw; prev.num = r.num; if (r.detail) prev.detail = r.detail; continue; }
    }
    ordered.push({ ...r });
  }
  const nums = ordered.map((r) => r.num);
  const minNum = nums.length ? Math.min(...nums) : 0;
  const maxNum = nums.length ? Math.max(...nums) : 0;
  return { basemap, matched: ordered, unmatched, minNum, maxNum };
}

// Choropleth ramp position (color-mix %) for a value within [min,max]. A flat
// series (min===max) pins to the ceiling so a single-value map still reads.
function rampMix(num, minNum, maxNum) {
  if (maxNum <= minNum) return MIX_CEIL;
  const t = (num - minNum) / (maxNum - minNum);
  return Math.round(MIX_FLOOR + t * (MIX_CEIL - MIX_FLOOR));
}

function buildMap(model, variant, classTokens = [], orientation) {
  const { basemap, matched, unmatched, minNum, maxNum } = model;
  const grouped = Array.isArray(classTokens) && classTokens.includes('grouped');
  const fillById = new Map(); // region id → { cls, style } (later rows override)

  // Compute each authored entry's fill, and lay it onto every region id it
  // covers (one for a region, many for a group). Later entries win on overlap.
  const entries = matched.map((r, i) => {
    // `cls`/`style` colour the region <path>s (CSS); `keyFill`/`keyStroke` colour
    // the SVG key swatch <rect> (inline) to MIRROR that region fill.
    let cls, style, keyFill, keyStroke;
    if (variant === 'highlight') {
      const slot = (i % CAT_SLOTS) + 1;
      style = `--region-hue:var(--chart-cat-${slot}-hue)`;
      cls = 'map-region map-region--hl';
      // SVG key swatch mirrors .map-region--hl (82% hue over the canvas).
      keyFill = `color-mix(in oklab, var(--chart-cat-${slot}-hue) 82%, var(--bg))`;
      keyStroke = `var(--chart-cat-${slot}-hue)`;
    } else {
      const mix = rampMix(r.num, minNum, maxNum);
      style = `--mix:${mix}%`;
      cls = 'map-region map-region--on';
      // SVG key swatch mirrors .map-region--on (the ramp tint over --map-base).
      keyFill = `color-mix(in oklab, var(--chart-cat-1-hue) ${mix}%, var(--map-base))`;
      keyStroke = `var(--chart-cat-1-hue)`;
    }
    // `i` is the authored-row (mark) index — every region path this row covers
    // carries the same data-mark, so the reveal layer lifts a whole group as one
    // and reads the row's detail template by index.
    for (const id of r.ids) fillById.set(id, { cls, style, mark: i, label: r.name, value: r.valueRaw });
    return { ...r, style, keyFill, keyStroke };
  });

  // Draw every basemap region; named ones carry their fill, the rest stay
  // neutral. Region order is basemap order (stable).
  const paths = Object.entries(basemap.regions).map(([id, r]) => {
    const fill = fillById.get(id);
    const cls = fill ? fill.cls : 'map-region';
    const style = fill ? ` style="${fill.style}"` : '';
    // data-mark groups a region with its authored row; data-label/value give the
    // reveal layer a uniform popover title (the row name, even for a group of
    // many regions). All invisible — the rendered PDF is byte-identical.
    const mark = fill
      ? ` data-mark="${fill.mark}" data-label="${esc(fill.label)}"${fill.value ? ` data-value="${esc(fill.value)}"` : ''}`
      : '';
    return `<path class="${cls}"${style}${mark} d="${r.d}"><title>${esc(r.name)}</title></path>`;
  }).join('');

  // Optional per-region detail: an inert <template> payload (read by the reveal
  // layer via data-mark) + a speaker-note fallback. Indexed by authored-row
  // order (== entries / matched order), so it aligns with the paths' data-mark.
  // Empty when no row carries a sublist — a plain map stays byte-identical.
  const detailWrap = markDetail.detailPayload(matched.map((r) => ({ detail: r.detail })));
  const note = markDetail.detailNote(
    matched.map((r) => ({ label: r.name, valueRaw: r.valueRaw, detail: r.detail })));

  // Legend order: high→low value (choropleth) or authored order (highlight).
  const legendEntries = variant === 'highlight' ? entries : [...entries].sort((a, b) => b.num - a.num);
  const toRow = (e) => ({
    swatchFill: e.keyFill, swatchStroke: e.keyStroke,
    label: e.name, value: e.valueRaw || null,
  });

  // Build the SVG-native key rows (the order/grouping logic is unchanged; only the
  // emitted markup moved from HTML <li> to the shared builder's row model). Group
  // headings become `head` rows; unmatched entries a hollow `?` chip.
  let rows = [];
  if (grouped) {
    // Cluster entries by continent (region entries) / "Groups" (group entries).
    // A no-op grouping (US, no continents) falls back to one flat cluster.
    const clusters = new Map();
    for (const e of legendEntries) {
      const key = e.kind === 'group' ? 'Groups'
        : (basemap.regions[e.ids[0]] && basemap.regions[e.ids[0]].continent) || '';
      (clusters.get(key) || clusters.set(key, []).get(key)).push(e);
    }
    const keys = [...clusters.keys()].sort((a, b) =>
      (a === 'Groups') - (b === 'Groups') || a.localeCompare(b));
    for (const k of keys) {
      if (k) rows.push({ head: true, label: k });
      for (const e of clusters.get(k)) rows.push(toRow(e));
    }
  } else {
    rows = legendEntries.map(toRow);
  }
  for (const r of unmatched) {
    rows.push({ swatchFill: 'transparent', swatchStroke: 'var(--text-muted)', label: r.name, value: '?' });
  }

  const unmatchedAttr = unmatched.length
    ? ` data-unmatched="${esc(unmatched.map((r) => r.name).join(', '))}"`
    : '';

  // The basemap viewBox sets the diagram box; the key rail appends to its right
  // and the whole unit (map letterboxed via preserveAspectRatio + key) scales as
  // one. A keyless map keeps its plain basemap viewBox.
  if (!rows.length) {
    const svg = `<svg class="map-svg" viewBox="${basemap.viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-hidden="true">${paths}</svg>`;
    return `<div class="map-figure" data-basemap="${esc(basemap.id)}"${unmatchedAttr}>${svg}${detailWrap}</div>${note}`;
  }
  const [, , vbW, vbH] = basemap.viewBox.split(/\s+/).map(Number);
  const hasValues = rows.some((r) => r.value != null);
  const key = buildSvgLegend({ rows, diagramRight: vbW, diagramHeight: vbH, hasValues, orientation });
  const svg = `<svg class="map-svg" viewBox="0 0 ${key.viewW} ${key.viewH}" ` +
    `preserveAspectRatio="xMidYMid meet" role="img"><title>Map</title>${key.desc}` +
    `<defs>${key.defs}</defs>` +
    `<g transform="translate(${key.diagramDx} ${key.diagramDy})">${paths}</g>` +
    `${key.body}</svg>`;
  return `<div class="map-figure" data-basemap="${esc(basemap.id)}"${unmatchedAttr}>${svg}${detailWrap}</div>${note}`;
}

module.exports = {
  parseMap, buildMap, pickVariant, pickBasemap, normName,
  regionIndex, groupIndex, BASEMAP, US_BASEMAP, WORLD_BASEMAP, WORLD_ROBINSON_BASEMAP, MIX_FLOOR, MIX_CEIL,
};
