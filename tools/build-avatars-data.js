#!/usr/bin/env node
/**
 * Build the avatars plugin's two generated files from its sources
 * (engineering/decisions/2026-10-09-inline-avatars.md § 6):
 *
 *   lib/plugins/avatars/avatars.vocab.generated.js   small: every trait and its options, the color
 *                                                    names, and the pools a name and a gender
 *                                                    preset draw defaults from. The kernel requires
 *                                                    it, so it ships wherever avatars are read.
 *   lib/plugins/avatars/avatars.data.generated.js    the drawings and the colors behind each color
 *                                                    name. Never required by a kernel; it reaches one
 *                                                    through lib/plugins/plugin-data.js, and only for
 *                                                    a deck that writes an avatar.
 *
 * Sources, in lib/plugins/_avatars-source/: `traits.json` (options, palettes, presets, pools) and
 * `parts.json` (the drawings).
 *
 * THE DRAWINGS ARE VALIDATED. Each node must be one of six shape elements carrying only geometry,
 * a paint ROLE (`$skin`, `$hair`, …) or `none` for fill and stroke, and a small set of numeric
 * presentation attributes. No literal color, no style, no href: a color reaches a slide only through
 * a palette in traits.json, and the kernel is the one place that resolves a role to it. Every trait
 * option must have a drawing, every drawing an option, and every pool and preset entry must name an
 * option that exists.
 *
 *   node tools/build-avatars-data.js           write both files
 *   node tools/build-avatars-data.js --check   exit 1 when either is stale
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'lib', 'plugins', 'avatars');
/** The sources, outside the package (an `_` folder is not a package, lib/packages/kinds.js). */
const SRC = path.join(ROOT, 'lib', 'plugins', '_avatars-source');
const VOCAB_FILE = path.join(DIR, 'avatars.vocab.generated.js');
const DATA_FILE = path.join(DIR, 'avatars.data.generated.js');
const check = process.argv.includes('--check');

