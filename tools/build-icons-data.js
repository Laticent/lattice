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
 *   node tools/build-icons-data.js           write both files, and the status-mark block in base.tokens.css
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

// The MIT permission notice, verbatim, carried INSIDE the drawings (a `/*! … */` comment esbuild keeps,
// tools/build-plugin-data-bundles.js), because the data script travels alone: the docs site, the
// Export-to-Marp bundle and the Marp kit each ship it beside the runtime, and MIT asks the notice to go
// with every copy. The same text the kit's THIRD-PARTY-LICENSES.txt reads.
const MIT_NOTICE = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'assets', 'licenses', 'MIT-tabler-icons.txt'), 'utf8').trimEnd();

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

/**
 * Our own drawings: an SVG whose root holds shape elements only (the house grid is Tabler's, § 3).
 * Parsed as XML, never pattern-matched: anything that is not one of the six shapes — a <g>, a
 * <style>, text, a comment with content — fails the build rather than slipping past a regex.
 */
function ownNodes(file) {
  const { JSDOM } = require('jsdom');
  const src = fs.readFileSync(path.join(SRC, 'own', `${file}.svg`), 'utf8');
  const doc = new JSDOM(src, { contentType: 'image/svg+xml' }).window.document;
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) fail(`own/${file}.svg is not a well-formed SVG`);
  const nodes = [];
  for (const child of root.childNodes) {
    if (child.nodeType === 3 && !child.textContent.trim()) continue; // whitespace between elements
    if (child.nodeType !== 1) fail(`own/${file}.svg holds something other than shape elements`);
    if (child.childNodes.length) fail(`own/${file}.svg: <${child.localName}> has content`);
    nodes.push([child.localName, Object.fromEntries([...child.attributes].map((a) => [a.name, a.value]))]);
  }
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
/*! Tabler Icons — https://tabler.io/icons — stream and gateway are Lattice's own.
${MIT_NOTICE.split('\n').map((l) => ` *${l ? ` ${l}` : ''}`).join('\n')}
 */
module.exports = Object.freeze({
  category: Object.freeze(${JSON.stringify(category)}),
  icons: Object.freeze({
${lines.join('\n')}
  }),
});
`;
  return [[VOCAB_FILE, vocab], [DATA_FILE, data], spliceMarks(tabler)];
}

/**
 * THE STATUS MARKS (`--mark-*` in lib/base/base.tokens.css), drawn from the same pinned Tabler package
 * as the icons (engineering/decisions/2026-10-18-checks.md §20). A mark is a CSS mask a state disc
 * carries, so it is one SVG with no color (the stroke is `black`, which the mask reads as alpha) and no
 * `#` (the data URI then needs no escaping). Each entry in `_icons-source/marks.json` names its Tabler
 * icon and the fit that places it in the disc: `scale` about `from` (the icon's centre) onto `at`,
 * measured so it covers the ink box of the mark it replaced. Strokes are in DISC units, divided by the
 * scale so a mark's weight does not change with its size. `bold` is the `checks-bold` and chart-family
 * weight; a mask's stroke cannot be set from CSS, so bold is its own token.
 */
const TOKENS_FILE = path.join(ROOT, 'lib', 'base', 'base.tokens.css');
const MARKS_BEGIN = '  /* ── BEGIN GENERATED STATUS MARKS';
const MARKS_END = '  /* ── END GENERATED STATUS MARKS ── */';

function buildMarks(sets) {
  const marks = JSON.parse(fs.readFileSync(path.join(SRC, 'marks.json'), 'utf8'));
  const n = (v) => String(+v.toFixed(3));
  const url = (nodes, e, stroke) => {
    // One rounded scale for the transform AND the stroke, so the drawn weight is exactly `stroke`.
    const scale = +n(e.scale);
    const tf = `translate(${n(e.at[0])} ${n(e.at[1])}) scale(${scale}) translate(${n(-e.from[0])} ${n(-e.from[1])})`;
    const paint = stroke === null
      ? "fill='black'"
      : `fill='none' stroke='black' stroke-width='${n(stroke / scale)}' stroke-linecap='round' stroke-linejoin='round'`;
    const shapes = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}='${v}'`).join(' ')} ${paint}/>`).join('');
    return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><g transform='${tf}'>${shapes}</g></svg>")`;
  };
  const regular = [];
  const bold = [];
  for (const e of marks) {
    if (!NAME.test(e.mark)) fail(`marks.json: "${e.mark}" is not a lower-case name`);
    const set = e.set || 'outline';
    if (!sets[set]) fail(`marks.json: ${e.mark}: set "${set}" is not outline or filled`);
    const raw = sets[set][e.tabler];
    if (!raw) fail(`marks.json: ${e.mark}: Tabler has no ${set} icon "${e.tabler}"`);
    const nodes = validNodes(raw, `mark ${e.mark}`);
    if (!(e.scale > 0) || e.at?.length !== 2 || e.from?.length !== 2) fail(`marks.json: ${e.mark}: give a positive scale and two-number "at" and "from"`);
    const filled = set === 'filled';
    if (!e.boldOnly) regular.push(`  --mark-${e.mark}: ${url(nodes, e, filled ? null : e.stroke)};`);
    bold.push(`  --mark-${e.mark}-bold: ${url(nodes, e, filled ? null : e.bold)};`);
  }
  return [
    `${MARKS_BEGIN} — tools/build-icons-data.js writes this from`,
    '   * lib/plugins/_icons-source/marks.json and the pinned Tabler Icons (MIT, https://tabler.io/icons;',
    '   * the notice ships in the kits\' THIRD-PARTY-LICENSES.txt). DO NOT EDIT: change marks.json and',
    '   * rebuild; `--check` fails on a hand edit. ── */',
    ...regular,
    '  /* Heavier-stroked set for the `checks-bold` variant and the chart family (a mask\'s stroke',
    '   * can\'t be tuned by CSS var, so bold swaps the token). */',
    ...bold,
    MARKS_END,
  ].join('\n');
}

function spliceMarks(tabler) {
  let filled;
  try {
    filled = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', '@tabler', 'icons', 'tabler-nodes-filled.json'), 'utf8'));
  } catch {
    fail('the @tabler/icons dev dependency is not installed — run npm install');
  }
  const css = fs.readFileSync(TOKENS_FILE, 'utf8');
  const a = css.indexOf(MARKS_BEGIN);
  const b = css.indexOf(MARKS_END);
  if (a < 0 || b < a) fail('lib/base/base.tokens.css lost its GENERATED STATUS MARKS markers');
  return [TOKENS_FILE, css.slice(0, a) + buildMarks({ outline: tabler, filled }) + css.slice(b + MARKS_END.length)];
}

const files = build();
if (check) {
  const stale = files.filter(([f, t]) => !fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== t);
  if (stale.length) fail(`stale: ${stale.map(([f]) => path.relative(ROOT, f)).join(', ')}. Run: node tools/build-icons-data.js`);
} else {
  for (const [f, t] of files) fs.writeFileSync(f, t);
  if (!process.argv.includes('--silent')) process.stdout.write(`icons data: ${files.length - 1} files → lib/plugins/icons/, status marks → lib/base/base.tokens.css\n`);
}
