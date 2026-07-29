/**
 * Unit: THE GATE behind the fidelity ledger (lib/core/marp-fidelity.js).
 *
 * This is the test that stops the CLASS of defect #1256 was made of, rather than
 * the four instances of it. Every one of those was the same shape: a structural
 * transform that exists only as a markdown-it plugin, on a route where marp-core
 * never runs our plugins — so it silently didn't happen, and the export's own
 * README claimed otherwise. Nothing forced a NEW plugin to say whether the export
 * covers it.
 *
 * So this test holds the ledger to the repo:
 *   1. every markdown-it plugin in plugins.js is classified (add one without
 *      classifying it and this fails — the failure IS the reminder);
 *   2. no entry names a plugin that no longer exists (a retired plugin can't leave
 *      a stale promise behind);
 *   3. a `mirrored` claim points at a symbol that is really in the runtime, and a
 *      `baked` claim at a transform the exporter really calls — the two ways a
 *      coverage claim could be aspirational rather than true;
 *   4. every `unmirrored` gap reaches the recipient, because the generated README
 *      is built from these rows rather than from prose beside them.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LEDGER, unmirroredEntries, fidelityNotes } = require('../../../lib/core/marp-fidelity');
const { readme } = require('../../../lib/core/marp-bundle');

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PLUGINS_SRC = read('lib/integrations/markdown-it/plugins.js');
const RUNTIME_SRC = read('lib/runtime/index.js');
const EXPORTER_SRC = read('tools/export-marp.js');

/**
 * The markdown-it plugins plugins.js defines — a function taking the markdown-it
 * (or marp) instance, spelled `markdown`, `md`, or `marp` in this file. That
 * signature is what makes something a plugin rather than a helper, so the
 * enumeration can't drift from the file.
 */
function definedPlugins() {
  return [...PLUGINS_SRC.matchAll(/^function ([A-Za-z]\w*)\((?:markdown|marp|md)\)/gm)].map((m) => m[1]);
}

const COVERAGE = new Set(['baked', 'mirrored', 'unmirrored', 'moot']);

describe('marp fidelity ledger — the classification is complete', () => {
  test('the plugin enumeration finds the real plugins (guard against a vacuous pass)', () => {
    const found = definedPlugins();
    assert.ok(found.length >= 12, `expected the plugin set; found ${found.length}`);
    for (const known of ['headingSplit', 'matrixGridCells', 'glossaryRange', 'animaSceneFences']) {
      assert.ok(found.includes(known), `${known} should be recognized as a plugin`);
    }
  });

  test('every markdown-it plugin is classified', () => {
    const classified = new Set(LEDGER.map((e) => e.plugin).filter(Boolean));
    const missing = definedPlugins().filter((p) => !classified.has(p));
    assert.deepEqual(missing, [],
      'a new markdown-it plugin needs a lib/core/marp-fidelity.js entry saying whether '
      + 'an exported deck reproduces it — `baked`, `mirrored`, `unmirrored`, or `moot`');
  });

  test('no entry names a plugin that no longer exists', () => {
    const defined = new Set(definedPlugins());
    const stale = LEDGER.map((e) => e.plugin).filter((p) => p && !defined.has(p));
    assert.deepEqual(stale, [], 'these ledger entries outlived their plugin');
  });

  test('every entry is well formed', () => {
    for (const e of LEDGER) {
      const id = e.plugin || e.topic;
      assert.ok(id, `an entry needs a plugin or a topic: ${JSON.stringify(e)}`);
      assert.ok(e.what, `${id} needs a "what" — the thing an author wrote`);
      assert.ok(COVERAGE.has(e.coverage), `${id} has an unknown coverage: ${e.coverage}`);
      if (e.coverage === 'unmirrored') assert.ok(e.note, `${id} is a gap and must say what happens instead`);
      if (e.coverage === 'mirrored' || e.coverage === 'baked') assert.ok(e.via, `${id} must name what covers it`);
    }
  });
});

describe('marp fidelity ledger — coverage claims point at real code', () => {
  test('every `mirrored` entry names a symbol the runtime actually calls', () => {
    for (const e of LEDGER.filter((x) => x.coverage === 'mirrored')) {
      // `via` is either a bare function or a `kernel.applyToDom` call; either way
      // it must appear as a CALL in the runtime, not merely as a mention.
      assert.ok(RUNTIME_SRC.includes(`${e.via}(`),
        `${e.plugin} claims to be mirrored by ${e.via}, which lib/runtime/index.js never calls`);
    }
  });

  test('every `baked` entry names a transform the exporter actually runs', () => {
    for (const e of LEDGER.filter((x) => x.coverage === 'baked')) {
      assert.ok(EXPORTER_SRC.includes(`${e.via}(`),
        `${e.plugin} claims to be baked by ${e.via}, which tools/export-marp.js never calls`);
    }
  });

  // The ledger says these are the ONLY gaps, so a transform claimed as mirrored had
  // better not be one of the three that shipped with no mirror at all in #1256.
  test('the transforms that were silently unmirrored are now covered', () => {
    const byPlugin = Object.fromEntries(LEDGER.filter((e) => e.plugin).map((e) => [e.plugin, e]));
    for (const p of ['matrixGridCells', 'glossaryListToTable', 'glossaryRange']) {
      assert.equal(byPlugin[p].coverage, 'mirrored', `${p} regressed to unmirrored`);
    }
  });
});

describe('marp fidelity ledger — the recipient is told', () => {
  test('the generated README carries every unmirrored gap, and no gap it invented', () => {
    const r = readme({ name: 'demo', palette: 'indaco', themes: ['lattice.css'], agent: false });
    assert.match(r, /### What Marp renders differently/);
    for (const e of unmirroredEntries()) {
      assert.ok(r.includes(e.what), `the README omits the ${e.plugin || e.topic} gap`);
      assert.ok(r.includes(e.note), `the README omits what happens instead for ${e.plugin || e.topic}`);
    }
    // The table is generated, not transcribed — one row per gap, plus the header.
    assert.equal(fidelityNotes().length, unmirroredEntries().length + 2);
  });

  test('the README no longer calls the marp-cli route unqualified "full fidelity"', () => {
    const r = readme({ name: 'demo', palette: 'indaco', themes: ['lattice.css'], agent: false });
    assert.doesNotMatch(r, /full-fidelity route/,
      'there are known gaps; the heading should not promise otherwise');
  });
});
