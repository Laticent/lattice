#!/usr/bin/env node
/**
 * Generates lib/forms/cell/masthead/stage-catalog.generated.js — a plain CJS
 * map (component name → "flow" | "canvas" | "sovereign") for EVERY layout,
 * bundled into dist/lattice-runtime.js so the masthead kernel can decide the
 * stage-cell treatment WITHOUT shipping the whole manifest catalog to the
 * browser (the same constraint that forces plugins.js's SOVEREIGN_FRAMES to
 * carry a baked fallback — the runtime bundle can't fs-load manifests).
 *
 * This is the SINGLE source of the stage-cell classification the three
 * hand-maintained Sets (STAGE_MIGRATED / STAGE_DEFERRED / SOVEREIGN_FRAMES)
 * used to encode imperatively. It composes two declarative inputs:
 *   · a component manifest's `stage: "flow" | "canvas"` field
 *     (flow → wrapped in `.cell-stage`; canvas → self-sizing direct-child body)
 *   · the sovereign frames, derived from lib/forms/frame/*'s
 *     `exemptFromChrome:true` (sovereignFrames) — these omit `stage` and are
 *     chrome-exempt (their stage is their own grid).
 * See engineering/decisions/2026-07-14-one-frame-model.md (step A).
 *
 * A drift test (test/unit/forms/stage-catalog.test.js) asserts this map
 * reproduces the OLD three-Set partition EXACTLY, so the refactor is
 * provably behavior-preserving.
 *
 * It ALSO generates a sibling lib/forms/cell/masthead/conformance-catalog.generated.js
 * — a plain CJS array of the sorted names of every manifest with
 * `conformance: "strict"` (the frame-conformance opt-in;
 * engineering/decisions/2026-07-15-model-driven-frame-render.md). Baked for the
 * same reason: the masthead kernel reads it to wrap a strict CANVAS in `.cell-stage`,
 * and the runtime bundle can't fs-load manifests. `--check` gates both files.
 *
 * And lib/core/segno-slots.generated.js — every manifest's `segno` slot specs, each compiled
 * here once so an ambiguous one fails the build (Segno phase 2).
 *
 * Usage:
 *   node tools/build-stage-catalog.js            regenerate
 *   node tools/build-stage-catalog.js --check     freshness gate (CI)
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadAll } = require('../lib/components');
const { sovereignFrames } = require('../lib/forms');

const ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'lib', 'forms', 'cell', 'masthead', 'stage-catalog.generated.js');
const CONFORMANCE_OUT_FILE = path.join(ROOT, 'lib', 'forms', 'cell', 'masthead', 'conformance-catalog.generated.js');
const CODA_OUT_FILE = path.join(ROOT, 'lib', 'forms', 'cell', 'coda', 'coda-catalog.generated.js');
const ALIGN_OUT_FILE = path.join(ROOT, 'lib', 'core', 'align-catalog.generated.js');
const LABEL_SET_OUT_FILE = path.join(ROOT, 'lib', 'core', 'label-set-catalog.generated.js');
const INLINE_RUN_OUT_FILE = path.join(ROOT, 'lib', 'core', 'inline-run-catalog.generated.js');
const CALLOUT_OUT_FILE = path.join(ROOT, 'lib', 'plugins', 'chart-family', 'shared', 'callout-catalog.generated.js');
const AXIS_OUT_FILE = path.join(ROOT, 'lib', 'core', 'axis-catalog.generated.js');
const SPECTRUM_OUT_FILE = path.join(ROOT, 'lib', 'core', 'spectrum-catalog.generated.js');
const SEGNO_OUT_FILE = path.join(ROOT, 'lib', 'core', 'segno-slots.generated.js');
const MEDIA_HOSTS_OUT_FILE = path.join(ROOT, 'lib', 'core', 'media-hosts.generated.js');
const PANE_OUT_FILE = path.join(ROOT, 'lib', 'forms', 'cell', 'pane', 'pane-catalog.generated.js');
const PANE_LINT_OUT_FILE = path.join(ROOT, 'lib', 'authoring', 'pane-lint.generated.js');
const VENUE_LINT_OUT_FILE = path.join(ROOT, 'lib', 'authoring', 'venue-capacity.generated.js');
const SLOT_CONTRACT_OUT_FILE = path.join(ROOT, 'lib', 'authoring', 'slot-contract.generated.js');
const LIST_CONTRACT_OUT_FILE = path.join(ROOT, 'lib', 'core', 'list-contract.generated.js');

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const silent = argv.includes('--silent') || check;

function build() {
  const sovereign = new Set(sovereignFrames());
  const catalog = {};
  for (const m of loadAll()) {
    const name = m.name;
    if (sovereign.has(name)) {
      if (m.stage) {
        throw new Error(
          `[build-stage-catalog] "${name}" is a sovereign (chrome-exempt) frame but also declares stage:"${m.stage}" — sovereign frames own their grid and must OMIT the stage field.`,
        );
      }
      catalog[name] = 'sovereign';
      continue;
    }
    if (m.stage !== 'flow' && m.stage !== 'canvas') {
      throw new Error(
        `[build-stage-catalog] non-sovereign component "${name}" must declare stage:"flow"|"canvas" in its manifest (got ${JSON.stringify(m.stage)}). See engineering/decisions/2026-07-14-one-frame-model.md.`,
      );
    }
    catalog[name] = m.stage;
  }
  // sovereign frames must all resolve to a real component (else the frame
  // catalog and component catalog have drifted).
  for (const id of sovereign) {
    if (!(id in catalog)) {
      throw new Error(`[build-stage-catalog] sovereign frame "${id}" has no component manifest — frame/component catalogs drifted.`);
    }
  }
  const sortedNames = Object.keys(catalog).sort();
  const sorted = {};
  for (const n of sortedNames) sorted[n] = catalog[n];
  return (
    '/* Auto-generated by tools/build-stage-catalog.js — DO NOT EDIT.\n' +
    "   Source: every component manifest's `stage` field (lib/components/) +\n" +
    '   the sovereign frames (lib/forms/frame/* exemptFromChrome).\n' +
    '   Rebuild: node tools/build-stage-catalog.js */\n' +
    'module.exports = ' + JSON.stringify(sorted, null, 2) + ';\n'
  );
}

// The strict-set: the sorted names of every manifest that has opted into the
// frame-conformance gate with `conformance: "strict"`
// (engineering/decisions/2026-07-15-model-driven-frame-render.md §2/§4). The
// masthead kernel is bundled into dist/lattice-runtime.js, which can't fs-load
// the manifests, so — exactly like the stage catalog above — the opt-in set is
// baked into a plain CJS array esbuild inlines. `wrapsStageBody` reads it so a
// strict CANVAS materializes its `.cell-stage` cell too (a strict SOVEREIGN
// still owns its own grid and does not wrap).
function buildConformance() {
  const strict = [];
  for (const m of loadAll()) {
    if (m.conformance === 'strict') strict.push(m.name);
  }
  strict.sort();
  const source =
    '/* Auto-generated by tools/build-stage-catalog.js — DO NOT EDIT.\n' +
    "   Source: every component manifest's `conformance` field (lib/components/) —\n" +
    '   the sorted names of the components that opted into the frame-conformance\n' +
    '   gate with `conformance: "strict"`.\n' +
    '   Rebuild: node tools/build-stage-catalog.js */\n' +
    'module.exports = ' + JSON.stringify(strict, null, 2) + ';\n';
  return { source, count: strict.length };
}


