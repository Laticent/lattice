/**
 * The slide-metadata vocabulary (lib/core/meta-keys.mjs) and the guards that keep it ONE list.
 *
 * Before the `meta` plugin owned it, five modules kept their own copy of "which comment keys are
 * directives" and four parity tests read the others' copies to catch drift. The vocabulary is now
 * data in lib/plugins/meta/meta.manifest.json; these tests pin what is derived from it, that every
 * reader that used to keep a list reads the registry, and that a sixth hand-kept list fails.
 * Design: engineering/decisions/2026-10-17-meta-record.md §5.0, §9 step 1.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const keys = require('../../../lib/core/meta-keys.js');
const manifest = require('../../../lib/plugins/meta/meta.manifest.json');
const directives = require('../../../lib/engine/directives.js');
const notes = require('../../../lib/authoring/notes-core.js');
const { PLUGIN_GRAMMAR } = require('../../../lib/plugins/grammar.generated.mjs');

const ROOT = path.join(__dirname, '..', '..', '..');
const fields = manifest.contributes.meta.fields;

describe('the vocabulary is derived from the meta manifest', () => {
  test('every field is a known key, in manifest order', () => {
    assert.deepEqual([...keys.KNOWN_KEYS], Object.keys(fields));
  });

  test('each flag set is exactly the fields that declare it', () => {
    const where = (pred) => Object.keys(fields).filter((k) => pred(fields[k]));
    assert.deepEqual([...keys.FLAG_KEYS], where((f) => f.bare));
    assert.deepEqual([...keys.GLOBAL_ONLY_KEYS], where((f) => f.scope === 'deck'));
    assert.deepEqual([...keys.APPLIED_KEYS], where((f) => f.applied));
    assert.deepEqual([...keys.NO_CUSTOM_PROP_KEYS], where((f) => f.applied && f.customProp === false));
    assert.deepEqual([...keys.LOCAL_KEYS], where((f) => f.local));
    assert.deepEqual([...keys.COMPLETE_KEYS], where((f) => f.complete));
  });

  test('the shipped vocabulary has not silently changed shape', () => {
    // The set the engine kept by hand before the manifest owned it. A change here is a decision.
    assert.deepEqual([...keys.KNOWN_KEYS].sort(), [
      'backgroundColor', 'backgroundImage', 'backgroundPosition', 'backgroundRepeat', 'backgroundSize', 'build', 'class',
      'color', 'debug', 'focus', 'focusStyle', 'focusSteps', 'footer', 'header', 'lang', 'lens', 'logo', 'marp', 'paginate', 'size',
      'style', 'theme', 'track',
    ].sort());
    assert.deepEqual([...keys.FLAG_KEYS].sort(), ['build', 'debug', 'lens']);
    assert.deepEqual([...keys.GLOBAL_ONLY_KEYS].sort(), ['lang', 'marp', 'size', 'theme']);
    assert.deepEqual([...keys.NO_CUSTOM_PROP_KEYS].sort(), ['build', 'debug', 'track']);
    assert.deepEqual([...keys.STRUCTURE_KEYS].sort(), ['pane', 'panes']);
    assert.deepEqual([...keys.CHANNEL_KEYS].sort(), ['describe', 'say']);
    assert.deepEqual([...keys.MARKER_NAMES], ['stress-slide']);
  });

  test('an enum field lists its words; others list none', () => {
    assert.deepEqual(keys.enumValues('focusStyle'), ['spotlight', 'blur', 'ring', 'list-fill', 'pop']);
    assert.deepEqual(keys.enumValues('paginate'), ['true', 'false', 'skip', 'hold']);
    assert.deepEqual(keys.enumValues('footer'), []);
    assert.equal(keys.fieldOf('nope'), null);
    assert.equal(keys.fieldOf('toString'), null, 'a prototype name is not a field');
  });

  test('a comment key is never also a directive field', () => {
    const comment = Object.keys(manifest.contributes.meta.comments);
    for (const k of comment) assert.ok(!keys.KNOWN_KEYS.has(k), `${k} is both a field and a comment key`);
  });

  test('every plugin register is listed, and none shares a name with a field', () => {
    const owners = keys.REGISTERS.map((r) => r.key);
    assert.deepEqual(owners.sort(), ['avatar', 'icon', 'legend', 'spark']);
    for (const r of keys.REGISTERS) assert.ok(!keys.KNOWN_KEYS.has(r.key), `register ${r.key} collides with a field`);
  });
});

describe('the readers that kept a list now read the registry', () => {
  test('the engine exports the registry\'s sets, not copies', () => {
    assert.equal(directives.KNOWN_DIRECTIVES, keys.KNOWN_KEYS);
    assert.equal(directives.FLAG_DIRECTIVES, keys.FLAG_KEYS);
    assert.equal(directives.GLOBAL_ONLY, keys.GLOBAL_ONLY_KEYS);
    assert.equal(directives.APPLIED_DIRECTIVES, keys.APPLIED_KEYS);
    assert.equal(directives.NO_CUSTOM_PROP, keys.NO_CUSTOM_PROP_KEYS);
  });

  test('the notes extractor classifies exactly the registry\'s directives', () => {
    assert.deepEqual([...notes.KNOWN_DIRECTIVE_NAMES].sort(), [...keys.KNOWN_KEYS].sort());
    assert.deepEqual([...notes.FLAG_DIRECTIVE_NAMES].sort(), [...keys.FLAG_KEYS].sort());
  });
});

describe('a sixth hand-kept key list fails', () => {
  // A list is five or more directive names as consecutive quoted elements: `'theme', 'paginate', …`
  // (or `'_class', '_paginate', …`). An object row (`{ key: 'footer', kind: 'text' }`) is catalog
  // metadata, not the vocabulary, and a CSS property read (`cs.backgroundRepeat`) is not quoted.
  const MIN_RUN = 5;
  const names = [...keys.KNOWN_KEYS].join('|');
  // Single and double quotes only: a backtick run is prose in a comment (`size`, `paginate`, …).
  const element = `(?:'_?(?:${names})'|"_?(?:${names})")`;
  const RUN = new RegExp(`${element}(?:\\s*,\\s*(?:\\/\\/[^\\n]*\\n\\s*)?${element}){${MIN_RUN - 1},}`);

  // Also an alternation (`/^_?(theme|paginate|header|footer|class)/`, `'theme' | 'paginate' | …`).
  const bare = `(?:${names})`;
  const ALT = new RegExp(`${bare}['"]?(?:\\s*[|]\\s*['"]?${bare}['"]?){4,}`);
  // lint-core's `rowsDeck` test lists the FRONT-MATTER keys that carry no claim about a deck's rows
  // (`marp|theme|paginate|header|footer|size|venue|class|acronyms|color-mode|profile|…`). That is a
  // different vocabulary: deck front-matter keys, most of them registers and none of them comment
  // directives. It is not the slide-comment list this guard exists to keep single.
  const SANCTIONED = { 'lib/authoring/lint-core.js': 'front-matter keys that make no claim about rows, not the comment vocabulary' };
  const hasList = (text) => RUN.test(text) || ALT.test(text);

  test('the detector sees a list, and does not see a catalog row or a CSS read', () => {
    assert.ok(hasList("const X = new Set(['theme', 'paginate', 'header', 'footer', 'class']);"));
    assert.ok(hasList("const X = ['_class', '_paginate',\n  '_header', // the header\n  '_footer', '_color'];"));
    assert.ok(!hasList("{ key: 'footer', kind: 'text' }, { key: 'header', kind: 'text' }"));
    assert.ok(!hasList('el.style.backgroundRepeat = x; cs.backgroundPosition; cs.backgroundSize;'));
    assert.ok(!hasList("['theme', 'paginate', 'header', 'footer']"), 'four is a coincidence, not the vocabulary');
    assert.ok(hasList("type K = 'theme' | 'paginate' | 'header' | 'footer' | 'class';"));
    assert.ok(hasList('const re = /^_?(theme|paginate|header|footer|class)/;'));
  });

  test('no source file outside the registry keeps one', () => {
    const files = execSync('git ls-files lib docs/src tools', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
      .trim().split('\n')
      .filter((f) => /\.(js|mjs|cjs|ts|tsx)$/.test(f))
      .filter((f) => !/\.generated\./.test(f) && !/\.(test|spec)\.|\/vendor\/|\.min\./.test(f));
    const found = [];
    for (const f of files) {
      let text;
      try { text = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
      if (hasList(text)) found.push(f);
    }
    // A sanctioned hit goes in WITH ITS JUSTIFICATION, and a stale entry fails (the check-ownership discipline).
    const stale = Object.keys(SANCTIONED).filter((f) => !found.includes(f));
    assert.deepEqual(stale, [], 'a sanctioned file no longer holds a list: drop its entry');
    for (const f of Object.keys(SANCTIONED)) found.splice(found.indexOf(f), 1);
    assert.deepEqual(found, [], 'a directive-key list belongs in lib/plugins/meta/meta.manifest.json; derive it from lib/core/meta-keys.mjs');
    assert.ok(files.length > 800, `expected to scan the tree, scanned ${files.length}`);
  });
});

describe('meta cannot be switched off', () => {
  test('it is a plugin of the grammar and embedded, and the grammar carries no separate always-on flag', () => {
    const meta = PLUGIN_GRAMMAR.find((g) => g.name === 'meta');
    assert.ok(meta, 'meta is in the grammar');
    assert.equal(meta.embedded, true, 'meta is embedded');
    assert.ok(PLUGIN_GRAMMAR.every((g) => !('alwaysOn' in g)), 'the always-on flag is gone: embedded is the one flag');
  });

  test('an external (zip) plugin cannot contribute meta', () => {
    const { PLUGIN_DATA_CONTRIBUTIONS } = require('../../../lib/packages/code-shape.mjs');
    assert.ok(![...PLUGIN_DATA_CONTRIBUTIONS].includes('meta'), 'meta must not be a contribution a zip plugin may declare');
  });
});
