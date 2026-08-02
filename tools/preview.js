#!/usr/bin/env node
/**
 * Preview tool — fast visual-iteration loop for Lattice decks.
 *
 * Replaces the slow "edit → build → commit → push → reviewer fetches"
 * cycle with "edit → preview → SendUserFile" in Claude Code, and
 * "edit → watch → PDF reloads in viewer" on the desktop.
 *
 * Auto-detects scope from `git diff --name-only`:
 *
 *   L0 (no visual impact)   tests, docs, schema/loader, manifest only
 *   L1 (deck or example)    one component example, or one deck source
 *   L2 (component-scoped)   per-component CSS or transform — affects
 *                           every deck using that component class
 *   L3 (full)               shared CSS (lib/_*.css), themes, anything
 *                           that touches every slide
 *
 * Builds only the affected decks. Diffs only the affected pages via
 * pdftoppm + ImageMagick compare. Output cap: at most 10 files
 * surfaced; excess reported as a summary count.
 *
 * Usage:
 *   npm run preview                      auto-detect from git diff
 *   npm run preview -- <deck>            force-rebuild a specific deck
 *   npm run preview -- --full            override → L3 (rebuild all)
 *   npm run preview -- --json            machine-readable output
 *   npm run preview:watch -- <deck>      chokidar watch (desktop)
 *
 * Output JSON shape (when --json):
 *   {
 *     scope: { level, decks, components, fullDiff },
 *     builds: [ { deck, pdf, took_ms } ],
 *     diffs:  [ { deck, page, pixels, diffPng } ],
 *     send:   [ <file paths to SendUserFile> ],
 *     summary: "<human-readable line>"
 *   }
 *
 * Designed so that an agent (or a Bash caller) can read `send` and
 * stream each file. Human callers see `summary` + interactive prompts.
 *
 * See engineering/workflow.md for the share-the-PDF rule.
 */