// The CODA catalog: for every layout, the two declarations the universal-coda
// kernel needs — where the cell DOCKS in that layout's outer structure, and which
// trailing elements the layout CLAIMS for its own anatomy (so the coda must not
// harvest them). Baked for the same reason as the two catalogs above: lib/core/coda.js
// is bundled into dist/lattice-runtime.js, which cannot fs-load the manifests.
//
// EVERY layout gets a row, including the ones that declare nothing — an absent row
// and a row saying "column, claims nothing" mean the same thing to the kernel, but
// only the explicit row lets `check` prove the catalog covers the whole catalog.
// A layout the kernel has never heard of still takes both beats (the opt-out
// default), so a third-party or brand-new component works untouched.
function buildCoda() {
  const catalog = {};
  for (const m of loadAll()) {
    const coda = m.coda || {};
    catalog[m.name] = {
      dock: coda.dock || 'column',
      claims: [...(coda.claims || [])].sort(),
      ...(coda.readsInsightLabel ? { readsInsightLabel: true } : {}),
    };
  }
  const sortedNames = Object.keys(catalog).sort();
  const sorted = {};
  for (const n of sortedNames) sorted[n] = catalog[n];
  const source =
    '/* Auto-generated by tools/build-stage-catalog.js — DO NOT EDIT.\n' +
    "   Source: every component manifest's `coda` field (lib/components/).\n" +
    '   dock   — the outer structure the coda cell docks into (column|row|grid).\n' +
    '   claims — trailing elements the layout keeps for its own anatomy.\n' +
    '   Rebuild: node tools/build-stage-catalog.js */\n' +
    'module.exports = ' + JSON.stringify(sorted, null, 2) + ';\n';
  return { source, count: sortedNames.length };
}

/**
 * The up-and-down ALIGNMENT default every component DECLARES — its `align` manifest field. Only
 * components that declare one appear here; the kernel treats an absent entry as "this
 * component reads the stage's align classes", stamps nothing, and leaves its stylesheet alone.
 *
 * Baked for the same reason the three catalogs above are: `lib/core/resolve-align.js` runs
 * inside the runtime bundle, which cannot fs-load manifests.
 */
function buildAlign() {
  const catalog = {};
  for (const m of loadAll()) {
    if (!m.align?.default) continue;
    catalog[m.name] = {
      default: m.align.default,
      ...(m.align.byFamily && Object.keys(m.align.byFamily).length
        ? { byFamily: Object.fromEntries(Object.entries(m.align.byFamily).sort()) }
        : {}),
      ...(m.align.byClass && Object.keys(m.align.byClass).length
        ? { byClass: Object.fromEntries(Object.entries(m.align.byClass).sort()) }
        : {}),
      ...(m.align.withCoda ? { withCoda: m.align.withCoda } : {}),
    };
  }
  const sortedNames = Object.keys(catalog).sort();
  const sorted = {};
  for (const n of sortedNames) sorted[n] = catalog[n];
  const source =
    '/* Auto-generated by tools/build-stage-catalog.js — DO NOT EDIT.\n' +
    "   Source: every component manifest's `align` field (lib/components/).\n" +
    '   default  — the up-and-down word when nothing else applies.\n' +
    '   byFamily — per-family override, for a layout that changes shape with the box.\n' +
    '   byClass  — per-variant override, for variants that are different shapes; beats byFamily.\n' +
    '   withCoda — the word when the slide ends in a key-insight / below-note panel.\n' +
    '   A component with no entry is NOT governed: nothing is stamped for it.\n' +
    '   Rebuild: node tools/build-stage-catalog.js */\n' +
    'module.exports = ' + JSON.stringify(sorted, null, 2) + ';\n';
  return { source, count: sortedNames.length };
}


/**
 * The INLINE RUN every component declares — its `inlineRun` manifest field: the list depths whose
 * items the component lays out as a flex or grid container, so a pill or bold span inside an item's
 * label would otherwise split the label into separate flex items (lib/core/inline-run.js).
 * Baked for the same reason the catalogs around it are: the transformer ships in the browser
 * runtime, which cannot fs-load a manifest. A component with no entry is untouched.
 */
function buildInlineRuns() {
  const catalog = {};
  for (const m of loadAll()) {
    const ir = m.inlineRun;
    if (!ir?.depths?.length) continue;
    catalog[m.name] = {
      depths: [...ir.depths].sort((a, b) => a - b),
      ...(ir.slots?.length ? { slots: [...ir.slots] } : {}),
    };
  }
  const sorted = {};
  for (const n of Object.keys(catalog).sort()) sorted[n] = catalog[n];
  const source =
    '/* Auto-generated by tools/build-stage-catalog.js — DO NOT EDIT.\n' +
    "   Source: every component manifest's `inlineRun` field (lib/components/).\n" +
    '   depths — the list depths (1 = an item of the section\'s outermost list) whose items get\n' +
    '            their leading inline run wrapped in one <span class="lat-run">.\n' +
    '   slots  — direct children of an item that the component\'s CSS reads as structure: a tag name\n' +
    '            (`code`) or a class token (`.lat-pill`). A trailing slot stays outside the run.\n' +
    '   A component with no entry is left alone.\n' +
    '   Rebuild: node tools/build-stage-catalog.js */\n' +
    'module.exports = ' + JSON.stringify(sorted, null, 2) + ';\n';
  return { source, count: Object.keys(sorted).length };
}

/**
 * The LABEL SET every component DECLARES — its `labelSet` manifest field: the members
 * it draws a key for, the default word for each, and the markers it deliberately leaves
 * unkeyed. Only components that declare one appear here; an absent entry means the
 * component has no closed set, so nothing reads a label set for it and `lint:deck` says
 * so rather than guessing a vocabulary.
 *
 * Baked for the same reason the four catalogs above are: `lib/core/label-set.js` and
 * `lib/authoring/lint-core.js` both run inside browser bundles that cannot fs-load a
 * manifest — and lint-core is fs-free by HARD RULE #7.
 *
 * ONE SOURCE, BOTH CONSUMERS. The transform takes its derived default from this catalog
 * and the lint checks an authored override's keys against the same rows, so a key
 * vocabulary that disagrees with what the component renders is not expressible. That is
 * the property `coda.claims` bought when it replaced two hand-maintained lists that were
 * wrong for 8 of 61 layouts.
 */
function buildLabelSets() {
  const catalog = {};
  for (const m of loadAll()) {
    const ls = m.labelSet;
    if (!ls?.members?.length) continue;
    const seen = new Set();
    for (const mem of ls.members) {
      if (seen.has(mem.key)) {
        throw new Error(`[build-stage-catalog] "${m.name}" declares labelSet member key ${JSON.stringify(mem.key)} twice — a key addresses one member.`);
      }
      seen.add(mem.key);
    }
    for (const u of ls.unkeyed || []) {
      if (seen.has(u.key)) {
        throw new Error(`[build-stage-catalog] "${m.name}" lists ${JSON.stringify(u.key)} as BOTH a labelSet member and unkeyed — it is one or the other.`);
      }
    }
    catalog[m.name] = {
      aria: ls.aria || 'Key',
      ...(ls.keyedBy === 'transformer' ? { keyedBy: 'transformer' } : {}),
      // Member order is the RENDER ORDER and the spine an override merges onto,
      // so it is preserved verbatim — never sorted, unlike the name keys below.
      members: ls.members.map((mem) => ({
        key: mem.key,
        ...(mem.label ? { label: mem.label } : {}),
        ...(mem.detail ? { detail: mem.detail } : {}),
      })),
      ...(ls.derivedLabels ? { derivedLabels: ls.derivedLabels } : {}),
      ...(ls.unkeyed?.length ? { unkeyed: ls.unkeyed.map((u) => ({ key: u.key, why: u.why })) } : {}),
    };
  }
  const sortedNames = Object.keys(catalog).sort();
  const sorted = {};
  for (const n of sortedNames) sorted[n] = catalog[n];
  const source =
    '/* Auto-generated by tools/build-stage-catalog.js — DO NOT EDIT.\n' +
    "   Source: every component manifest's `labelSet` field (lib/components/).\n" +
    '   aria          — the key\'s accessible name.\n' +
    '   members       — the keyable members IN RENDER ORDER; a member with no `label`\n' +
    '                   has its label DERIVED from the data at render time.\n' +
    '   derivedLabels — what those derived labels are read from.\n' +
    '   unkeyed       — markers the grammar takes in a cell but deliberately does not\n' +
    '                   key, each with the reason the lint quotes back to an author.\n' +
    '   A component with no entry has no closed set: nothing reads a label set for it.\n' +
    '   Rebuild: node tools/build-stage-catalog.js */\n' +
    'module.exports = ' + JSON.stringify(sorted, null, 2) + ';\n';
  return { source, count: sortedNames.length };
}


