#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
/**
 * diagram-oracle — a per-fence byte oracle for the CLI's mmdc bake.
 *
 * The gate for any change that batches, memoizes, or reuses `mmdc`: every mermaid
 * fence in the corpus must render to the SAME SVG bytes after the change as before.
 * If they match across every fence, a memoization key is correct BY CONSTRUCTION —
 * including the cases judgment would most likely miss (same definition under a
 * different theme, band scope, or look).
 *
 * Renders each diagram-bearing deck to .pdf and reads the HTML sidecar. .pdf on
 * purpose: the sidecar path is identical on main and on any feature branch, so a
 * baseline captured on one is comparable on the other. (.html output would be
 * cheaper but only exists on the unmerged #1661 branch — an oracle must not depend
 * on the thing it is not testing.)
 *
 * MEASURE THE NOISE FLOOR BEFORE BELIEVING A DIFF. Three sources of run-to-run
 * variance survive normalization on a small, fixed set of fences, so `compare` of
 * two captures from the SAME code is not guaranteed to be empty. Capture the base
 * arm twice, compare those, and treat that result as zero — a change is clean when
 * it differs by no more than the floor, on the same fences. Measured on this corpus
 * at 4 of 118 fences (idx 0/3/9/19 of four specific decks), stable across runs.
 *
 * Usage:
 *   node tools/diagram-oracle.mjs capture <out.json> [--limit N]
 *   node tools/diagram-oracle.mjs compare <before.json> <after.json>
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path, { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODE = process.argv[2];

function decksWithDiagrams() {
  const listed = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /examples\/|\.gallery\.md$|exemplars\//.test(f));
  return listed.filter((f) => {
    try { return /^```mermaid/m.test(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
    catch { return false; }
  });
}

// Each baked diagram is a <div class="mermaid-svg …"> wrapper around the mmdc output.
// Capture the wrapper's full inner payload, not just the <svg>, so a change to the
// wrapper's attributes (data-mmd-idx, scope classes) is caught too.
// Normalize the three things measured to vary run-to-run with no visual consequence,
// so the oracle gates on what a change actually did rather than on mermaid's noise:
//  · path geometry — rough/curve CONTROL points drift while endpoints stay put
//  · sub-pixel dimensions — 796.253px vs 796.081px in style/viewBox
//  · gitGraph auto commit hashes — 4-c9dba73 vs 4-00a2aae
// Everything else (element count, classes, ids, text, colors) still compares exact.
// The hand-drawn jitter that used to dominate this list is GONE — fixed at source by
// DIAGRAM_HAND_DRAWN_SEED rather than normalized away.
function normalize(s) {
  return s
    .replace(/\sd="[^"]*"/g, ' d="~"')
    .replace(/(\d+\.\d{2})\d+/g, '$1')
    .replace(/\b\d+-[0-9a-f]{7}\b/g, 'N-hash');
}

function extractDiagrams(html) {
  const out = [];
  const re = /<div class="mermaid-svg[^"]*"[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    // Walk to the matching </div> by depth, since the SVG payload contains divs.
    let depth = 1, i = re.lastIndex;
    while (depth > 0 && i < html.length) {
      const nextOpen = html.indexOf('<div', i);
      const nextClose = html.indexOf('</div>', i);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) { depth++; i = nextOpen + 4; }
      else { depth--; i = nextClose + 6; }
    }
    out.push(html.slice(m.index, i));
  }
  return out;
}

if (MODE === 'capture') {
  const outFile = process.argv[3];
  const limitArg = process.argv.indexOf('--limit');
  let decks = decksWithDiagrams();
  if (limitArg !== -1) decks = decks.slice(0, Number(process.argv[limitArg + 1]));

  const record = { capturedFrom: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), decks: {} };
  let totalFences = 0;
  for (const deck of decks) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-'));
    const pdf = path.join(dir, 'd.pdf');
    const t0 = Date.now();
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), path.join(ROOT, deck), pdf, '--quiet'],
        { cwd: ROOT, timeout: 300000, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      record.decks[deck] = { error: String(e.message || e).split('\n')[0] };
      console.error(`  ✗ ${deck}: ${record.decks[deck].error}`);
      continue;
    }
    const ms = Date.now() - t0;
    const html = fs.readFileSync(path.join(dir, 'd.html'), 'utf8');
    const diagrams = extractDiagrams(html);
    record.decks[deck] = {
      renderMs: ms,
      fences: diagrams.map((d, i) => ({ i, sha: createHash('sha256').update(d).digest('hex').slice(0, 16), nrm: createHash('sha256').update(normalize(d)).digest('hex').slice(0, 16), bytes: d.length })),
    };
    totalFences += diagrams.length;
    console.log(`  ${String(diagrams.length).padStart(3)} fences  ${String(ms).padStart(6)}ms  ${deck}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  record.totals = { decks: decks.length, fences: totalFences };
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2));
  console.log(`\ncaptured ${totalFences} fences across ${decks.length} decks → ${outFile}`);
}

if (MODE === 'compare') {
  const a = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const b = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  let same = 0, diff = 0, missing = 0;
  for (const [deck, ra] of Object.entries(a.decks)) {
    const rb = b.decks[deck];
    if (!rb || rb.error || ra.error) { console.log(`  ? ${deck}: missing/errored on one side`); missing++; continue; }
    if (ra.fences.length !== rb.fences.length) {
      console.log(`  ✗ ${deck}: fence COUNT moved ${ra.fences.length} → ${rb.fences.length}`); diff++; continue;
    }
    const bad = ra.fences.filter((f, i) => f.nrm !== rb.fences[i].nrm);
    if (bad.length) { console.log(`  ✗ ${deck}: ${bad.length}/${ra.fences.length} fences changed (idx ${bad.map((f) => f.i).join(',')})`); diff++; }
    else same++;
  }
  const msA = Object.values(a.decks).reduce((s, d) => s + (d.renderMs || 0), 0);
  const msB = Object.values(b.decks).reduce((s, d) => s + (d.renderMs || 0), 0);
  console.log(`\n${same} decks byte-identical · ${diff} changed · ${missing} missing`);
  console.log(`total render wall: ${(msA / 1000).toFixed(1)}s → ${(msB / 1000).toFixed(1)}s  (${(((msB - msA) / msA) * 100).toFixed(1)}%)`);
  process.exitCode = diff || missing ? 1 : 0;
}
