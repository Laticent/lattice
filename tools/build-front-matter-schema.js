#!/usr/bin/env node
/**
 * build-front-matter-schema.js — generate dist/schemas/front-matter.schema.json from the engine's
 * table of deck front-matter keys (lib/core/deck-settings.js).
 *
 * Why: an editor that reads JSON Schema (VS Code with the YAML extension, most IDEs) can then
 * complete a deck's keys and values and flag a typo as it is typed, outside the Studio. The schema
 * is DERIVED, never written by hand: one row of the table is one property here, and each value
 * list comes from the same resolver the renderer and the linter read (through the lint vocab), so
 * the three cannot disagree. Record: engineering/decisions/2026-10-15-conformance-harness.md §9
 * phase 1.
 *
 * Two keys stay open on purpose. `theme:` and `finish:` also accept a theme or finish the author
 * installed or saved, which no build-time list can know, so their known values are `examples`, not
 * an `enum`. An unknown KEY is refused (`additionalProperties: false`): that is the point of the
 * file, and lint:deck reports the same thing as a warning (`unknown-key`).
 *
 * Written to dist/ and NOT committed, like the other generated indexes
 * (engineering/decisions/2026-10-09-generated-indexes-uncommitted.md).
 *
 * Usage:
 *   node tools/build-front-matter-schema.js          # write dist/schemas/front-matter.schema.json
 *   node tools/build-front-matter-schema.js --check  # build it in memory and validate the TABLE;
 *                                                    # exit 1 on a row the schema cannot express
 */
const fs = require('node:fs');
const path = require('node:path');
const { withPluginRegisters, settingValues } = require('../lib/core/deck-settings');
const { withProse } = require('../lib/core/deck-settings.prose');
const { buildVocab } = require('../lib/authoring/lint');
const { SIZES } = require('../lib/core/sizes');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'schemas', 'front-matter.schema.json');
const OPEN_VALUES = new Set(['theme', 'finish']);
const KINDS = new Set(['register', 'axis', 'flag', 'text', 'number', 'path', 'css', 'list', 'map', 'directive', 'marp', 'retired']);

/**
 * The LFM 1.0 part (spec/LFM-1.0.md §1) each key belongs to, published as `x-lattice-profile` so a reader that
 * implements only some parts knows which keys are its business. Core keys change how a deck is read; Lens and Timing
 * keys belong to those profiles; `application` keys are a host's own (the Studio, the Coach, Marp metadata), which a
 * conforming renderer ignores. Every other key is Presentation.
 */
const PROFILE_BY_KEY = {
  lfm: 'core', split: 'core', lang: 'core', 'inline-code': 'notation',
  lenses: 'lens', 'lens-default': 'lens', 'lens-defaults': 'lens',
  pace: 'timing', delivery: 'timing', greeting: 'timing', closing: 'timing', terms: 'timing', lexicon: 'timing', acronyms: 'timing', say: 'timing', captions: 'timing', track: 'timing',
  title: 'application', 'ai-lang': 'application', profile: 'application', validate: 'application', description: 'application', author: 'application', keywords: 'application', url: 'application', image: 'application',
};
const PROFILE_BY_GROUP = { raw: 'application', developer: 'application' };
function profileOf(row) {
  return PROFILE_BY_KEY[row.key] || (row.kind === 'marp' ? 'application' : PROFILE_BY_GROUP[row.group]) || 'presentation';
}

/** A prefixed key (`acme.tally`) belongs to the plugin of that name (spec/EXTENDING-1.0.md §4): allowed, not listed. */
const { PREFIXED_KEY } = require('../lib/core/deck-settings');

