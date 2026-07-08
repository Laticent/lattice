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
 *   3. lattice-runtime.js     tools/build-runtime.js
 *   4. lattice-emulator.js    tools/build-emulator.js    (bundled CLI bin)
 *   5. VS Code snippets       tools/build-snippets.js
 *   6. per-component docs      tools/build-component-docs.js
 *   7. canonical doc portal    tools/build-docs-portal.js (components.md/.json)
 *   7b. forms catalog          tools/build-forms.js       (dist/docs/forms.json)
 *   7c. concepts catalog       tools/build-concepts.js    (dist/docs/concepts.json)
 *   8. landing tokens          tools/build-landing-tokens.js  (docs site palette CSS)
 *   9. playground bundle       tools/build-playground.js      (docs site browser engine)
 *  10. theme-core bundle       tools/build-theme-core.js      (docs site Theme Studio core)
 *  11. layout-core bundle      tools/build-layout-core.js     (docs site Layout Studio core)
 *  12. authoring-core bundle   tools/build-authoring-core.js  (docs site Architect/Coach core)
 *  13. capability index        tools/build-capabilities.js (engineering/capabilities.md)
 *  14. dist README            tools/build-dist-readme.js (indexes dist/; runs last)
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

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Each step names its generator script and whether it accepts --check.
// The guard runs first and has no build/check distinction (it only
// reads), so it is always invoked plain.
const GUARD = { label: 'ownership guard', script: 'check-ownership.js' };

// Read-only preflight gates that run after the ownership guard and before any
// artifact is (re)generated — a desynced font set should fail the build, not
// bake a fallback PDF. Each only reads, so it is invoked plain (no --check).
const PREFLIGHT = [
  { label: 'font-embedding parity', script: 'check-fonts.js' },
];

const STEPS = [
  { label: 'lattice.css', script: 'build-css.js' },
  { label: 'lattice-default.css', script: 'build-default-bundle.js' },
  { label: 'lattice-runtime.js', script: 'build-runtime.js' },
  { label: 'lattice-emulator.js', script: 'build-emulator.js' },
  { label: 'VS Code snippets', script: 'build-snippets.js' },
  { label: 'per-component docs', script: 'build-component-docs.js' },
  { label: 'doc portal (components.md/.json)', script: 'build-docs-portal.js' },
  { label: 'forms catalog (dist/docs/forms.json)', script: 'build-forms.js' },
  { label: 'concepts catalog (dist/docs/concepts.json)', script: 'build-concepts.js' },
  { label: 'landing tokens (docs site)', script: 'build-landing-tokens.js' },
  { label: 'spec pages (docs site)', script: 'build-spec-docs.js' },
  { label: 'playground bundle (docs site)', script: 'build-playground.js' },
  { label: 'theme-core bundle (docs site)', script: 'build-theme-core.js' },
  { label: 'layout-core bundle (docs site)', script: 'build-layout-core.js' },
  { label: 'authoring-core bundle (docs site)', script: 'build-authoring-core.js' },
  { label: 'exemplar-core bundle (docs site)', script: 'build-exemplar-core.js' },
  { label: 'standalone-core bundle (docs site)', script: 'build-standalone-core.js' },
  { label: 'a11y-textures bundle (docs site)', script: 'build-a11y-textures.js' },
  { label: 'player-core bundle (docs site)', script: 'build-player-core.js' },
  // Capability index — reads package.json scripts + tools/ headers (source,
  // not built artifacts), so order-independent; grouped with the generators.
  { label: 'capability index (engineering/capabilities.md)', script: 'build-capabilities.js' },
  // Decision-doc index — reads each note's front-matter; order-independent.
  { label: 'decision index (engineering/decisions/README.md)', script: 'build-decisions-index.js' },
  // Last — it indexes the finished dist/ folder, so every other artifact
  // must already be (re)written before it runs.
  { label: 'dist README', script: 'build-dist-readme.js' },
];

function runStep(step, check) {
  const args = [path.join(__dirname, step.script)];
  if (check) args.push('--check');
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  return r.status === 0;
}

function main(argv) {
  const check = argv.includes('--check');
  const mode = check ? 'check' : 'build';
  process.stdout.write(`Lattice ${mode}: ${STEPS.length} artifacts behind the ownership gate.\n\n`);

  // Gate first — a collision fails before anything is (re)generated.
  process.stdout.write(`▸ ${GUARD.label}\n`);
  if (!runStep(GUARD, false)) {
    process.stderr.write('\nbuild aborted: ownership guard failed.\n');
    return 1;
  }

  // Read-only preflight gates (font parity, …) — fail before generating.
  for (const gate of PREFLIGHT) {
    process.stdout.write(`▸ ${gate.label}\n`);
    if (!runStep(gate, false)) {
      process.stderr.write(`\nbuild aborted: ${gate.label} failed.\n`);
      return 1;
    }
  }

  const failed = [];
  for (const step of STEPS) {
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

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { STEPS, GUARD, PREFLIGHT };
