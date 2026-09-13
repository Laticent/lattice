/**
 * Unit: tools/build.js — the build orchestrator's static shape.
 *
 * Covers that every step (and the guard) names a generator script that
 * actually exists on disk, so a renamed/removed tool fails here rather
 * than mid-build. Does not execute the generators (some need esbuild /
 * Chromium not present in every environment).
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { STEPS, GUARD, PREFLIGHT, BACKGROUND_LABELS, JOIN_BEFORE_SCRIPTS } = require('../../../tools/build');

const TOOLS = path.join(__dirname, '..', '..', '..', 'tools');

describe('build orchestrator', () => {
  test('the guard step exists', () => {
    assert.ok(fs.existsSync(path.join(TOOLS, GUARD.script)), `missing ${GUARD.script}`);
  });

  test('every preflight gate names an existing script', () => {
    assert.ok(PREFLIGHT.length > 0);
    for (const gate of PREFLIGHT) {
      assert.ok(gate.label, 'preflight gate missing label');
      assert.ok(fs.existsSync(path.join(TOOLS, gate.script)), `missing ${gate.script}`);
    }
  });

  test('every step names an existing generator script', () => {
    assert.ok(STEPS.length > 0);
    for (const step of STEPS) {
      assert.ok(step.label, 'step missing label');
      assert.ok(fs.existsSync(path.join(TOOLS, step.script)), `missing ${step.script}`);
    }
  });

  // ── Ordering: a generator must precede every bundle that INLINES its output ──
  // esbuild inlines at bundle time, so a generator ordered after its consumer bakes
  // the PREVIOUS revision into the bundle and one `npm run build` cannot converge.
  // Nothing else catches this: dist/ is gitignored and `build:check
  // --exclude-uncommitted` skips the built-not-committed artifacts by design, so
  // these asserts are the only thing standing between a STEPS re-sort and a silent
  // regression. See engineering/decisions/2026-09-13-bundle-era-skew.md.
  const idx = (script) => STEPS.findIndex((s) => s.script === script);

  test('build-anima-player precedes every bundle that inlines its output', () => {
    const anima = idx('build-anima-player.js');
    assert.ok(anima >= 0, 'build-anima-player.js is not in STEPS');
    // lib/export/anima-player-bundle.generated.mjs is in the emulator's require
    // graph (marker `// lib/export/anima-player-bundle.generated.mjs` in
    // dist/lattice-emulator.js) and in player-core's. It once ran 18 steps late.
    for (const consumer of ['build-runtime.js', 'build-emulator.js', 'build-player-core.js']) {
      const at = idx(consumer);
      assert.ok(at >= 0, `${consumer} is not in STEPS`);
      assert.ok(anima < at, `build-anima-player.js (${anima}) must run before ${consumer} (${at})`);
    }
  });

  test('every background step is joined before its first consumer runs', () => {
    const background = STEPS.filter((s) => BACKGROUND_LABELS.has(s.label));
    assert.ok(background.length > 0, 'no background steps — this pin has gone vacuous');
    const joins = STEPS.filter((s) => JOIN_BEFORE_SCRIPTS.has(s.script)).map((s) => idx(s.script));
    assert.ok(joins.length > 0, 'no join step is in STEPS');
    // build-player-core.js bundles @laticent/cadenza, whose entry IS that background
    // step's dist. It ran six steps ahead of the only join, so it read a file a live
    // child process could still be writing — a race won by ~5.7s of scheduling luck.
    assert.ok(
      JOIN_BEFORE_SCRIPTS.has('build-player-core.js'),
      'build-player-core.js inlines docs/src/lib/cadenza/dist/index.mjs and must be a join point',
    );
    assert.ok(
      JOIN_BEFORE_SCRIPTS.has('build-read-along-core.js'),
      'build-read-along-core.js inlines docs/src/lib/cadenza/dist/index.cjs and must be a join point',
    );
    for (const script of JOIN_BEFORE_SCRIPTS) {
      assert.ok(idx(script) >= 0, `JOIN_BEFORE_SCRIPTS names ${script}, which is not a step`);
    }
  });

  test('css, runtime, snippets, and both doc generators are all covered', () => {
    const scripts = STEPS.map((s) => s.script);
    for (const required of [
      'build-css.js',
      'build-runtime.js',
      'build-snippets.js',
      'build-component-docs.js',
      'build-docs-portal.js',
    ]) {
      assert.ok(scripts.includes(required), `orchestrator does not run ${required}`);
    }
  });
});
