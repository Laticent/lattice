#!/usr/bin/env node
/**
 * Build the distributable emulator CLI bundle.
 *
 *   lattice-emulator.js  →  dist/lattice-emulator.js
 *
 * The repo-root `lattice-emulator.js` is the SOURCE (tests, tools, and
 * `node lattice-emulator.js` run it in place). The committed
 * `dist/lattice-emulator.js` is the published artifact: it is the
 * package `bin`/`main`, so an `npm install` / `npx lattice` consumer runs
 * the bundle, not the loose source. This mirrors the runtime split
 * (lib/runtime/index.js → dist/lattice-runtime.js).
 *
 * Bundling inlines the local graph — lib/core, lib/transformers,
 * lib/components/**, lib/integrations, package.json — into
 * one file so the published bin doesn't depend on the engine source tree
 * being present. node_modules deps stay EXTERNAL (`packages: 'external'`):
 * the CLI shells out to chromium / mmdc and `require()`s katex,
 * highlight.js, function-plot, puppeteer at runtime — those resolve from
 * the consumer's node_modules, exactly as the loose source does.
 *
 * `@workwel/*` IS THE LOCAL GRAPH, so it is inlined too (see WORKSPACE_LIBS
 * below). Those four packages are npm-WORKSPACE members: in this repo they
 * resolve through a node_modules symlink into docs/src/lib/<name>, and in an
 * `npm install @workwel/lattice` they resolve nowhere — they are neither a
 * dependency nor in the published `files`. A bare `require('@workwel/cadenza')`
 * surviving into the bundle is therefore MODULE_NOT_FOUND for every installed
 * user, which is what `--strip-notes`, read-along, chart narration and `--lens`
 * would each have hit. `packages: 'external'` is the right default for a
 * third-party dep the consumer installs; it is the wrong one for our own source
 * under another name.
 *
 * Path resolution: the source uses a package-root walk (PKG_ROOT) rather
 * than __dirname for themes/, dist/lattice.css, and node_modules/.bin, so
 * the same code locates its assets whether it runs from the repo root or
 * from dist/. See lattice-emulator.js.
 *
 * Flags:
 *   --check    Build to a temp file beside the output and byte-diff it
 *              against the committed dist/lattice-emulator.js. Exits 1 on
 *              drift. Used by the bundle-freshness pre-commit hook + CI.
 *   --silent   Suppress the success log line (implied by --check).
 *
 * Target: node22 (package.json engines `>=22`).
 */

const esbuild = require('esbuild');
const path    = require('path');
const fs      = require('fs');
const { execSync } = require('child_process');

const ROOT     = path.resolve(__dirname, '..');
const ENTRY    = path.join(ROOT, 'lattice-emulator.js');
const LIB_DIR  = path.join(ROOT, 'docs', 'src', 'lib');
const OUT_FILE = path.join(ROOT, 'dist', 'lattice-emulator.js');
const MIN_FILE = path.join(ROOT, 'dist', 'lattice-emulator.min.js');

/**
 * Resolve `@workwel/<name>` to its TypeScript SOURCE barrel so esbuild inlines it
 * instead of leaving a `require()` the installed CLI cannot satisfy. An onResolve
 * callback runs ahead of esbuild's own resolver, which is where `packages: 'external'`
 * lives — so this is the one hook that can opt a package back IN.
 *
 * SOURCE, not the sibling `dist/index.cjs`, for one reason: build order. Each library's
 * dist is generated (tools/build-lente-lib.js et al), gitignored, and — in tools/build.js —
 * produced in the BACKGROUND, joined only before build-read-along-core.js, long after this
 * step runs. Bundling it would make this artifact a function of one produced LATER in the
 * same build, so `--check` would report drift on a cold tree. (Nothing under dist/ is
 * committed — an earlier draft of this comment said "a committed artifact", which is simply
 * wrong; the ordering is the reason, not the tracking.) The `.ts` files ARE committed and
 * esbuild reads TypeScript natively, so pointing at them removes the ordering question
 * entirely.
 *
 * The two builds are equivalent in the way that matters and NOT identical in every way, and
 * the difference is worth stating rather than glossing: each dist is `esbuild --bundle` of
 * this same zero-dependency barrel, so the module graph is the same — but the lib builds
 * target node18 while this one targets node22, and the `.min.js` twin adds minification. So
 * "equivalent by construction" holds for what the code DOES, not for the bytes. Measured:
 * `makeCursor.toString()` — the one place a workspace function's SOURCE is embedded in an
 * exported artifact — is byte-identical between cadenza's dist and a fresh build of its
 * barrel, and the exported `.html` is unchanged with this plugin on or off.
 */
