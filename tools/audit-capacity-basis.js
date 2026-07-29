#!/usr/bin/env node
/**
 * audit-capacity-basis — what words-per-element does each component ACTUALLY get
 * authored at, and how does that compare to the number `calibrate-capacity` holds
 * it at?
 *
 * A count ceiling is only meaningful for a stated element SIZE, so
 * `calibrate-capacity` holds words-per-element fixed and grows the count. It holds
 * them at the component's declared `density.soft`. Nobody had ever checked whether
 * that number describes what people write — and it does not: measured here, it
 * overstates real authoring for **every** component that has all three figures,
 * by a median of ~1.4x.
 *
 * The reflow note (2026-07-27) proposed each component's own `skeleton` as the
 * honest basis instead. This tool exists because that proposal needed checking too,
 * and it does not survive: a skeleton is a SHAPE template with placeholder filler
 * ("One-sentence description"), not a length specimen, so it runs TERSER than real
 * authoring on 7 of 25 components — including `inventory`, the component the
 * proposal was written for. Erring terse is the dangerous direction: a shorter
 * basis measures a HIGHER ceiling, so the linter goes quiet on slides that clip.
 *
 * Three bases per component, all measured, none quoted from prose:
 *   density.soft — what the tool holds elements at today
 *   skeleton     — the manifest's canonical shape
 *   gallery      — the component's own gallery deck, i.e. real authored slides
 *
 * Companion to engineering/decisions/2026-07-28-capacity-basis.md, which reads
 * these numbers. The doc names this command rather than repeating its output,
 * because a table of measurements pasted into prose is exactly the drifting
 * constant that decision note is about.
 *
 * Usage:
 *   node tools/audit-capacity-basis.js           # the table
 *   node tools/audit-capacity-basis.js --json    # machine-readable
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { BUILDERS, findManifest } = require('./lib/calibrate-core.js');
const { loadAll, manifestBucket } = require('../lib/components');

const JSON_OUT = process.argv.includes('--json');
const byName = new Map(loadAll().map((m) => [m.name, m]));

/**
 * The top-level list members in a markdown body, each folded together with its
 * nested lines — because a "element" for capacity purposes is one MEMBER, and a
 * member's sub-bullets are part of it (`- **Term.**` + its description clause).
 */
function members(md) {
  const out = [];
  let cur = null;
  for (const raw of md.split('\n')) {
    if (/^\s*<!--/.test(raw) || /^\s*#/.test(raw)) continue;
    const m = raw.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (m) {
      if (m[1].length === 0) { if (cur) out.push(cur); cur = [m[3]]; } else if (cur) cur.push(m[3]);
    } else if (cur && /^\s+\S/.test(raw)) cur.push(raw.trim());
  }
  if (cur) out.push(cur);
  return out;
}

// Code spans are CHROME, not prose — a `p.3` page marker or an `Effective Mar 2026`
// pill occupies a fixed slot the author does not budget words against. Counting them
// would inflate exactly the layouts (agenda, regulatory-update, timeline-list) whose
// chrome is most of their markup.
const wordsOf = (parts) => parts.join(' ')
  .replace(/`[^`]*`/g, ' ')
  .replace(/\[[ x]\]/g, ' ')
  .replace(/[*_#>]/g, ' ')
  .split(/\s+/).filter(Boolean).length;

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/** Every slide in the component's OWN gallery that renders that component. */
function gallerySlides(name) {
  const m = byName.get(name);
  if (!m) return [];
  const p = path.join(ROOT, 'lib', 'components', manifestBucket(m), name, `${name}.gallery.md`);
  if (!fs.existsSync(p)) return [];
  const isMine = new RegExp(`_class:[^-]*\\b${name}\\b`);
  return fs.readFileSync(p, 'utf8').split(/^---\s*$/m)
    .filter((s) => isMine.test(s) && !/_class:[^-]*\btitle\b/.test(s));
}

function audit() {
  const rows = [];
  for (const name of Object.keys(BUILDERS).sort()) {
    const man = findManifest(name);
    if (!man) continue;
    const skel = man.skeleton ? members(man.skeleton).map(wordsOf) : [];
    const gal = gallerySlides(name).flatMap((s) => members(s).map(wordsOf));
    rows.push({
      name,
      soft: man.density?.soft ?? null,
      skeleton: mean(skel),
      gallery: mean(gal),
      galleryMax: gal.length ? Math.max(...gal) : null,
      gallerySlides: gallerySlides(name).length,
    });
  }
  return rows;
}

function main() {
  const rows = audit();
  if (JSON_OUT) { process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`); return 0; }
  const f = (x) => (x == null ? '  —  ' : x.toFixed(1).padStart(5));
  const ratio = (a, b) => ((a && b) ? `${(a / b).toFixed(1)}x`.padStart(5) : '  —  ');
  process.stdout.write('\nWords per ELEMENT, three ways. `soft/gal` > 1 means the basis the tool uses\n');
  process.stdout.write('is more generous than what people actually write.\n\n');
  process.stdout.write('component            density.soft  skeleton  gallery  gal max   soft/gal  skel/gal\n');
  for (const r of rows) {
    process.stdout.write(
      `${r.name.padEnd(21)}${String(r.soft ?? '—').padStart(6)}       ${f(r.skeleton)}    ${f(r.gallery)}`
      + `   ${String(r.galleryMax ?? '—').padStart(5)}     ${ratio(r.soft, r.gallery)}     ${ratio(r.skeleton, r.gallery)}\n`,
    );
  }
  const all = rows.filter((r) => r.soft && r.skeleton && r.gallery);
  const over = all.filter((r) => r.soft > r.gallery);
  const terse = all.filter((r) => r.skeleton < r.gallery * 0.7);
  process.stdout.write(`\n  ${all.length} of ${rows.length} components have all three figures.\n`);
  process.stdout.write(`  density.soft is MORE generous than real authoring on ${over.length} of ${all.length} — it is never tighter.\n`);
  process.stdout.write(`  the skeleton runs >30% TERSER than real authoring on ${terse.length}: ${terse.map((r) => r.name).join(', ')}.\n`);
  process.stdout.write('  A terser basis measures a HIGHER ceiling, so those are the ones where swapping\n');
  process.stdout.write('  density.soft for the skeleton would make the linter quieter about slides that clip.\n\n');
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { audit, members, wordsOf };
