#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
// #1527 concat-flip render sweep.
//
// Renders a nine-slide deck built from live gallery slides across every
// selectable theme in BOTH color-modes, one PNG per slide, and records a
// SHA-256 per slide. Run it once per side (an origin/main worktree = "before",
// the flip branch = "after") and compare the two manifests.
//
// `--no-split` is deliberate: the rig needs page N to stay slide N, so a
// pagination difference cannot masquerade as a color difference. Both sides
// render the same way, so the comparison is like-for-like.
//
// Usage: node sweep.mjs <repoRoot> <outDir> <label>
import fs from 'node:fs';
import path from 'node:path';

const [repo, outDir, label] = process.argv.slice(2);
if (!repo || !outDir || !label) { console.error('usage: sweep.mjs <repoRoot> <outDir> <label>'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });

const body = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'sweep-body.md'), 'utf8');
const THEMES = fs.readdirSync(path.join(repo, 'themes'))
  .filter((f) => f.endsWith('.manifest.json'))
  .map((f) => f.replace(/\.manifest\.json$/, ''))
  .sort();

const manifest = {};
let n = 0;
for (const theme of THEMES) {
  for (const mode of ['light', 'dark']) {
    const deck = path.join(outDir, `${theme}.${mode}.md`);
    fs.writeFileSync(deck, `---\nmarp: true\ntheme: ${theme}\ncolor-mode: ${mode}\nsize: hd\npaginate: true\nheader: "#1527 concat sweep"\nfooter: "${theme} · ${mode}"\n---\n\n${body}`);
    const out = path.join(outDir, `${theme}.${mode}.png`);
    try {
      execFileSync('node', [path.join(repo, 'lattice-emulator.js'), deck, out, theme, '--no-split', '--quiet'],
        { cwd: repo, stdio: ['ignore', 'ignore', 'pipe'], env: process.env, timeout: 300_000 });
    } catch (e) {
      console.error(`RENDER FAILED ${theme}/${mode}: ${String(e.stderr || e.message).slice(0, 400)}`);
      manifest[`${theme}|${mode}`] = { error: true };
      continue;
    }
    const slides = fs.readdirSync(outDir).filter((f) => f.startsWith(`${theme}.${mode}.`) && f.endsWith('.png')).sort();
    manifest[`${theme}|${mode}`] = slides.map((f) =>
      crypto.createHash('sha256').update(fs.readFileSync(path.join(outDir, f))).digest('hex'));
    n += slides.length;
    process.stdout.write(`\r${label}: ${Object.keys(manifest).length}/${THEMES.length * 2} theme-modes, ${n} slides`);
  }
}
fs.writeFileSync(path.join(outDir, `manifest.${label}.json`), JSON.stringify(manifest, null, 2));
console.log(`\n${label}: ${n} slide renders across ${Object.keys(manifest).length} theme-modes → manifest.${label}.json`);