/** One property's schema for a row. Throws on a row the schema cannot express. */
function propertyFor(row, lists) {
  if (!KINDS.has(row.kind)) throw new Error(`${row.key}: unknown kind '${row.kind}'`);
  // EXTENDING §3: every entry says the registry version that added it (`since`, 1.0 for every key 1.0 ships).
  const base = { description: row.info, 'x-lattice-profile': profileOf(row), 'x-lattice-since': row.since || REGISTRY_VERSION, ...(row.default && row.default !== 'none' ? { $comment: `default: ${row.default}` } : {}) };
  const names = settingValues(row, lists);
  switch (row.kind) {
    case 'register':
      if (!names?.length) throw new Error(`${row.key}: a register with no value list`);
      if (OPEN_VALUES.has(row.key)) return { ...base, type: 'string', pattern: '^[A-Za-z0-9_-]+$', examples: [...names] };
      // A register matches without regard to case (LFM 1.0 §4.2) — except `size:`, whose reader
      // is case-sensitive. An enum is exact, so the lower-case spellings are the ones offered.
      return { ...base, enum: row.key === 'size' ? [...names] : [...new Set(names.map((n) => String(n).toLowerCase()))] };
    case 'axis': {
      if (!names?.length) throw new Error(`${row.key}: an axis register with no words`);
      const word = names.map((n) => String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      return { ...base, type: ['string', 'number'], pattern: `^\\s*(?:(?:${word})(?:[\\s,]+|$))+$`, examples: [...names] };
    }
    case 'flag':
      return { ...base, anyOf: [{ type: 'boolean' }, { type: 'string', ...(names ? { enum: [...names] } : {}) }], ...(row.complete ? { examples: [...row.complete] } : {}) };
    case 'number':
      return { ...base, anyOf: [{ type: 'number' }, { type: 'string', pattern: '^-?[0-9.]+$' }] };
    case 'list':
      return { ...base, anyOf: [{ type: 'array', items: { type: 'string', ...(names ? { examples: [...names] } : {}) } }, { type: 'string' }] };
    case 'map':
      return { ...base, type: 'object' };
    case 'retired':
      // JSON Schema's own `deprecated` stays a boolean; EXTENDING §3's version of it is `x-lattice-deprecated`.
      return { ...base, deprecated: true, 'x-lattice-deprecated': row.deprecatedIn || REGISTRY_VERSION, ...(row.replacement ? { 'x-lattice-replacement': row.replacement } : {}) };
    case 'marp':
      return base;
    default:
      return { ...base, ...(row.complete ? { examples: [...row.complete] } : {}) };
  }
}

/**
 * The registry's version (EXTENDING §3). A registry minor adds or retires an entry; a major removes one. Raise it with
 * the change that needs it; test/unit/tools/registry-names.test.js fails when an entry 1.0 listed disappears.
 */
const REGISTRY_VERSION = '1.0';

/**
 * Record fields that are not front-matter keys (LFM 1.0 §2.3): the slide's own settings. The rest of a record's fields
 * share their name with a front-matter key, which `properties` lists. A record writes a key in kebab case
 * (`focus-steps`, `background-image`).
 */
const RECORD_ONLY_FIELDS = Object.freeze({
  layout: 'The component the slide uses (LFM §4.1).',
  class: 'The modifier tokens after the component.',
  variant: 'A component variant, written as a class word.',
  universal: 'A base modifier, written as a class word.',
  modifiers: 'Modifier tokens, written as class words.',
  carry: 'The record runs on to every later slide, as a front-matter key would from that slide on.',
  hide: 'The slide is left out of the rendered deck.',
  lens: 'The reader lenses the slide is in or out of (LFM §6.1).',
  pane: 'The component a pane of a `columns` or `rows` slide uses.',
  panes: 'The ratio of a `columns` or `rows` slide\'s panes.',
  'focus-steps': 'The focus walk the slide steps through.',
});

/** The whole schema, in memory. */
function buildSchema() {
  const vocab = buildVocab();
  const lists = { ...vocab, sizeNames: Object.keys(SIZES) };
  const properties = {};
  for (const row of withProse(withPluginRegisters(vocab.pluginRegisters))) properties[row.key] = propertyFor(row, lists);
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://lattice.style/schemas/front-matter.schema.json',
    title: 'Lattice deck front matter',
    'x-lattice-version': REGISTRY_VERSION,
    description: 'The keys a Lattice deck\'s leading YAML block may carry. Generated from lib/core/deck-settings.js by tools/build-front-matter-schema.js; do not edit.',
    type: 'object',
    properties,
    patternProperties: { [PREFIXED_KEY]: {} },
    // An authoring tool validates with this; a reader never refuses to render over an unknown key (EXTENDING §5).
    additionalProperties: false,
    'x-lattice-record-fields': Object.fromEntries(Object.entries(RECORD_ONLY_FIELDS).map(([k, d]) => [k, { description: d, 'x-lattice-since': REGISTRY_VERSION }])),
  };
}

function main() {
  const check = process.argv.includes('--check');
  let schema;
  try {
    schema = buildSchema();
  } catch (e) {
    process.stderr.write(`front-matter schema: ${e.message}\n`);
    process.exit(1);
  }
  if (check) {
    process.stdout.write(`front-matter schema: ${Object.keys(schema.properties).length} keys, every row expressible.\n`);
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(schema, null, 2)}\n`);
  process.stdout.write(`wrote ${path.relative(ROOT, OUT)} (${Object.keys(schema.properties).length} keys)\n`);
}

if (require.main === module) main();

module.exports = { buildSchema, propertyFor, profileOf, PREFIXED_KEY, REGISTRY_VERSION, RECORD_ONLY_FIELDS };
