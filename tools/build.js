#!/usr/bin/env node
/**
 * The Lattice build orchestrator — one entry point that produces every
 * canonical generated artifact, in dependency order, behind a single
 * collision gate.
 *
 * Before this script the build was a loose bag of npm scripts
 * (css:build, runtime:build, snippets:build, docs:components,
 * docs:portal), each invoked by hand and each with its own --check
 * twin. Nothing ran them together or in a guaranteed order, and nothing
 * proved the separately-built single-canonical files didn't clobber each
 * other. `npm run build` now does both: it runs the ownership guard
 * first (fail fast), then regenerates every artifact.
 *
 * Steps (in order):
 *   0. ownership guard        tools/check-ownership.js   (gate — no output)
 *   0b. font-embedding parity  tools/check-fonts.js       (preflight gate)
 *   1. lattice.css            tools/build-css.js
 *   2. lattice-default.css    tools/build-default-bundle.js  (engine + default palette)
 *   2b. axis-DOM catalog      tools/build-axis-dom-catalog.js (lib/runtime/, before step 3)
 *   3. lattice-runtime.js     tools/build-runtime.js
 *   4. lattice-emulator.js    tools/build-emulator.js    (bundled CLI bin)
 *   5. VS Code snippets       tools/build-snippets.js
 *   6. per-component docs      tools/build-component-docs.js
 *   7. canonical doc portal    tools/build-docs-portal.js (components.md/.json)
 *   7b. forms catalog          tools/build-forms.js       (dist/docs/forms.json)
 *   7c. concepts catalog       tools/build-concepts.js    (dist/docs/concepts.json)
 *   8. landing tokens          tools/build-landing-tokens.js  (docs site palette CSS)
 *   9. playground bundle       tools/build-playground.js      (docs site browser engine)
 *   9b. katex-provider bundle  tools/build-katex-provider.js  (on-demand KaTeX, split out of 9)
 *  10. theme-core bundle       tools/build-theme-core.js      (docs site Theme Studio core)
 *  11. layout-core bundle      tools/build-layout-core.js     (docs site Layout Studio core)
 *  12. authoring-core bundle   tools/build-authoring-core.js  (docs site Architect/Coach core)
 *  13. capability index        tools/build-capabilities.js (engineering/capabilities.md)
 *  14. marp kit               tools/build-marp-kit.js (dist/marp-kit; needs dist/ fresh)
 *  15. dist README            tools/build-dist-readme.js (indexes dist/; runs last)
 *
 * Gallery PDFs are NOT part of this build: they need Chromium, take tens
 * of seconds, and are regression artifacts rather than shipped source.
 * Build them explicitly with `npm run build:galleries` /
 * `build:bucket-galleries`.
 *
 * Usage:
 *   node tools/build.js            # regenerate every artifact
 *   node tools/build.js --check    # verify nothing is stale (CI gate);
 *                                  # exits 1 if any artifact would change
 *
 * Exit codes:
 *   0  success (or --check: everything up to date)
 *   1  a step failed, or (--check) an artifact is stale / a collision
 */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Each step names its generator script and whether it accepts --check.
// The guard runs first and has no build/check distinction (it only
// reads), so it is always invoked plain.
const GUARD = { label: 'ownership guard', script: 'check-ownership.js' };

// Read-only preflight gates that run after the ownership guard and before any
// artifact is (re)generated — a desynced font set should fail the build, not
// bake a fallback PDF. Each only reads, so it is invoked plain (no --check).
// (`check-lint-coverage.js` writes and removes probe files inside its own run, so it is
// read-only from the build's point of view; it is here rather than in the ownership guard
// because it shells out to Biome and git, which that pure-ish file does not.)
const PREFLIGHT = [
  { label: 'font-embedding parity', script: 'check-fonts.js' },
  { label: 'lint coverage', script: 'check-lint-coverage.js' },
];

