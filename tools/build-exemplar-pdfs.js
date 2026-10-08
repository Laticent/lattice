#!/usr/bin/env node
/**
 * Regenerate the committed PDF for every worked exemplar deck
 * (exemplars/<sector>/<name>.md → sibling <name>.pdf).
 *
 * The 45 exemplars ship a committed PDF each (HARD RULE #9 — external
 * reviewers and a future gallery need raw-URL access). The pre-commit
 * hook (tools/build-staged-pdfs.js) auto-rebuilds the PDF for an
 * exemplar whose *markdown* you edit, so day-to-day the committed PDFs
 * stay fresh for free. This script is the BULK path: when a
 * component / shared-CSS / engine change reflows many decks at once,
 * run it to re-render all 45 (or a subset) and commit the refreshed
 * PDFs — the blessed regenerate path the render gate
 * (test/integration/exemplars/exemplar-render.test.js) points to when
 * it flags structural drift.
 *
 * On-demand, like `npm run bless` — NOT part of `npm run build` /
 * `build:check`. Re-rendering 45 full decks is minutes of work; gating
 * it on every build would thrash. The integration render gate is the
 * CI safety net; this is the human-run fix.
 *
 * Usage:
 *   node tools/build-exemplar-pdfs.js                 # all 45
 *   node tools/build-exemplar-pdfs.js --only seminar  # decks whose stem matches
 *   node tools/build-exemplar-pdfs.js academic/seminar.md corporate/sales-deck.md
 *
 * Chrome: lattice.js auto-detects the puppeteer-cached binary,
 * so no CHROME_PATH wiring is needed here.
 *
 * Exit codes:
 *   0  every targeted deck re-rendered
 *   1  a render failed, or --only / a path matched nothing
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const EMULATOR = path.join(ROOT, 'lattice.js');
const EXEMPLARS_DIR = path.join(ROOT, 'exemplars');

// Every exemplar deck: exemplars/<sector>/<name>.md, sorted.
function discoverExemplars() {
  const out = [];
  for (const sector of fs.readdirSync(EXEMPLARS_DIR)) {
    const sectorDir = path.join(EXEMPLARS_DIR, sector);
    if (!fs.statSync(sectorDir).isDirectory()) continue;
    for (const file of fs.readdirSync(sectorDir)) {
      if (file.endsWith('.md')) out.push(path.join(sectorDir, file));
    }
  }
  return out.sort();
}

function main() {
  const argv = process.argv.slice(2);
  let only = null;
  const explicit = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') { only = argv[++i]; continue; }
    explicit.push(argv[i]);
  }

  let targets = discoverExemplars();

  if (only) {
    targets = targets.filter((p) => path.basename(p, '.md') === only);
    if (targets.length === 0) {
      console.error(`build-exemplar-pdfs: --only ${only} matched no exemplar deck`);
      process.exit(1);
    }
  } else if (explicit.length) {
    // Accept repo-relative paths (with or without the exemplars/ prefix).
    targets = explicit.map((a) => {
      const p = a.startsWith('exemplars/') ? path.join(ROOT, a) : path.join(EXEMPLARS_DIR, a);
      if (!fs.existsSync(p)) {
        console.error(`build-exemplar-pdfs: no such exemplar deck: ${a}`);
        process.exit(1);
      }
      return p;
    });
  }

  console.log(`Rendering ${targets.length} exemplar deck(s)…`);
  for (const src of targets) {
    const out = src.replace(/\.md$/, '.pdf');
    const rel = path.relative(ROOT, src);
    process.stdout.write(`  ${rel} → ${path.basename(out)} … `);
    try {
      execFileSync('node', [EMULATOR, src, out, '-q'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      console.log('ok');
    } catch (e) {
      console.log('FAILED');
      console.error(e.stderr ? e.stderr.toString() : e.message);
      process.exit(1);
    }
  }
  console.log('Done.');
}

if (require.main === module) main();

module.exports = { discoverExemplars };
