#!/usr/bin/env node
// palette-slide-parity — does a stylesheet a web app can import draw a slide the way the CLI does?
//
// The measurement behind followups.d/2580-p3-packed-palette-form.md and the 2026-10-07 packed
// palette entry in engineering/decisions/2026-09-23-portable-packages.md §10. For each deck and palette it renders
// the deck with the CLI to HTML (the reference), screenshots every slide at its own size, then puts
// engine.render()'s slide markup in a plain page under each candidate stylesheet and diffs every
// slide against the reference with `compare -metric AE -fuzz 3%` (the regression gate's threshold).
//
// Arms:
//   render  engine.render()'s own `css` — the documented slide path.
//   packed  slides.css + palette/<name>.slides.css — the UNPUBLISHED candidate, built here into
//           the output folder: the engine scaffold + `packTheme(dist/lattice.css)` + the 16:9
//           geometry stamp (through `hoistImports`), and `packTheme(dist/palettes/<name>.css)`
//           per palette. Nothing in the package ships these files; this arm is what publishing
//           them would give a consumer.
//   pair    dist/lattice.css + dist/palettes/<name>.css — what the package publishes today.
//   bundled one stylesheet per palette that a bundler built (opt-in: `--bundled <path>`, where
//           `{palette}` in the path is replaced by each palette name). It measures what a consumer's
//           Vite or webpack build makes of a stylesheet, which a <link> to the source cannot show.
//
// Usage:
//   CHROME_PATH=… node tools/palette-slide-parity.js                 # the six galleries
//   CHROME_PATH=… node tools/palette-slide-parity.js <deck.md> …     # your decks
//   …--palette indaco,cuoio-dark   --arms render,packed,pair   --out <dir>
//   …--bundled <dir>/{palette}/assets/{palette}.css   (adds the `bundled` arm)
// Default out: .scratch/palette-slide-parity (CLI renders are cached there; delete to refresh).
// Needs a built dist/ (`npm run build`) and ImageMagick's `compare`. On-demand, not a gate.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const engine = require('../lib/engine');
const { scaffold, packTheme, resolveSize, geometryVarsCss, hoistImports } = require('../lib/engine/css.js');
const { parseAeCount } = require('./preview');

const GALLERIES = [
  'anchor/title/title', 'statement/big-number/big-number', 'inventory/cards-grid/cards-grid',
  'comparison/split-compare/split-compare', 'evidence/stats/stats', 'statement/quote/quote',
].map((g) => path.join(ROOT, 'lib/components', `${g}.gallery.md`));

function parseArgs(argv) {
  const opts = { decks: [], palettes: ['indaco', 'cuoio-dark'], arms: ['render', 'packed', 'pair'], out: path.join(ROOT, '.scratch/palette-slide-parity') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--palette') opts.palettes = argv[++i].split(',');
    else if (a === '--arms') opts.arms = argv[++i].split(',');
    else if (a === '--out') opts.out = path.resolve(argv[++i]);
    else if (a === '--bundled') {
      if (!argv[i + 1]) throw new Error('palette-slide-parity: --bundled needs a path');
      opts.bundled = path.resolve(argv[++i]);
    }
    else opts.decks.push(path.resolve(a));
  }
  if (!opts.decks.length) opts.decks = GALLERIES;
  if (opts.bundled && !opts.arms.includes('bundled')) opts.arms.push('bundled');
  if (opts.arms.includes('bundled') && !opts.bundled) throw new Error('palette-slide-parity: --arms bundled needs --bundled <path>');
  return opts;
}