const STEPS = [
  { label: 'lattice.css', script: 'build-css.js', uncommitted: true },
  { label: 'lattice-default.css', script: 'build-default-bundle.js', uncommitted: true },
  // Must run BEFORE lattice-runtime.js / lattice-emulator.js — those bundles
  // `require()` these generated catalogs directly (esbuild inlines them at
  // bundle time). The stage catalog is the single source of the stage-cell
  // classification the masthead kernel reads (stage-cell classification, step A).
  { label: 'stage catalog (lib/forms/cell/masthead)', script: 'build-stage-catalog.js' },
  // The palette picker's groups + swatches, baked from themes/*.manifest.json — the
  // docs bundle can't fs-load 32 manifests at runtime.
  { label: 'theme catalog (docs studio palettes)', script: 'build-theme-catalog.js' },
  { label: 'axis-DOM catalog (lib/runtime)', script: 'build-axis-dom-catalog.js' },
  { label: 'lattice-runtime.js', script: 'build-runtime.js', uncommitted: true },
  { label: 'lattice-emulator.js', script: 'build-emulator.js', uncommitted: true },
  { label: 'VS Code snippets', script: 'build-snippets.js' },
  { label: 'per-component docs', script: 'build-component-docs.js' },
  { label: 'doc portal (components.md/.json)', script: 'build-docs-portal.js', uncommitted: true },
  { label: 'forms catalog (dist/docs/forms.json)', script: 'build-forms.js', uncommitted: true },
  { label: 'concepts catalog (dist/docs/concepts.json)', script: 'build-concepts.js', uncommitted: true },
  { label: 'landing tokens (docs site)', script: 'build-landing-tokens.js' },
  { label: 'spec pages (docs site)', script: 'build-spec-docs.js' },
  { label: 'playground bundle (docs site)', script: 'build-playground.js', uncommitted: true },
  { label: 'katex-provider bundle (docs site)', script: 'build-katex-provider.js', uncommitted: true },
  // Per-language highlight.js grammars for on-demand preview loading. After the
  // playground bundle only for log ordering — it reads node_modules, not the bundle.
  { label: 'hljs grammars (docs site)', script: 'build-hljs-languages.js', uncommitted: true },
  { label: 'theme-core bundle (docs site)', script: 'build-theme-core.js', uncommitted: true },
  { label: 'layout-core bundle (docs site)', script: 'build-layout-core.js', uncommitted: true },
  { label: 'authoring-core bundle (docs site)', script: 'build-authoring-core.js', uncommitted: true },
  { label: 'exemplar-core bundle (docs site)', script: 'build-exemplar-core.js', uncommitted: true },
  { label: 'standalone-core bundle (docs site)', script: 'build-standalone-core.js', uncommitted: true },
  { label: 'image-set-core bundle (docs site)', script: 'build-image-set-core.js', uncommitted: true },
  { label: 'a11y-textures bundle (docs site)', script: 'build-a11y-textures.js', uncommitted: true },
  // anima-player IIFE must exist before player-core bundles it in (playerJs injects it).
  { label: 'anima-player bundle (engine export)', script: 'build-anima-player.js' },
  { label: 'player-core bundle (docs site)', script: 'build-player-core.js', uncommitted: true },
  { label: 'player-prune bundle (docs site)', script: 'build-player-prune.js', uncommitted: true },
  // Cadenza's dist/ must exist on disk BEFORE read-along-core bundles it in.
  { label: 'Cadenza library dist (CJS + .d.ts)', script: 'build-cadenza-lib.js', uncommitted: true },
  { label: 'Vetrina library dist (CJS + .d.ts)', script: 'build-vetrina-lib.js', uncommitted: true },
  // Lente has no root CJS consumer today, but its package.json promises
  // ./dist/index.cjs (main/require) and it is a workspace member, so it must
  // build like its siblings or `require('@workwel/lente')` / publish break.
  { label: 'Lente library dist (CJS + .d.ts)', script: 'build-lente-lib.js', uncommitted: true },
  { label: 'Suono library dist (CJS + .d.ts)', script: 'build-suono-lib.js', uncommitted: true },
  { label: 'read-along-core bundle (docs site)', script: 'build-read-along-core.js', uncommitted: true },
  // Capability index — reads package.json scripts + tools/ headers (source,
  // not built artifacts), so order-independent; grouped with the generators.
  // Curated categorical on-canvas ink — regenerates the --cat-N-ink block in each
  // palette from that palette's own mark cycle (hue + chroma held, lightness solved
  // for AA). Reads theme SOURCE only, so it is order-independent; it must simply run
  // before anything that copies themes/ into dist/.
  { label: 'categorical on-canvas ink (themes/*.css)', script: 'derive-cat-ink.js' },
  { label: 'chart categorical ink (themes/*.css)', script: 'derive-chart-cat-ink.js' },
  { label: 'capability index (engineering/capabilities.md)', script: 'build-capabilities.js' },
  // §0c's split-treatment table — renders TREATMENTS (lib/core/split-facts.js) into
  // the split decision note. Reads manifests + that map; order-independent.
  { label: 'split treatments (§0c of the split decision note)', script: 'build-split-treatments.js' },
  // Decision-doc index — reads each note's front-matter; order-independent.
  { label: 'decision index (engineering/decisions/README.md)', script: 'build-decisions-index.js' },
  // Gotchas symptom index — reads the entry headings in engineering/gotchas/;
  // order-independent, same as the decision index above.
  { label: 'gotchas index (engineering/gotchas.md)', script: 'build-gotchas-index.js' },
  // Last — it indexes the finished dist/ folder, so every other artifact
  // must already be (re)written before it runs.
  // The copy-and-go Marp kit. Runs LATE: it copies dist/lattice.min.css,
  // dist/themes/, dist/lattice-runtime.min.js and dist/fonts/, so every one of
  // those must already be fresh. Before dist README, which indexes dist/.
  { label: 'marp kit (dist/marp-kit)', script: 'build-marp-kit.js', uncommitted: true },
  { label: 'dist README', script: 'build-dist-readme.js', uncommitted: true },
];