/**
 * The AXIS every component DECLARES — its `axisSet` manifest field.
 *
 * WHY A CATALOG RATHER THAN A LIST IN EACH READER. Three readers need to know
 * which components own a bracketed axis, and they are in different layers: the
 * two transforms (which body tag bounds their slots), `chart-narration` (whether
 * a one-span bracketed eyebrow is an axis or a caption), and `lint:deck` (whether
 * a key above the body will be misread). A hand-maintained list in each is the
 * drift `labelSet` was bought to end — and narration is the proof: without this
 * it expanded EVERY bracketed eyebrow, so a `bullet` caption was spoken as axis
 * names while the slide rendered it as a caption.
 *
 * `members` names the positions in order, which is what makes the declaration
 * readable — `["x", "y", "size"]` says a scatter takes three. `body` is the tag
 * that bounds the axis slot: a grid's is its TABLE, an SVG chart's is its LIST,
 * and taking the earliest of either for everyone is what let a framing bullet
 * above a grid's axis line destroy it.
 */
/**
 * The MEDIA HOSTS (engineering/decisions/2026-10-16-media-plugins.md §4.7, decision 19): every manifest's `media` field, the
 * layouts that seat `@image{…}` / `@video{…}` figures and what each decides about them. The markdown-it pass reads it at parse
 * time (lib/core/media-display.js `hostFor`), the runtime bundle cannot fs-load a manifest, and the component guide renders the
 * same field as its "Media inside" section, so the code and the docs read one declaration.
 */
function buildMediaHosts() {
  const catalog = {};
  for (const m of loadAll()) {
    const md = m.media;
    if (!md) continue;
    catalog[m.name] = {
      places: md.places,
      kinds: [...(md.kinds || ['image', 'video'])].sort(),
      ...(md.show ? { show: md.show } : {}),
      ...(md.ignores?.length ? { ignores: [...md.ignores].sort() } : {}),
    };
  }
  const sorted = {};
  for (const n of Object.keys(catalog).sort()) sorted[n] = catalog[n];
  const source =
    '/* Auto-generated by tools/build-stage-catalog.js — DO NOT EDIT.\n' +
    "   Source: every component manifest's `media` field (lib/components/).\n" +
    '   places  — flow (the figure sizes itself) | panel | tiles | background (the layout lays it out)\n' +
    '   kinds   — the media kinds the layout seats\n' +
    "   show    — the host's default for which of the record's words the slide shows\n" +
    '   ignores — the display settings that have nothing to act on in this layout\n' +
    '   Rebuild: node tools/build-stage-catalog.js */\n' +
    'module.exports = ' + JSON.stringify(sorted, null, 2) + ';\n';
  return { source, count: Object.keys(sorted).length };
}

/**
 * Segno slots (Segno phase 2, engineering/decisions/2026-09-28-segno-unified-inline-notation.md):
 * every manifest's `segno` field, keyed component → slot → spec. Each spec is COMPILED here
 * with Segno (`compileSlot`, @laticent/segno), so a slot Segno refuses — a bare word two parameters
 * could take, a tag that is not a tag — fails the build with the component and slot named,
 * never a render. The catalog holds the DATA; lib/core/segno-slots.js compiles it again, lazily,
 * in whichever process reads it (the runtime bundle cannot fs-load manifests).
 */
function buildSegnoSlots() {
  const { compileSlot } = require('@laticent/segno/read');
  const catalog = {};
  for (const m of loadAll()) {
    if (!m.segno || !Object.keys(m.segno).length) continue;
    const slots = {};
    for (const name of Object.keys(m.segno).sort()) {
      compileSlot(m.segno[name], `${m.name}.segno.${name}`);
      slots[name] = m.segno[name];
    }
    catalog[m.name] = slots;
  }
  const sorted = {};
  for (const n of Object.keys(catalog).sort()) sorted[n] = catalog[n];
  const source =
    '/* Auto-generated by tools/build-stage-catalog.js — DO NOT EDIT.\n' +
    "   Source: every component manifest's `segno` field (lib/components/ and each plugin's kinds/).\n" +
    '   component → slot → Segno slot spec (`compileSlot`, @laticent/segno); read through\n' +
    '   lib/core/segno-slots.js, which compiles each spec on first use.\n' +
    '   Rebuild: node tools/build-stage-catalog.js */\n' +
    'module.exports = ' + JSON.stringify(sorted, null, 2) + ';\n';
  return { source, count: Object.keys(sorted).length };
}

/**
 * lib/plugins/chart-family/shared/callout-catalog.generated.js: each chart manifest's `callout` defaults (today the side its
 * `@callout` notes sit on when the author does not say). The placement reads it at render time in the
 * engine, the runtime and the CLI, none of which can fs-load a manifest. A chart with no entry takes the
 * shared default: notes under the figure.
 */
function buildCallouts() {
  const catalog = {};
  for (const m of loadAll()) {
    const c = m.callout;
    if (!c) continue;
    if (c.side !== undefined && !['under', 'beside'].includes(c.side)) {
      throw new Error(`[build-stage-catalog] "${m.name}" callout.side must be "under" or "beside" (got ${JSON.stringify(c.side)}).`);
    }
    if (c.side) catalog[m.name] = { side: c.side };
  }
  const sorted = {};
  for (const n of Object.keys(catalog).sort()) sorted[n] = catalog[n];
  const source =
    '/* Auto-generated by tools/build-stage-catalog.js — DO NOT EDIT.\n' +
    "   Source: every component manifest's `callout` field (lib/components/).\n" +
    '   side — where the chart\'s `@callout` notes sit when the author does not say:\n' +
    '          `under` the figure (the default, so omitted) or `beside` it.\n' +
    '   A chart with no entry takes the shared default: notes under the figure.\n' +
    '   Rebuild: node tools/build-stage-catalog.js */\n' +
    'module.exports = ' + JSON.stringify(sorted, null, 2) + ';\n';
  return { source, count: Object.keys(sorted).length };
}

function buildSpectrumCatalog() {
  const catalog = {};
  for (const m of loadAll()) {
    if (m.spectrum === undefined || m.spectrum === true) continue;
    if (m.spectrum !== false && !['rainbow', 'solid', 'duo', 'mono'].includes(m.spectrum)) {
      throw new Error(`[build-stage-catalog] "${m.name}" spectrum must be true, false, or a style name (rainbow, solid, duo, mono) (got ${JSON.stringify(m.spectrum)}).`);
    }
    catalog[m.name] = m.spectrum;
  }
  const sorted = {};
  for (const n of Object.keys(catalog).sort()) sorted[n] = catalog[n];
  const source =
    '/* Auto-generated by tools/build-stage-catalog.js — DO NOT EDIT.\n' +
    "   Source: every component manifest's `spectrum` field (lib/components/).\n" +
    '   false      — the component has no spectrum: its slides get no-spectrum.\n' +
    '   a style    — the component pins that spectrum style (rainbow, solid, duo, mono).\n' +
    '   A component with no entry carries the default spectrum (the manifest said true or nothing).\n' +
    '   Applied by lib/core/component-spectrum.js in both render paths.\n' +
    '   Rebuild: node tools/build-stage-catalog.js */\n' +
    'module.exports = ' + JSON.stringify(sorted, null, 2) + ';\n';
  return { source, count: Object.keys(sorted).length };
}

