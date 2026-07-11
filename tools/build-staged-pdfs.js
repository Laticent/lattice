#!/usr/bin/env node
/**
 * Pre-commit helper: rebuild + re-stage the PDF for every staged deck
 * markdown, incrementally — only the decks whose source actually
 * changed. Replaces the "edited markdown, forgot to rebuild the PDF"
 * gate (check-pdf-freshness.sh) with an auto-rebuild: the PDF is a pure
 * derived artifact, so the hook regenerates it and stages it for you
 * rather than failing and making you do it by hand.
 *
 * Scope — markdown that produces a committed PDF:
 *   examples/<name>.md                          → examples/<name>.pdf
 *   test/integration/baseline-decks/<name>.md   → sibling <name>.pdf
 *   exemplars/<sector>/<name>.md                → sibling <name>.pdf
 *   lib/components/<bucket>/<name>/<name>.gallery.md   (per-component)
 *       → build-galleries.js --only <name>  (light + dark)
 *   lib/components/<bucket>/<bucket>.gallery.md        (bucket survey)
 *       → build-bucket-galleries.js --only <bucket>  (light + dark)
 *
 * NOT in scope (deliberately): component CSS / transforms / shared CSS /
 * themes / the engine. Those affect many decks at once and a full
 * rebuild is ~30 min — too slow for a commit hook. CI's freshness
 * checks (build:galleries:check / build:bucket-galleries:check) are the
 * safety net there. This hook only ever rebuilds decks whose *markdown*
 * is in the commit, so its cost scales with the change, not the repo.
 *
 * Chrome: lattice-emulator.js auto-detects the puppeteer-cached binary,
 * so no CHROME_PATH wiring is needed here.
 *
 * Exit codes:
 *   0  every staged deck rebuilt + staged (or nothing to do)
 *   1  a rebuild failed
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync, execFileSync, spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');

// Each deck render spawns its own headless Chromium, so cap how many run at
// once — unbounded parallelism across a many-deck commit would exhaust memory.
const DECK_CONCURRENCY = 3;

function stagedFiles() {
  const out = execSync('git diff --cached --name-only --diff-filter=ACMR', {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

// The consolidated showcase decks (examples/<id>-gallery.md) are GENERATED from
// the manifest set, not rendered as-is — so a staged edit to one, or to any
// chart/math component that feeds it, regenerates the whole showcase.
const { SHOWCASES: SHOWCASE_DEFS } = require('./build-showcase-galleries');
const SHOWCASE_IDS = new Set(SHOWCASE_DEFS.map((s) => s.id));
const SHOWCASE_BUCKETS = new Set(SHOWCASE_DEFS.flatMap((s) => s.buckets));

// Classify a staged path into a build job, or null if it produces no PDF.
function classify(file) {
  // Generated consolidated showcase deck — regenerate from manifests (do NOT
  // render the .md as-is to a single .pdf like a hand-authored deck).
  let m = file.match(/^examples\/([a-z][a-z0-9-]*)-gallery\.md$/);
  if (m && SHOWCASE_IDS.has(m[1])) return { kind: 'showcase', id: m[1] };
  // A change to a component in a showcase's bucket regenerates that showcase
  // (its slide is composed from the manifest.sample). Keyed on the manifest,
  // where `sample` lives.
  m = file.match(/^lib\/components\/([a-z-]+)\/[a-z-]+\/[a-z-]+\.manifest\.json$/);
  if (m && SHOWCASE_BUCKETS.has(m[1])) {
    return { kind: 'showcase', id: SHOWCASE_DEFS.find((s) => s.buckets.includes(m[1])).id };
  }

  // Hand-authored example deck.
  m = file.match(/^examples\/([a-z][a-z0-9-]*)\.md$/);
  if (m) return { kind: 'deck', src: file, out: `examples/${m[1]}.pdf` };

  // CI baseline deck (lives with the test infra).
  m = file.match(/^(test\/integration\/baseline-decks\/[a-z][a-z0-9-]*)\.md$/);
  if (m) return { kind: 'deck', src: file, out: `${m[1]}.pdf` };

  // Worked exemplar deck (exemplars/<sector>/<name>.md → sibling .pdf).
  // Rendered as-is (the full deck); its committed PDF is the full tier.
  m = file.match(/^(exemplars\/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*)\.md$/);
  if (m) return { kind: 'deck', src: file, out: `${m[1]}.pdf` };

  // Component / bucket gallery markdown. Disambiguate by depth:
  //   lib/components/<bucket>/<bucket>.gallery.md       → bucket
  //   lib/components/<bucket>/<name>/<name>.gallery.md  → component
  m = file.match(/^lib\/components\/(.+)\.gallery\.md$/);
  if (m) {
    const segs = m[1].split('/'); // e.g. ["anchor","title","title"] or ["anchor","anchor"]
    const stem = segs[segs.length - 1];
    if (segs.length === 2 && segs[0] === stem) return { kind: 'bucket', name: stem };
    if (segs.length === 3 && segs[1] === stem) return { kind: 'component', name: stem };
  }
  return null;
}

// Async single-deck render (one Chromium); resolves to the output path. Uses
// spawn + stdio:'inherit' (not execFile): the render streams progress straight
// to the terminal, and there is no captured-output buffer to overflow — execFile
// would buffer stdout to a 1 MB default and spuriously fail a chatty render.
function buildDeckAsync(job) {
  return new Promise((resolve, reject) => {
    process.stderr.write(`build-staged-pdfs: rebuilding ${job.out}\n`);
    const child = spawn('node', [EMULATOR, job.src, job.out], { cwd: ROOT, stdio: 'inherit' });
    child.on('error', (err) => reject(new Error(`${job.out}: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve(job.out);
      else reject(new Error(`${job.out}: exited ${code}`));
    });
  });
}

// Render the independent decks concurrently, capped at DECK_CONCURRENCY.
async function buildDecks(decks) {
  const out = [];
  let next = 0;
  async function worker() {
    while (next < decks.length) {
      const job = decks[next++];
      out.push(await buildDeckAsync(job));
    }
  }
  await Promise.all(Array.from({ length: Math.min(DECK_CONCURRENCY, decks.length) }, worker));
  return out;
}

function buildComponent(name) {
  execFileSync('node', [path.join(ROOT, 'tools', 'build-galleries.js'), '--only', name], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  return globGallery(`lib/components/**/${name}/${name}.gallery.{light,dark}.pdf`, name, false);
}

function buildBucket(name) {
  execFileSync('node', [path.join(ROOT, 'tools', 'build-bucket-galleries.js'), '--only', name], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  return [`lib/components/${name}/${name}.gallery.light.pdf`, `lib/components/${name}/${name}.gallery.dark.pdf`];
}

// Resolve a component's light/dark gallery PDFs without a glob dep:
// the per-component gallery sits at lib/components/<bucket>/<name>/.
function globGallery(_pattern, name, _bucket) {
  const base = path.join(ROOT, 'lib', 'components');
  for (const bucket of fs.readdirSync(base)) {
    const dir = path.join(base, bucket, name);
    const light = path.join(dir, `${name}.gallery.light.pdf`);
    if (fs.existsSync(light)) {
      return [
        path.relative(ROOT, light),
        path.relative(ROOT, path.join(dir, `${name}.gallery.dark.pdf`)),
      ];
    }
  }
  return [];
}

async function main() {
  const files = stagedFiles();
  const decks = [];
  const components = new Set();
  const buckets = new Set();
  const showcases = new Set();

  for (const f of files) {
    const job = classify(f);
    if (!job) continue;
    if (job.kind === 'deck') decks.push(job);
    else if (job.kind === 'component') components.add(job.name);
    else if (job.kind === 'bucket') buckets.add(job.name);
    else if (job.kind === 'showcase') showcases.add(job.id);
  }

  if (!decks.length && !components.size && !buckets.size && !showcases.size) return;

  const rebuilt = [];
  try {
    // Decks are independent (distinct outputs) → render concurrently. Component
    // and bucket gallery builds stay serial (the --only tools manage their own
    // shared output and are the rarer path).
    rebuilt.push(...(await buildDecks(decks)));
    for (const c of components) {
      process.stderr.write(`build-staged-pdfs: rebuilding component gallery ${c}\n`);
      rebuilt.push(...buildComponent(c));
    }
    for (const b of buckets) {
      process.stderr.write(`build-staged-pdfs: rebuilding bucket gallery ${b}\n`);
      rebuilt.push(...buildBucket(b));
    }
    for (const id of showcases) {
      process.stderr.write(`build-staged-pdfs: rebuilding showcase gallery ${id}\n`);
      execFileSync('node', [path.join(ROOT, 'tools', 'build-showcase-galleries.js')], { cwd: ROOT, stdio: 'inherit' });
      rebuilt.push(`examples/${id}-gallery.md`, `examples/${id}-gallery.light.pdf`, `examples/${id}-gallery.dark.pdf`);
    }
  } catch (err) {
    process.stderr.write(`build-staged-pdfs: rebuild failed — ${err.message}\n`);
    process.exit(1);
  }

  const existing = rebuilt.filter((p) => fs.existsSync(path.join(ROOT, p)));
  if (existing.length) {
    execFileSync('git', ['add', '--', ...existing], { cwd: ROOT, stdio: 'inherit' });
    // Loud + explicit: this hook adds derived PDFs INTO your commit. Name them.
    process.stderr.write(
      `build-staged-pdfs: staged ${existing.length} rebuilt PDF(s) into this commit:\n` +
        existing.map((p) => `  + ${p}\n`).join(''),
    );
  }
}

main();