const read = (p) => fs.readFileSync(p, 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// The palette and every theme it imports, base first — what addThemes needs for render().
function themeChain(name) {
  const out = [];
  for (let n = name; n; ) {
    const css = read(path.join(ROOT, 'themes', n, `${n}.css`));
    out.unshift({ name: n, css });
    const imports = [...stripComments(css).matchAll(/@import\s+['"]([\w-]+)['"]/g)].map((m) => m[1]);
    n = imports.find((x) => x !== 'lattice');
  }
  return out;
}

// The candidate: one engine sheet for every palette, and one small packed sheet per palette.
function buildPacked(dir) {
  fs.mkdirSync(path.join(dir, 'palette'), { recursive: true });
  const geometry = resolveSize();
  const base = stripComments(read(path.join(ROOT, 'dist/lattice.css')));
  fs.writeFileSync(path.join(dir, 'slides.css'), hoistImports(`${scaffold(geometry)}\n${packTheme(base)}\n${geometryVarsCss(geometry)}\n`));
  for (const f of fs.readdirSync(path.join(ROOT, 'dist/palettes'))) {
    const packed = packTheme(read(path.join(ROOT, 'dist/palettes', f)));
    fs.writeFileSync(path.join(dir, 'palette', f.replace(/\.css$/, '.slides.css')), packed);
  }
  // The engine sheet's @font-face urls are relative to dist/, where a published slides.css would sit.
  fs.rmSync(path.join(dir, 'fonts'), { force: true, recursive: true });
  fs.symlinkSync(path.join(ROOT, 'dist/fonts'), path.join(dir, 'fonts'));
}

function page({ css, links = [], html, dark }) {
  const linkTags = links.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n');
  // A dark palette's page needs color-scheme: dark, or the white canvas shows through the top rule.
  return `<!doctype html><html><head><meta charset="utf-8"><base href="file://${ROOT}/dist/">
${linkTags}${css ? `<style>${css}</style>` : ''}
<style>html,body{margin:0;padding:0}${dark ? ':root{color-scheme:dark}' : ''}</style></head><body>${html}</body></html>`;
}

// Clip each slide at its origin to the REFERENCE slide's size (`sizes`, from the CLI shot), not
// the candidate's own box: the `pair` arm's slides have no height, and an element screenshot of a
// zero-height box would refuse to run. Returns the sizes it clipped.
async function shoot(browser, file, dir, selector, sizes = null) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const pg = await browser.newPage();
  await pg.setViewport({ width: 1280, height: 720 });
  await pg.goto(`file://${file}`, { waitUntil: 'networkidle0' });
  await pg.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 400));
  const slides = await pg.$$(selector);
  const clipped = [];
  for (const [i, el] of slides.entries()) {
    const box = await el.evaluate((n) => {
      const r = n.getBoundingClientRect();
      return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
    });
    const size = sizes ? sizes[i] || sizes[sizes.length - 1] : box;
    clipped.push({ width: size.width, height: size.height });
    const file = path.join(dir, `${String(i + 1).padStart(2, '0')}.png`);
    await pg.screenshot({ path: file, clip: { x: box.x, y: box.y, width: size.width, height: size.height }, captureBeyondViewport: true });
  }
  await pg.close();
  return clipped;
}

function pixelsOver(a, b) {
  if (!fs.existsSync(a) || !fs.existsSync(b)) return Infinity;
  const r = spawnSync('compare', ['-metric', 'AE', '-fuzz', '3%', a, b, 'null:'], { encoding: 'utf8' });
  // An unreadable count (-1) is "cannot tell", which counts as changed, never as a match.
  const n = parseAeCount(r.stderr);
  return n < 0 ? Infinity : n;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!process.env.CHROME_PATH) throw new Error('palette-slide-parity: set CHROME_PATH');
  if (!fs.existsSync(path.join(ROOT, 'dist/palettes'))) throw new Error('palette-slide-parity: no dist/palettes — run `npm run build`');
  const puppeteer = require('puppeteer');
  const pkg = path.join(opts.out, 'packed-candidate');
  if (opts.arms.includes('packed')) buildPacked(pkg);
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none'] });
  const rows = [];
  try {
    for (const palette of opts.palettes) {
      engine.addThemes([{ name: 'lattice', css: read(path.join(ROOT, 'dist/lattice.css')) }, ...themeChain(palette).map((t) => ({ name: t.name, css: t.css }))]);
      const dark = /-dark$/.test(palette);
      for (const deck of opts.decks) {
        const slug = path.basename(deck, '.md').replace(/\.gallery$/, '');
        const dir = path.join(opts.out, palette, slug);
        fs.mkdirSync(dir, { recursive: true });
        const cliHtml = path.join(dir, 'cli.html');
        if (!fs.existsSync(cliHtml)) execFileSync(process.execPath, [path.join(ROOT, 'dist/lattice-emulator.js'), deck, cliHtml, palette], { stdio: 'ignore' });
        const sizes = await shoot(browser, cliHtml, path.join(dir, 'cli'), 'section[data-lattice-slide]');
        const { html, css } = engine.render(read(deck), palette);
        for (const arm of opts.arms) {
          const spec = arm === 'render' ? { css, html, dark }
            : arm === 'packed' ? { links: [`file://${pkg}/slides.css`, `file://${pkg}/palette/${palette}.slides.css`], html, dark }
            : arm === 'bundled' ? { links: [`file://${opts.bundled.replaceAll('{palette}', palette)}`], html, dark }
            : { links: ['lattice.css', `palettes/${palette}.css`], html, dark };
          const file = path.join(dir, `${arm}.html`);
          fs.writeFileSync(file, page(spec));
          const n = (await shoot(browser, file, path.join(dir, arm), 'article.lattice > section', sizes)).length;
          for (let i = 1; i <= Math.max(n, sizes.length); i++) {
            const id = `${String(i).padStart(2, '0')}.png`;
            rows.push({ palette, deck: slug, arm, slide: i, px: pixelsOver(path.join(dir, 'cli', id), path.join(dir, arm, id)) });
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(opts.out, 'results.json'), `${JSON.stringify(rows, null, 1)}\n`);
  for (const palette of opts.palettes) {
    for (const arm of opts.arms) {
      const rs = rows.filter((r) => r.palette === palette && r.arm === arm);
      const worst = rs.reduce((m, r) => (r.px > m.px ? r : m), { px: 0, deck: '-', slide: 0 });
      console.log(`${palette.padEnd(12)} ${arm.padEnd(7)} ${rs.filter((r) => r.px === 0).length}/${rs.length} match  worst ${worst.px} px (${worst.deck} #${worst.slide})`);
    }
  }
  for (const deck of new Set(rows.map((r) => r.deck))) {
    const line = opts.palettes.flatMap((palette) => opts.arms.map((arm) => {
      const rs = rows.filter((r) => r.deck === deck && r.palette === palette && r.arm === arm);
      return `${palette}/${arm} ${rs.filter((r) => r.px === 0).length}/${rs.length}`;
    }));
    console.log(`  ${deck.padEnd(16)} ${line.join('  ')}`);
  }
  console.log(`per-slide results: ${path.relative(ROOT, path.join(opts.out, 'results.json'))}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
