/**
 * The DECK SETTING contract — what every front-matter key owes
 * (engineering/decisions/2026-10-15-conformance-harness.md §6.2 Family C, §9 phase 1).
 *
 * ENUMERATION finds the instances itself: every row of the engine's table
 * (lib/core/deck-settings.js, plugin registers included) PLUS every key a reader names
 * literally — `frontMatterValue(fm, 'key')` and its siblings — anywhere in lib/, lattice.js or
 * the docs site. A key that is read but has no row is therefore an instance too, and fails
 * `registered`, rather than being invisible because nobody listed it.
 *
 * Each instance carries the facts its clauses read (who reads it, whether the spec and a shared
 * case mention it, whether its doc does). `enumerate()` measures them; a fixture states them, so
 * a failing fixture trips exactly one clause (§6.3 rule 4). The lint clauses run the REAL linter
 * on a one-line deck, because the linter is the thing under test there.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { withPluginRegisters, settingValues } = require('../../core/deck-settings');
const { withProse } = require('../../core/deck-settings.prose');

const ROOT = path.join(__dirname, '..', '..', '..');
const ADDED = '2026-10-16';
const NOTE = 'engineering/decisions/2026-10-15-conformance-harness.md';
const GROUPS = new Set(['general', 'look', 'chrome', 'accent', 'motion', 'speech', 'export', 'raw', 'developer']);
const VALUED = new Set(['register', 'axis']);
const UNREAD_BY_DESIGN = new Set(['marp', 'retired']);

/** Every reader call that names its key as a string literal. */
const READER_CALL = /\b(?:frontMatterValue|topLevelFrontMatterValue|frontMatterName|readRenderTargetKey|bookendLine|readFrontMatterScalar|getFrontMatter|getFrontMatterName|frontMatterKeySpan|writeFrontMatterLine|writeRegister)\(\s*[^,()]+,\s*'([A-Za-z][\w-]*)'/g;

/** The source files a reader can live in: tracked, not tests, not vendored, not the table itself. */
function readerFiles() {
  const out = execFileSync('git', ['ls-files', 'lib/**/*.js', 'lib/**/*.mjs', 'lattice.js', 'docs/src/**/*.ts', 'docs/src/**/*.tsx', 'docs/src/**/*.js', 'docs/src/**/*.mjs'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean).filter((f) => !/\.test\.|\/vendor\/|^lib\/core\/deck-settings\.js$|^lib\/authoring\/lint-core\.js$|^lib\/conformance\/|front-matter-(docs|keys)\.ts$/.test(f));
}

/** A file that reads front matter at all: a shared reader, the directive table, or the registers. */
const FRONT_MATTER_FILE = /\b(?:frontMatterValue|topLevelFrontMatterValue|frontMatterName|parseFrontMatter|readFrontMatter\w*|KNOWN_DIRECTIVES|PLUGIN_REGISTERS|RENDER_TARGET_KEYS|front-?matter)\b/i;

/**
 * The files that read `key`: a `^key:` pattern anywhere, or the key as a quoted string in a file
 * that reads front matter (a reader call, the directive table, the plugin registers). The second
 * condition is what keeps a common word from passing: `'none'` is quoted in hundreds of files, but
 * a row only counts as read where front matter is read. (Still a static proxy, not a proof that a
 * render consumes the value; stated in the clause.)
 */
function readersOf(key, sources) {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const anchored = new RegExp(`\\^(?:\\\\s\\*|\\[ \\\\t\\]\\*|\\uFEFF\\?)?${esc}:`);
  const quoted = new RegExp(`['"\`]${esc}['"\`]`);
  return sources.filter(([, src]) => anchored.test(src) || (quoted.test(src) && FRONT_MATTER_FILE.test(src))).map(([f]) => f);
}

function context() {
  const { buildVocab, lintText } = require('../../authoring/lint');
  const { propertyFor } = require('../../../tools/build-front-matter-schema');
  const { SIZES } = require('../../engine/sizes');
  const vocab = buildVocab();
  const sources = readerFiles().map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
  const specFull = fs.readFileSync(path.join(ROOT, 'spec', 'LFM-1.1.md'), 'utf8');
  // §2.3 only: a key named elsewhere in the spec (an example, the history table) has no row.
  const spec = specFull.slice(specFull.indexOf('### 2.3 '), specFull.indexOf('### 2.4 '));
  const caseDir = path.join(ROOT, 'spec', 'conformance', 'lfm');
  const cases = fs.readdirSync(caseDir).filter((f) => f.endsWith('.json') || f.endsWith('.md')).map((f) => fs.readFileSync(path.join(caseDir, f), 'utf8')).join('\n');
  const lint = (source) => lintText(source, { vocab });
  return { vocab, lists: { ...vocab, sizeNames: Object.keys(SIZES) }, sources, spec, cases, lint, propertyFor };
}

/** The facts an instance carries, measured. */
function measure(key, row, ctx) {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const docFile = row?.docs ? path.join(ROOT, row.docs) : null;
  return {
    key,
    row,
    readers: readersOf(key, ctx.sources),
    inSpec: ctx.spec.includes(`\`${key}:\``),
    specCases: (ctx.cases.match(new RegExp(`(?:\\\\n|^)${esc}:`, 'gm')) || []).length,
    docMentions: Boolean(docFile && fs.existsSync(docFile) && fs.readFileSync(docFile, 'utf8').includes(`${key}:`)),
  };
}

function enumerate(ctx) {
  const rows = withProse(withPluginRegisters(ctx.vocab.pluginRegisters));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const keys = new Set(rows.map((r) => r.key));
  for (const [, src] of ctx.sources) for (const m of src.matchAll(READER_CALL)) keys.add(m[1]);
  return [...keys].sort().map((k) => measure(k, byKey.get(k) || null, ctx));
}

/** A fixture: `{ key, row, readers, inSpec, specCases, docMentions }`, defaults filled in. */
function fromFixture(json) {
  return { readers: [], inSpec: false, specCases: 0, docMentions: false, row: null, ...json };
}

const deck = (key, value) => `---\n${key}: ${value}\n---\n\n## A\n\nText.\n`;
const valueRule = (row) => (row.rule && !row.generic ? row.rule : `unknown-${row.key}`);
const hasValues = (inst, ctx) => Boolean(inst.row && VALUED.has(inst.row.kind) && settingValues(inst.row, ctx.lists)?.length);

const clauses = [
  {
    id: 'deck-setting.registered',
    level: 'always',
    tier: 'static',
    check: (i) => (i.row ? null : `read by ${i.readers.slice(0, 3).join(', ') || 'a reader'} but has no row in lib/core/deck-settings.js`),
    fixtures: { fails: 'unregistered-key', passes: 'registered-key' },
    reach: 80,
    catches: ['2026-10-16: 20 keys a reader read had no row in the Studio key list the linter and editor used — avatar, icon, plugins, greeting, closing, code, build, focus, focusStyle, track, lenses, lens-default, lens-defaults, marp, guards, autosplit, captions, form, overflow-marker (inventory)'],
    added: ADDED,
    why: `${NOTE} §3.2`,
  },
  {
    id: 'deck-setting.read',
    level: 'conditional',
    tier: 'static',
    applies: (i) => Boolean(i.row && !UNREAD_BY_DESIGN.has(i.row.kind)),
    check: (i) => (i.readers.length ? null : 'no reader in lib/, lattice.js or docs/src names this key: a row for a setting nothing reads'),
    fixtures: { fails: 'unread-row', passes: 'registered-key' },
    reach: 60,
    catches: [],
    catchesNone: 'No phantom row on 2026-10-16 (the inventory found none in the Studio list either). It keeps a row from outliving its reader.',
    added: ADDED,
    why: `${NOTE} §6.2 Family C`,
  },
  {
    id: 'deck-setting.lint-knows-key',
    level: 'conditional',
    tier: 'static',
    applies: (i) => Boolean(i.row),
    check: (i, ctx) => {
      const f = ctx.lint(deck(i.key, 'x')).find((x) => x.rule === 'unknown-key');
      return f ? `lint:deck calls \`${i.key}:\` an unknown key` : null;
    },
    fixtures: { fails: 'row-lint-does-not-know', passes: 'registered-key' },
    reach: 80,
    catches: ['2026-10-15: `finsh: halo` and `themee: x` linted clean (exit 0); no rule knew which keys exist (§3.2)'],
    added: ADDED,
    why: `${NOTE} §12.3`,
  },
  {
    id: 'deck-setting.value-warns',
    level: 'conditional',
    tier: 'static',
    applies: hasValues,
    check: (i, ctx) => {
      const want = valueRule(i.row);
      const got = ctx.lint(deck(i.key, 'zzbogus')).filter((x) => x.slide === 0 && /^(unknown-|bad-|paginate-)/.test(x.rule)).map((x) => x.rule);
      return got.includes(want) ? null : `\`${i.key}: zzbogus\` should warn ${want}; lint said [${got.join(', ') || 'nothing'}]`;
    },
    fixtures: { fails: 'value-rule-mismatch', passes: 'registered-key' },
    reach: 30,
    catches: ['2026-10-15: `size: huge` and `theme: nosuchtheme` linted clean, as did any value of motion, motion-style, motion-speed, player-motion, glossary, logo-on, logo-style and profile (§3.2)'],
    added: ADDED,
    why: `${NOTE} §3.2`,
  },
  {
    id: 'deck-setting.values-clean',
    level: 'conditional',
    tier: 'static',
    applies: hasValues,
    check: (i, ctx) => {
      const want = valueRule(i.row);
      const flagged = settingValues(i.row, ctx.lists).filter((v) => ctx.lint(deck(i.key, v)).some((x) => x.rule === want));
      return flagged.length ? `values the table accepts but lint flags: ${flagged.join(', ')}` : null;
    },
    fixtures: { fails: 'value-lint-refuses', passes: 'registered-key' },
    reach: 30,
    catches: [],
    catchesNone: 'Every listed value linted clean on 2026-10-16. It keeps the table and the resolver lint reads from drifting apart.',
    added: ADDED,
    why: `${NOTE} §6.2 Family C`,
  },
  {
    id: 'deck-setting.documented',
    level: 'conditional',
    tier: 'static',
    applies: (i) => Boolean(i.row && !UNREAD_BY_DESIGN.has(i.row.kind)),
    check: (i) => {
      const r = i.row;
      if (r.offer !== false) {
        if (!r.info || !r.default || !GROUPS.has(r.group)) return 'an offered row needs info, a default and a known group, which the reference page prints';
        return null;
      }
      return i.docMentions ? null : `a row kept off the reference page must name a doc that describes it (docs: ${r.docs || 'none'})`;
    },
    fixtures: { fails: 'hidden-undocumented', passes: 'registered-key' },
    reach: 60,
    catches: ['2026-10-15: plugins, greeting and closing were in LFM 1.1 but not on the front-matter reference page or in autocomplete; icon and avatar in neither (§3.2)'],
    added: ADDED,
    why: 'docs/src/content/docs/reference/front-matter.mdx',
  },
  {
    id: 'deck-setting.spec-row',
    level: 'conditional',
    tier: 'static',
    applies: (i) => i.row?.spec === '2.3',
    check: (i) => (i.inSpec ? null : `the row says spec 2.3, but spec/LFM-1.1.md §2.3 has no \`${i.key}:\` line`),
    fixtures: { fails: 'spec-row-missing', passes: 'registered-key' },
    reach: 30,
    catches: ['2026-10-15: spectrum-card, spectrum-card-edge, spectrum-trim and avatar had no §2.3 row (§3.2)'],
    added: ADDED,
    why: 'spec/LFM-1.1.md §2.3',
  },
  {
    id: 'deck-setting.spec-case',
    level: 'conditional',
    tier: 'static',
    applies: (i, ctx) => i.row?.spec === '2.3' && hasValues(i, ctx),
    check: (i) => (i.specCases ? null : `no shared case in spec/conformance/lfm/ sets \`${i.key}:\``),
    fixtures: { fails: 'spec-case-missing', passes: 'registered-key' },
    reach: 25,
    catches: ['2026-10-15: spectrum-card, spectrum-card-edge, spectrum-trim and avatar had no conformance case (lfm-conformance.test.js listed 26 keys)'],
    added: ADDED,
    why: 'spec/LFM-1.1.md §8',
  },
  {
    id: 'deck-setting.schema',
    level: 'conditional',
    tier: 'static',
    applies: (i) => Boolean(i.row),
    check: (i, ctx) => {
      let prop;
      try {
        prop = ctx.propertyFor(i.row, ctx.lists);
      } catch (e) {
        return `the schema cannot express the row: ${e.message}`;
      }
      if (prop.enum) {
        const enumSet = new Set(prop.enum.map(String));
        const missing = settingValues(i.row, ctx.lists).filter((v) => !enumSet.has(String(i.row.key === 'size' ? v : String(v).toLowerCase())));
        if (missing.length) return `the schema's enum misses ${missing.join(', ')}`;
        if (enumSet.has('zzbogus')) return 'the schema accepts zzbogus';
      }
      return null;
    },
    fixtures: { fails: 'schema-inexpressible', passes: 'registered-key' },
    reach: 80,
    catches: ['2026-10-15: there was no JSON Schema for front matter at all (§3.2)'],
    added: ADDED,
    why: 'dist/schemas/front-matter.schema.json (tools/build-front-matter-schema.js)',
  },
];

module.exports = {
  kind: 'deck-setting',
  measure,
  title: 'Deck setting',
  summary: 'Every front-matter key: one row in lib/core/deck-settings.js, read by something, known to lint, its values checked, documented, in the spec when it is portable, and expressible in the JSON Schema.',
  context,
  enumerate,
  instanceId: (i) => i.key,
  fromFixture,
  clauses,
};
