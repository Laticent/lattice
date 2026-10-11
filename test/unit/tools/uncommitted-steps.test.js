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
 * was worse: it assumed every generator's `--check` IS a byte-diff, and the
 * index generators' checks validate SOURCES instead (their output is never
 * committed). Rebuilding and diffing the tree cannot express that.
 *
 * So the tags stay, and the drift risk is answered by ASSERTING THE PARTITION
 * here rather than by trusting whoever edits STEPS next. The tags themselves were
 * derived by measurement — timestamp the tree, run each of the 39 generators
 * alone, classify what it wrote — not by reading the build.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { STEPS, scopeSteps } = require('../../../tools/build.js');
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
  // Measured 2026-09-06 against a timestamped tree: its entire write set is
  // lib/core/dagre-bundle.generated.js, which .gitignore carries for the same
  // reason as the docs-site bundles — a 62KB minified bundle on one line makes
  // every concurrent PR conflict.
  'build-dagre-bundle.js',
  'build-css.js',
  'build-default-bundle.js',
  'build-runtime.js',
  'build-cli.js',
  'build-docs-portal.js',
  'build-forms.js',
  'build-concepts.js',
  'build-playground.js',
  'build-katex-provider.js',
  // Measured 2026-10-05: writes only docs/public/playground/lattice-plugin-<name>.js, beside the
  // KaTeX provider and covered by the same ignore rule.
  'build-plugin-data-bundles.js',
  'build-hljs-languages.js',
  'build-theme-core.js',
  'build-layout-core.js',
  // Measured 2026-09-24: writes only docs/src/playground/packages-core.generated.js,
  // which .gitignore's docs/src/playground/*.generated.js covers.
  'build-packages-core.js',
  'build-authoring-core.js',
  'build-exemplar-core.js',
  'build-standalone-core.js',
  'build-image-set-core.js',
  'build-a11y-textures.js',
  'build-player-core.js',
  'build-player-prune.js',
  // Measured 2026-09-24: its whole write set is docs/src/lib/ltt/dist/, which docs/.gitignore's
  // `dist/` covers, exactly as it does for the four sibling library dists below.
  'build-ltt-lib.js',
  'build-cadenza-lib.js',
  'build-trama-lib.js',
  // Calco's write set is docs/src/lib/calco/dist/, covered by docs/.gitignore's `dist/`.
  'build-calco-lib.js',
  'build-vetrina-lib.js',
  'build-lente-lib.js',
  // Measured 2026-09-28: its whole write set is docs/src/lib/segno/dist/ (docs/.gitignore's
  // `dist/`); the committed notation.generated.ts is written by build-segno-grammar.js.
  'build-segno-lib.js',
  'build-suono-lib.js',
  // Its whole write set is docs/src/lib/tavola/dist/, covered by docs/.gitignore's `dist/`.
  'build-tavola-lib.js',
  'build-read-along-core.js',
  'build-marp-kit.js',
  'build-agent-kit.mjs',
  'build-dist-readme.js',
  // Measured 2026-09-27 against a timestamped tree: its whole write set is
  // dist/lattice-pdf-compose-min.js (the shared PDF writer the CLI injects), which
  // .gitignore's dist/ covers. Its esbuild entry is a temp file it deletes before exiting.
  'build-pdf-compose.js',
  // Measured 2026-10-09 against a timestamped tree: each one's whole write set is one file
  // under dist/engineering/ (capabilities.md, decisions.md, gotchas.md). They are the
  // three generated INDEXES, and they are also `validates` — see the test below.
  'build-capabilities.js',
  'build-decisions-index.js',
  'build-gotchas-index.js',
]);