function buildAxisSets() {
  const catalog = {};
  for (const m of loadAll()) {
    const ax = m.axisSet;
    if (!ax?.members?.length) continue;
    if (!Array.isArray(ax.members) || ax.members.some((x) => typeof x !== 'string' || !x.trim())) {
      throw new Error(`[build-stage-catalog] "${m.name}" axisSet.members must be non-empty position names.`);
    }
    const dupes = ax.members.filter((x, i) => ax.members.indexOf(x) !== i);
    if (dupes.length) {
      throw new Error(`[build-stage-catalog] "${m.name}" declares axisSet position ${JSON.stringify(dupes[0])} twice — a position names one axis. (buildLabelSets throws on the same shape; this one did not.)`);
    }
    const BODIES = { table: ['<table'], list: ['<ul', '<ol'] };
    if (!BODIES[ax.body]) {
      throw new Error(`[build-stage-catalog] "${m.name}" axisSet.body must be "table" or "list" (got ${JSON.stringify(ax.body)}).`);
    }
    catalog[m.name] = {
      members: ax.members.slice(),
      body: ax.body,
      bodyTags: BODIES[ax.body],
      ...(ax.keyBelow === false ? { keyBelow: false } : {}),
    };
  }
  const sortedNames = Object.keys(catalog).sort();
  const sorted = {};
  for (const n of sortedNames) sorted[n] = catalog[n];
  const source =
    '/* Auto-generated by tools/build-stage-catalog.js — DO NOT EDIT.\n' +
    "   Source: every component manifest's `axisSet` field (lib/components/).\n" +
    '   members   — the axis positions IN ORDER, as an author writes them in one\n' +
    '               bracketed list above the chart body.\n' +
    '   body      — what bounds the axis slot: a grid\'s TABLE or a chart\'s LIST.\n' +
    '   bodyTags  — that, as the tags the lift scans for.\n' +
    '   keyBelow  — false when the component has no label set below the body, so the\n' +
    '               lift must not consume a trailing coda as a key it never draws.\n' +
    '   A component with no entry does not own a bracketed axis: a bracketed span on\n' +
    '   its slide is an ordinary eyebrow and every reader must leave it alone.\n' +
    '   Rebuild: node tools/build-stage-catalog.js */\n' +
    'module.exports = ' + JSON.stringify(sorted, null, 2) + ';\n';
  return { source, count: sortedNames.length };
}

/** Whether a component's own anatomy uses `###`: a slot whose selector names an `h3`. A pane of
 *  it keeps every `###` it holds, instead of taking one as the pane's title or a new pane's start
 *  (lib/core/pane-spec.js `ownsHeadings`). Only `team-profile` (its `sides` roster labels) today. */
