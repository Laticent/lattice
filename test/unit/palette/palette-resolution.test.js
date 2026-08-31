/**
 * Unit: lib/resolve-palette.js — palette precedence chain.
 *
 * Pins the four-tier resolution chain that every render path inherits:
 *   1. CLI arg            (cliArg)
 *   2. LATTICE_PALETTE    (env)
 *   3. Front-matter `theme:`
 *   4. Default: the DEFAULT constant (cuoio)
 *
 * Higher tiers override lower. Each test asserts both the resolved
 * `name` and the `source` (so a regression that flips precedence is
 * caught even if the resolved name happens to match by coincidence).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { resolvePalette, DEFAULT } = require('../../../lib/core/resolve-palette');
const { DEFAULT_PALETTE } = require('../../../lib/core/default-palette.mjs');

describe('palette-resolution', () => {
  // THE VALUE PIN. Every other case here reads the DEFAULT constant, which is right per
  // case — they test precedence, not which palette wins the fall-through — but it left
  // the VALUE itself unpinned: a one-character edit to lib/core/default-palette.mjs
  // silently changed what every palette-less deck, every Marp export and
  // dist/lattice-default.css render as, with the whole suite green. The pre-change tree
  // pinned 'indaco' by accident, through literals these cases have since stopped using.
  // Same shape as docs/src/lib/site-chrome.test.ts, which pins its own copy.
  //
  // Re-blessing a different default is meant to be one edit; this makes it two, and the
  // second one is a deliberate acknowledgement rather than a search-and-replace.
  test('the default palette is cuoio', () => {
    assert.equal(DEFAULT, 'cuoio');
    assert.equal(DEFAULT_PALETTE, 'cuoio', 're-export and declaration must not drift');
  });

  const FM_INDACO = '---\nmarp: true\ntheme: indaco\n---\n\n# Slide';
  const FM_CUOIO  = '---\nmarp: true\ntheme: cuoio\n---\n\n# Slide';
  const FM_NONE   = '---\nmarp: true\n---\n\n# Slide';
  const NO_FM     = '# Slide\n\nbody';

  test('resolve: default fires when nothing is specified', () => {
    const r = resolvePalette({ md: NO_FM, env: {} });
    assert.equal(r.name, DEFAULT);
    assert.equal(r.source, 'default');
  });

  test('resolve: front-matter theme:indaco wins over default', () => {
    const r = resolvePalette({ md: FM_INDACO, env: {} });
    assert.equal(r.name, 'indaco');
    assert.equal(r.source, 'front-matter');
  });

  test('resolve: front-matter theme:cuoio resolves to cuoio', () => {
    const r = resolvePalette({ md: FM_CUOIO, env: {} });
    assert.equal(r.name, 'cuoio');
    assert.equal(r.source, 'front-matter');
  });

  test('resolve: front-matter present but no theme: field falls through to default', () => {
    const r = resolvePalette({ md: FM_NONE, env: {} });
    assert.equal(r.name, DEFAULT);
    assert.equal(r.source, 'default');
  });

  test('resolve: env LATTICE_PALETTE overrides front-matter', () => {
    const r = resolvePalette({ md: FM_INDACO, env: { LATTICE_PALETTE: 'cuoio' } });
    assert.equal(r.name, 'cuoio');
    assert.equal(r.source, 'env');
  });

  test('resolve: env LATTICE_PALETTE wins when no front-matter theme', () => {
    const r = resolvePalette({ md: FM_NONE, env: { LATTICE_PALETTE: 'cuoio' } });
    assert.equal(r.name, 'cuoio');
    assert.equal(r.source, 'env');
  });

  test('resolve: empty env LATTICE_PALETTE is treated as unspecified', () => {
    const r = resolvePalette({ md: FM_INDACO, env: { LATTICE_PALETTE: '' } });
    assert.equal(r.name, 'indaco');
    assert.equal(r.source, 'front-matter');
  });

  test('resolve: whitespace env LATTICE_PALETTE is treated as unspecified', () => {
    const r = resolvePalette({ md: FM_INDACO, env: { LATTICE_PALETTE: '   ' } });
    assert.equal(r.source, 'front-matter');
  });

  test('resolve: CLI arg wins over env', () => {
    const r = resolvePalette({ md: FM_INDACO, cliArg: 'cuoio', env: { LATTICE_PALETTE: 'indaco' } });
    assert.equal(r.name, 'cuoio');
    assert.equal(r.source, 'cli');
  });

  test('resolve: CLI arg wins over front-matter (no env)', () => {
    const r = resolvePalette({ md: FM_INDACO, cliArg: 'cuoio', env: {} });
    assert.equal(r.name, 'cuoio');
    assert.equal(r.source, 'cli');
  });

  test('resolve: CLI arg wins even when nothing else is set', () => {
    const r = resolvePalette({ md: NO_FM, cliArg: 'cuoio', env: {} });
    assert.equal(r.name, 'cuoio');
    assert.equal(r.source, 'cli');
  });

  test('resolve: CLI arg null/undefined is treated as unspecified', () => {
    const r1 = resolvePalette({ md: FM_INDACO, cliArg: null, env: {} });
    assert.equal(r1.source, 'front-matter');
    const r2 = resolvePalette({ md: FM_INDACO, cliArg: undefined, env: {} });
    assert.equal(r2.source, 'front-matter');
  });

  test('resolve: CLI arg empty string is treated as unspecified', () => {
    const r = resolvePalette({ md: FM_CUOIO, cliArg: '', env: {} });
    assert.equal(r.source, 'front-matter');
  });

  test('resolve: front-matter theme accepts quoted values', () => {
    const r1 = resolvePalette({ md: '---\ntheme: "cuoio"\n---\n', env: {} });
    assert.equal(r1.name, 'cuoio');
    const r2 = resolvePalette({ md: "---\ntheme: 'cuoio'\n---\n", env: {} });
    assert.equal(r2.name, 'cuoio');
  });

  test('resolve: front-matter theme tolerates trailing whitespace', () => {
    const r = resolvePalette({ md: '---\ntheme: cuoio   \n---\n', env: {} });
    assert.equal(r.name, 'cuoio');
  });

  test('resolve: theme: outside the front-matter block is ignored', () => {
    // Only the leading ---\n…\n---\n block counts. A `theme:` mention
    // anywhere else (body prose, comment) must not be picked up.
    const md = '# Slide\n\ntheme: cuoio\n\nbody';
    const r = resolvePalette({ md, env: {} });
    assert.equal(r.source, 'default');
  });

  test('resolve: empty md still works (gives default)', () => {
    const r = resolvePalette({ md: '', env: {} });
    assert.equal(r.source, 'default');
  });

  test('resolve: missing md arg still works (gives default)', () => {
    const r = resolvePalette({ env: {} });
    assert.equal(r.source, 'default');
  });

  // ── The trailing-comment defect, and the guard it used to hide ────────────────
  //
  // This reader used to capture the value with `([A-Za-z0-9_-]+)` anchored to `$`,
  // which did two jobs at once and got one of them wrong. `theme: cuoio  # brand`
  // matched NOTHING, so a deck that annotated its own front matter silently fell
  // back to indaco (the default at the time) on the CLI/export path — while the engine's
  // own `parseFrontMatter`
  // read the palette fine. Two readers, one question, opposite answers (#1416's class).
  //
  // Caught by rendering the real CLI, not by a unit test: every unit suite passed
  // while `node dist/lattice-emulator.js` still emitted the wrong `--accent`.

  test('resolve: a trailing YAML comment does not lose the deck its palette', () => {
    const r = resolvePalette({ md: '---\ntheme: cuoio  # our brand palette\n---\n\n# T\n', env: {} });
    assert.equal(r.name, 'cuoio');
    assert.equal(r.source, 'front-matter');
  });

  test('resolve: a quoted value with a trailing comment', () => {
    const r = resolvePalette({ md: "---\ntheme: 'cuoio' # draft\n---\n\n# T\n", env: {} });
    assert.equal(r.name, 'cuoio');
    assert.equal(r.source, 'front-matter');
  });

  test('resolve: the path-traversal guard survives the shared reader', () => {
    // The name becomes `themes/<name>.css`, so this constraint is load-bearing. It used
    // to be implicit in the capture group; it is now an explicit predicate, and this is
    // what proves the explicit one still holds.
    for (const bad of ['../../etc/passwd', 'a b', 'foo/bar', '..']) {
      const r = resolvePalette({ md: `---\ntheme: ${bad}\n---\n\n# T\n`, env: {} });
      assert.equal(r.source, 'default', `${bad} must not resolve as a palette`);
      // The CONSTANT, not a literal: this case is about the guard rejecting the value
      // and falling through, not about which palette the fall-through lands on.
      assert.equal(r.name, DEFAULT);
    }
  });

  test('resolve: a hyphenated a11y palette still resolves', () => {
    const r = resolvePalette({ md: '---\ntheme: a11y-deuteranopia\n---\n\n# T\n', env: {} });
    assert.equal(r.name, 'a11y-deuteranopia');
    assert.equal(r.source, 'front-matter');
  });

});