const fs = require('node:fs');
const path = require('node:path');
const { execSync, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');

// Per-deck PDF outputs we track. Anything in examples/ following the
// pattern `examples/<name>.md` is a candidate; this list is the closed
// set we'll actually build. Update when a new deck is added.
// Decks under examples/ that npm run preview can rebuild + diff. The
// CI baseline deck (gallery.md → test/integration/baseline-decks/),
// the mermaid integration showcase (mermaid.gallery.md →
// lib/integrations/mermaid/), the design-system slide demo
// (design-system.gallery.md → design/), and the palette-audit theme-
// designer's deck (palette-audit.md → themes/) are intentionally
// NOT here — each lives with its owner, and its integration test
// or documentation reference picks it up directly.
const ALL_DECKS = Object.freeze([
  'gallery-jargon',
]);

// Page-counted baselines — the two canonical top-level galleries CI
// asserts on (per-component galleries self-assert via the formula in
// expectedGallerySlideCount; gallery-jargon is editorial, not asserted).
const CANONICAL_DECKS = Object.freeze(['gallery', 'gallery-mermaid']);

// Pattern detectors. Source-order matters: most-specific first.
const PATTERNS = Object.freeze({
  // No visual impact — skip the entire pipeline.
  noVisualImpact: [
    /^test\//,
    /^docs\//,
    /^engineering\//,
    /^design\//,
    /^package(-lock)?\.json$/,
    /^biome\.json$/,
    /^lefthook\.yml$/,
    /^jsconfig\.json$/,
    /^\.gitignore$/,
    /^\.github\//,
    /^\.vscode\//,
    /^\.scratch\//,
    /^\.nvmrc$/,
    /^\.c8rc\.json$/,
    /^README\.md$/,
    /^CHANGELOG\.md$/,
    /^LICENSE$/,
    /^CLAUDE\.md$/,
    // Build outputs and committed PDFs are downstream artifacts.
    /^examples\/.*\.(pdf|html)$/,
    // Tools are infrastructure unless they're the renderer (covered by fullDiff).
    /^tools\//,
    // Component metadata only affects scaffolder/snippets, not rendering.
    /^lib\/components\/index\.js$/,
    /^lib\/components\/manifest\.schema\.json$/,
    /^lib\/components\/(?:[a-z][a-z0-9-]*\/)?[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\.manifest\.json$/,
    /^lib\/components\/(?:[a-z][a-z0-9-]*\/)?[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\.docs\.md$/,
  ],
  // Full diff triggers — shared CSS, theme, both render paths.
  fullDiff: [
    /^lib\/_(legacy|scaffold|universal|semi-universal|base|root|theme|diagram-overrides)\.css$/,
    /^themes\//,
    /^lattice-emulator\.js$/,
    /^dist\/lattice-runtime\.js$/,
    /^lib\/components\/chart\/_chart-family\/chart-family\.js$/,
    /^lib\/match-section\.js$/,
    /^lib\/slot-label-lift\.js$/,
    /^lib\/split-(panels|slides)\.js$/,
    /^lib\/mermaid-hljs\.js$/,
    /^lib\/resolve-palette\.js$/,
    /^lib\/class-aliases\.js$/,
    /^dist\/lattice\.css$/,
  ],
  // Component-scoped triggers — affect that component's per-component
  // gallery + every top-level deck that uses the component. The
  // (?:[a-z][a-z0-9-]*\/)? prefix tolerates the bucket-nested layout
  // (`lib/components/<bucket>/<name>/...`) without losing match in
  // the flat layout (`lib/components/<name>/...`).
  componentCss: /^lib\/components\/(?:[a-z][a-z0-9-]*\/)?([a-z][a-z0-9-]*)\/\1\.styles\.css$/,
  componentTransform: /^lib\/components\/(?:[a-z][a-z0-9-]*\/)?([a-z][a-z0-9-]*)\/\1\.transform\.js$/,
  // Per-component gallery.md change — rebuild that component's gallery only.
  componentGallery: /^lib\/components\/(?:[a-z][a-z0-9-]*\/)?([a-z][a-z0-9-]*)\/\1\.gallery\.md$/,
  // Deck source — that deck only.
  deckSource: /^examples\/([a-z][a-z0-9-]*)\.md$/,
});

const SCOPE_LEVELS = Object.freeze({
  L0: 'no visual impact',
  L1: 'single deck or example',
  L2: 'component-scoped',
  L3: 'full',
});

function gitChangedFiles() {
  try {
    const staged = execSync('git diff --name-only --cached', { cwd: ROOT, encoding: 'utf8' });
    const unstaged = execSync('git diff --name-only', { cwd: ROOT, encoding: 'utf8' });
    const untracked = execSync('git ls-files --others --exclude-standard', { cwd: ROOT, encoding: 'utf8' });
    const all = new Set();
    for (const block of [staged, unstaged, untracked]) {
      for (const line of block.split('\n')) {
        const t = line.trim();
        if (t) all.add(t);
      }
    }
    return [...all].sort();
  } catch {
    return [];
  }
}

function decksUsingComponent(componentName) {
  const re = new RegExp(`<!--\\s*_class:[^>]*\\b${componentName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`);
  const hits = [];
  for (const deck of ALL_DECKS) {
    const src = path.join(ROOT, 'examples', `${deck}.md`);
    if (!fs.existsSync(src)) continue;
    const text = fs.readFileSync(src, 'utf8');
    if (re.test(text)) hits.push(deck);
  }
  return hits;
}

/**
 * Categorize the change-set and return a scope descriptor.
 * `override` is an optional explicit scope (forced via CLI).
 */
function detectScope(changes, override) {
  if (override === 'full') {
    return { level: 'L3', decks: [...ALL_DECKS], reason: '--full override' };
  }
  if (override?.deck) {
    return { level: 'L1', decks: [override.deck], reason: `explicit deck: ${override.deck}` };
  }

  const visual = changes.filter((f) => !PATTERNS.noVisualImpact.some((p) => p.test(f)));
  if (visual.length === 0) {
    return { level: 'L0', decks: [], reason: 'no visual-impact files changed' };
  }

  if (visual.some((f) => PATTERNS.fullDiff.some((p) => p.test(f)))) {
    return {
      level: 'L3',
      decks: [...ALL_DECKS],
      reason: 'shared CSS / engine / theme changed',
      triggers: visual.filter((f) => PATTERNS.fullDiff.some((p) => p.test(f))),
    };
  }

  const affectedComponents = new Set();
  const affectedDecks = new Set();

  for (const f of visual) {
    let matched = false;
    const cssM = f.match(PATTERNS.componentCss);
    if (cssM) { affectedComponents.add(cssM[1]); matched = true; }
    const jsM = f.match(PATTERNS.componentTransform);
    if (jsM) { affectedComponents.add(jsM[1]); matched = true; }
    const galleryM = f.match(PATTERNS.componentGallery);
    if (galleryM) { affectedComponents.add(galleryM[1]); matched = true; }
    const deckM = f.match(PATTERNS.deckSource);
    if (deckM) { affectedDecks.add(deckM[1]); matched = true; }
    if (!matched) {
      // Unknown lib/ file — be conservative, treat as full.
      return {
        level: 'L3',
        decks: [...ALL_DECKS],
        reason: `unrecognized file (treating as full): ${f}`,
      };
    }
  }

  // Component CSS / transform → rebuild every deck using that component.
  // The per-component gallery is implicit: it's the canonical demo deck
  // for that component, so callers can rebuild <name>.gallery.pdf
  // directly from the affectedComponents set.
  for (const c of affectedComponents) {
    for (const d of decksUsingComponent(c)) affectedDecks.add(d);
  }

  if (affectedComponents.size > 0) {
    return {
      level: 'L2',
      decks: [...affectedDecks].sort(),
      components: [...affectedComponents].sort(),
      reason: `component(s) changed: ${[...affectedComponents].sort().join(', ')}`,
    };
  }

  return {
    level: 'L1',
    decks: [...affectedDecks].sort(),
    reason: `deck source changed: ${[...affectedDecks].sort().join(', ')}`,
  };
}

function buildDeck(deck) {
  const src = path.join(ROOT, 'examples', `${deck}.md`);
  const out = path.join(ROOT, 'examples', `${deck}.pdf`);
  if (!fs.existsSync(src)) {
    return { deck, ok: false, error: `source missing: ${src}` };
  }
  const t0 = Date.now();
  const r = spawnSync(
    process.execPath,
    [EMULATOR, src, out, '-q'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } }
  );
  const took = Date.now() - t0;
  if (r.status !== 0) {
    return { deck, ok: false, pdf: out, took_ms: took, error: r.stderr?.toString() || `exit ${r.status}` };
  }
  return { deck, ok: true, pdf: out, took_ms: took };
}

function _pageCount(pdf) {
  try {
    const r = execSync(`pdfinfo "${pdf}" | awk '/^Pages:/ {print $2}'`, { encoding: 'utf8' });
    return parseInt(r.trim(), 10);
  } catch { return 0; }
}

function diffPages(committedPdf, freshPdf, deck) {
  if (!fs.existsSync(committedPdf) || !fs.existsSync(freshPdf)) {
    return { ok: false, error: 'PDF missing for diff' };
  }
  const tmpDir = `/tmp/preview-${process.pid}-${deck}`;
  fs.mkdirSync(tmpDir, { recursive: true });
  // Render both PDFs to per-page PNGs at 72 dpi (1 px ≈ 1pt)
  spawnSync('pdftoppm', ['-r', '72', committedPdf, `${tmpDir}/old`, '-png'], { stdio: 'ignore' });
  spawnSync('pdftoppm', ['-r', '72', freshPdf, `${tmpDir}/new`, '-png'], { stdio: 'ignore' });
  // pdftoppm pads page numbers based on total count; enumerate from disk
  const oldPngs = fs.readdirSync(tmpDir).filter((f) => f.startsWith('old-') && f.endsWith('.png')).sort();
  const newPngs = fs.readdirSync(tmpDir).filter((f) => f.startsWith('new-') && f.endsWith('.png')).sort();
  const pages = Math.max(oldPngs.length, newPngs.length);
  const diffs = [];
  for (let i = 0; i < pages; i++) {
    const oldP = oldPngs[i] ? path.join(tmpDir, oldPngs[i]) : null;
    const newP = newPngs[i] ? path.join(tmpDir, newPngs[i]) : null;
    if (!oldP || !newP) {
      diffs.push({ page: i + 1, pixels: -1, note: oldP ? 'new page added' : 'page removed' });
      continue;
    }
    const diffPng = path.join(tmpDir, `diff-${String(i + 1).padStart(2, '0')}.png`);
    const r = spawnSync('compare', ['-metric', 'AE', oldP, newP, diffPng], { encoding: 'utf8' });
    // ImageMagick `compare` prints the pixel count to stderr and exits non-zero
    // when any pixels differ; that's the documented behavior.
    const raw = (r.stderr || '').trim();
    const px = /^\d+$/.test(raw) ? parseInt(raw, 10) : 0;
    if (px > 0) {
      diffs.push({ page: i + 1, pixels: px, diffPng });
    }
  }
  return { ok: true, diffs, totalPixels: diffs.reduce((s, d) => s + (d.pixels > 0 ? d.pixels : 0), 0) };
}

function preview({ override } = {}) {
  const changes = gitChangedFiles();
  const scope = detectScope(changes, override);
  const result = {
    scope,
    builds: [],
    diffs: [],
    send: [],
    summary: '',
  };

  if (scope.level === 'L0') {
    result.summary = 'L0 — no visual impact; nothing to rebuild.';
    return result;
  }

  // Build each affected deck, capture pre-rebuild PDF for diff baseline
  for (const deck of scope.decks) {
    const pdf = path.join(ROOT, 'examples', `${deck}.pdf`);
    // Snapshot committed PDF for diff (the on-disk PDF before we rebuild)
    let baseline = null;
    if (fs.existsSync(pdf)) {
      baseline = `/tmp/preview-baseline-${process.pid}-${deck}.pdf`;
      fs.copyFileSync(pdf, baseline);
    }
    const build = buildDeck(deck);
    result.builds.push(build);
    if (!build.ok) continue;
    if (baseline) {
      const diff = diffPages(baseline, build.pdf, deck);
      if (diff.ok) {
        for (const d of diff.diffs) {
          result.diffs.push({ deck, ...d });
        }
      }
    }
    result.send.push(build.pdf);
  }

  // Pick up to 5 worst diff PNGs to surface alongside the PDFs
  const sortedDiffs = result.diffs.filter((d) => d.diffPng).sort((a, b) => b.pixels - a.pixels);
  for (const d of sortedDiffs.slice(0, 5)) {
    result.send.push(d.diffPng);
  }

  // Cap total send list at 10 files
  if (result.send.length > 10) {
    result.send = result.send.slice(0, 10);
  }

  const totalPx = result.diffs.reduce((s, d) => s + Math.max(0, d.pixels), 0);
  const changedPages = result.diffs.filter((d) => d.pixels !== 0).length;
  result.summary = `${scope.level} — ${scope.decks.length} deck${scope.decks.length === 1 ? '' : 's'} rebuilt, ${changedPages} page${changedPages === 1 ? '' : 's'} changed (${totalPx.toLocaleString()} px total).`;
  return result;
}

function printText(result) {
  process.stdout.write(`scope: ${result.scope.level} — ${SCOPE_LEVELS[result.scope.level]}\n`);
  process.stdout.write(`reason: ${result.scope.reason}\n`);
  if (result.scope.decks?.length) {
    process.stdout.write(`decks: ${result.scope.decks.join(', ')}\n`);
  }
  for (const b of result.builds) {
    if (b.ok) {
      process.stdout.write(`  built ${b.deck} (${b.took_ms}ms)\n`);
    } else {
      process.stdout.write(`  FAILED ${b.deck}: ${b.error}\n`);
    }
  }
  const changed = result.diffs.filter((d) => d.pixels !== 0);
  if (changed.length === 0 && result.builds.length > 0) {
    process.stdout.write('diff: 0 pixels across all pages\n');
  } else {
    for (const d of changed) {
      const note = d.note ? ` (${d.note})` : '';
      process.stdout.write(`  ${d.deck} page ${d.page}: ${d.pixels.toLocaleString()} px${note}\n`);
    }
  }
  process.stdout.write(`\nsend (${result.send.length} files):\n`);
  for (const f of result.send) process.stdout.write(`  ${f}\n`);
  process.stdout.write(`\n${result.summary}\n`);
}

function watchMode(deck) {
  if (!deck) {
    process.stderr.write('preview --watch: deck name required (e.g. `npm run preview:watch -- gallery`)\n');
    return 2;
  }
  const src = path.join(ROOT, 'examples', `${deck}.md`);
  if (!fs.existsSync(src)) {
    process.stderr.write(`preview --watch: source missing: ${src}\n`);
    return 2;
  }

  let opened = false;
  let pending = null;

  const build = () => {
    const r = buildDeck(deck);
    if (!r.ok) {
      process.stderr.write(`preview: build failed — ${r.error}\n`);
      return;
    }
    process.stdout.write(`preview: built ${r.deck} (${r.took_ms}ms) → ${r.pdf}\n`);
    if (!opened) {
      const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
      spawnSync(opener, [r.pdf], { stdio: 'ignore', detached: true });
      opened = true;
    }
  };

  const schedule = (filename) => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      process.stdout.write(`preview: change → ${filename}\n`);
      build();
    }, 200);
  };

  // Initial build
  process.stdout.write(`preview --watch: ${deck}\n`);
  build();

  const watchTargets = [
    src,
    path.join(ROOT, 'lib'),
    path.join(ROOT, 'dist', 'lattice.css'),
    path.join(ROOT, 'themes'),
  ];

  for (const target of watchTargets) {
    if (!fs.existsSync(target)) continue;
    // When the watch target is a single file (not a dir), Linux inotify
    // omits the filename from the change event — `filename` is null.
    // Fall back to the target's basename so the event still routes.
    const targetIsFile = fs.statSync(target).isFile();
    try {
      fs.watch(target, { recursive: true }, (_event, filename) => {
        const name = filename || (targetIsFile ? path.basename(target) : null);
        if (!name) return;
        // Ignore build outputs and editor noise
        if (/\.(pdf|html)$/.test(name)) return;
        if (name.includes('node_modules')) return;
        if (name.startsWith('.')) return;
        schedule(name);
      });
    } catch (e) {
      process.stderr.write(`preview --watch: cannot watch ${target} — ${e.message}\n`);
    }
  }

  process.stdout.write('preview: watching for changes (Ctrl-C to stop)\n');
  // Keep the process alive forever. Returning here would let main()'s
  // process.exit() tear the watch down before any event fires. The
  // never-resolving promise pins the event loop until SIGINT/SIGTERM.
  return new Promise(() => {});
}

async function main(argv) {
  const json = argv.includes('--json');
  const full = argv.includes('--full');
  const watch = argv.includes('--watch');
  const deckArg = argv.find((a) => !a.startsWith('--') && /^[a-z][a-z0-9-]*$/.test(a));

  if (watch) return await watchMode(deckArg);

  let override;
  if (full) override = 'full';
  else if (deckArg) override = { deck: deckArg };

  const result = preview({ override, json });
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    printText(result);
  }
  // Non-zero exit if any build failed
  if (result.builds.some((b) => !b.ok)) return 1;
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code ?? 0),
    (err) => { process.stderr.write(`preview: ${err.stack || err}\n`); process.exit(1); }
  );
}

module.exports = {
  ALL_DECKS,
  CANONICAL_DECKS,
  PATTERNS,
  SCOPE_LEVELS,
  detectScope,
  decksUsingComponent,
  preview,
};