function ownsH3(m) {
  return Object.values(m.slots || {}).some((s) => /(?:^|[\s>+~,(])h3\b/.test(String(s?.selector || '')));
}

// The PANE catalog: for every layout, whether it can go in a pane (`fit`) and what it
// renders AS there (`form`). Baked for the same reason as the catalogs above: the carve
// (lib/core/panes.js) runs inside the browser bundle, which cannot fs-load the manifests.
// The budgets are NOT here — they are a lint concern, and `lint:deck` reads them from the
// manifests through its vocab. A layout with no `pane` field (an installed package) has no
// row, and the carve treats it as `fit: half`.
function buildPane() {
  const catalog = {};
  for (const m of loadAll()) {
    if (!m.pane) continue;
    // Every built-in row: the least share each direction reads at is measured per component, so
    // no default covers them. A MISSING row is an installed package, which fits any share.
    catalog[m.name] = { side: m.pane.side, stack: m.pane.stack, ...(m.pane.form ? { form: m.pane.form } : {}), ...(ownsH3(m) ? { h3: true } : {}), ...(m.hosts ? { host: true } : {}) };
  }
  const sorted = {};
  for (const n of Object.keys(catalog).sort()) sorted[n] = catalog[n];
  const source =
    '/* Auto-generated by tools/build-stage-catalog.js — DO NOT EDIT.\n' +
    "   Source: every component manifest's `pane` field (lib/components/).\n" +
    '   side  — the least share side by side a pane of it reads at, or false (never).\n' +
    '   stack — the least share of the height a stacked pane of it reads at, or false.\n' +
    '   form  — the component a pane renders this one AS, when it differs.\n' +
    "   h3    — its own anatomy uses `###` (a slot selector names h3), so a pane of it keeps them.\n" +
    "   host  — a HOST component (manifest `hosts`, columns / rows): its body is two panes, and it\n" +
    "           names nothing to render with where none were carved (lib/core/resolve-component.js).\n" +
    '   Measured by tools/measure-pane-fit.js, then reviewed. No row: fits any share.\n' +
    '   Rebuild: node tools/build-stage-catalog.js */\n' +
    'module.exports = ' + JSON.stringify(sorted) + ';\n';
  return { source, count: Object.keys(sorted).length };
}

// The PANE LINT table: every component's pane fit and budget, for the linter that runs where no
// vocab carries them — the Studio's live lint builds its vocab in studio.astro and sends only
// names, modifiers and capacity across. Derived by the SAME function `buildVocab` uses
// (lib/core/pane-spec.js `paneVocab`), so the Studio and `lint:deck` warn on the same numbers.
// Compact JSON: it rides the Studio's eager bundle, whose route budget is tight.
function buildPaneLint() {
  const { paneVocab } = require('../lib/core/pane-spec');
  const { paneSpec, paneBudget } = paneVocab(loadAll());
  const spec = {};
  for (const [name, row] of Object.entries(paneSpec)) spec[name] = row;
  const source =
    '/* Auto-generated by tools/build-stage-catalog.js — DO NOT EDIT.\n' +
    "   Source: every component manifest's `pane` field (lib/components/), through\n" +
    '   lib/core/pane-spec.js paneVocab. spec: every side/stack fit; budget: every pane budget.\n' +
    '   Rebuild: node tools/build-stage-catalog.js */\n' +
    'module.exports = ' + JSON.stringify({ spec, budget: paneBudget }) + ';\n';
  return { source, count: Object.keys(paneBudget).length };
}

// The SLOT CONTRACT table: every component's slots, reduced to what the `slot-contract` lint rule
// executes (`match` and `required`), plus each variant's
// `variantSlots` overrides and `variantKinds` (the `variant-inert` rule). lint-core is fs-free (HARD RULE #7), so it reads this table rather
// than the manifests (engineering/decisions/2026-11-19-deterministic-authoring-audit.md W1).
// Only what can produce a finding rides along: a required slot, or a list slot that names one
// marker. The packed table rides the lint VOCABULARY (lint.js buildVocab, the Studio page's inlined
// vocab), not lint-core's bundle, so the studio route's lintCoreGz pays only for the reader.
const strictMarker = (match) => !Array.isArray(match) && match?.kind === 'list' && match.marker !== 'any';
function slotRow(slot) {
  if (slot === null) return null;
  const row = {};
  if (slot.match !== undefined) row.match = slot.match;
  if (slot.required !== undefined) row.required = slot.required;
  return row;
}
const slotCounts = (slot) => slot === null || slot.required === true || strictMarker(slot.match);
// A component that declares a list contract (`lists`) has its markers normalized by the engine
// (lib/core/list-contract.js, W2), so either marker renders as the layout expects and the marker
// is no longer a finding: its list slots reach lint as `any`. The manifest keeps the marker it
// names, because that is the element the engine rewrites the list to.
function relaxMarkers(slot) {
  if (!slot?.match) return slot;
  const relax = (mt) => (mt?.kind === 'list' && mt.marker && mt.marker !== 'any' ? { ...mt, marker: 'any' } : mt);
  return { ...slot, match: Array.isArray(slot.match) ? slot.match.map(relax) : relax(slot.match) };
}
function buildSlotContract() {
  const { UNIVERSAL_MODIFIER_TOKENS, FAMILY_MODIFIER_TOKENS } = require('../lib/components');
  const BASE_WORDS = new Set(UNIVERSAL_MODIFIER_TOKENS);
  const FAMILY_WORDS = new Set(FAMILY_MODIFIER_TOKENS);
  const table = {};
  for (const m of loadAll()) {
    if (!m.slots) continue;
    const norm = m.lists ? relaxMarkers : (slot) => slot;
    const slots = Object.fromEntries(Object.entries(m.slots).map(([k, v]) => [k, norm(v)]).filter(([, v]) => slotCounts(v)).map(([k, v]) => [k, slotRow(v)]));
    const entry = { slots };
    if (m.variantSlots) {
      entry.variantSlots = Object.fromEntries(Object.entries(m.variantSlots).map(([v, over]) => [v, Object.fromEntries(Object.entries(over).map(([k, s]) => [k, slotRow(norm(s))]))]));
    }
    if (m.variantKinds) entry.variantKinds = m.variantKinds;
    // This component's own variants beyond the base groups. lint's `foreign-variant` reads it, so
    // `kpi gallery` (another layout's variant) is named instead of passing because SOME component
    // declares it. Family modifiers stay out: `checks-*` and `heat` act on any slide that carries
    // a state mark, so they are nobody's to own.
    const own = (m.variants || []).filter((t) => !BASE_WORDS.has(t) && !FAMILY_WORDS.has(t));
    if (own.length) entry.variants = own;
    table[m.name] = entry;
  }
  const source =
    '/* Auto-generated by tools/build-stage-catalog.js — DO NOT EDIT.\n' +
    "   Source: every component manifest's `slots`, `variantSlots`, `variantKinds` and `variants` (lib/components/, the chart kinds).\n" +
    '   ONE packed string (lib/authoring/slot-contract.js `unpackContract` reads it): lint.js puts it in the lint\n' +
    "   vocabulary as `slotContract`, so it rides the vocabulary every caller already hands lint-core (the CLI's\n" +
    "   buildVocab, the Studio page's inlined vocab) instead of lint-core's own bundle (the studio route's lintCoreGz).\n" +
    '   Rebuild: node tools/build-stage-catalog.js */\n' +
    'module.exports = ' + JSON.stringify(packContract(table)) + ';\n';
  return { source, count: Object.keys(table).length };
}

// The LIST CONTRACT table: every component's `lists` (and `variantLists`), with the element each
// list depth is rewritten to, read off its list slots' `match.marker` (`ordered` → `ol`, `bullet` →
// `ul`, `any` or no slot → null, which lib/core/list-contract.js reads as `ul`). A variant whose
// `variantSlots` or `variantLists` changes the answer gets its own row. The engine and the runtime
// both read it (lib/core/list-contract.js), so the runtime bundle carries no manifest
// (engineering/decisions/2026-11-19-deterministic-authoring-audit.md W2).
function listMarkers(slots) {
  const byDepth = [];
  // A slot whose marker is `any` but whose `selector` names one element (`ol > li`, the ledgers
  // authority-chain, regulatory-update, timeline-list) is read as that element: the layout reads
  // both, and the selector, which the semantic-invariant suite executes, stays true.
  const fromSelector = (sel) => {
    const ol = /(^|[\s>,(+~])ol\b/.test(sel || '');
    const ul = /(^|[\s>,(+~])ul\b/.test(sel || '');
    // Only `ol`: a `ul` is already what a neutral layout gets, and on a numbered-tags layout a
    // `ul > li` selector describes the unnumbered form, not a target to rewrite `1.` into.
    return ol && !ul ? 'ol' : null;
  };
  const visit = (match, selector) => {
    for (const mt of Array.isArray(match) ? match : [match]) {
      if (mt?.kind !== 'list') continue;
      const d = (mt.depth || 1) - 1;
      const named = mt.marker === 'ordered' ? 'ol' : mt.marker === 'bullet' ? 'ul' : null;
      const el = named || (d === 0 ? fromSelector(selector) : null);
      if (!el) continue;
      if (byDepth[d] && byDepth[d] !== el) throw new Error(`list contract: two list slots at depth ${d + 1} name different markers`);
      byDepth[d] = el;
    }
  };
  for (const slot of Object.values(slots)) if (slot) visit(slot.match, slot.selector);
  const out = Array.from({ length: byDepth.length }, (_, i) => byDepth[i] || null);
  return out;
}
// The deepest list depth any slot reads: below it, lists are left as the author wrote them (the
// owner's ruling on #3330: a nested `1.` the layout does not read keeps its numbered meaning).
function listDepths(slots) {
  let deepest = 0;
  for (const slot of Object.values(slots)) {
    for (const mt of [].concat(slot?.match)) if (mt?.kind === 'list') deepest = Math.max(deepest, mt.depth || 1);
  }
  return deepest;
}
const hasListSlot = (slots) => Object.values(slots || {}).some((s) => s && (Array.isArray(s.match) ? s.match : [s.match]).some((mt) => mt?.kind === 'list'));
function buildListContract() {
  const table = {};
  for (const m of [...loadAll()].sort((a, b) => a.name.localeCompare(b.name))) {
    const listed = hasListSlot(m.slots) || Object.values(m.variantSlots || {}).some(hasListSlot);
    if (listed && !m.lists) throw new Error(`list contract: ${m.name} has a list slot but no \`lists\` (manifest.schema.json)`);
    if (!m.lists) continue;
    const base = { lists: m.lists, depths: listDepths(m.slots || {}), markers: listMarkers(m.slots || {}) };
    const variants = {};
    const names = new Set([...Object.keys(m.variantSlots || {}), ...Object.keys(m.variantLists || {})]);
    for (const v of [...names].sort()) {
      const slots = { ...(m.slots || {}) };
      for (const [k, s] of Object.entries(m.variantSlots?.[v] || {})) {
        if (s === null) delete slots[k];
        else slots[k] = { ...(slots[k] || {}), ...s };
      }
      const row = { lists: m.variantLists?.[v] || m.lists, depths: listDepths(slots), markers: listMarkers(slots) };
      if (JSON.stringify(row) !== JSON.stringify(base)) variants[v] = row;
    }
    table[m.name] = Object.keys(variants).length ? { ...base, variants } : base;
  }
  const body = Object.entries(table).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  const source =
    '/* Auto-generated by tools/build-stage-catalog.js — DO NOT EDIT.\n' +
    "   Source: every component manifest's `lists`, `variantLists` and list slots' `match.marker`.\n" +
    '   lists   — prose (R1), numbered-tags (R2) or neutral (R3).\n' +
    '   depths  — the deepest list depth a slot reads; deeper lists are left as written.\n' +
    '   markers — per list depth, the element lib/core/list-contract.js rewrites a list to (null: `ul`).\n' +
    '   Rebuild: node tools/build-stage-catalog.js */\n' +
    `module.exports = {\n${body}\n};\n`;
  return { source, count: Object.keys(table).length };
}

// The packed form is lib/authoring/slot-contract-pack.js `packContract`.
const { packContract } = require('../lib/authoring/slot-contract-pack');

// The VENUE CAPACITY table: every component's measured element count at each `venue:` rung, from
// its manifest's `venueCapacity` (2026-09-25-font-scale-fit.md, Amendment 2026-09-27). lint-core
// reads it as `SCALE_CAPACITY` / `CODE_LINES_AT_SCALE`, so `lint:deck` and the Studio's live lint
// warn on the numbers the manifest states, and no second copy lives in the linter. Rows are arrays
// in `FONT_SCALE_ORDER` (laptop 1x, huddle 1.15x, conference 1.3x, hall 1.5x). A manifest that says
// `none` has no row. Compact JSON: it rides the Studio's eager bundle, like the pane table.
const VENUE_ORDER = ['laptop', 'huddle', 'conference', 'hall'];
function buildVenueLint() {
  const items = {};
  // `variants`: "<component> <token>" → a word map, for a register that holds more or less than
  // the bare component. `insight`: component → a word map measured with a trailing insight
  // callout. Both optional per manifest; lint-core decides how to apply them.
  const variants = {};
  const insight = {};
  const insightVariants = {};
  const eyebrow = {};
  const insightEyebrow = {};
  const eyebrowStrict = {};
  const panel = {};
  const panelNot = {};
  const rows = {};
  const points = {};
  // `prose`: component → { slot, row } for a component that is one block of prose, whose budget is a
  // WORD count at each rung, not an element count (lint's `venue-prose`; lib/authoring/venue-prose.js).
  const prose = {};
  let rowFrame = null;
  // Universal modifiers a `venueCapacity.rows` register may be measured with (Amendment (10)).
  const ROW_MODIFIERS = ['compact'];
  // The count axis of a row whose component has no `capacity` block (lint's venue-only path).
  const axis = {};
  let codeRows = null;
  let compareCode = null;
  const row = (r) => VENUE_ORDER.map((v) => r[v]);
  for (const m of [...loadAll()].sort((a, b) => a.name.localeCompare(b.name))) {
    const vc = m.venueCapacity;
    if (!vc || vc.none) continue;
    if (vc.lines) {
      // A line budget per code pane. Lint reads `code`'s (CODE_LINES_AT_SCALE) and compare-code's.
      // compare-code's pane holds the taller of its two blocks; lint judges it the same way (`compareCode`).
      if (m.name === 'code' || m.name === 'compare-code') {
        const code = { bare: row(vc.lines.bare), eyebrow: row(vc.lines.eyebrow) };
        if (m.name === 'code') codeRows = code;
        else compareCode = code;
        // The same pane with the slide ending in a `> …` callout, when measured (`--insight`).
        if (vc.lines.insight) code.insight = row(vc.lines.insight);
        if (vc.lines.eyebrowInsight) code.eyebrowInsight = row(vc.lines.eyebrowInsight);
        // All four under a heading that wraps to 2 or 3 lines (`--heading-lines N`).
        if (vc.lines.headed) {
          code.headed = Object.fromEntries(Object.entries(vc.lines.headed).map(([k, g]) => [k, Object.fromEntries(Object.entries(g).map(([sh, r]) => [sh, row(r)]))]));
        }
      }
      continue;
    }
    if (vc.prose) {
      // Compact, since it rides the Studio's lint bundle: [slot, row, variants?] with variants as { token: row }.
      prose[m.name] = [vc.prose.slot, row(vc.prose.row)];
      const regs = (v) => Object.fromEntries(Object.entries(v).map(([tok, r]) => [tok, row(r)]));
      // [slot, row, variants | null, { family: [row, variants?] }]: the other canvases' budgets, when measured.
      if (vc.prose.variants || vc.prose.families) prose[m.name].push(vc.prose.variants ? regs(vc.prose.variants) : null);
      if (vc.prose.families) prose[m.name].push(Object.fromEntries(Object.entries(vc.prose.families).map(([f, r]) => [f, r.variants ? [row(r.row), regs(r.variants)] : [row(r.row)]])));
      continue;
    }
    const words = (byWords) => Object.fromEntries(Object.entries(byWords).map(([w, r]) => [w, row(r)]));
    items[m.name] = words(vc.byWords);
    if (vc.axis && vc.axis !== 'item') axis[m.name] = vc.axis;
    for (const [tok, v] of Object.entries(vc.variants || {})) {
      variants[`${m.name} ${tok}`] = words(v.byWords);
      if (v.insight) insightVariants[`${m.name} ${tok}`] = words(v.insight.byWords);
    }
    if (vc.insight) insight[m.name] = words(vc.insight.byWords);
    // The callout and an eyebrow together, measured: their costs do not add.
    if (vc.insight?.eyebrow) insightEyebrow[m.name] = words(vc.insight.eyebrow.byWords);
    // `eyebrow`: component → a word map measured under an eyebrow, whose cost lint subtracts.
    if (vc.eyebrow) eyebrow[m.name] = words(vc.eyebrow.byWords);
    // `eyebrowStrict`: the same row on a 4k deck, where the export forgives a third as much.
    if (vc.eyebrow?.strict) eyebrowStrict[m.name] = words(vc.eyebrow.strict.byWords);
    // `panel`: "<component>" / "<component> <register>" → the claim panel's line geometry, each role
    // as [chars a line holds, px a line takes] per rung and `budget` per rung, and the variants the
    // geometry does not describe (Amendment (6)).
    if (vc.panel) {
      for (const [reg, g] of Object.entries(vc.panel.lines)) {
        panel[reg === 'bare' ? m.name : `${m.name} ${reg}`] = Object.fromEntries(Object.entries(g).map(([k, r]) => [k, row(r)]));
      }
      if (vc.panel.not) panelNot[m.name] = vc.panel.not;
    }
    // `rows`: component → the line geometry of its list or cards (Amendment (7)). `frame` per role as
    // rung arrays; each register keyed by its variant tokens ('' for bare), with `cols`, `span` and
    // per shape the item roles, `row` and `budget` as rung arrays. `of` is the component's variant
    // list, so lint can tell a slide in a measured register from one in an unmeasured one.
    if (vc.rows) {
      // Compact, since it rides the Studio's eager bundle: a px value the same at all four rungs
      // (a budget, a row's cost, within 2 px) is one number, and an `ordered` shape keeps only the
      // fields that differ from the unordered one. lint-core reads both forms.
      // Collapsed toward a warning: the least of a budget, the most of a cost.
      const rungs = (g) => Object.fromEntries(Object.entries(g).map(([k, r]) => {
        const a = row(r);
        // A one-row budget may be a list per item count at a rung (calibrate-rows.js), which stays as is.
        return [k, a.every((x) => typeof x === 'number') && Math.max(...a) - Math.min(...a) <= 2 ? (k === 'budget' ? Math.min(...a) : Math.max(...a)) : a];
      }));
      const regs = {};
      for (const [reg, g] of Object.entries(vc.rows)) {
        if (reg === 'frame') continue;
        // lint finds a register by joining the slide's variant tokens in the manifest's `variants`
        // order, so a key in any other order would never be read.
        // A universal modifier that changes the geometry (`compact`) may close a key, after the variants.
        const want = [...(m.variants || []), ...ROW_MODIFIERS].filter((v) => reg.split(' ').includes(v)).join(' ');
        if (reg !== 'bare' && reg !== want) throw new Error(`${m.name}: venueCapacity.rows key '${reg}' must name its variants in the manifest's order ('${want}').`);
        const out = {};
        for (const [k, v] of Object.entries(g)) {
          if (k === 'ordered' || k === 'frame') continue;
          out[k] = typeof v === 'object' ? rungs(v) : v;
        }
        // A register's own frame (`compact`) keeps only what the shared frame gets wrong: a px cost more
        // than 2 px off either way, or a line holding fewer characters. A line that holds more reads
        // the shared frame's fewer, which errs toward a warning by a fraction of a line (Amendment (10)).
        if (g.frame) {
          const base = rungs(vc.rows.frame);
          const own = Object.entries(rungs(g.frame)).filter(([k, v]) => [v].flat().some((x, j) => {
            const b = [base[k]].flat()[j];
            return Array.isArray(x) ? x[0] < b[0] - 0.05 || x[1] > b[1] : Math.abs(x - b) > 2;
          }));
          if (own.length) out.frame = Object.fromEntries(own);
        }
        for (const [shape, o] of Object.entries(g.ordered || {})) {
          // The same 2 px as across the rungs: a budget measured 1542 bare and 1543 numbered is one
          // stage, not a numbered register's own. Dropped only toward a warning, as `rungs` collapses:
          // the bare value stands in when it is the smaller budget or the larger cost, so a numbered
          // row 2 px dearer than the bare one keeps its own.
          const same = (k, a, b) => {
            if (typeof a !== 'number' || typeof b !== 'number') return JSON.stringify(a) === JSON.stringify(b);
            return k === 'budget' ? b <= a && a - b <= 2 : b >= a && b - a <= 2;
          };
          const own = Object.entries(rungs(o)).filter(([k, v]) => !same(k, v, out[shape]?.[k]));
          (out.ordered ||= {})[shape] = Object.fromEntries(own);
        }
        // A register measured the same as one before it is baked as that one's key (compare-prose's
        // `chosen`, `mirror` and `transition` are bare's geometry): lint follows the string.
        const twin = Object.keys(regs).find((k) => typeof regs[k] !== 'string' && JSON.stringify(regs[k]) === JSON.stringify(out));
        regs[reg === 'bare' ? '' : reg] = twin != null ? twin : out;
      }
      // The frame is the standard frame's, the same measurement on every component that has one:
      // baked once as `rowFrame`, and per component only where it differs.
      const frame = rungs(vc.rows.frame);
      rowFrame ||= frame;
      // `of` gains a universal modifier only where a register is measured with it, so lint reads a
      // `compact` slide by that register and keeps any other `compact` slide on its count row.
      const mods = ROW_MODIFIERS.filter((t) => Object.keys(vc.rows).some((k) => k.split(' ').includes(t)));
      rows[m.name] = { of: [...(m.variants || []), ...mods], regs, ...(JSON.stringify(frame) === JSON.stringify(rowFrame) ? {} : { frame }) };
    }
    // `points`: component → its split-panel POINTS COLUMN's line geometry per register (Amendment
    // (10)), compacted the way `rows` is: a rung-equal px value is one number, `ordered` keeps what
    // differs, and a register measured the same as an earlier one is that one's key.
    if (vc.points) {
      const rungs = (g) => Object.fromEntries(Object.entries(g).map(([k, r]) => {
        const a = row(r);
        return [k, a.every((x) => typeof x === 'number') && Math.max(...a) - Math.min(...a) <= 2 ? (k === 'budget' ? Math.min(...a) : Math.max(...a)) : a];
      }));
      const regs = {};
      for (const [reg, g] of Object.entries(vc.points)) {
        const want = (m.variants || []).filter((v) => reg.split(' ').includes(v)).join(' ');
        if (reg !== 'bare' && reg !== want) throw new Error(`${m.name}: venueCapacity.points key '${reg}' must name its variants in the manifest's order ('${want}').`);
        const out = {};
        for (const [k, v] of Object.entries(g)) if (k !== 'ordered') out[k] = v && typeof v === 'object' && v.laptop != null ? rungs({ [k]: v })[k] : v;
        if (g.ordered) {
          const o = rungs(g.ordered);
          const own = Object.entries(o).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(out[k]));
          if (own.length) out.ordered = Object.fromEntries(own);
        }
        const twin = Object.keys(regs).find((k) => typeof regs[k] !== 'string' && JSON.stringify(regs[k]) === JSON.stringify(out));
        regs[reg === 'bare' ? '' : reg] = twin != null ? twin : out;
      }
      points[m.name] = { of: m.variants || [], regs };
    }
  }
  const source =
    '/* Auto-generated by tools/build-stage-catalog.js — DO NOT EDIT.\n' +
    "   Source: every component manifest's `venueCapacity` (lib/components/). items: element count\n" +
    '   per words-per-element, as [laptop, huddle, conference, hall]; code: pane lines, bare and\n' +
    '   under an eyebrow, and `headed` under a 2- or 3-line heading; variants: "<component> <token>" rows; insight: rows with a trailing\n' +
    '   insight callout; panel: claim-panel line geometry; rows: list and card line geometry; points: the\n' +
    '   split-panel points column\'s line geometry; prose: a one-block component\'s word budget\n' +
    '   per rung. Rebuild:\n' +
    '   node tools/build-stage-catalog.js */\n' +
    'module.exports = ' + JSON.stringify({ items, code: codeRows, compareCode, variants, insight, insightVariants, eyebrow, eyebrowStrict, insightEyebrow, axis, panel, panelNot, rows, rowFrame, points, prose }) + ';\n';
  return { source, count: Object.keys(items).length + Object.keys(prose).length + (codeRows ? 1 : 0) + (compareCode ? 1 : 0) };
}

function main() {
  const out = build();
  const { source: conformanceOut, count: conformanceCount } = buildConformance();
  const { source: codaOut, count: codaCount } = buildCoda();
  const { source: alignOut, count: alignCount } = buildAlign();
  const { source: labelSetOut, count: labelSetCount } = buildLabelSets();
  const { source: inlineRunOut, count: inlineRunCount } = buildInlineRuns();
  const { source: axisOut, count: axisCount } = buildAxisSets();
  const { source: calloutOut, count: calloutCount } = buildCallouts();
  const { source: spectrumOut, count: spectrumCount } = buildSpectrumCatalog();
  const { source: segnoOut, count: segnoCount } = buildSegnoSlots();
  const { source: mediaHostsOut, count: mediaHostsCount } = buildMediaHosts();
  const { source: paneOut, count: paneCount } = buildPane();
  const { source: paneLintOut, count: paneLintCount } = buildPaneLint();
  const { source: venueLintOut, count: venueLintCount } = buildVenueLint();
  const { source: slotContractOut, count: slotContractCount } = buildSlotContract();
  const { source: listContractOut, count: listContractCount } = buildListContract();
  const entryCount = (out.match(/": "/g) || []).length;
  if (check) {
    const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
    if (current !== out) {
      console.error('[build-stage-catalog] STALE — run `node tools/build-stage-catalog.js` and commit lib/forms/cell/masthead/stage-catalog.generated.js');
      process.exit(1);
    }
    const currentConformance = fs.existsSync(CONFORMANCE_OUT_FILE) ? fs.readFileSync(CONFORMANCE_OUT_FILE, 'utf8') : '';
    if (currentConformance !== conformanceOut) {
      console.error('[build-stage-catalog] STALE — run `node tools/build-stage-catalog.js` and commit lib/forms/cell/masthead/conformance-catalog.generated.js');
      process.exit(1);
    }
    const currentCoda = fs.existsSync(CODA_OUT_FILE) ? fs.readFileSync(CODA_OUT_FILE, 'utf8') : '';
    if (currentCoda !== codaOut) {
      console.error('[build-stage-catalog] STALE — run `node tools/build-stage-catalog.js` and commit lib/forms/cell/coda/coda-catalog.generated.js');
      process.exit(1);
    }
    const currentAlign = fs.existsSync(ALIGN_OUT_FILE) ? fs.readFileSync(ALIGN_OUT_FILE, 'utf8') : '';
    if (currentAlign !== alignOut) {
      console.error('[build-stage-catalog] STALE — run `node tools/build-stage-catalog.js` and commit lib/core/align-catalog.generated.js');
      process.exit(1);
    }
    const currentLabelSets = fs.existsSync(LABEL_SET_OUT_FILE) ? fs.readFileSync(LABEL_SET_OUT_FILE, 'utf8') : '';
    if (currentLabelSets !== labelSetOut) {
      console.error('[build-stage-catalog] STALE — run `node tools/build-stage-catalog.js` and commit lib/core/label-set-catalog.generated.js');
      process.exit(1);
    }
    const currentInlineRun = fs.existsSync(INLINE_RUN_OUT_FILE) ? fs.readFileSync(INLINE_RUN_OUT_FILE, 'utf8') : '';
    if (currentInlineRun !== inlineRunOut) {
      console.error('[build-stage-catalog] STALE — run `node tools/build-stage-catalog.js` and commit lib/core/inline-run-catalog.generated.js');
      process.exit(1);
    }
    const currentCallout = fs.existsSync(CALLOUT_OUT_FILE) ? fs.readFileSync(CALLOUT_OUT_FILE, 'utf8') : '';
    if (currentCallout !== calloutOut) {
      console.error('[build-stage-catalog] STALE — run `node tools/build-stage-catalog.js` and commit lib/plugins/chart-family/shared/callout-catalog.generated.js');
      process.exit(1);
    }
    const currentAxis = fs.existsSync(AXIS_OUT_FILE) ? fs.readFileSync(AXIS_OUT_FILE, 'utf8') : '';
    if (currentAxis !== axisOut) {
      console.error('[build-stage-catalog] STALE — run `node tools/build-stage-catalog.js` and commit lib/core/axis-catalog.generated.js');
      process.exit(1);
    }
    const currentSpectrum = fs.existsSync(SPECTRUM_OUT_FILE) ? fs.readFileSync(SPECTRUM_OUT_FILE, 'utf8') : '';
    if (currentSpectrum !== spectrumOut) {
      console.error('[build-stage-catalog] STALE — run `node tools/build-stage-catalog.js` and commit lib/core/spectrum-catalog.generated.js');
      process.exit(1);
    }
    const currentSegno = fs.existsSync(SEGNO_OUT_FILE) ? fs.readFileSync(SEGNO_OUT_FILE, 'utf8') : '';
    if (currentSegno !== segnoOut) {
      console.error('[build-stage-catalog] STALE — run `node tools/build-stage-catalog.js` and commit lib/core/segno-slots.generated.js');
      process.exit(1);
    }
    const currentMediaHosts = fs.existsSync(MEDIA_HOSTS_OUT_FILE) ? fs.readFileSync(MEDIA_HOSTS_OUT_FILE, 'utf8') : '';
    if (currentMediaHosts !== mediaHostsOut) {
      console.error('[build-stage-catalog] STALE — run `node tools/build-stage-catalog.js` and commit lib/core/media-hosts.generated.js');
      process.exit(1);
    }
    const currentPane = fs.existsSync(PANE_OUT_FILE) ? fs.readFileSync(PANE_OUT_FILE, 'utf8') : '';
    if (currentPane !== paneOut) {
      console.error('[build-stage-catalog] STALE — run `node tools/build-stage-catalog.js` and commit lib/forms/cell/pane/pane-catalog.generated.js');
      process.exit(1);
    }
    const currentPaneLint = fs.existsSync(PANE_LINT_OUT_FILE) ? fs.readFileSync(PANE_LINT_OUT_FILE, 'utf8') : '';
    if (currentPaneLint !== paneLintOut) {
      console.error('[build-stage-catalog] STALE — run `node tools/build-stage-catalog.js` and commit lib/authoring/pane-lint.generated.js');
      process.exit(1);
    }
    const currentVenueLint = fs.existsSync(VENUE_LINT_OUT_FILE) ? fs.readFileSync(VENUE_LINT_OUT_FILE, 'utf8') : '';
    if (currentVenueLint !== venueLintOut) {
      console.error('[build-stage-catalog] STALE — run `node tools/build-stage-catalog.js` and commit lib/authoring/venue-capacity.generated.js');
      process.exit(1);
    }
    const currentSlotContract = fs.existsSync(SLOT_CONTRACT_OUT_FILE) ? fs.readFileSync(SLOT_CONTRACT_OUT_FILE, 'utf8') : '';
    if (currentSlotContract !== slotContractOut) {
      console.error('[build-stage-catalog] STALE — run `node tools/build-stage-catalog.js` and commit lib/authoring/slot-contract.generated.js');
      process.exit(1);
    }
    const currentListContract = fs.existsSync(LIST_CONTRACT_OUT_FILE) ? fs.readFileSync(LIST_CONTRACT_OUT_FILE, 'utf8') : '';
    if (currentListContract !== listContractOut) {
      console.error('[build-stage-catalog] STALE — run `node tools/build-stage-catalog.js` and commit lib/core/list-contract.generated.js');
      process.exit(1);
    }
    if (!silent) console.log('[build-stage-catalog] up to date.');
    return;
  }
  fs.writeFileSync(OUT_FILE, out);
  fs.writeFileSync(CONFORMANCE_OUT_FILE, conformanceOut);
  fs.mkdirSync(path.dirname(CODA_OUT_FILE), { recursive: true });
  fs.writeFileSync(CODA_OUT_FILE, codaOut);
  fs.writeFileSync(ALIGN_OUT_FILE, alignOut);
  fs.writeFileSync(LABEL_SET_OUT_FILE, labelSetOut);
  fs.writeFileSync(INLINE_RUN_OUT_FILE, inlineRunOut);
  fs.writeFileSync(AXIS_OUT_FILE, axisOut);
  fs.writeFileSync(CALLOUT_OUT_FILE, calloutOut);
  fs.writeFileSync(SPECTRUM_OUT_FILE, spectrumOut);
  fs.writeFileSync(SEGNO_OUT_FILE, segnoOut);
  fs.writeFileSync(MEDIA_HOSTS_OUT_FILE, mediaHostsOut);
  fs.writeFileSync(PANE_OUT_FILE, paneOut);
  fs.writeFileSync(PANE_LINT_OUT_FILE, paneLintOut);
  fs.writeFileSync(VENUE_LINT_OUT_FILE, venueLintOut);
  fs.writeFileSync(SLOT_CONTRACT_OUT_FILE, slotContractOut);
  fs.writeFileSync(LIST_CONTRACT_OUT_FILE, listContractOut);
  if (!silent) {
    console.log(`[build-stage-catalog] wrote ${path.relative(ROOT, OUT_FILE)} (${entryCount} entries)`);
    console.log(`[build-stage-catalog] wrote ${path.relative(ROOT, CONFORMANCE_OUT_FILE)} (${conformanceCount} strict)`);
    console.log(`[build-stage-catalog] wrote ${path.relative(ROOT, CODA_OUT_FILE)} (${codaCount} layouts)`);
    console.log(`[build-stage-catalog] wrote ${path.relative(ROOT, ALIGN_OUT_FILE)} (${alignCount} governed)`);
    console.log(`[build-stage-catalog] wrote ${path.relative(ROOT, LABEL_SET_OUT_FILE)} (${labelSetCount} with a key)`);
    console.log(`[build-stage-catalog] wrote ${path.relative(ROOT, CALLOUT_OUT_FILE)} (${calloutCount} with a default side)`);
    console.log(`[build-stage-catalog] wrote ${path.relative(ROOT, INLINE_RUN_OUT_FILE)} (${inlineRunCount} with an inline run)`);
    console.log(`[build-stage-catalog] wrote ${path.relative(ROOT, SPECTRUM_OUT_FILE)} (${spectrumCount} opted out or pinned)`);
    console.log(`[build-stage-catalog] wrote ${path.relative(ROOT, AXIS_OUT_FILE)} (${axisCount} with an axis)`);
    console.log(`[build-stage-catalog] wrote ${path.relative(ROOT, SEGNO_OUT_FILE)} (${segnoCount} with Segno slots)`);
    console.log(`[build-stage-catalog] wrote ${path.relative(ROOT, MEDIA_HOSTS_OUT_FILE)} (${mediaHostsCount} media hosts)`);
    console.log(`[build-stage-catalog] wrote ${path.relative(ROOT, PANE_OUT_FILE)} (${paneCount} layouts)`);
    console.log(`[build-stage-catalog] wrote ${path.relative(ROOT, PANE_LINT_OUT_FILE)} (${paneLintCount} budgets)`);
    console.log(`[build-stage-catalog] wrote ${path.relative(ROOT, VENUE_LINT_OUT_FILE)} (${venueLintCount} venue budgets)`);
    console.log(`[build-stage-catalog] wrote ${path.relative(ROOT, SLOT_CONTRACT_OUT_FILE)} (${slotContractCount} slot contracts)`);
    console.log(`[build-stage-catalog] wrote ${path.relative(ROOT, LIST_CONTRACT_OUT_FILE)} (${listContractCount} list contracts)`);
  }
}

main();
