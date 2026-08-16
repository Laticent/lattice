#!/usr/bin/env node
// Engine ↔ emulator HTML parity harness (P2 step 1 — see
// engineering/decisions/2026-06-11-emulator-on-engine-p2.md).
//
// Enumerates where lattice-engine's per-slide HTML diverges from the emulator's
// bespoke regex parser, so the P2 swap (emulator → engine) can be verified gap-by
// -gap before parseSlide/parseInline are deleted. Renders each deck through the
// emulator (whose `out.html` sidecar carries the assembled slides) and through
// engine.render(), then compares STRUCTURE — the ordered sequence of block tags +
// their normalized text — per slide. Chrome (header/footer), inline SVG icons, and
// Mermaid payloads are stripped first: those layers differ by design (the emulator
// pre-renders Mermaid + injects page chrome; the engine emits neither). What's left
// is the markdown→HTML contract, which is exactly what the swap must preserve.
//
// Usage:
//   CHROME_PATH=… node tools/emulator-engine-parity.mjs <deck.md> [<deck2.md> …]
//   CHROME_PATH=… node tools/emulator-engine-parity.mjs --galleries
//   …--palette indaco   (default indaco)
//
// A divergence is NOT automatically a bug — it can be an emulator parser bug the
// engine fixes (e.g. bold inside an inline-code span), a genuine engine gap, or a
// normalization the harness should add. Each one is triaged in the P2 note.

import { execFileSync } from 'node:child_process';
import { globSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import latticeEngine from '../lib/engine/index.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const args = process.argv.slice(2);
const pi = args.indexOf('--palette');
const palette = pi >= 0 ? args[pi + 1] : 'indaco';

let decks = args.filter((a) => a.endsWith('.md')).map((a) => (a.startsWith('/') ? a : join(process.cwd(), a)));
if (args.includes('--galleries')) {
  decks = globSync('lib/components/**/*.gallery.md', { cwd: ROOT }).map((p) => join(ROOT, p)).sort();
}
if (!decks.length) {
  console.error('No decks. Pass <deck>.md paths or --galleries.');
  process.exit(2);
}

const eng = latticeEngine.createEngine();
eng.addThemes([
  { name: 'lattice', css: readFileSync(join(ROOT, 'dist/lattice.css'), 'utf8') },
  { name: palette, css: readFileSync(join(ROOT, `themes/${palette}.css`), 'utf8') },
]);

// Top-level slide sections — sections not nested inside another section. jsdom so
// literal `<section>` in rendered code/CSS text can't fool a regex.
function slides(html) {
  const doc = new JSDOM(html).window.document;
  return [...doc.querySelectorAll('section')].filter((s) => !s.parentElement?.closest('section'));
}
const BLOCKS = 'h1,h2,h3,h4,h5,h6,p,li,th,td,code,blockquote,strong,em,pre';
function structure(section) {
  const clone = section.cloneNode(true);
  for (const n of clone.querySelectorAll('svg, header, footer')) n.remove();
  return [...clone.querySelectorAll(BLOCKS)].map((n) => `${n.tagName}:${n.textContent.replace(/\s+/g, ' ').trim()}`).join(' | ');
}

function emulatorSlides(deck) {
  const dir = mkdtempSync(join(tmpdir(), 'p2-parity-'));
  try {
    execFileSync('node', [join(ROOT, 'lattice-emulator.js'), deck, join(dir, 'o.pdf'), palette, '--quiet'], {
      cwd: ROOT,
      stdio: 'pipe',
      env: process.env,
    });
    return slides(readFileSync(join(dir, 'o.html'), 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

let totalSlides = 0;
let totalDiffs = 0;
const offenders = [];
for (const deck of decks) {
  const rel = deck.replace(`${ROOT}/`, '');
  let E;
  let M;
  try {
    E = slides(eng.render(readFileSync(deck, 'utf8'), palette).html);
    M = emulatorSlides(deck);
  } catch (e) {
    console.log(`✗ ${rel} — ERROR: ${e.message.split('\n')[0]}`);
    continue;
  }
  const n = Math.max(E.length, M.length);
  let d = 0;
  const detail = [];
  for (let i = 0; i < n; i++) {
    const a = E[i] ? structure(E[i]) : '(missing)';
    const b = M[i] ? structure(M[i]) : '(missing)';
    if (a === b) continue;
    d++;
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    detail.push(`    slide ${i + 1} @${p}\n      eng: …${a.slice(Math.max(0, p - 25), p + 70)}\n      emu: …${b.slice(Math.max(0, p - 25), p + 70)}`);
  }
  totalSlides += n;
  totalDiffs += d;
  if (E.length !== M.length) console.log(`✗ ${rel} — slide COUNT differs: engine ${E.length} vs emulator ${M.length}`);
  if (d) {
    offenders.push(rel);
    console.log(`✗ ${rel} [${palette}] — ${d}/${n} slides diverge`);
    console.log(detail.slice(0, 3).join('\n'));
  } else {
    console.log(`✓ ${rel} [${palette}] — ${n}pp PARITY`);
  }
}
console.log(`\n${decks.length} deck(s): ${totalDiffs}/${totalSlides} slides diverge. ${offenders.length} deck(s) with divergence.`);
process.exit(totalDiffs ? 1 : 0);