const inlineWorkspacePackages = {
  name: 'workwel-workspace-inline',
  setup(build) {
    build.onResolve({ filter: /^@workwel\/[a-z]+$/ }, (args) => {
      const name = args.path.slice('@workwel/'.length);
      const entry = path.join(LIB_DIR, name, 'index.ts');
      // Anything not a workspace member falls through to the normal resolver (and
      // stays external) rather than resolving to a path that does not exist.
      return fs.existsSync(entry) ? { path: entry } : null;
    });
  },
};

const argv   = process.argv.slice(2);
const check  = argv.includes('--check');
const silent = argv.includes('--silent') || check;

const BUILD_OPTIONS = {
  entryPoints: [ENTRY],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: ['node22'],
  // Keep every bare import external — the CLI's deps (katex, highlight.js,
  // function-plot, puppeteer) and node builtins resolve at runtime from the
  // install's node_modules, the same way the loose source resolves them.
  // Only the local relative graph (./lib, ./package.json) is
  // inlined.
  packages: 'external',
  plugins: [inlineWorkspacePackages],
  // Inlined source map so a single committed file carries debugging info
  // without a sidecar .map artifact. esbuild is deterministic, so identical
  // sources rebuild byte-for-byte — the --check diff relies on that.
  sourcemap: 'inline',
  minify: false,
  legalComments: 'inline',
  // The CLI hashbang lives at the top of the source entry; esbuild preserves
  // it as the first line. This banner lands just beneath it.
  banner: {
    js: `/* Auto-generated by tools/build-emulator.js — DO NOT EDIT.\n   Source: lattice-emulator.js (+ inlined lib/**).\n   Rebuild: npm run emulator:build\n   SPDX-License-Identifier: AGPL-3.0-only\n   Copyright (c) 2025-2026 SlideWright\n*/`,
  },
};

// Minified twin: same CJS bundle, compressed, no source map. The shebang
// is preserved by esbuild so it stays directly runnable; the published
// bin/main remains the unminified file (the debug surface) — the .min.js
// is the lean install/CDN variant.
const MIN_OPTIONS = {
  ...BUILD_OPTIONS,
  sourcemap: false,
  minify: true,
  legalComments: 'none',
  banner: { js: `/*! lattice-emulator.min.js — generated by tools/build-emulator.js, do not edit. SPDX-License-Identifier: AGPL-3.0-only. (c) 2025-2026 SlideWright */` },
};

async function buildOnce(outFile, minFile) {
  await esbuild.build({ ...BUILD_OPTIONS, outfile: outFile });
  await esbuild.build({ ...MIN_OPTIONS, outfile: minFile });
  // Both carry the CLI shebang and must be executable.
  fs.chmodSync(outFile, 0o755);
  fs.chmodSync(minFile, 0o755);
}

async function main() {
  if (check) {
    // esbuild encodes inline-sourcemap source paths RELATIVE TO the outfile,
    // so a tmp build in /tmp would diff against the committed file purely on
    // path encoding even when the JS is identical. Writing the tmp beside the
    // real output keeps that encoding stable so the diff reports only real
    // drift. (Same caveat as tools/build-runtime.js.)
    const tmp = `${OUT_FILE}.check.tmp`;
    const minTmp = `${MIN_FILE}.check.tmp`;
    let exitCode = 0;
    try {
      await buildOnce(tmp, minTmp);
      for (const [real, fresh] of [[OUT_FILE, tmp], [MIN_FILE, minTmp]]) {
        try {
          execSync(`diff -q "${real}" "${fresh}"`, { stdio: 'pipe' });
        } catch (_e) {
          console.error(`✗ dist/${path.basename(real)} is stale relative to lattice-emulator.js`);
          console.error('  Run: npm run emulator:build');
          console.error('  Bypass (last resort): git commit --no-verify');
          exitCode = 1;
        }
      }
    } finally {
      for (const f of [tmp, minTmp]) { try { fs.unlinkSync(f); } catch (_e) { /* best effort */ } }
    }
    process.exit(exitCode);
  }

  await buildOnce(OUT_FILE, MIN_FILE);
  if (!silent) {
    const bytes = fs.statSync(OUT_FILE).size;
    const minBytes = fs.statSync(MIN_FILE).size;
    console.log(
      `[build-emulator] ${path.relative(ROOT, OUT_FILE)} (${(bytes / 1024).toFixed(1)} KB) + ` +
        `${path.relative(ROOT, MIN_FILE)} (${(minBytes / 1024).toFixed(1)} KB)`,
    );
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
