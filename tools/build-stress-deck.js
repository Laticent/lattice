#!/usr/bin/env node
/**
 * build-stress-deck — assemble one bucket's CEILING cases into a single deck.
 *
 * Every component manifest carries a `stressDoc`: a curated worst case at the
 * documented ceiling — the pie at eleven slices, the kanban at six lanes, the
 * scatter with four points inside four units of each other. They are written to
 * be hard, and they are the corpus a design decision should be tested against,
 * because a language that only holds on the gallery's tidy three-to-five
 * category samples has not been tested where it breaks.
 *
 * Today those samples are rendered one per docs page and never assembled, so
 * nothing measures the bucket AT ITS CEILING in one pass. This writes the deck
 * so the census, the separation audit, a contrast sweep or a render check can
 * be pointed at it exactly as they are pointed at the gallery.
 *
 * This is why it exists rather than a fuzzer. Random data finds crashes; these
 * find DESIGN failures, because a human chose each one to sit exactly at the
 * limit the component claims to support. The first run of it found that the
 * accessibility texture cycle is wired six wide while the categorical palette
 * is eight and the pie's own documented ceiling is eleven — a defect invisible
 * on every gallery slide, all of which fit inside six.
 *
 * Usage:
 *   node tools/build-stress-deck.js [--bucket chart] [--out <path>]
 *
 * Then:
 *   node tools/chart-mark-separation.js <out> --theme a11y-achromatopsia
 *   node tools/chart-language-census.js <out>
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = { bucket: 'chart', out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--bucket') out.bucket = argv[++i];
    else if (argv[i] === '--out') out.out = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = path.join(REPO, 'lib/components', args.bucket);
  if (!fs.existsSync(dir)) {
    console.error(`build-stress-deck: no such bucket — ${args.bucket}`);
    process.exit(2);
  }

  const slides = [];
  const missing = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const manifest = path.join(dir, name, `${name}.manifest.json`);
    if (!fs.existsSync(manifest)) continue;
    const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const sample = m.stressDoc?.sample;
    if (!sample) { missing.push(name); continue; }
    slides.push(sample.trim());
  }

  if (!slides.length) {
    console.error(`build-stress-deck: no stressDoc samples in ${args.bucket}`);
    process.exit(1);
  }

  const outPath = args.out
    ? path.resolve(args.out)
    : path.join(REPO, '.scratch', `${args.bucket}.stress.md`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${slides.join('\n\n---\n\n')}\n`);

  console.log(`${outPath}  —  ${slides.length} ceiling slide(s) from ${args.bucket}`);
  // Say what is NOT in the deck. A component with no stressDoc is silently
  // absent otherwise, and a sweep over an incomplete corpus that looks complete
  // is worse than no sweep.
  if (missing.length) console.log(`  no stressDoc (absent from the deck): ${missing.join(', ')}`);
}

main();
