/**
 * The Lattice adapter for `tools/style-needs.js`: the two things the generic core is handed.
 *
 *  - `RUNTIME_TOKENS`: classes and attributes that script adds after a document is scanned (the
 *    player prune's own keep-lists, solved once: HARD RULE #15, plus the two the checker found that
 *    no list named: the code-copy `data-copied` flag and the fluid view switch).
 *  - `buildLatticeIndex`: the index over `dist/styles/` (unminified: the selectors are the same as in
 *    `dist/styles-min/`, and the minified copy has the same ids in the same order), in the shape the
 *    docs Playground's loader fetches (`docs/scripts/sync-playground-assets.mjs` stages it).
 *
 * Shared by `tools/style-needs-audit.mjs` and the docs sync, so the audited index and the shipped
 * index are one function's output.
 */
const fs = require('node:fs');
const path = require('node:path');
const { buildIndex } = require('./style-needs.js');
const { PLAYER_PRUNE_SAFELIST, GUIDE_PRUNE_SAFELIST } = require('../lib/export/player-prune.js');

const ROOT = path.resolve(__dirname, '..');

function runtimeTokens() {
  const runtime = { c: [], a: ['data-copied', 'data-lattice-view'] };
  for (const sel of [...PLAYER_PRUNE_SAFELIST, ...GUIDE_PRUNE_SAFELIST]) {
    const m = sel.match(/^\.([\w-]+)$/) || sel.match(/^\[([\w-]+)\]$/);
    if (!m) throw new Error(`style-needs-lattice: cannot read runtime token ${sel}`);
    (sel.startsWith('.') ? runtime.c : runtime.a).push(m[1]);
  }
  runtime.c.push('lat-guide-dim');
  // Classes a third-party library builds in the browser, after any scan of the HTML could see them: function-plot's
  // SVG (found on plugin-system-phase-b.md in WebKit: `.functionplot .function-plot` rules were dropped).
  // Mermaid's internals are deliberately NOT listed: generic names (`node`, `edge`) pulled the whole sheet in, and the
  // gate is clean on every Mermaid deck without them.
  runtime.c.push('function-plot', 'domain', 'tick', 'line-0', 'line-1', 'line-2', 'line-3', 'line-4', 'line-5');
  return runtime;
}
const RUNTIME_TOKENS = runtimeTokens();

/**
 * Every class and attribute the shipped runtime and the Playground host WRITE into a slide after it is
 * scanned, found in their source, kept only when a module's selectors key on the name (so the list stays
 * bounded by what could matter). A hand-kept list missed `.overflow`, which the runtime toggles on a slide
 * that overflows and which draws the author's red outline (found by the inversion review, 2026-10-19), and
 * listed ~20 more that happened to sit in always-loaded modules. Reading the source makes the list a
 * property of the code that writes the tokens. It is a regex over `classList.add/toggle`, `setAttribute`
 * and `dataset.x =` calls, so a token built at run time from a variable is invisible to it: the live-frame
 * comparison (docs/e2e/playground-style-loader.spec.ts) is the check on that.
 */
