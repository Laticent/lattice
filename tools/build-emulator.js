#!/usr/bin/env node
/**
 * Build the distributable emulator CLI bundle.
 *
 *   lattice-emulator.js       →  dist/lattice-emulator.js (+ -min.js)
 *   lib/packages/cli.js       →  dist/lattice-packages.js  (`lattice packages`, a child process)
 *   lib/export/video-cli.mjs  →  dist/lattice-video.mjs    (`lattice video`, a child process)
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
const OUT_FILE = path.join(ROOT, 'dist', 'lattice-emulator.js');
const MIN_FILE = path.join(ROOT, 'dist', 'lattice-emulator-min.js');

const argv   = process.argv.slice(2);
const check  = argv.includes('--check');
const silent = argv.includes('--silent') || check;

// `packages: 'external'`, except the workspace libraries in INLINE_PACKAGES. Every workspace
// library the CLI's graph reaches belongs here: none is published or in `dependencies`, so one
// left external makes the installed `lattice` throw `Cannot find module` before it renders
// (Segno, LTT and Cadenza did, from #2513 until #2577's follow-up). The pin is
// test/unit/tools/shipped-bundle-externals.test.js, which fails on any bare import in a shipped
// bundle that is neither a dependency nor a Node builtin.
const INLINE_PACKAGES = [
  '@laticent/trama',
  '@laticent/calco',
  '@laticent/segno',
  '@laticent/ltt',
  '@laticent/cadenza',
];

function inlineWorkspaceLibs() {
  return {
    name: 'inline-workspace-libs',
    setup(build) {
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        const bare = args.path;
        // A Windows absolute path (`C:\…`, the entry point itself) starts with neither `.` nor
        // `/`, so the filter took it for a package and marked the entry external (#2459).
        if (args.kind === 'entry-point' || path.isAbsolute(bare)) return undefined;
        if (INLINE_PACKAGES.some((p) => bare === p || bare.startsWith(`${p}/`))) return undefined;
        return { path: bare, external: true };
      });
    },
  };
}

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
  // inlined, plus the workspace libraries below.
  // One exception: the workspace libraries the export path draws with
  // (`@laticent/trama`, the graph-chart kernel and pipeline) are INLINED. They
  // resolve in the repo only through the workspace symlink and are not in
  // `dependencies`, so leaving them external made an install without the
  // symlink throw inside the flowchart script builder, which the CLI swallows:
  // every flowchart exported as its fallback tiles, silently.
  plugins: [inlineWorkspaceLibs()],
  // Inlined source map so a single committed file carries debugging info
  // without a sidecar .map artifact. esbuild is deterministic, so identical
  // sources rebuild byte-for-byte — the --check diff relies on that.
  sourcemap: 'inline',
  minify: false,
  legalComments: 'inline',
  // The CLI hashbang lives at the top of the source entry; esbuild preserves
  // it as the first line. This banner lands just beneath it.
  banner: {
    js: `/* Auto-generated by tools/build-emulator.js — DO NOT EDIT.\n   Source: lattice-emulator.js (+ inlined lib/**).\n   Rebuild: npm run emulator:build\n   SPDX-License-Identifier: AGPL-3.0-only\n   Copyright (c) 2025-2026 Laticent\n*/`,
  },
};

// Minified twin: same CJS bundle, compressed, no source map. The shebang
// is preserved by esbuild so it stays directly runnable; the published
// bin/main remains the unminified file (the debug surface) — the -min.js
// is the lean install/CDN variant.
const MIN_OPTIONS = {
  ...BUILD_OPTIONS,
  sourcemap: false,
  minify: true,
  legalComments: 'none',
  banner: { js: `/*! lattice-emulator-min.js — generated by tools/build-emulator.js, do not edit. SPDX-License-Identifier: AGPL-3.0-only. (c) 2025-2026 Laticent */` },
};

// The subcommands the bin runs as CHILD processes (`lattice packages`, `lattice video`; see the
// dispatch at the top of lattice-emulator.js). Bundled for the same reason as the bin: the raw lib/
// entries import `@laticent/segno` and `@laticent/ltt`, which an install cannot resolve. No source
// map and no -min twin: nothing imports them, and the bin is the debug surface. The video CLI is
// ESM (it reads `import.meta.url`), so its bundle gets a real `require` for the CJS it inlines.
const SUBCOMMAND_BUNDLES = [
  { entry: 'lib/packages/cli.js', out: 'lattice-packages.js', format: 'cjs' },
  { entry: 'lib/export/video-cli.mjs', out: 'lattice-video.mjs', format: 'esm' },
];

function subcommandOptions({ entry, format }) {
  const banner = `/* Auto-generated by tools/build-emulator.js — DO NOT EDIT. Source: ${entry}. SPDX-License-Identifier: AGPL-3.0-only. (c) 2025-2026 Laticent */`;
  return {
    ...BUILD_OPTIONS,
    entryPoints: [path.join(ROOT, entry)],
    format,
    sourcemap: false,
    banner: {
      js: format === 'esm' ? `${banner}\nimport { createRequire as __latticeCreateRequire } from 'node:module';\nconst require = __latticeCreateRequire(import.meta.url);` : banner,
    },
  };
}

async function buildOnce(outFile, minFile, outDir = path.dirname(OUT_FILE), suffix = '') {
  await esbuild.build({ ...BUILD_OPTIONS, outfile: outFile });
  await esbuild.build({ ...MIN_OPTIONS, outfile: minFile });
  for (const b of SUBCOMMAND_BUNDLES) {
    await esbuild.build({ ...subcommandOptions(b), outfile: path.join(outDir, b.out + suffix) });
  }
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
    const subPairs = SUBCOMMAND_BUNDLES.map((b) => {
      const real = path.join(path.dirname(OUT_FILE), b.out);
      return [real, `${real}.check.tmp`];
    });
    let exitCode = 0;
    try {
      await buildOnce(tmp, minTmp, path.dirname(OUT_FILE), '.check.tmp');
      for (const [real, fresh] of [[OUT_FILE, tmp], [MIN_FILE, minTmp], ...subPairs]) {
        try {
          execSync(`diff -q "${real}" "${fresh}"`, { stdio: 'pipe' });
        } catch (_e) {
          console.error(`✗ dist/${path.basename(real)} is stale relative to its source`);
          console.error('  Run: npm run emulator:build');
          console.error('  Bypass (last resort): git commit --no-verify');
          exitCode = 1;
        }
      }
    } finally {
      for (const f of [tmp, minTmp, ...subPairs.map(([, fresh]) => fresh)]) { try { fs.unlinkSync(f); } catch (_e) { /* best effort */ } }
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