// The slowest steps (non-incremental `tsc --emitDeclarationOnly`) have no
// ordering dependency on anything EXCEPT read-along-core, which needs Cadenza's
// dist/ on disk (see the STEPS comment above). Run them in the background as
// soon as the pipeline starts; join right before read-along-core, the one step
// that actually needs to wait. Each -lib script stages into its own
// `${dist}.tmp` sibling and touches only its own lib dir, so the three run
// collision-free; Lente/Vetrina aren't read-along inputs, so joining them at
// that point is incidental (harmless), not a dependency.
// Conservative scope: just these library dists, not a full 26-step dependency-tier
// reorg (the other steps' temp-path usage across all 26 scripts isn't
// audited, so parallelizing further risks output collisions this narrow slice
// avoids by construction).
const BACKGROUND_LABELS = new Set([
  'Cadenza library dist (CJS + .d.ts)',
  'Vetrina library dist (CJS + .d.ts)',
  'Lente library dist (CJS + .d.ts)',
  'Suono library dist (CJS + .d.ts)',
]);
const JOIN_BEFORE_SCRIPT = 'build-read-along-core.js';

function runStep(step, check) {
  const args = [path.join(__dirname, step.script)];
  if (check) args.push('--check');
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  return r.status === 0;
}

// Runs a step in the background (stdio buffered, not inherited, so its output
// can't interleave with the serial steps' console lines) and flushes that
// buffered output — prefixed with the step label — once it exits.
function runStepAsync(step, check) {
  const args = [path.join(__dirname, step.script)];
  if (check) args.push('--check');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['inherit', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => {
      if (out) process.stdout.write(`\n▸ ${step.label} (background)\n${out}`);
      resolve(code === 0);
    });
  });
}

