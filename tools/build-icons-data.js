#!/usr/bin/env node
/**
 * Build the icons plugin's two generated files from its curation list
 * (engineering/decisions/2026-09-29-inline-icons.md § 7 and § 9):
 *
 *   lib/plugins/icons/icons.vocab.generated.js   small: every name, its aliases, and the
 *                                                service-name coaching table. The kernel
 *                                                requires it, so it ships wherever icons are read.
 *   lib/plugins/icons/icons.data.generated.js    the drawings: name → [[tag, attrs], …], and each
 *                                                icon's category. Never required by a kernel; it
 *                                                reaches one through lib/plugins/plugin-data.js,
 *                                                and only for a deck that uses an icon.
 *
 * Sources, in lib/plugins/_icons-source/: `curation.json` (our name, the Tabler source or one of
 * OUR drawings in `own/`, the category, the aliases), `coaching.json` (a vendor service name → the
 * role icon to use instead, § 4), and the pinned `@tabler/icons` dev dependency's outline nodes.
 *
 * THE DRAWINGS ARE VALIDATED, not copied: each node must be one of six shape elements with only
 * its geometry attributes (no fill, no stroke, no style, no href), so a later Tabler release
 * cannot slip color or markup into a slide. Our own SVGs pass the same check.
 *
 *   node tools/build-icons-data.js           write both files
 *   node tools/build-icons-data.js --check   exit 1 when either is stale
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'lib', 'plugins', 'icons');
/** The sources, outside the package (an `_` folder is not a package, lib/packages/kinds.js). */
const SRC = path.join(ROOT, 'lib', 'plugins', '_icons-source');
const VOCAB_FILE = path.join(DIR, 'icons.vocab.generated.js');
const DATA_FILE = path.join(DIR, 'icons.data.generated.js');
const check = process.argv.includes('--check');

