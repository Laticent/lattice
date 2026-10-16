#!/usr/bin/env node
/**
 * Build the on-demand highlight.js grammars for the browser preview.
 *
 *   node_modules/highlight.js/lib/languages/<name>.js   (every grammar but `bash`)
 *     →  docs/public/playground/hljs/<name>.js          (one small IIFE each)
 *     →  docs/public/playground/hljs/index.json         (names, aliases, embeds)
 *
 * WHY THIS EXISTS. The preview bundle carries highlight.js CORE and no grammars:
 * the code plugin's browser loader (lib/plugins/code/shared/load-grammar.browser.js)
 * loads nothing, so a deck pays for exactly the languages its fences name, which is
 * what the CLI does too (engineering/decisions/2026-10-15-code-plugin.md §4.3). Before
 * that the bundle carried highlight.js's 36-language `common` build, 53 KB gzipped,
 * whether a deck had code or not, and fetched only the other 156.
 *
 * `bash` is the one exception: Lattice's shell grammar (`sh`, `zsh` too) is built into
 * the bundle by the highlighter, so it is listed under `bundled` and never fetched.
 *
 * WHY PER-LANGUAGE FILES rather than one lazily-fetched chunk. Both keep first paint
 * free; they differ entirely in what a deck that uses ONE language then pays: median
 * 1.9 KB per language against hundreds for a chunk. The cost is ~190 build outputs,
 * and they are build outputs in the literal sense — docs/public/playground/ is
 * gitignored (2026-08-17-generated-bundles-uncommitted.md).
 *
 * WHAT A LANGUAGE EMBEDS. `requires` (from the code plugin's language table,
 * lib/plugins/code/shared/languages.generated.js) lists the grammars one hands part of
 * a block to — HTML's `<script>` to JavaScript — so the preview fetches them with it and
 * colors what the CLI colors. `['*']` (http, whose body auto-detects among every
 * language) means all of them.
 *
 * THE FILE SHAPE is a classic-script IIFE, not an ES module, because the page loads
 * the engine as a classic `<script>` (docs/src/lib/playground-engine.ts) and these have
 * to register into the same highlight.js singleton it holds. Each file pushes
 * `[name, definitionFactory]` onto `window.__latticeHljs`, a plain queue, so load order
 * does not matter; `lib/playground` drains it and registers.
 *
 * ALIASES ARE RESOLVED AT BUILD TIME, from the same language table the code plugin
 * reads in Node, so a ```ps1 fence resolves to powershell.js in one lookup and the two
 * surfaces agree on every spelling.
 *
 * Flags:
 *   --check    Rebuild to a buffer and compare against what is on disk; exits 1
 *              on drift (the freshness gate `build:check` runs).
 *   --silent   Suppress the success log line.
 */
const esbuild = require('esbuild');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const HLJS_LIB = path.join(ROOT, 'node_modules', 'highlight.js', 'lib');
const LANG_DIR = path.join(HLJS_LIB, 'languages');
const OUT_DIR = path.join(ROOT, 'docs', 'public', 'playground', 'hljs');
const MANIFEST = path.join(OUT_DIR, 'index.json');

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const silent = argv.includes('--silent') || check;

const { LANGUAGES, ALIASES } = require('../lib/plugins/code/shared/languages.generated.js');

/** The grammar the bundle carries itself (Lattice's shell grammar), never fetched. */
const BUNDLED = Object.freeze(['bash']);

/** The languages to emit: every grammar in the code plugin's table but the bundled one. */
function fetchableLanguages() {
  return Object.keys(LANGUAGES).filter((name) => !BUNDLED.includes(name)).sort();
}

/** Every alias of `name` (not the name itself), sorted. */
function aliasesOf(name) {
  return Object.keys(ALIASES).filter((a) => ALIASES[a] === name && a !== name).sort();
}

/** The IIFE source for one language, before bundling. */
function entryFor(name) {
  const mod = JSON.stringify(path.join(LANG_DIR, `${name}.js`));
  return (
    '(function(){var m=require(' +
    mod +
    ');var d=m&&m.default?m.default:m;' +
    '(window.__latticeHljs||(window.__latticeHljs=[])).push([' +
    JSON.stringify(name) +
    ',d]);})();'
  );
}

async function buildAll() {
  const names = fetchableLanguages();
  const files = new Map(); // relative name → text
  const manifest = { languages: {}, aliases: {}, bundled: Object.fromEntries(BUNDLED.map((n) => [n, aliasesOf(n)])) };

  // Sequential rather than a Promise.all over ~190 esbuild calls: each is ~15ms and
  // the flat fan-out oversubscribes esbuild's worker pool on a small runner, which
  // measured SLOWER end to end than the loop.
  for (const name of names) {
    const result = await esbuild.build({
      stdin: { contents: entryFor(name), resolveDir: ROOT, loader: 'js', sourcefile: `${name}.entry.js` },
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: ['chrome109'],
      minify: true,
      legalComments: 'none',
      write: false,
      logLevel: 'silent',
    });
    const text = result.outputFiles[0].text;
    files.set(`${name}.js`, text);
    const requires = LANGUAGES[name].filter((d) => !BUNDLED.includes(d));
    manifest.languages[name] = { file: `${name}.js`, bytes: Buffer.byteLength(text), ...(requires.length ? { requires } : {}) };
    for (const alias of aliasesOf(name)) manifest.aliases[alias] = name;
  }
  files.set('index.json', `${JSON.stringify(manifest, null, 1)}\n`);
  return files;
}

function readCurrent() {
  if (!fs.existsSync(OUT_DIR)) return new Map();
  const out = new Map();
  for (const f of fs.readdirSync(OUT_DIR)) out.set(f, fs.readFileSync(path.join(OUT_DIR, f), 'utf8'));
  return out;
}

async function main() {
  const built = await buildAll();
  if (check) {
    const current = readCurrent();
    const stale =
      current.size !== built.size || [...built].some(([name, text]) => current.get(name) !== text);
    if (stale) {
      console.error('[build-hljs-languages] STALE — run `npm run hljs:build`');
      process.exit(1);
    }
    if (!silent) console.log('[build-hljs-languages] up to date.');
    return;
  }
  // Rewrite the whole directory so a language dropped by an hljs upgrade does not
  // linger as a file the manifest no longer lists.
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let bytes = 0;
  for (const [name, text] of built) {
    fs.writeFileSync(path.join(OUT_DIR, name), text);
    bytes += Buffer.byteLength(text);
  }
  if (!silent) {
    const langs = built.size - 1; // minus index.json
    console.log(
      `[build-hljs-languages] ${langs} grammars → ${path.relative(ROOT, OUT_DIR)}/ (${(bytes / 1024).toFixed(0)} KB, median ${medianKb(built)} KB)`,
    );
  }
}

function medianKb(files) {
  const sizes = [...files]
    .filter(([n]) => n !== 'index.json')
    .map(([, t]) => Buffer.byteLength(t))
    .sort((a, b) => a - b);
  return (sizes[Math.floor(sizes.length / 2)] / 1024).toFixed(1);
}

main().catch((e) => {
  console.error('[build-hljs-languages] failed:', e.message);
  process.exit(1);
});

module.exports = { fetchableLanguages, aliasesOf, MANIFEST };