function derivedRuntimeTokens(index, root = ROOT) {
  const vocab = { c: new Set(), a: new Set() };
  for (const m of index) {
    for (const alt of m.alts) {
      for (const x of alt[0]) vocab.c.add(x);
      for (const x of alt[1]) vocab.a.add(x);
    }
  }
  const files = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) {
        if (f.name !== 'node_modules' && f.name !== 'dist') walk(p);
      } else if (/\.(m?js|ts|tsx)$/.test(f.name) && !/\.(test|generated)\./.test(f.name)) files.push(p);
    }
  };
  for (const d of ['lib/runtime', 'docs/src/playground', 'docs/src/components/playground', 'docs/src/lib/anima']) if (fs.existsSync(path.join(root, d))) walk(path.join(root, d));
  const c = new Set();
  const a = new Set();
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/classList\.(?:add|toggle|replace)\(\s*['"]([\w-]+)['"]/g)) c.add(m[1].toLowerCase());
    for (const m of text.matchAll(/(?:setAttribute|toggleAttribute)\(\s*['"]([\w-]+)['"]/g)) a.add(m[1].toLowerCase());
    for (const m of text.matchAll(/\.dataset\.(\w+)\s*=/g)) a.add(`data-${m[1].replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`);
  }
  // The host's own transforms of the HTML between the engine and the frame write ATTRIBUTES through string
  // rewrites and template literals, which the call patterns above cannot see: the rough-ink layer
  // (`svg[data-lattice-rough-ink]`) and the blocked-web-image placeholder (`data-lattice-web-src`). Only
  // `data-lattice-*` names are read from those files, because a broader read (every word) made the average
  // deck "need" 720 KB of the 936 KB sheet and gave the loader nothing to save. The CLASSES the structural split
  // adds (`lat-split-cover`, ...) are not listed at all: the loader scans the HTML after the split, so they are
  // in the document it reads.
  const coreDir = path.join(root, 'lib/core');
  if (fs.existsSync(coreDir)) {
    for (const f of fs.readdirSync(coreDir)) {
      if (!/(split|rough-ink|remote-ref|surface-registers)[\w.-]*\.(m?js)$/.test(f) || /\.test\./.test(f)) continue;
      for (const m of fs.readFileSync(path.join(coreDir, f), 'utf8').matchAll(/data-lattice-[a-z0-9]+(?:-[a-z0-9]+)*/g)) a.add(m[0]);
    }
  }
  // The DOM adapters the runtime applies (`applyToDom`) build markup from HTML strings, not from classList calls:
  // the progress rail (`<div class="tile-progress">`), the masthead bay, the code-copy button, the overflow tab.
  // The structural split can rebuild a slide without the rails the engine put in it, and the runtime puts them
  // back, so a scan of the HTML never sees them (found on dark-canvas-ownership.md in WebKit: the progress rail
  // lost its rules). Read the `class="..."` literals of the lib/core and lib/forms files the runtime requires.
  const rtFile = path.join(root, 'lib/runtime/index.js');
  if (fs.existsSync(rtFile)) {
    const rtDir = path.dirname(rtFile);
    for (const m of fs.readFileSync(rtFile, 'utf8').matchAll(/require\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g)) {
      const base = path.resolve(rtDir, m[1]);
      const file = [base, `${base}.js`, `${base}.mjs`].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
      const rel = file ? path.relative(root, file) : '';
      if (!file || !/^lib\/(core|forms)\//.test(rel) || /\.test\./.test(rel)) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const q of text.matchAll(/class=\\?["']([^"'<>$]*?)\\?["']/g)) for (const w of q[1].split(/\s+/)) if (w) c.add(w.toLowerCase());
      for (const q of text.matchAll(/className\s*=\s*['"]([^'"]+)['"]/g)) for (const w of q[1].split(/\s+/)) if (w) c.add(w.toLowerCase());
    }
  }
  return { c: [...c].filter((x) => vocab.c.has(x)).sort(), a: [...a].filter((x) => vocab.a.has(x)).sort() };
}

/** The static player-prune list plus what the runtime and host source write, for one index. */
function runtimeTokensFor(index, root = ROOT) {
  const derived = derivedRuntimeTokens(index, root);
  return { c: [...new Set([...RUNTIME_TOKENS.c, ...derived.c])].sort(), a: [...new Set([...RUNTIME_TOKENS.a, ...derived.a])].sort() };
}

/** `dist/styles/manifest.json` with each module's text read in. */
function readModules(root = ROOT) {
  const dir = path.join(root, 'dist/styles');
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('dist/styles/ is missing; run `npm run css:build` first');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.modules.map((m) => ({ ...m, text: fs.readFileSync(path.join(dir, m.file), 'utf8') }));
}

/**
 * The index a browser loader fetches. `floor` lists the module indexes (besides the always-needed ones) to
 * load at start. `modules[i]` and `index[i]` describe the same module, in
 * `lattice.css` order; `file` is a name under `dist/styles-min/`. `verified` adds the selector text
 * behind each alternative so the loader can ask the document (about 2.4x the bytes, fewer modules).
 */
function buildLatticeIndex({ verified = true, root = ROOT } = {}) {
  const modules = readModules(root);
  const index = buildIndex(modules, { selectors: verified });
  const min = JSON.parse(fs.readFileSync(path.join(root, 'dist/styles-min/manifest.json'), 'utf8'));
  if (min.modules.length !== modules.length || min.modules.some((m, i) => m.id !== modules[i].id)) {
    throw new Error('style-needs-lattice: dist/styles and dist/styles-min list different modules; run `npm run css:build`');
  }
  // The modules most decks need, loaded with the always-needed ones at start (tools/style-needs-common.js).
  // An optimization only: an id this build does not have is skipped, and a missing file means no floor.
  let common = [];
  try {
    common = JSON.parse(fs.readFileSync(path.join(__dirname, 'style-needs-common.json'), 'utf8')).ids;
  } catch {
    /* no committed list: the floor is the always-needed modules alone */
  }
  const floor = min.modules.flatMap((m, i) => (common.includes(m.id) ? [i] : []));
  return {
    version: 1,
    verified,
    floor,
    runtime: runtimeTokensFor(index, root),
    modules: min.modules.map((m) => ({ id: m.id, file: m.file, bytes: m.bytes })),
    index,
  };
}

module.exports = { RUNTIME_TOKENS, runtimeTokensFor, derivedRuntimeTokens, readModules, buildLatticeIndex };