async function main(argv) {
  const check = argv.includes('--check');
  // --exclude-uncommitted: skip the generators whose outputs are NOT COMMITTED
  // (dist/, the docs-site bundles — see .gitignore). This is not an optimization,
  // it is what keeps the gate meaningful.
  //
  // The gate's question is "did you commit the regenerated artifacts you own?",
  // which can only be answered by comparing a FRESH generation against what is on
  // disk from the checkout. So CI must NOT run `npm run build` before it — that
  // would make everything on disk fresh and every check pass vacuously. But a CI
  // checkout has no dist/ at all now, so those generators would fail on a missing
  // file rather than a stale one. Skipping them is the correct scope: an artifact
  // that is never committed cannot be stale relative to anything.
  //
  // Each surviving generator keeps its OWN --check semantics, which is load-bearing:
  // build-decisions-index.js's is deliberately WEAKER than a byte-diff (#1547) so
  // two decision-doc PRs can share the merge queue. An earlier attempt at this
  // scoping rebuilt the tree and diffed it with git instead, which silently
  // overrode that and re-opened the ejection #1547 closed.
  //
  // The tags were derived by MEASUREMENT — timestamp the tree, run each of the 39
  // generators alone, see what it writes — not by reading the build; that is how
  // build-theme-catalog.js was caught writing on both sides of the line.
  // test/unit/tools/uncommitted-steps.test.js re-asserts the partition.
  const excludeUncommitted = check && argv.includes('--exclude-uncommitted');

  // --only-uncommitted: generate ONLY the built-not-committed artifacts, and skip
  // the guard and preflight entirely. This exists to break a real chicken-and-egg
  // a cold checkout hits: the ownership guard reads dist/ CSS to know which tokens
  // are declared, and reads a generated docs bundle for the style-sink check — so
  // on a tree that has never been built it fails on the absence of the very files
  // this script exists to produce.
  //
  // CI uses it as a bootstrap: `build:uncommitted` then `build:check`. That order
  // matters and is the whole point — building EVERYTHING first would rewrite the
  // committed artifacts too, so the freshness check after it would compare fresh
  // against fresh and pass vacuously. Generating only the uncommitted half gives
  // the guard its inputs while leaving the committed half exactly as checked out,
  // which is the state the gate needs to judge.
  const onlyUncommitted = argv.includes('--only-uncommitted');

  const steps = onlyUncommitted
    ? STEPS.filter((s) => s.uncommitted)
    : excludeUncommitted
      ? STEPS.filter((s) => !s.uncommitted)
      : STEPS;
  const mode = check ? 'check' : 'build';
  const scope = excludeUncommitted
    ? `${steps.length} committed artifacts (${STEPS.length - steps.length} built-not-committed skipped)`
    : `${steps.length} artifacts`;
  process.stdout.write(`Lattice ${mode}: ${scope} behind the ownership gate.\n\n`);

  // SELF-BOOTSTRAP. The ownership guard below reads dist/ CSS to know which tokens
  // are declared, and a generated docs bundle for the HARD RULE #22 style-sink
  // check. Those are built, not committed — so on a tree that has never been built
  // the guard fails on the ABSENCE of the very files this script exists to produce,
  // and its error tells you to delete a security allowlist entry rather than to
  // build.
  //
  // This was originally handled by making every caller run `build:uncommitted`
  // first. That was the wrong shape and it shipped broken: five CI jobs, the
  // pre-push hook, the release workflow and the SessionStart hook all call plain
  // `npm run build` or `npm run build:check`, and every one of them was red on a
  // cold checkout. An ordering invariant spread across ten surfaces, enforced by
  // nobody, is a defect generator. It lives here instead, once.
  //
  // Only the UNCOMMITTED steps run: generating the committed artifacts too would
  // make a subsequent --check compare fresh against fresh and pass vacuously.
  //
  // CONSTRAINT this creates, and it is load-bearing: an uncommitted step may not
  // depend on a COMMITTED step's output being freshly generated, because the
  // bootstrap skips those. Today that holds — build-player-core.js needs
  // build-anima-player.js's lib/export/anima-player-bundle.generated.mjs, and that
  // file is committed, so a checkout always has it. If a dependency of an
  // uncommitted step is ever moved out of git, bootstrap it here too.
  const GUARD_INPUTS = ['dist/lattice.css', 'docs/src/playground/player-core.generated.js'];
  if (!onlyUncommitted && GUARD_INPUTS.some((f) => !fs.existsSync(path.join(ROOT, f)))) {
    process.stdout.write('▸ cold tree — generating the built-not-committed artifacts first\n');
    // BACKGROUND_LABELS first, and this is a dependency, not a speed-up. The main
    // pipeline starts the four workspace-library dists in the background early and
    // joins them at build-read-along-core.js; a naive in-order serial loop here
    // instead ran build-player-core.js BEFORE build-cadenza-lib.js, and player-core
    // bundles `@workwel/cadenza`, whose entry IS that dist. It failed with
    // `Could not resolve "@workwel/cadenza"` on a genuinely cold tree — and only
    // there, because any previously-built dist/ hid it.
    const bootstrapOrder = [
      ...STEPS.filter((x) => x.uncommitted && BACKGROUND_LABELS.has(x.label)),
      ...STEPS.filter((x) => x.uncommitted && !BACKGROUND_LABELS.has(x.label)),
    ];
    for (const step of bootstrapOrder) {
      if (!runStep(step, false)) {
        process.stderr.write(`\nbuild aborted: bootstrap step ${step.label} failed.\n`);
        return 1;
      }
    }
    process.stdout.write('\n');
  }

  // Gate first — a collision fails before anything is (re)generated. Skipped under
  // --only-uncommitted, which runs precisely to give this guard the files it reads.
  if (!onlyUncommitted) {
  process.stdout.write(`▸ ${GUARD.label}\n`);
  if (!runStep(GUARD, false)) {
    process.stderr.write('\nbuild aborted: ownership guard failed.\n');
    return 1;
  }

  }

  // Read-only preflight gates (font parity, …) — fail before generating.
  for (const gate of onlyUncommitted ? [] : PREFLIGHT) {
    process.stdout.write(`▸ ${gate.label}\n`);
    if (!runStep(gate, false)) {
      process.stderr.write(`\nbuild aborted: ${gate.label} failed.\n`);
      return 1;
    }
  }

  // Kick the independent, slow steps off in the background now; everything
  // else still runs serially in its documented order.
  const backgroundSteps = steps.filter((s) => BACKGROUND_LABELS.has(s.label));
  const foregroundSteps = steps.filter((s) => !BACKGROUND_LABELS.has(s.label));

  // The background steps are only ever AWAITED at the join point. If scoping
  // removed the join step while leaving a background step in, nothing would
  // await it and its failure would be silently discarded — a check that passes
  // because it stopped looking. Today all four background steps AND the join
  // step are built-not-committed, so they leave together and this never fires; it exists
  // because that is a coincidence of the current tags, not a property anyone
  // enforced, and the failure it guards is invisible.
  if (backgroundSteps.length && !foregroundSteps.some((s) => s.script === JOIN_BEFORE_SCRIPT)) {
    process.stderr.write(
      `\nbuild aborted: ${backgroundSteps.length} background step(s) are in scope but the ` +
        `join step (${JOIN_BEFORE_SCRIPT}) is not, so their results would never be awaited. ` +
        'Fix the uncommitted tags in STEPS so the join step is in scope whenever a background step is.\n',
    );
    return 1;
  }
  const backgroundResults = backgroundSteps.map((step) => ({ step, ok: runStepAsync(step, check) }));

  const failed = [];
  for (const step of foregroundSteps) {
    if (step.script === JOIN_BEFORE_SCRIPT) {
      for (const { step: bgStep, ok } of backgroundResults) {
        if (!(await ok)) failed.push(bgStep.label);
      }
    }
    process.stdout.write(`\n▸ ${step.label}\n`);
    if (!runStep(step, check)) failed.push(step.label);
  }

  process.stdout.write('\n');
  if (failed.length) {
    if (check) {
      process.stderr.write(
        `build:check FAILED — stale: ${failed.join(', ')}. Run \`npm run build\` and commit.\n`,
      );
    } else {
      process.stderr.write(`build FAILED — ${failed.join(', ')}.\n`);
    }
    return 1;
  }
  process.stdout.write(check ? 'build:check OK — all artifacts up to date.\n' : 'build OK — all artifacts regenerated.\n');
  return 0;
}

if (require.main === module) main(process.argv.slice(2)).then((code) => process.exit(code));

module.exports = { STEPS, GUARD, PREFLIGHT };
