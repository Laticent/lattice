#!/usr/bin/env node
// Re-renders the reference sheets for the media plugins' frames, finishes and tones from looks.css, so the build
// can compare its output with the looks the owner approved (2026-10-16-media-plugins.md §4.7, §4.9).
// On demand only; nothing runs it in CI. Writes to .scratch/media-looks/ and needs network once for the photos.
//   node engineering/decisions/2026-10-16-media-plugins/render.mjs [theme ...]   (default: indaco indaco-dark cuoio cuoio-dark)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = join(root, '.scratch', 'media-looks');
mkdirSync(out, { recursive: true });

// Two real photographs from Lorem Picsum (Unsplash photos, Unsplash license): a canoe on a lake, a red mug.
const PHOTOS = { 'canoe.jpg': 1011, 'mug.jpg': 30 };
for (const [name, id] of Object.entries(PHOTOS)) {
  const file = join(out, name);
  if (!existsSync(file)) execFileSync('curl', ['-sfL', '--max-time', '60', '-o', file, `https://picsum.photos/id/${id}/1600/1000`]);
}

const css = readFileSync(join(here, 'looks.css'), 'utf8').replace(/^\/\*[\s\S]*?\*\/\n/, '');
const { qrSvg } = createRequire(import.meta.url)(join(root, 'lib/engine/qr.js'));
const qr = qrSvg('https://laticent.com/join', { ecLevel: 'M', margin: 4, label: 'QR' });

const img = (p = 'canoe.jpg') => `<img src="${p}" alt="sample">`;
const clip = `<div class="poster">${img()}</div>`;
const code = `<div class="qrtile">${qr}</div>`;
const FRAMES = [['mat', 'Mat'], ['keyline', 'Keyline'], ['float', 'Float'], ['device', 'Device'], ['corners', 'Corners']];

function deck(theme) {
  const o = [`---\ntheme: ${theme}\n---\n\n<style>\n${css}</style>\n\n## Frames, off by default — ${theme}\n\n<div class="g3">`];
  for (const [k, t] of FRAMES) o.push(`<div class="cell"><b>${t}</b><figure class="f ${k}">${img()}</figure></div>`);
  o.push('</div>\n');
  for (const [k, t] of FRAMES) {
    o.push(`\n---\n\n## ${t}: one frame for a photo, a clip and a code\n\n<div class="row"><figure class="f ${k}">${img()}</figure><figure class="f ${k}">${clip}</figure><figure class="f ${k}">${code}</figure></div>\n`);
  }
  for (const p of ['canoe.jpg', 'mug.jpg']) {
    o.push('\n---\n\n## Finishes on the photo\n\n<div class="g2">');
    for (const [k, t] of [['', 'No finish'], ['nimbus', 'nimbus · accent blooms'], ['halo', 'halo · vignette'], ['meridian', 'meridian · diagonal wash']]) {
      o.push(`<div class="cell"><b>${t}</b><figure class="ph ${k}">${img(p)}</figure></div>`);
    }
    o.push('</div>\n');
  }
  o.push('\n---\n\n## Tones\n\n<div class="g3">');
  for (const p of ['canoe.jpg', 'mug.jpg']) {
    for (const [k, t] of [['', 'No tone'], ['duotone', 'duotone'], ['grayscale', 'grayscale']]) {
      o.push(`<div class="cell"><b>${t}</b><figure class="ph ${k}">${img(p)}</figure></div>`);
    }
  }
  o.push('</div>\n');
  o.push(`\n---\n\n## In a real slide: mat + nimbus\n\n<div class="situ"><div><p>Our field team covered 1,200 km of lakes this season, and every survey site is now on the shared map.</p><p style="opacity:.7">frame=mat · nimbus</p></div><figure class="f mat"><div class="ph nimbus">${img()}</div></figure></div>\n`);
  return o.join('\n');
}

const themes = process.argv.slice(2).length ? process.argv.slice(2) : ['indaco', 'indaco-dark', 'cuoio', 'cuoio-dark'];
for (const theme of themes) {
  const md = join(out, `looks-${theme}.md`);
  writeFileSync(md, deck(theme));
  execFileSync(process.execPath, [join(root, 'lattice.js'), md, join(out, `looks-${theme}.png`)], { stdio: 'inherit' });
}
console.log(`reference sheets: ${out}`);
