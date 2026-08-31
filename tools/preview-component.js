#!/usr/bin/env node
/**
 * Component preview — render ONE local / AI-generated component the way the engine
 * actually does, so it can be reviewed in PIXELS (not just structural numbers).
 *
 * Why this exists: a generated component (Studio "Describe a component", a shared
 * component) is not in `dist/lattice.css`, so the obvious `lattice-emulator.js
 * <deck> <css> <out>` invocation is a TRAP — the positional CSS arg REPLACES the
 * bundled `lattice.css` rather than supplementing it, so the slide renders with
 * NO frame (no masthead, no `.cell-stage` box, broken pagination) and a perfectly
 * good component looks broken. This tool does the faithful thing: concatenate the
 * bundled `lattice.css` (the frame + tokens) WITH the component's scoped CSS and
 * render the skeleton normally, so the component gets the exact same frame a
 * shipped component does. The result is a true preview you can judge.
 *
 * Usage:
 *   node tools/preview-component.js <component.json> [--out <file.png>] [--theme <name>] [--palette dark]
 *     component.json = { "name": "...", "css": "...", "skeleton": "<!-- _class: name -->\n..." }
 *     (the exact shape lib/layout/ai.js coerceComponent / the Studio produces)
 *
 *   # or pass the parts directly:
 *   node tools/preview-component.js --css comp.css --skeleton slide.md [--out ...] [--theme ...]
 *
 * Output is a PNG (default `<name>.preview.png` in the cwd). Pair with SendUserFile
 * in Claude Code for a visual review loop.
 */

const fs = require('node:fs');
const { DEFAULT_PALETTE } = require('../lib/core/default-palette.mjs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const LATTICE_CSS = path.join(ROOT, 'dist', 'lattice.css');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');

/** Faithful stylesheet: the bundled frame/tokens FIRST, then the component's scoped CSS. */
function combineCss(latticeCss, componentCss) {
  return `${latticeCss}\n\n/* ─── generated component (preview) ─── */\n${String(componentCss || '').trim()}\n`;
}

/** Wrap a bare skeleton in deck front-matter; strip any front-matter the skeleton already carries. */
function buildDeck(skeleton, { theme = DEFAULT_PALETTE } = {}) {
  const body = String(skeleton || '').replace(/^﻿?---\n[\s\S]*?\n---\s*\n?/, '').trimStart();
  return `---\nmarp: true\ntheme: ${theme}\npaginate: true\n---\n\n${body}\n`;
}

/**
 * Render a component ({name, css, skeleton}) to a PNG via the engine. Returns the
 * output path. `theme` defaults to the engine default (lib/core/default-palette.mjs); `palette` is an optional emulator palette.
 */
function renderComponent({ name, css, skeleton }, { out, theme = DEFAULT_PALETTE, palette } = {}) {
  if (!css || !skeleton) throw new Error('component needs both `css` and `skeleton`');
  const latticeCss = fs.readFileSync(LATTICE_CSS, 'utf8');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-preview-'));
  const deckPath = path.join(tmp, 'deck.md');
  const cssPath = path.join(tmp, 'combined.css');
  const base = path.join(tmp, 'out.png');
  fs.writeFileSync(deckPath, buildDeck(skeleton, { theme }));
  fs.writeFileSync(cssPath, combineCss(latticeCss, css));

  const args = [EMULATOR, deckPath, cssPath, base];
  if (palette) args.push(palette);
  execFileSync('node', args, { cwd: ROOT, stdio: 'pipe' });

  // The emulator writes `<base-stem>.NNN.png` (one per slide); grab the first.
  const produced = fs.readdirSync(tmp).filter(f => /^out\.\d+\.png$/.test(f)).sort();
  if (!produced.length) throw new Error('emulator produced no PNG');
  const finalOut = path.resolve(out || `${name || 'component'}.preview.png`);
  fs.copyFileSync(path.join(tmp, produced[0]), finalOut);
  fs.rmSync(tmp, { recursive: true, force: true });
  return finalOut;
}

function parseArgs(argv) {
  const o = { theme: DEFAULT_PALETTE };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--theme') o.theme = argv[++i];
    else if (a === '--palette') o.palette = argv[++i];
    else if (a === '--css') o.cssFile = argv[++i];
    else if (a === '--skeleton' || a === '--md') o.skelFile = argv[++i];
    else pos.push(a);
  }
  o.json = pos[0];
  return o;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.json && !(o.cssFile && o.skelFile)) {
    console.error('usage: node tools/preview-component.js <component.json> [--out f.png] [--theme name] [--palette dark]');
    console.error('   or: node tools/preview-component.js --css comp.css --skeleton slide.md [--out ...]');
    process.exit(2);
  }
  let comp;
  if (o.json) comp = JSON.parse(fs.readFileSync(o.json, 'utf8'));
  else comp = { name: path.basename(o.cssFile, '.css'), css: fs.readFileSync(o.cssFile, 'utf8'), skeleton: fs.readFileSync(o.skelFile, 'utf8') };
  const png = renderComponent(comp, { out: o.out, theme: o.theme, palette: o.palette });
  console.log(`PNG → ${png}`);
}

if (require.main === module) main();

module.exports = { combineCss, buildDeck, renderComponent };