const SHAPES = Object.freeze({
  path: ['d'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
});
/** Presentation attributes a node may carry besides its geometry. */
const PAINTS = Object.freeze(['fill', 'stroke']);
const NUMERIC = Object.freeze(['stroke-width', 'fill-opacity', 'stroke-opacity']);
const KEYWORD = Object.freeze({ 'stroke-linecap': ['round', 'butt', 'square'], 'stroke-linejoin': ['round', 'miter', 'bevel'] });
/** The paint roles the kernel resolves (avatars.inline.js `rolesFor`). */
const ROLES = Object.freeze(['skin', 'lip', 'hair', 'brow', 'eye', 'top', 'cover', 'ink', 'white', 'mouth', 'frame', 'shade', 'metal']);
/** The traits that are one drawing per option. */
const DRAWN = Object.freeze(['face', 'eyes', 'brows', 'nose', 'mouth', 'beard', 'glasses', 'clothing']);
/** The traits whose drawing differs per face shape (the ears sit differently on each). */
const FACE_KEYED = Object.freeze(['earrings']);
/** Traits that are off by default: no name, preset or skin tone may turn one on. */
const OPT_IN = Object.freeze(['earrings', 'headwear', 'clothing']);
/** The traits drawn in layers, and the layers each may have. */
const LAYERED = Object.freeze({ hair: ['back', 'mid', 'front'], headwear: ['back', 'front'] });
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const HEX = /^#[0-9A-F]{6}$/;

function fail(msg) {
  process.stderr.write(`build-avatars-data: ${msg}\n`);
  process.exit(1);
}

function validNodes(nodes, where) {
  if (!Array.isArray(nodes)) fail(`${where}: not a list of nodes`);
  return nodes.map((node, k) => {
    if (!Array.isArray(node) || node.length !== 2) fail(`${where}: node ${k} is not [tag, attrs]`);
    const [tag, attrs] = node;
    const geometry = SHAPES[tag];
    if (!geometry) fail(`${where}: node ${k} is <${tag}>, not one of ${Object.keys(SHAPES).join(', ')}`);
    const out = {};
    for (const [a, raw] of Object.entries(attrs || {})) {
      const v = String(raw);
      if (geometry.includes(a)) {
        if (!/^[-0-9.,\sa-zA-Z]*$/.test(v)) fail(`${where}: <${tag} ${a}> is not a plain coordinate list`);
      } else if (PAINTS.includes(a)) {
        if (v !== 'none' && !(v.startsWith('$') && ROLES.includes(v.slice(1)))) fail(`${where}: <${tag} ${a}="${v}"> is not a paint role (${ROLES.map((r) => `$${r}`).join(' ')}) or none`);
      } else if (NUMERIC.includes(a)) {
        if (!/^\d*\.?\d+$/.test(v)) fail(`${where}: <${tag} ${a}="${v}"> is not a number`);
      } else if (KEYWORD[a]) {
        if (!KEYWORD[a].includes(v)) fail(`${where}: <${tag} ${a}="${v}"> is not one of ${KEYWORD[a].join(', ')}`);
      } else {
        fail(`${where}: <${tag}> carries "${a}", which is neither geometry nor an allowed paint attribute`);
      }
      out[a] = v;
    }
    if (!('fill' in out)) fail(`${where}: <${tag}> node ${k} names no fill (write "none" for a line)`);
    return [tag, out];
  });
}

function sameSet(a, b, where) {
  const missing = a.filter((x) => !b.includes(x));
  const extra = b.filter((x) => !a.includes(x));
  if (missing.length) fail(`${where}: no drawing for ${missing.join(', ')}`);
  if (extra.length) fail(`${where}: a drawing for ${extra.join(', ')}, which is not an option`);
}

function build() {
  const src = JSON.parse(fs.readFileSync(path.join(SRC, 'traits.json'), 'utf8'));
  const parts = JSON.parse(fs.readFileSync(path.join(SRC, 'parts.json'), 'utf8'));
  const { palettes, traits, presets, pools, deep } = src;
  const hidesEarrings = src['hides-earrings'] || [];
  for (const c of hidesEarrings) if (!traits.headwear.includes(c) || c === 'none') fail(`hides-earrings: "${c}" is not a head covering`);

  for (const [trait, options] of Object.entries(traits)) {
    for (const o of options) if (!NAME.test(o)) fail(`${trait}: "${o}" is not a lower-case name`);
    if (new Set(options).size !== options.length) fail(`${trait}: an option is listed twice`);
  }
  for (const [pal, entries] of Object.entries(palettes)) {
    for (const [name, v] of Object.entries(entries)) {
      const hexes = typeof v === 'string' ? [v] : Object.values(v);
      for (const h of hexes) if (!HEX.test(h)) fail(`palette ${pal}.${name}: "${h}" is not an upper-case #RRGGBB`);
    }
  }
  for (const role of Object.keys(palettes.fixed)) if (!ROLES.includes(role)) fail(`palettes.fixed.${role} is not a paint role`);

  // The color traits' options ARE their palette's names.
  const colors = {
    skin: Object.keys(palettes.skin),
    'hair-color': Object.keys(palettes['hair-color']),
    'eye-color': Object.keys(palettes['eye-color']),
    top: Object.keys(palettes.top),
    // A head covering takes its color from the clothes' palette.
    'headwear-color': Object.keys(palettes.top),
  };
  const options = { ...traits, ...colors };

  // Every drawn trait has exactly its options' drawings; hair has a layer set per style.
  const drawings = {};
  for (const t of DRAWN) {
    sameSet(traits[t], Object.keys(parts[t] || {}), t);
    drawings[t] = {};
    for (const o of traits[t]) drawings[t][o] = validNodes(parts[t][o], `${t}.${o}`);
  }
  // A face-keyed drawing is one list for every face, or an object with a list for each face shape.
  for (const t of FACE_KEYED) {
    sameSet(traits[t], Object.keys(parts[t] || {}), t);
    drawings[t] = {};
    for (const o of traits[t]) {
      const v = parts[t][o];
      if (Array.isArray(v)) {
        const nodes = validNodes(v, `${t}.${o}`);
        drawings[t][o] = Object.fromEntries(traits.face.map((f) => [f, nodes]));
      } else {
        sameSet(traits.face, Object.keys(v || {}), `${t}.${o}`);
        drawings[t][o] = Object.fromEntries(traits.face.map((f) => [f, validNodes(v[f], `${t}.${o}.${f}`)]));
      }
    }
  }
  for (const [t, layerNames] of Object.entries(LAYERED)) {
    sameSet(traits[t], Object.keys(parts[t] || {}), t);
    drawings[t] = {};
    for (const o of traits[t]) {
      const layers = parts[t][o];
      for (const l of Object.keys(layers)) if (!layerNames.includes(l)) fail(`${t}.${o}: layer "${l}" is not one of ${layerNames.join(', ')}`);
      drawings[t][o] = {};
      for (const l of layerNames) if (layers[l]) drawings[t][o][l] = validNodes(layers[l], `${t}.${o}.${l}`);
    }
  }

  // Which hair layers a head covering hides: only a real covering, hairstyle and layer may be named.
  const coverage = {};
  for (const [cover, rules] of Object.entries(src.coverage || {})) {
    if (cover === '$comment') continue;
    if (!traits.headwear.includes(cover) || cover === 'none') fail(`coverage.${cover}: not a head covering`);
    if (!rules['*']) fail(`coverage.${cover}: needs a "*" rule (the hairstyles not named)`);
    coverage[cover] = {};
    for (const [style, layers] of Object.entries(rules)) {
      if (style !== '*' && !traits.hair.includes(style)) fail(`coverage.${cover}.${style}: not a hairstyle`);
      for (const l of layers) if (!LAYERED.hair.includes(l)) fail(`coverage.${cover}.${style}: "${l}" is not a hair layer`);
      coverage[cover][style] = [...layers];
    }
  }
  for (const cover of traits.headwear) if (cover !== 'none' && !coverage[cover]) fail(`coverage: no rule for ${cover}`);

  // Pools and presets name real options; `color` names a chart color slot.
  for (const [trait, pool] of Object.entries(pools)) {
    const allowed = trait === 'color' ? Array.from({ length: 12 }, (_, i) => `c${i + 1}`) : options[trait];
    if (!allowed) fail(`pools.${trait}: not a trait`);
    if (!pool.length) fail(`pools.${trait} is empty`);
    for (const o of pool) if (!allowed.includes(o)) fail(`pools.${trait}: "${o}" is not an option`);
  }
  if (!presets.neutral) fail('presets: "neutral" (no gender written) is required');
  for (const [gender, preset] of Object.entries(presets)) {
    if (!NAME.test(gender)) fail(`presets: "${gender}" is not a lower-case name`);
    for (const [trait, pool] of Object.entries(preset)) {
      if (!options[trait]) fail(`presets.${gender}.${trait}: not a trait`);
      if (!pool.length) fail(`presets.${gender}.${trait} is empty`);
      for (const o of pool) if (!options[trait].includes(o)) fail(`presets.${gender}.${trait}: "${o}" is not an option`);
    }
  }
  if (!deep || !Array.isArray(deep.skin) || !deep.pools) fail('deep: needs "skin" (the deeper tones) and "pools"');
  for (const s of deep.skin) if (!options.skin.includes(s)) fail(`deep.skin: "${s}" is not a skin tone`);
  for (const [trait, pool] of Object.entries(deep.pools)) {
    if (!pools[trait]) fail(`deep.pools.${trait}: only a trait with a shared pool can have a deep one`);
    for (const o of pool) if (!options[trait].includes(o)) fail(`deep.pools.${trait}: "${o}" is not an option`);
  }
  // Every trait that has no fixed default needs a pool, from the presets or the shared pools.
  for (const trait of Object.keys(options)) {
    const pooled = pools[trait] || Object.values(presets).every((p) => p[trait]);
    if (!pooled) fail(`${trait}: no pool to draw a default from (add it to pools, or to every preset)`);
  }

  // Opt-in traits default to their first option for everyone, so a name that writes none draws what
  // v1 drew: one-entry pool, no preset or deep override.
  for (const t of OPT_IN) {
    if (pools[t].length !== 1 || pools[t][0] !== traits[t][0]) fail(`pools.${t}: must be exactly ["${traits[t][0]}"] (an opt-in trait)`);
    for (const [g, p] of Object.entries(presets)) if (p[t]) fail(`presets.${g}.${t}: an opt-in trait takes no preset`);
    if (deep.pools[t]) fail(`deep.pools.${t}: an opt-in trait takes no deep pool`);
  }

  const vocab = {
    TRAITS: Object.fromEntries(Object.entries(options).map(([k, v]) => [k, [...v]])),
    GENDERS: Object.keys(presets),
    PRESETS: presets,
    POOLS: pools,
    DEEP: { skin: deep.skin, pools: deep.pools },
  };
  const data = { palettes, drawings, coverage, hidesEarrings };

  const header = (what) => `// GENERATED by tools/build-avatars-data.js from lib/plugins/_avatars-source/ — do not edit.\n// ${what}\n// Design: engineering/decisions/2026-10-09-inline-avatars.md. Regenerate: npm run build.\n`;
  const files = [
    [VOCAB_FILE, `${header('The avatar VOCABULARY: every trait and its options, the gender presets and the default pools. Required by the kernel; small.')}\nmodule.exports = Object.freeze(${JSON.stringify(vocab)});\n`],
    [DATA_FILE, `${header('The avatar DRAWINGS and colors: parts on a 100-unit grid, paints as roles. Never required by a kernel; read through lib/plugins/plugin-data.js.')}\nmodule.exports = Object.freeze(${JSON.stringify(data)});\n`],
  ];
  if (check) {
    const stale = files.filter(([f, text]) => !fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== text);
    if (stale.length) fail(`stale: ${stale.map(([f]) => path.relative(ROOT, f)).join(', ')}. Run: node tools/build-avatars-data.js`);
    return;
  }
  fs.mkdirSync(DIR, { recursive: true });
  for (const [f, text] of files) {
    if (fs.existsSync(f) && fs.readFileSync(f, 'utf8') === text) continue;
    fs.writeFileSync(f, text);
    process.stdout.write(`build-avatars-data: wrote ${path.relative(ROOT, f)}\n`);
  }
}

build();