/** The geometry each shape may carry; anything else fails the build. */
const SHAPES = Object.freeze({
  path: ['d'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
});
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const CATEGORIES = Object.freeze(['compute', 'storage', 'data', 'network', 'security', 'integration',
  'observability', 'delivery', 'clients', 'people', 'business']);

function fail(msg) {
  process.stderr.write(`build-icons-data: ${msg}\n`);
  process.exit(1);
}

function validNodes(nodes, where) {
  if (!Array.isArray(nodes) || !nodes.length) fail(`${where}: no drawing`);
  return nodes.map(([tag, attrs], k) => {
    const allowed = SHAPES[tag];
    if (!allowed) fail(`${where}: node ${k} is <${tag}>, not one of ${Object.keys(SHAPES).join(', ')}`);
    const out = {};
    for (const [a, v] of Object.entries(attrs || {})) {
      if (!allowed.includes(a)) fail(`${where}: <${tag}> carries "${a}", which is not geometry`);
      if (!/^[-0-9.,\sa-zA-Z]*$/.test(String(v))) fail(`${where}: <${tag} ${a}> is not a plain coordinate list`);
      out[a] = String(v);
    }
    return [tag, out];
  });
}

/** Our own drawings: plain SVG with shape elements only (the house grid is Tabler's, § 3). */
function ownNodes(file) {
  const src = fs.readFileSync(path.join(SRC, 'own', `${file}.svg`), 'utf8');
  const body = src.replace(/<\?xml[^>]*>|<svg\b[^>]*>|<\/svg>/g, '').trim();
  const nodes = [];
  for (const m of body.matchAll(/<([a-z]+)\b([^>]*?)\/>/g)) {
    nodes.push([m[1], Object.fromEntries([...m[2].matchAll(/([a-z0-9-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]))]);
  }
  if (body.replace(/<([a-z]+)\b([^>]*?)\/>/g, '').trim()) fail(`own/${file}.svg holds something other than self-closing shape elements`);
  return nodes;
}

function build() {
  const curation = JSON.parse(fs.readFileSync(path.join(SRC, 'curation.json'), 'utf8'));
  const coaching = JSON.parse(fs.readFileSync(path.join(SRC, 'coaching.json'), 'utf8'));
  let tabler;
  try {
    // By path: the package's `exports` map exposes only `icons/*`.
    tabler = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', '@tabler', 'icons', 'tabler-nodes-outline.json'), 'utf8'));
  } catch {
    fail('the @tabler/icons dev dependency is not installed — run npm install');
  }
  const names = [];
  const aliases = {};
  const category = {};
  const icons = {};
  const claimed = new Map();
  const claim = (word, by) => {
    if (!NAME.test(word)) fail(`"${word}" (${by}) is not a lower-case name`);
    if (claimed.has(word)) fail(`"${word}" is claimed by both ${claimed.get(word)} and ${by}`);
    claimed.set(word, by);
  };
  for (const e of curation) {
    claim(e.name, e.name);
    if (!CATEGORIES.includes(e.category)) fail(`${e.name}: category "${e.category}" is not one of ${CATEGORIES.join(', ')}`);
    if (Boolean(e.tabler) === Boolean(e.own)) fail(`${e.name}: name exactly one source, "tabler" or "own"`);
    const nodes = e.own ? ownNodes(e.own) : tabler[e.tabler];
    if (!nodes) fail(`${e.name}: Tabler has no outline icon "${e.tabler}"`);
    icons[e.name] = validNodes(nodes, e.name);
    names.push(e.name);
    category[e.name] = e.category;
    if (e.aliases?.length) {
      for (const a of e.aliases) claim(a, `an alias of ${e.name}`);
      aliases[e.name] = [...e.aliases];
    }
  }
  // A service name must never also be an icon or alias (§ 9: "service names are not aliases"),
  // and must point at an icon that exists.
  for (const [svc, role] of Object.entries(coaching)) {
    if (claimed.has(svc)) fail(`service name "${svc}" is also ${claimed.get(svc) === svc ? 'an icon' : claimed.get(svc)} — a vendor name may only coach`);
    if (!icons[role]) fail(`service name "${svc}" points at "${role}", which is not an icon`);
  }
  const header = (what) => `// GENERATED by tools/build-icons-data.js from lib/plugins/_icons-source/curation.json — do not edit.\n// ${what}\n// Design: engineering/decisions/2026-09-29-inline-icons.md. Regenerate: npm run build.\n`;
  const vocab = `${header('The icon VOCABULARY: names, aliases and the service-name coaching table. Small; the kernel requires it.')}
module.exports = Object.freeze({
  NAMES: Object.freeze(${JSON.stringify(names)}),
  ALIASES: Object.freeze(${JSON.stringify(aliases)}),
  SERVICES: Object.freeze(${JSON.stringify(Object.fromEntries(Object.entries(coaching).sort()))}),
});
`;
  const lines = names.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(icons[n])},`);
  const data = `${header('The icon DRAWINGS: name → [[tag, geometry], …] on a 24-unit grid. Never required by a kernel; read through lib/plugins/plugin-data.js.')}
/*! Tabler Icons — https://tabler.io/icons — MIT License, Copyright (c) 2020-2026 Paweł Kuna.
 * Full notice: lib/plugins/_icons-source/LICENSE-tabler.md. stream and gateway are Lattice's own. */
module.exports = Object.freeze({
  category: Object.freeze(${JSON.stringify(category)}),
  icons: Object.freeze({
${lines.join('\n')}
  }),
});
`;
  return [[VOCAB_FILE, vocab], [DATA_FILE, data]];
}

const files = build();
if (check) {
  const stale = files.filter(([f, t]) => !fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== t);
  if (stale.length) fail(`stale: ${stale.map(([f]) => path.relative(ROOT, f)).join(', ')}. Run: node tools/build-icons-data.js`);
} else {
  for (const [f, t] of files) fs.writeFileSync(f, t);
  if (!process.argv.includes('--silent')) process.stdout.write(`icons data: ${files.length} files → lib/plugins/icons/\n`);
}
