const _puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { resolveSelector } = require(path.join(__dirname, '..', 'lib', 'core', 'match-section'));

// ── Help / version (handled before positional parsing) ─────────────────────
function showHelp() {
  console.log(`screenshot-slides — Capture PNG screenshots of Lattice slide HTML

USAGE
  node tools/screenshot-slides.js [html-path] [out-dir] [selector] [scale]
  node tools/screenshot-slides.js --html PATH [--out DIR] [--selector EXPR] [--scale N]

ARGUMENTS / FLAGS
  html-path,  --html PATH       Pre-rendered Lattice HTML
                                  (default: .scratch/peek/deck.html)
  out-dir,    --out DIR         Output directory for PNGs
                                  (default: .scratch/peek)
  selector,   --selector EXPR   Which slide(s) to screenshot (see below)
                                  (default: all)
  scale,      --scale N         deviceScaleFactor (1 = native 1280×720,
                                  3 = retina 3840×2160)
                                  (default: 3)

  -h, --help                    Show this help and exit
  -v, --version                 Show version and exit
  -q, --quiet                   Suppress non-error output

SELECTOR FORMS (case-insensitive substring; first hit wins)
  all                  Every slide (default)
  <integer>            1-based slide index (e.g. 47)
  h2:<substring>       Slide whose first <h2> contains substring
  class:<substring>    Slide whose <section class="…"> contains substring
  footer:<substring>   Slide whose <footer> contains substring
  match:<substring>    Slide where any of the above matches

EXIT CODES
  0  Success (one or more screenshots written)
  1  HTML missing / selector matched no slide / Puppeteer error
  2  Selector syntax not understood

EXAMPLES
  node tools/screenshot-slides.js .scratch/peek/deck.html
  node tools/screenshot-slides.js .scratch/peek/deck.html .scratch/peek 47
  node tools/screenshot-slides.js .scratch/peek/deck.html .scratch/peek h2:banner-tag 3
  node tools/screenshot-slides.js --html=.scratch/peek/deck.html --selector=class:compare-prose
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  const pkg = require(path.join(__dirname, '..', 'package.json'));
  console.log(`screenshot-slides ${pkg.version}`);
  process.exit(0);
}

// ── Argv parsing — flags + positional, flags take precedence ────────────
function parseArgs(argv) {
  const flags = { quiet: false };
  const positional = [];
  const opts = {
    '--html': 'html',
    '--out': 'out', '-o': 'out',
    '--selector': 'selector', '-s': 'selector',
    '--scale': 'scale',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-q' || a === '--quiet') { flags.quiet = true; continue; }
    const eq = a.match(/^(--?[A-Za-z][\w-]*)=(.*)$/);
    if (eq && opts[eq[1]]) { flags[opts[eq[1]]] = eq[2]; continue; }
    if (opts[a]) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('-')) {
        console.error(`error: ${a} requires a value`);
        process.exit(1);
      }
      flags[opts[a]] = v;
      i++;
      continue;
    }
    if (a.startsWith('-')) {
      console.error(`error: unknown option: ${a}`);
      console.error('Run with --help to see available options.');
      process.exit(1);
    }
    positional.push(a);
  }
  return { flags, positional };
}

const { flags, positional } = parseArgs(process.argv.slice(2));

// Sensible repo-rooted defaults: drop /tmp (Linux-only); .scratch/peek
// matches the project's scratch-lifecycle convention. Default scale=3
// matches the engine's 1× export scale and is what the recipes recommend.
const DEFAULT_HTML  = path.join(process.cwd(), '.scratch', 'peek', 'deck.html');
const DEFAULT_OUT   = path.join(process.cwd(), '.scratch', 'peek');
const DEFAULT_SCALE = 3;

const htmlFile = flags.html     || positional[0] || DEFAULT_HTML;
const outDir   = flags.out      || positional[1] || DEFAULT_OUT;
const selector = flags.selector || positional[2] || 'all';

const scaleRaw = flags.scale ?? positional[3];
const scale = (() => {
  if (scaleRaw === undefined) return DEFAULT_SCALE;
  const n = parseFloat(scaleRaw);
  if (!Number.isFinite(n) || n < 1) {
    console.error(`error: scale must be a number ≥ 1 (got "${scaleRaw}")`);
    process.exit(1);
  }
  return n;
})();
const QUIET = flags.quiet;

if (!fs.existsSync(htmlFile)) {
  console.error(`error: HTML not found: ${htmlFile}`);
  console.error('       Render a deck first (e.g. `node lattice.js deck.md out.pdf`)');
  console.error('       or pass an explicit path: --html <file>');
  process.exit(1);
}

// Try to find puppeteer in multiple locations
function loadPuppeteer() {
  const tryPaths = ['puppeteer', 'puppeteer-core'];
  try {
    const globalRoot = require('child_process')
      .execSync('npm root -g', { stdio: ['pipe','pipe','ignore'] }).toString().trim();
    if (globalRoot) tryPaths.push(path.join(globalRoot, '@mermaid-js', 'mermaid-cli', 'node_modules', 'puppeteer'));
  } catch(_) {}
  tryPaths.push(path.join(__dirname, '..', 'Workspace', 'Lattice', 'node_modules', '.pnpm', 'puppeteer@21.11.0', 'node_modules', 'puppeteer'));
  for (const p of tryPaths) {
    try { return require(p); } catch(_) {}
  }
  return null;
}

(async () => {
  const pup = loadPuppeteer();
  if (!pup) {
    console.error('error: puppeteer not found in any expected location');
    console.error('       try: npm install (from the repo root) to install dependencies');
    process.exit(1);
  }
  const browser = await pup.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: scale });

  const htmlPath = `file://${path.resolve(htmlFile)}`;
  try {
    await page.goto(htmlPath, { waitUntil: 'networkidle0', timeout: 30000 });
  } catch (e) {
    console.error(`error: failed to load HTML (${htmlPath}): ${e.message}`);
    await browser.close();
    process.exit(1);
  }

  const sections = await page.$$('section');
  if (sections.length === 0) {
    console.error(`error: no <section> elements in ${htmlFile}`);
    console.error('       Is this a Lattice-rendered HTML? Section per slide is expected.');
    await browser.close();
    process.exit(1);
  }
  if (!QUIET) console.log(`Found ${sections.length} sections`);

  fs.mkdirSync(outDir, { recursive: true });

  // Pull metadata for every section once, then delegate the matching
  // logic to lib/match-section.js (pure, unit-tested).
  const meta = await page.$$eval('section', els => els.map(s => ({
    cls:    s.className || '',
    h2:     (s.querySelector('h2')?.textContent || '').trim(),
    footer: (s.querySelector('footer')?.textContent || '').trim(),
  })));
  const result = resolveSelector(selector, meta);

  if (result.error === 'invalid') {
    console.error(`error: selector not understood: "${selector}"`);
    console.error('       valid forms: all | <N> | h2:<text> | class:<text> | footer:<text> | match:<text>');
    await browser.close();
    process.exit(2);
  }
  if (selector !== 'all' && result.indices.length === 0) {
    console.error(`error: selector "${selector}" matched no slide`);
    console.error('available h2 titles:');
    meta.slice(0, 10).forEach((m, i) => { console.error(`  ${i + 1}: ${m.h2 || '(no h2)'}`); });
    if (meta.length > 10) console.error(`  … and ${meta.length - 10} more`);
    await browser.close();
    process.exit(1);
  }
  if (!QUIET && result.parsed.kind !== 'all' && result.parsed.kind !== 'index') {
    const i = result.indices[0];
    console.log(`  selector "${selector}" matched slide ${i + 1}: h2="${meta[i].h2}" class="${meta[i].cls}"`);
  }
  const indices = result.indices;

  for (const i of indices) {
    const num = String(i + 1).padStart(3, '0');
    const outPath = path.join(outDir, `${num}.png`);
    const box = await sections[i].boundingBox();
    if (!box) {
      if (!QUIET) console.log(`  slide ${num}: no bounding box, skipping`);
      continue;
    }
    await page.screenshot({
      path: outPath,
      clip: { x: box.x, y: box.y, width: 1280, height: 720 }
    });
    if (!QUIET) console.log(`  slide ${num} → ${outPath}`);
  }

  await browser.close();
  if (!QUIET) console.log('Done');
})();
