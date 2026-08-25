/**
 * The `uncommitted` tags on tools/build.js's STEPS.
 *
 * `npm run build:check` is `build.js --check --exclude-built-not-committed`: it skips the
 * generators whose outputs the rebuild workflow writes on `main`, because a PR
 * branch's bundles are legitimately stale against that PR's own source.
 *
 * THE DANGER THIS FILE EXISTS FOR. A step wrongly tagged `uncommitted` stops being
 * checked, and says nothing about it. That is a gate quietly getting smaller —
 * the failure mode is silence, which is why an earlier attempt rejected step
 * tagging altogether and rebuilt-and-diffed the tree instead. That alternative
 * was worse: it assumed every generator's `--check` IS a byte-diff, and
 * build-decisions-index.js's is deliberately weaker (#1547) so two decision-doc
 * PRs can share the merge queue. Rebuilding and diffing re-opened that ejection.
 *
 * So the tags stay, and the drift risk is answered by ASSERTING THE PARTITION
 * here rather than by trusting whoever edits STEPS next. The tags themselves were
 * derived by measurement — timestamp the tree, run each of the 39 generators
 * alone, classify what it wrote — not by reading the build.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { STEPS } = require('../../../tools/build.js');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');

/** True when git ignores the path — i.e. it is built, not committed. */
function isIgnored(p) {
  const r = spawnSync('git', ['check-ignore', '-q', p], { cwd: ROOT });
  return r.status === 0;
}

// Measured, one generator at a time. Every entry is a script whose ENTIRE write
// set lands inside the built-not-committed paths. Changing this list means re-measuring,
// not re-reasoning.
const EXPECTED_UNCOMMITTED = new Set([
  'build-css.js',
  'build-default-bundle.js',
  'build-runtime.js',
  'build-emulator.js',
  'build-docs-portal.js',
  'build-forms.js',
  'build-concepts.js',
  'build-playground.js',
  'build-katex-provider.js',
  'build-hljs-languages.js',
  'build-theme-core.js',
  'build-layout-core.js',
  'build-authoring-core.js',
  'build-exemplar-core.js',
  'build-standalone-core.js',
  'build-image-set-core.js',
  'build-a11y-textures.js',
  'build-player-core.js',
  'build-player-prune.js',
  'build-cadenza-lib.js',
  'build-vetrina-lib.js',
  'build-lente-lib.js',
  'build-suono-lib.js',
  'build-read-along-core.js',
  'build-marp-kit.js',
  'build-dist-readme.js',
]);

// Generators that write PR-owned artifacts. Listed explicitly, so that tagging
// one of them `uncommitted` — which would silently stop checking it — fails here
// instead of shipping.
const EXPECTED_PR_OWNED = new Set([
  'build-stage-catalog.js', // lib/forms/cell/masthead
  'build-theme-catalog.js', // lib/theme/edges.generated.mjs AND the palette catalog
  'build-axis-dom-catalog.js', // lib/runtime
  'build-snippets.js', // .vscode
  'build-component-docs.js', // lib/components/**/*.docs.md
  'build-landing-tokens.js', // docs/src/styles
  'build-spec-docs.js', // docs/src/content/docs/spec
  'build-anima-player.js', // lib/export
  'derive-cat-ink.js', // themes/*.css
  'derive-chart-cat-ink.js', // themes/*.css
  'build-capabilities.js', // engineering/capabilities.md
  'build-split-treatments.js', // engineering/decisions/*.md
  'build-decisions-index.js', // engineering/decisions/README.md
  'build-gotchas-index.js', // engineering/gotchas.md
]);

test('built-not-committed build steps', async (t) => {
  await t.test('every step is classified, exactly once', () => {
    for (const step of STEPS) {
      const inBot = EXPECTED_UNCOMMITTED.has(step.script);
      const inPr = EXPECTED_PR_OWNED.has(step.script);
      assert.ok(
        inBot !== inPr,
        `${step.script} is in ${inBot && inPr ? 'BOTH' : 'NEITHER'} expected set. ` +
          'A new build step must be measured and classified — run it alone against ' +
          'a timestamped tree and see whether everything it writes is built-not-committed.',
      );
    }
  });

  await t.test('the tags match the measured classification', () => {
    for (const step of STEPS) {
      assert.equal(
        Boolean(step.uncommitted),
        EXPECTED_UNCOMMITTED.has(step.script),
        `${step.script}: uncommitted tag disagrees with the measured write set. ` +
          'If the generator genuinely changed what it writes, re-measure and update ' +
          'BOTH — a tag that drifts from reality either stops checking a PR-owned ' +
          'artifact (silent) or deadlocks every PR that touches this one (loud).',
      );
    }
  });

  await t.test('no expected script has disappeared from STEPS', () => {
    // Otherwise a renamed or deleted generator leaves a stale expectation that
    // passes vacuously while covering nothing.
    const scripts = new Set(STEPS.map((s) => s.script));
    for (const s of [...EXPECTED_UNCOMMITTED, ...EXPECTED_PR_OWNED]) {
      assert.ok(scripts.has(s), `${s} is expected here but is no longer a build step`);
    }
  });

  await t.test('the PR-owned set still covers the artifacts a PR must own', () => {
    // The load-bearing three: a PR is responsible for its own decision-note row,
    // its own capability-index row, and its own component docs. If any of these
    // ever gets tagged built-not-committed, PRs stop being held to them at all.
    for (const s of ['build-decisions-index.js', 'build-capabilities.js', 'build-component-docs.js']) {
      const step = STEPS.find((x) => x.script === s);
      assert.ok(step, `${s} missing from STEPS`);
      assert.ok(!step.uncommitted, `${s} must stay PR-owned — a PR owns this artifact`);
    }
  });

  await t.test('the scoped run still has steps left to check', () => {
    // A partition that excluded everything would make `build:check` a no-op that
    // exits 0 forever. Guard the degenerate case explicitly.
    const remaining = STEPS.filter((s) => !s.uncommitted);
    assert.ok(remaining.length >= 10, `only ${remaining.length} PR-owned steps remain`);
  });

  await t.test('the theme catalog is PR-owned, and so is its sibling output', () => {
    // build-theme-catalog.js writes docs/src/lib/theme-catalog.generated.ts AND
    // lib/theme/edges.generated.mjs. It is the one generator whose outputs
    // straddled the boundary; the catalog was pulled back to PR-owned so the step
    // is wholly PR-owned. Re-adding the catalog to the built-not-committed paths recreates
    // a step that can be neither skipped nor kept.
    assert.equal(isIgnored('docs/src/lib/theme-catalog.generated.ts'), false);
    assert.equal(isIgnored('lib/theme/edges.generated.mjs'), false);
    // And the sanity check in the other direction: the bundles ARE ignored.
    assert.equal(isIgnored('dist/lattice-emulator.js'), true);
    assert.equal(isIgnored('docs/public/playground/lattice-playground.js'), true);
  });
});
