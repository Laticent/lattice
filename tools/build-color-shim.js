#!/usr/bin/env node
/**
 * Bundle the old-browser colour shim for inline delivery.
 *
 *   lib/core/color-shim.js (+ parse-root-vars, resolve-token-expr, theme/color)
 *     →  dist/color-shim.min.js   (self-contained IIFE, auto-installs on load)
 *
 * WHY a bundle: the shim runs in the VIEWER's browser and must be a single self-contained,
 * pre-paint `<script>` — but its source is a CJS `require` graph. esbuild resolves the graph and
 * emits one IIFE that calls `installColorShim()` on load, so a surface just inlines this file's text
 * into the document `<head>` (after the palette `<style>`) and the shim installs itself.
 *
 * TARGET is the OLD engine the shim exists for: it must not use syntax those engines can't parse.
 * The floor is the deck's own floor — CSS custom properties (Chrome 49 / Safari 9.1); below that a
 * deck can't render at all, so the shim is moot. esbuild down-compiles newer SYNTAX (`?.`, arrow
 * fns, template literals) to that floor; the source already avoids newer runtime METHODS esbuild
 * can't polyfill (e.g. String.matchAll, Chrome 73).
 *
 * Flags:
 *   --check    Build to a buffer and diff against the committed dist file (freshness gate); exit 1 on drift.
 *   --silent   Suppress the success log line.
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'lib', 'core');
const OUT_FILE = path.join(ROOT, 'dist', 'color-shim.min.js');

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const silent = argv.includes('--silent') || check;

// Auto-install entry: importing the bundle installs the shim (no-op on a modern engine). Wrapped in
// try/catch so that if the shim ever hits a runtime method an OLD engine lacks, it degrades to
// "no worse than not running" (raw light-dark ships, same as no shim) instead of throwing an
// uncaught error out of the pre-paint <head> script — which would leave the whole deck black.
const ENTRY_CONTENTS = `
import { installColorShim } from './color-shim.js';
try { installColorShim(); } catch (e) { /* old-engine method gap — leave native CSS, never black out */ }
`;

const BUILD_OPTIONS = {
  stdin: { contents: ENTRY_CONTENTS, resolveDir: SRC_DIR, loader: 'js', sourcefile: 'color-shim.entry.js' },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  // ES2015 — the deck's custom-property floor (Chrome 49 / Safari 10) supports ES6 syntax natively
  // (const/let/arrow/destructuring/template/for-of/Set); esbuild lowers only NEWER syntax (e.g. `?.`)
  // to it. Targeting below ES2015 would make esbuild refuse (it can't emit ES5).
  target: ['es2015'],
  minify: true,
  legalComments: 'none',
};

async function build() {
  const result = await esbuild.build({ ...BUILD_OPTIONS, write: false });
  return result.outputFiles[0].text;
}

async function main() {
  const out = await build();
  if (check) {
    const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
    if (current !== out) {
      console.error('[build-color-shim] STALE — run `node tools/build-color-shim.js` and commit dist/color-shim.min.js');
      process.exit(1);
    }
    if (!silent) console.log('[build-color-shim] up to date.');
    return;
  }
  fs.writeFileSync(OUT_FILE, out);
  if (!silent) console.log(`[build-color-shim] ${path.relative(ROOT, OUT_FILE)} (${out.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
