#!/usr/bin/env node

/**
 * build-projection-catalog.js — freeze every component manifest's `projection`
 * block into lib/core/projection-catalog.generated.mjs.
 *
 * WHY THIS EXISTS. Nine hand-maintained literals across five files and two module
 * systems each encoded one fact about how a component's rendered visual travels off
 * the slide — and FOUR of them held the identical twelve names:
 *
 *   CHART_TOKEN_COMPONENTS   lib/transformers/prose-projection.mjs
 *   KEYED_CHART_LAYOUTS      lib/export/image-set.js
 *   CLEAN_SVG_LAYOUTS        docs/src/components/studio/export/deck-export.js
 *   KEYED                    tools/export-chart-svg.js  (inside a page.evaluate,
 *                                                        invisible to a grep for
 *                                                        the exported name)
 *
 * Not one of them went red on omission. A chart missing from the first rendered
 * black fills (`color-mix(var(--chart-cat-N-hue) …)` collapsing to an undefined
 * var); one missing from the vector rosters silently downgraded its export to PNG.
 * That is the defect this catalog exists to delete, and it is the prerequisite for
 * anything a third party could contribute — a plugin cannot hand-edit deck-export.js.
 * See engineering/decisions/2026-09-13-projected-rosters.md.
 *
 * WHY GENERATED AND NOT SCANNED, and WHY .mjs.
 * Generated for the same reason as the chart registry: this file is bundled by
 * esbuild into dist/lattice-emulator.js and five docs-site bundles, which cannot
 * `fs`-load 69 manifests at run time. Emitted as ESM because the consumers straddle
 * both module systems — three are ESM in docs/src, three are CJS in lib/ — and
 * rollup cannot take named exports from a source-tree CommonJS file. That is the
 * exact shape lib/theme/edges.generated.mjs already ships in: `require()`d from CJS
 * on Node >= 22.12 (package.json pins it), imported by relative path in the docs
 * bundle. The chart registry could NOT take this route, because it emits
 * `require()` calls into CJS transform modules; a pure data catalog has no such tie.
 *
 * WHAT IS DERIVED HERE AND WHAT IS DECLARED. The generator derives the SETS
 * (`MEDIA_COMPONENTS` is every declared figure except `flow`, and so on) so the rule
 * lives in one place and every consumer reads a name rather than re-deriving it. It
 * derives NOTHING about a component from another manifest field: an earlier
 * motion-sheet.ts keyed on the `render` enum and got two backwards — `diagram`
 * declares SVG and emits no role, `state-chart` is `hybrid` and does. The figure
 * kind is declared per component, and `checkProjectionCoverage` in
 * tools/check-ownership.js makes a chart that forgets it a build failure.
 *
 * Usage:
 *   node tools/build-projection-catalog.js            # rewrite the catalog
 *   node tools/build-projection-catalog.js --check    # exit 1 if it is stale
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadAll } = require('../lib/components');

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const silent = argv.includes('--silent') || check;
const rootFlag = argv.indexOf('--root');

// `--root DIR` generates against another tree — DIR is the tree ROOT (the directory
// holding `lib/`), the same convention tools/build-chart-registry.js uses, and for the
// same one caller: the folder-drop proof copies lib/ to a scratch tree, drops a chart
// into it and runs the real generators there. A claim that a drop needs no central edit
// is worth nothing unless something actually drops one.
const ROOT = rootFlag >= 0 ? path.resolve(argv[rootFlag + 1]) : path.join(__dirname, '..');
const COMPONENTS_DIR = path.join(ROOT, 'lib', 'components');
const OUT_FILE = path.join(ROOT, 'lib', 'core', 'projection-catalog.generated.mjs');

const list = (names) => names.map((n) => `\t${JSON.stringify(n)},`).join('\n');

function build() {
  const projections = {};
  for (const m of loadAll(COMPONENTS_DIR)) {
    if (!m.projection) continue;
    projections[m.name] = m.projection;
  }
  // Sorted, so the output is a function of the manifests alone and two machines emit
  // the same bytes.
  const names = Object.keys(projections).sort();
  const figured = (kind) => names.filter((n) => projections[n].figure === kind);

  const svg = figured('svg');
  const flow = figured('flow');
  const spatial = figured('spatial');
  const placeholder = figured('placeholder');
  const bare = figured('bare');
  // MEDIA is every component with a re-hostable figure EXCEPT the flow layouts, which
  // the prose projection dispatches on their own branch before it reaches the media
  // one. `none` is excluded by construction: it declares that there is no producer.
  const media = [...svg, ...spatial, ...placeholder, ...bare].sort();
  const data = names.filter((n) => projections[n].data === true);

  const entries = names
    .map((n) => `\t${JSON.stringify(n)}: ${JSON.stringify(projections[n])},`)
    .join('\n');

  return `// GENERATED by tools/build-projection-catalog.js from every component manifest's
// \`projection\` block — DO NOT EDIT.
//
// How each component's rendered visual travels off the slide, and whether its
// substance counts as data. Read by the prose projection, the image-set export, the
// Studio's single-chart export, tools/export-chart-svg.js and the authoring
// scorecard — replacing nine hand-maintained literals, four of which held the same
// twelve names and none of which went red when a chart was missing from it.
//
// ESM so both module systems can reach it: CJS \`require()\`s it on Node >= 22.12, the
// docs bundles import it by relative path. Same shape as lib/theme/edges.generated.mjs.
// See engineering/decisions/2026-09-13-projected-rosters.md.

/** name → its declared projection block. The whole record; the sets below are views. */
export const PROJECTION = Object.freeze({
${entries}
});

/** Renders as ONE self-contained <svg>: re-hosts cleanly, extracts as standalone vector. */
export const SVG_CHART_LAYOUTS = Object.freeze([
${list(svg)}
]);

/** HTML+CSS flow-height layouts (\`cqi\` only): re-host the whole .chart-body. */
export const FLOW_CHART_COMPONENTS = Object.freeze([
${list(flow)}
]);

/** Absolutely-positioned / \`cqi\`-sized: needs a BOUNDED box to re-host. */
export const SPATIAL_BOUNDED_COMPONENTS = Object.freeze([
${list(spatial)}
]);

/** A static re-host cannot reconstruct these; they keep the honest placeholder. */
export const SPATIAL_PLACEHOLDER_COMPONENTS = Object.freeze([
${list(placeholder)}
]);

/** Re-hosts as a plain <figure> — does not ride the chart spectrum, so no chart-frame. */
export const BARE_FIGURE_COMPONENTS = Object.freeze([
${list(bare)}
]);

/** Every component with a re-hostable visual except the flow layouts (own branch, first). */
export const MEDIA_COMPONENTS = Object.freeze([
${list(media)}
]);

/** Substance is data: one on a deck makes the scorecard's Data category scorable. */
export const DATA_LAYOUTS = Object.freeze([
${list(data)}
]);
`;
}

function main() {
  const out = build();
  const target = OUT_FILE;
  if (check) {
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (current !== out) {
      console.error('[build-projection-catalog] STALE — run `node tools/build-projection-catalog.js` and commit lib/core/projection-catalog.generated.mjs');
      process.exit(1);
    }
    if (!silent) console.log('[build-projection-catalog] up to date.');
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, out);
  if (!silent) {
    const declared = (out.match(/^\t"[a-z0-9-]+": \{/gm) || []).length;
    console.log(`[build-projection-catalog] wrote ${path.relative(ROOT, target)} (${declared} components)`);
  }
}

main();
