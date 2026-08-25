#!/usr/bin/env node
/**
 * Build the on-demand highlight.js grammars for the browser preview.
 *
 *   node_modules/highlight.js/lib/languages/<name>.js   (the 156 NOT in `common`)
 *     →  docs/public/playground/hljs/<name>.js          (one small IIFE each)
 *     →  docs/public/playground/hljs/index.json         (name + alias manifest)
 *
 * WHY THIS EXISTS. The preview bundle ships highlight.js's 36-language `common`
 * build; the CLI and marp-core both ship all 192. So a `powershell` fence measured
 * 11 highlight spans in a lattice-emulator export and 0 in the Playground — same
 * deck, same theme, silently different. The fix has to close that gap WITHOUT
 * putting the full build in front of first paint: measured, `common` is 53 KB
 * gzipped and the full build is 312 KB, which nearly doubles the whole Playground
 * bundle (327 KB → 585 KB gzipped).
 *
 * WHY PER-LANGUAGE FILES rather than one lazily-fetched "extras" chunk. Both keep
 * first paint free; they differ entirely in what a deck that uses ONE exotic fence
 * then pays. Measured over all 156, gzipped:
 *
 *     one extras chunk  →  316 KB, every time, for a single ```dockerfile
 *     per language      →  median 1.9 KB, biggest 156 KB (`1c`); dockerfile is 614 B
 *
 * A 300× difference on the common case is not a close call. The cost is 156 build
 * outputs, and they are build outputs in the literal sense — docs/public/playground/
 * is gitignored (2026-08-17-generated-bundles-uncommitted.md), so none of this is
 * committed and an hljs bump regenerates the lot with no diff to review.
 *
 * THE FILE SHAPE is a classic-script IIFE, not an ES module, because the page
 * loads the engine as a classic `<script>` (docs/src/lib/playground-engine.ts) and
 * these have to register into the same highlight.js singleton it holds. Each file
 * pushes `[name, definitionFactory]` onto `window.__latticeHljs`, a plain queue —
 * so load order does not matter, a file that arrives before the engine is not
 * lost, and the consumer drains it. `lib/playground` owns the draining and the
 * `registerLanguage` call; this script owns only the packaging.
 *
 * ALIASES ARE RESOLVED AT BUILD TIME. A grammar declares its own aliases inside
 * the definition (`bash` → `sh`, `zsh`), which the browser cannot know before it
 * has fetched the file — the exact chicken-and-egg the manifest removes. Each
 * definition is invoked once here against a stub `hljs` façade to read its
 * `aliases`, and index.json maps every alias to its file. So a ```ps1 fence
 * resolves to powershell.js in one lookup with nothing speculative fetched.
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

/**
 * The languages to emit: every grammar file that `common` does NOT already carry.
 *
 * The directory ships each grammar twice — `x.js` and `x.js.js` — so the filter is
 * anchored rather than a bare `.endsWith('.js')`, which would double the output and
 * emit 156 files named `<lang>.js.js` that nothing ever requests.
 */
function extraLanguages() {
  const common = require(path.join(HLJS_LIB, 'common.js')).default;
  const inCommon = new Set(common.listLanguages());
  return fs
    .readdirSync(LANG_DIR)
    .filter((f) => /^[a-z0-9_+#-]+\.js$/i.test(f))
    .map((f) => f.slice(0, -3))
    .filter((name) => !inCommon.has(name))
    .sort();
}

/**
 * Read a grammar's declared aliases without a real highlight.js instance.
 *
 * A language definition is a factory taking `hljs` and returning `{ name, aliases,
 * contains, … }`. Every definition destructures helpers off that argument during
 * the call, so the façade answers with inert stand-ins rather than throwing; only
 * the returned object's `aliases` is read, and none of the stubs is ever run.
 */
function aliasesOf(name) {
  const factory = require(path.join(LANG_DIR, `${name}.js`));
  const def = factory.default || factory;
  if (typeof def !== 'function') return [];
  const noop = () => ({});
  const facade = new Proxy(
    {
      // The handful of value-shaped members definitions read directly. Everything
      // else resolves through the `get` trap to a callable that also answers as an
      // object, which covers both `hljs.COMMENT(…)` and `hljs.QUOTE_STRING_MODE`.
      IDENT_RE: '[a-zA-Z]\\w*',
      UNDERSCORE_IDENT_RE: '[a-zA-Z_]\\w*',
      NUMBER_RE: '\\b\\d+(\\.\\d+)?',
      C_NUMBER_RE: '(-?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)',
      BINARY_NUMBER_RE: '\\b(0b[01]+)',
      RE_STARTERS_RE: '!|!=|!==|%|%=|&|&&|&=',
      MATCH_NOTHING_RE: '\\b\\B',
      SHEBANG: noop,
      COMMENT: noop,
      inherit: (...xs) => Object.assign({}, ...xs),
      regex: new Proxy({}, { get: () => (...a) => a.filter((x) => typeof x === 'string').join('') }),
    },
    { get: (t, k) => (k in t ? t[k] : noop) },
  );
  try {
    const built = def(facade);
    return Array.isArray(built?.aliases) ? built.aliases.filter((a) => typeof a === 'string') : [];
  } catch {
    // A grammar whose factory needs more than the façade offers still ships — it
    // just resolves by its canonical name only. Silent by design: an alias is a
    // convenience, and failing the whole build over one would be worse.
    return [];
  }
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
  const names = extraLanguages();
  const files = new Map(); // relative name → text
  const manifest = { languages: {}, aliases: {} };

  // Sequential rather than a Promise.all over 156 esbuild calls: each is ~15ms and
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
    manifest.languages[name] = { file: `${name}.js`, bytes: Buffer.byteLength(text) };
    for (const alias of aliasesOf(name)) {
      // First writer wins: highlight.js resolves a duplicated alias to whichever
      // language registered first, and `names` is sorted, so this is stable across
      // machines rather than dependent on readdir order.
      if (!(alias in manifest.aliases) && !(alias in manifest.languages)) manifest.aliases[alias] = name;
    }
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

module.exports = { extraLanguages, aliasesOf, MANIFEST };