// Generators that write PR-owned artifacts. Listed explicitly, so that tagging
// one of them `uncommitted` — which would silently stop checking it — fails here
// instead of shipping.
const EXPECTED_PR_OWNED = new Set([
  'build-stage-catalog.js', // lib/forms/cell/masthead
  'build-theme-catalog.js', // lib/theme/edges.generated.mjs AND the palette catalog
  // Re-measured 2026-10-07: its whole write set is lib/packages/packages.generated.json,
  // lib/finishes/presets.generated.js, lib/motion/scenes.generated.js,
  // lib/base/base.finish.css and lib/packages/reserved-classes.generated.js, all tracked —
  // the spine's registry, the finish register and the Studio's shipped-motion list read them.
  'build-packages-index.js', // lib/packages
  'build-axis-dom-catalog.js', // lib/runtime
  // Measured 2026-09-21 against a timestamped tree: its whole write set is
  // docs/src/components/studio/guide-handles.generated.ts, which git tracks — the Guide
  // imports it as an ordinary module, so a missing file is a docs build error.
  'build-guide-handles.js', // docs/src/components/studio
  'build-chart-registry.js', // lib/plugins/chart-family/shared/chart-registry.generated.js
  'build-chart-finish-css.js', // lib/components/chart/_chart-family/chart-finish.generated.css
  // Measured 2026-09-27: writes exactly lib/plugins/grammar.generated.mjs and
  // lib/plugins/registry.generated.js, both tracked.
  'build-plugin-registry.js',
  // Measured 2026-10-05: writes lib/plugins/icons/icons.{vocab,data}.generated.js, both tracked —
  // the registry and the engine require them.
  'build-icons-data.js',
  // Measured 2026-10-09 against a timestamped tree: writes exactly
  // lib/plugins/avatars/avatars.{vocab,data}.generated.js, both tracked — the registry and the
  // engine require them, as they do the icons'.
  'build-avatars-data.js',
  'build-projection-catalog.js', // lib/core/projection-catalog.generated.mjs
  // Measured 2026-09-28: writes exactly docs/src/lib/segno/notation.generated.ts, which git
  // tracks — the docs site and Vitest import it. Since Segno phase 3 (2026-10-06) also
  // lib/core/flowchart-row.generated.js, tracked too: `splitRow` requires it; and since phase 3's
  // list text (2026-10-06) lib/core/list-text.generated.js, which leading-marker.js requires.
  'build-segno-grammar.js', // docs/src/lib/segno, lib/core
  'build-snippets.js', // .vscode
  'build-component-docs.js', // lib/components/**/*.docs.md
  'build-landing-tokens.js', // docs/src/styles
  'build-spec-docs.js', // docs/src/content/docs/spec
  'build-anima-player.js', // lib/export
  'build-guide-player.js', // lib/export — the Guide for narrated exports (committed, like Anima's)
  // Measured 2026-09-24: its whole write set is docs/src/lib/ltt/ltt.schema.json, which git
  // tracks — it is the generated half of guardrail G1, and build:check must compare it.
  'build-ltt-schema.js', // docs/src/lib/ltt
  // Measured 2026-09-20 against a timestamped tree: its whole write set is
  // lib/export/speech-projection-bundle.generated.mjs, which git tracks.
  'build-speech-projection-bundle.js', // lib/export
  'derive-cat-ink.js', // themes/*.css
  'derive-chart-cat-ink.js', // themes/*.css
  'build-split-treatments.js', // engineering/decisions/*.md
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

  await t.test('a PR is still held to its own index rows', () => {
    // A PR is responsible for its own decision note, its own tool or script description,
    // and its own gotcha heading. The three indexes are no longer committed, so that duty
    // moved from "commit the regenerated row" to "pass the source validator": each is
    // `uncommitted` AND `validates`, and `build:check` runs every `validates` step's
    // --check even though it skips other uncommitted steps. Lose `validates` and the
    // gate shrinks silently. Component docs stay a committed, PR-owned artifact.
    for (const s of ['build-decisions-index.js', 'build-capabilities.js', 'build-gotchas-index.js']) {
      const step = STEPS.find((x) => x.script === s);
      assert.ok(step, `${s} missing from STEPS`);
      assert.ok(step.uncommitted && step.validates, `${s} must be uncommitted + validates`);
    }
    const docs = STEPS.find((x) => x.script === 'build-component-docs.js');
    assert.ok(docs && !docs.uncommitted, 'build-component-docs.js must stay PR-owned');
  });

  await t.test('validates only ever rides on an uncommitted step', () => {
    // On a committed step `validates` means nothing (build:check already runs it), and
    // a reader would wrongly take it to change what the gate does.
    for (const step of STEPS) {
      if (step.validates) assert.ok(step.uncommitted, `${step.script}: validates without uncommitted`);
    }
  });

  await t.test('build:check keeps every validates step in scope', () => {
    // Through the orchestrator's own scoping function, the one `main` calls.
    const scoped = new Set(scopeSteps({ excludeUncommitted: true }).map((s) => s.script));
    for (const step of STEPS.filter((s) => s.validates)) {
      assert.ok(scoped.has(step.script), `${step.script} is not in build:check's scope`);
    }
    // And they are still WRITTEN by the install-time bootstrap.
    const installed = new Set(scopeSteps({ onlyUncommitted: true }).map((s) => s.script));
    for (const step of STEPS.filter((s) => s.validates)) {
      assert.ok(installed.has(step.script), `${step.script} is not written by build:uncommitted`);
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
    assert.equal(isIgnored('dist/lattice.js'), true);
    assert.equal(isIgnored('docs/public/playground/lattice-playground.js'), true);
  });
});
